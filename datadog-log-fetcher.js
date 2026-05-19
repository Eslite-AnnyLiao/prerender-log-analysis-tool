'use strict';

// 從 Datadog Logs Search API 取得指定日期的 SSR / SSG log，各存成 CSV
//
// 用法:
//   node datadog-log-fetcher.js --date <YYYYMMDD>
//
// 說明:
//   apiKey / appKey 固定設定於檔案頂部常數
//   --date    查詢日期（台灣時區），格式 YYYYMMDD 或 YYYY-MM-DD（必填）
//   --env     環境，預設 prd（astro-worker-prd），傳 stg 改為 astro-worker-stg
//   --api-key / --app-key  選填，傳入時覆蓋頂部常數
//
// API: POST https://api.us5.datadoghq.com/api/v2/logs/events/search

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================
// 固定設定（依實際環境填入）
// ============================

const DATADOG_API_KEY = 'DD_API_KEY_REMOVED';
const DATADOG_APP_KEY = 'DD_APP_KEY_REMOVED';
const WORKER_PRD = 'astro-worker-prd';
const WORKER_STG = 'astro-worker-stg';
const DATADOG_SITE = 'api.us5.datadoghq.com';

const SSR_OUTPUT_DIR    = './to-analyze-daily-data/ssr';
const SSG_OUTPUT_DIR    = './to-analyze-daily-data/ssg';
const ERR404_OUTPUT_DIR = './to-analyze-daily-data/404-errors';

const PAGE_LIMIT = 1000;
const MAX_RETRIES = 3;

// ============================
// 參數解析
// ============================

function parseArgs(argv) {
  const args = {
    apiKey: DATADOG_API_KEY,
    appKey: DATADOG_APP_KEY,
    date: null,
    env: 'prd',
    debug: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--api-key' && argv[i + 1]) args.apiKey = argv[++i];
    else if (argv[i] === '--app-key' && argv[i + 1]) args.appKey = argv[++i];
    else if (argv[i] === '--date' && argv[i + 1]) args.date = argv[++i];
    else if (argv[i] === '--env' && argv[i + 1]) args.env = argv[++i];
    else if (argv[i] === '--debug') args.debug = true;
  }
  return args;
}

function normalizeDate(dateStr) {
  const clean = dateStr.replace(/\D/g, '');
  return clean.length === 8 ? clean : null;
}

// ============================
// 時間工具（台灣時區 UTC+8）
// ============================

function buildTWRange(dateDigits) {
  const y = dateDigits.slice(0, 4);
  const m = dateDigits.slice(4, 6);
  const d = dateDigits.slice(6, 8);
  return {
    fromISO: `${y}-${m}-${d}T00:00:00+08:00`,
    toISO:   `${y}-${m}-${d}T23:59:59+08:00`,
  };
}

// ============================
// CSV 工具
// ============================

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(...fields) {
  return fields.map(csvEscape).join(',');
}

function formatDuration(raw) {
  if (raw == null || raw === '') return '';
  const n = Number(raw);
  if (isNaN(n)) return String(raw);
  // Datadog duration 單位可能是 ns，>10000 視為 ns → 轉 ms
  return n > 10_000 ? `${Math.round(n / 1_000_000)}ms` : `${Math.round(n)}ms`;
}

// ============================
// 404 統計工具
// ============================

function extractProductId(custom) {
  return custom.productId ?? custom['@productId'] ?? custom.product_id ?? custom['@product_id'] ?? null;
}

// 回傳 Map<productId, Set<traceId>>
// 同一次 page load（相同 trace_id）的不同 API 404 算同一次
function process404Logs(logs) {
  const result = new Map(); // productId -> Set<traceId>
  for (const log of logs) {
    const attr   = log.attributes || {};
    const custom = attr.attributes || {};

    const errorMsg = custom.error ?? '';
    if (!errorMsg.includes('404')) continue;

    const productId = extractProductId(custom);
    if (!productId) continue;

    const traceId = custom.otel?.trace_id ?? attr.timestamp ?? '';

    if (!result.has(productId)) result.set(productId, new Set());
    result.get(productId).add(traceId);
  }
  return result;
}

function logs404ToCsv(result) {
  const rows = ['ProductId,404 次數'];
  for (const [productId, traces] of result) {
    rows.push(csvRow(productId, String(traces.size)));
  }
  return rows.join('\n');
}

// ============================
// HTTP 工具
// ============================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsRequest(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ============================
// Datadog API
// ============================

let DEBUG = false;

async function fetchLogsPage(apiKey, appKey, params, retries = 0) {
  const url = `https://${DATADOG_SITE}/api/v2/logs/events/search`;
  const headers = { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey };

  if (DEBUG) {
    console.log(`\n[DEBUG] POST ${url}`);
    console.log('[DEBUG] headers:', JSON.stringify(headers));
    console.log('[DEBUG] Request body:');
    console.log(JSON.stringify(params, null, 2));
  }

  let res;
  try {
    res = await httpsRequest(url, headers, JSON.stringify(params));
  } catch (err) {
    if (retries < MAX_RETRIES) {
      console.log(`  [網路錯誤] ${err.message}，10s 後重試 (${retries + 1}/${MAX_RETRIES})...`);
      await sleep(10_000);
      return fetchLogsPage(apiKey, appKey, params, retries + 1);
    }
    throw err;
  }

  if (DEBUG) {
    console.log(`[DEBUG] HTTP ${res.status}`);
    console.log('[DEBUG] Response body:');
    console.log(res.body.slice(0, 3000));
  }

  if (res.status === 429) {
    if (retries >= MAX_RETRIES) throw new Error('Rate limit (429) 超過最大重試次數');
    const retryAfterSec = parseInt(res.headers['retry-after'] || '60', 10);
    console.log(`  [429 Rate Limited] 等待 ${retryAfterSec}s 後重試 (${retries + 1}/${MAX_RETRIES})...`);
    await sleep(retryAfterSec * 1000);
    return fetchLogsPage(apiKey, appKey, params, retries + 1);
  }

  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 500)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new Error(`無法解析回應 JSON: ${res.body.slice(0, 200)}`);
  }

  return parsed;
}

// ============================
// 分頁撈完所有 log
// ============================

async function fetchAllLogs(apiKey, appKey, query, fromISO, toISO, label) {
  console.log(`[${label}] Query: ${query}`);

  const allLogs = [];
  let cursor = null;
  let page = 1;
  let firstLogPrinted = false;

  while (true) {
    const params = {
      filter: { query, from: fromISO, to: toISO },
      sort: 'timestamp',
      page: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    };

    process.stdout.write(`  第 ${page} 頁...`);
    const result = await fetchLogsPage(apiKey, appKey, params);

    const data = result.data || [];

    if (DEBUG && !firstLogPrinted && data.length > 0) {
      console.log('\n[DEBUG] 第一筆 log attributes:');
      console.log(JSON.stringify(data[0].attributes, null, 2));
      firstLogPrinted = true;
    }

    allLogs.push(...data);
    console.log(` ${data.length} 筆（累計 ${allLogs.length}）`);

    const nextCursor = result.meta?.page?.after;
    if (!nextCursor || data.length === 0) break;

    cursor = nextCursor;
    page++;
    await sleep(2000);
  }

  console.log(`  共 ${allLogs.length} 筆\n`);
  return allLogs;
}

// ============================
// CSV 轉換
// ============================

function logsToSSRCsv(logs) {
  const rows = ['Date,User agent,Duration,Content'];
  for (const log of logs) {
    const attr   = log.attributes || {};
    const custom = attr.attributes || {};
    const date    = attr.timestamp || '';
    const ua      = custom.user_agent ?? '';
    const dur     = formatDuration(custom.duration ?? custom['@duration']);
    const content = attr.message || '';
    rows.push(csvRow(date, ua, dur, content));
  }
  return rows.join('\n');
}

function logsToSSGCsv(logs) {
  const rows = ['Date,User agent,@product_id,Content'];
  for (const log of logs) {
    const attr   = log.attributes || {};
    const custom = attr.attributes || {};
    const date      = attr.timestamp || '';
    const ua        = custom.user_agent ?? '';
    const productId = custom['@product_id'] ?? custom.product_id ?? '';
    const content   = attr.message || '';
    rows.push(csvRow(date, ua, productId, content));
  }
  return rows.join('\n');
}

// ============================
// Main
// ============================

async function main() {
  const args = parseArgs(process.argv);

  if (!args.apiKey || !args.appKey) {
    console.error('錯誤: 請在檔案頂部設定 DATADOG_API_KEY 與 DATADOG_APP_KEY');
    process.exit(1);
  }

  DEBUG = args.debug;

  if (!args.date) {
    console.error('錯誤: 請指定 --date <YYYYMMDD>');
    console.log('用法: node datadog-log-fetcher.js --date <YYYYMMDD>');
    process.exit(1);
  }

  const dateDigits = normalizeDate(args.date);
  if (!dateDigits) {
    console.error(`錯誤: 無效的日期格式 "${args.date}"，請使用 YYYYMMDD 或 YYYY-MM-DD`);
    process.exit(1);
  }

  const worker  = args.env === 'stg' ? WORKER_STG : WORKER_PRD;
  const querySSR = `@cloudflare.script_name:${worker} @name:page-render`;
  const querySSG = `@cloudflare.script_name:${worker} message:ssg`;
  const query404 = `@cloud.platform:cloudflare.workers @cloudflare.script_name:${worker} status:error @service:ssr-product-page`;

  const dateDash = `${dateDigits.slice(0, 4)}-${dateDigits.slice(4, 6)}-${dateDigits.slice(6, 8)}`;
  const { fromISO, toISO } = buildTWRange(dateDigits);

  console.log('Datadog Log Fetcher');
  console.log('='.repeat(48));
  console.log(`環境     : ${args.env} (${worker})`);
  console.log(`查詢日期 : ${dateDash} 00:00:00 ~ 23:59:59 (台灣時區)`);
  console.log(`時間範圍 : ${fromISO} ~ ${toISO}`);
  console.log('');

  const ssrLogs    = await fetchAllLogs(args.apiKey, args.appKey, querySSR, fromISO, toISO, 'SSR');
  const err404Logs = await fetchAllLogs(args.apiKey, args.appKey, query404, fromISO, toISO, '404-Error');
  const ssgLogs    = await fetchAllLogs(args.apiKey, args.appKey, querySSG, fromISO, toISO, 'SSG');

  const err404Map = process404Logs(err404Logs);

  fs.mkdirSync(SSR_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SSG_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(ERR404_OUTPUT_DIR, { recursive: true });

  const ssrPath    = path.join(SSR_OUTPUT_DIR,    `ssr-product-log-${dateDigits}.csv`);
  const ssgPath    = path.join(SSG_OUTPUT_DIR,    `ssg-product-log-${dateDigits}.csv`);
  const err404Path = path.join(ERR404_OUTPUT_DIR, `404-errors-${dateDigits}.csv`);

  fs.writeFileSync(ssrPath,    logsToSSRCsv(ssrLogs),      'utf8');
  fs.writeFileSync(ssgPath,    logsToSSGCsv(ssgLogs),      'utf8');
  fs.writeFileSync(err404Path, logs404ToCsv(err404Map),    'utf8');

  console.log('結果已儲存:');
  console.log(`• SSR  : ${ssrPath}  (${ssrLogs.length} 筆)`);
  console.log(`• SSG  : ${ssgPath}  (${ssgLogs.length} 筆)`);
  console.log(`• 404  : ${err404Path}  (共 ${err404Map.size} 個商品)`);
}

main().catch((err) => {
  console.error('執行錯誤:', err.message);
  process.exit(1);
});
