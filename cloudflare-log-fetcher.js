'use strict';

// 從 Cloudflare Logs Explorer SQL API 取得指定日期含有 "Astro cache hit for" 的 log
//
// 用法:
//   node cloudflare-log-fetcher.js --date <YYYYMMDD>
//   node cloudflare-log-fetcher.js --date <YYYY-MM-DD> --worker <workerName> --output <dir>
//   node cloudflare-log-fetcher.js --probe             # 列出欄位名稱，確認 schema
//
// 說明:
//   accountId / apiToken / workerName 固定設定於檔案頂部常數
//   --probe   呼叫 keys endpoint 列出所有欄位名稱，不儲存檔案
//   --date    查詢日期（台灣時區），格式 YYYYMMDD 或 YYYY-MM-DD（必填，probe 模式除外）
//   --worker  Worker script 名稱，用於過濾 scriptName（選填，傳入時覆蓋頂部常數）
//   --output  輸出目錄（預設: ./daily-analysis-result/cloudflare/YYYYMMDD）
//   --account-id / --api-token  選填，傳入時覆蓋頂部常數
//
// API: POST /accounts/{id}/workers/observability/telemetry/query

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================
// 固定設定（依實際環境填入）
// ============================

const CLOUDFLARE_ACCOUNT_ID = 'CF_ACCOUNT_ID_REMOVED';
const CLOUDFLARE_API_TOKEN = 'CF_API_TOKEN_REMOVED';
const CLOUDFLARE_WORKER_NAME = 'stg-eslite-com';

// Cloudflare Logs Explorer SQL API rate limit: 6 requests / minute
// 每次請求後至少等待 11 秒，確保不超過限制
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 6;
const REQUEST_INTERVAL_MS = Math.ceil(RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX_REQUESTS) + 1000; // ~11s
const PAGE_LIMIT = 1000;
const MAX_RETRIES = 3;

// ============================
// 參數解析
// ============================

function parseArgs(argv) {
  const args = {
    accountId: CLOUDFLARE_ACCOUNT_ID,
    apiToken: CLOUDFLARE_API_TOKEN,
    worker: CLOUDFLARE_WORKER_NAME,
    date: null,
    output: null,
    probe: false,
    raw: false,
    debug: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--account-id' && argv[i + 1]) args.accountId = argv[++i];
    else if (argv[i] === '--api-token' && argv[i + 1]) args.apiToken = argv[++i];
    else if (argv[i] === '--worker' && argv[i + 1]) args.worker = argv[++i];
    else if (argv[i] === '--date' && argv[i + 1]) args.date = argv[++i];
    else if (argv[i] === '--output' && argv[i + 1]) args.output = argv[++i];
    else if (argv[i] === '--probe') args.probe = true;
    else if (argv[i] === '--raw') args.raw = true;
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

function buildUTCRange(dateDigits) {
  const y = parseInt(dateDigits.slice(0, 4), 10);
  const m = parseInt(dateDigits.slice(4, 6), 10) - 1;
  const d = parseInt(dateDigits.slice(6, 8), 10);

  // 台灣 00:00:00 → UTC 前一天 16:00:00
  const fromMs = Date.UTC(y, m, d, 0, 0, 0) - 8 * 3600 * 1000;
  // 台灣 23:59:59.999 → UTC 當天 15:59:59.999
  const toMs = Date.UTC(y, m, d, 23, 59, 59, 999) - 8 * 3600 * 1000;

  const fmt = (ms) =>
    new Date(ms)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '');
  return { fromMs, toMs, startDisplay: fmt(fromMs), endDisplay: fmt(toMs) };
}

function nowTW() {
  return new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: true });
}

// ============================
// Rate Limiter
// ============================

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  async throttle() {
    const now = Date.now();
    // 移除 window 外的舊記錄
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      // 算出最早一筆 + windowMs 後可以繼續
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 100;
      console.log(
        `  [Rate Limiter] 已達 ${this.maxRequests} req/${this.windowMs / 1000}s，等待 ${Math.ceil(waitMs / 1000)}s...`,
      );
      await sleep(waitMs);
      return this.throttle();
    }

    this.timestamps.push(Date.now());
  }
}

// ============================
// HTTP 工具
// ============================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsRequest(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
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
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ============================
// Cloudflare API
// ============================

const rateLimiter = new RateLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
let DEBUG = false;

async function verifyToken(accountId, apiToken) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`;
  const headers = { Authorization: `Bearer ${apiToken}` };
  let res;
  try {
    res = await httpsRequest('GET', url, headers, null);
  } catch (err) {
    throw new Error(`Token 驗證網路錯誤: ${err.message}`);
  }
  if (res.status !== 200) {
    throw new Error(`Token 驗證失敗 (HTTP ${res.status}): ${res.body.slice(0, 200)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new Error(`Token 驗證回應無法解析: ${res.body.slice(0, 100)}`);
  }
  if (!parsed.success) {
    const errMsg = (parsed.errors || []).map((e) => e.message || JSON.stringify(e)).join(', ') || '未知錯誤';
    throw new Error(`Token 無效: ${errMsg}`);
  }
  return parsed.result;
}

async function callObservabilityAPI(accountId, apiToken, subpath, body, retries = 0) {
  await rateLimiter.throttle();

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/${subpath}`;
  const headers = { Authorization: `Bearer ${apiToken}` };

  if (DEBUG) {
    console.log(`\n[DEBUG] POST ${url}`);
    console.log('[DEBUG] Request body:');
    console.log(JSON.stringify(body, null, 2));
  }

  let res;
  try {
    res = await httpsRequest('POST', url, headers, JSON.stringify(body));
  } catch (err) {
    if (retries < MAX_RETRIES) {
      console.log(`  [網路錯誤] ${err.message}，10s 後重試 (${retries + 1}/${MAX_RETRIES})...`);
      await sleep(10_000);
      return callObservabilityAPI(accountId, apiToken, subpath, body, retries + 1);
    }
    throw err;
  }

  if (DEBUG) {
    console.log(`[DEBUG] HTTP ${res.status}`);
    console.log('[DEBUG] Response body:');
    console.log(res.body.slice(0, 2000));
  }

  if (res.status === 429) {
    if (retries >= MAX_RETRIES) throw new Error('Rate limit (429) 超過最大重試次數');
    const retryAfterSec = parseInt(res.headers['retry-after'] || '60', 10);
    console.log(`  [429 Rate Limited] 等待 ${retryAfterSec}s 後重試 (${retries + 1}/${MAX_RETRIES})...`);
    await sleep(retryAfterSec * 1000);
    return callObservabilityAPI(accountId, apiToken, subpath, body, retries + 1);
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

  if (!parsed.success) {
    const errMsg = (parsed.errors || []).map((e) => e.message || JSON.stringify(e)).join(', ') || '未知錯誤';
    throw new Error(`API 錯誤: ${errMsg}`);
  }

  // 印出 API messages（有時包含重要提示）
  if (parsed.messages?.length) {
    parsed.messages.forEach((m) => console.log(`  [API message] ${JSON.stringify(m)}`));
  }

  return parsed;
}

// ============================
// 分頁取得所有 Log
// ============================

function buildFilters(worker) {
  const filters = [{ kind: 'filter', key: 'message', operation: 'regex', type: 'string', value: '^Astro cache hit for' }];
  if (worker) {
    filters.push({
      kind: 'filter',
      key: '$metadata.service',
      operation: 'eq',
      type: 'string',
      value: worker,
    });
  }
  return filters;
}

const twHHMM = ms => new Date(ms + 8 * 3600_000).toISOString().slice(11, 16);

async function fetchHourCount(accountId, apiToken, worker, fromMs, toMs, hourLabel) {
  const filters = buildFilters(worker);
  const body = {
    queryId: 'adhoc-query',
    timeframe: { from: fromMs, to: toMs },
    view: 'calculations',
    parameters: {
      filters,
      filterCombination: 'and',
      calculations: [{ operator: 'count' }],
    },
  };

  process.stdout.write(`  ${hourLabel}... `);
  const t0 = Date.now();
  const result = await callObservabilityAPI(accountId, apiToken, 'query', body);
  const elapsed = Date.now() - t0;

  const calcs = result.result?.calculations || [];
  const abrLevel = result.result?.run?.statistics?.abr_level ?? '?';

  if (DEBUG && calcs.length) {
    console.log(`\n  [DEBUG] calculations: ${JSON.stringify(calcs)}`);
  }

  const count = Number(calcs[0]?.aggregates?.[0]?.value) || 0;
  console.log(`${count} 次（${elapsed}ms，abr=${abrLevel}）`);

  return { hourLabel, count };
}

async function fetchAllLogs(accountId, apiToken, dateDigits, worker) {
  const { fromMs, toMs, startDisplay, endDisplay } = buildUTCRange(dateDigits);
  const HOUR_MS = 3600_000;
  const hourlyResults = [];

  console.log(`查詢時間範圍 (UTC): ${startDisplay} ~ ${endDisplay}`);
  console.log(`Worker: ${worker || '（不限）'}`);
  console.log(`查詢條件: message regex 'Astro\\scache\\shit\\sfor'`);
  console.log(`策略: 每小時 calculations 分批查詢（降低 ABR 取樣等級）`);
  console.log('');

  let slotStart = fromMs;

  while (slotStart < toMs) {
    const slotEnd = Math.min(slotStart + HOUR_MS - 1, toMs);
    const label = `${twHHMM(slotStart)}~${twHHMM(slotEnd)} (TW)`;

    const { count } = await fetchHourCount(accountId, apiToken, worker, slotStart, slotEnd, label);
    if (count > 0) hourlyResults.push({ hour: twHHMM(slotStart), count });

    slotStart += HOUR_MS;

    if (slotStart < toMs) await sleep(10_000);
  }

  const total = hourlyResults.reduce((s, r) => s + r.count, 0);
  console.log(`\nAstro cache hit 全天總計: ${total} 次\n`);
  return { total, hourly: hourlyResults };
}

// ============================
// 輸出報告
// ============================

function buildReport(dateDigits, worker, total, hourly) {
  const dateDash = `${dateDigits.slice(0, 4)}-${dateDigits.slice(4, 6)}-${dateDigits.slice(6, 8)}`;
  const lines = [
    'Cloudflare Workers Observability - Astro Cache Hit 統計',
    `生成時間: ${nowTW()}`,
    `日期 (台灣時區): ${dateDash} 00:00:00 ~ 23:59:59`,
    `Worker: ${worker || '（不限）'}`,
    `查詢條件: message regex 'Astro cache hit for'`,
    `全天總計: ${total} 次`,
    '='.repeat(64),
    '',
    '每小時明細 (台灣時區，只顯示有資料的小時):',
  ];

  if (hourly.length === 0) {
    lines.push('• 無資料');
  } else {
    hourly.forEach(({ hour, count }) => {
      lines.push(`  ${hour}  ${count} 次`);
    });
  }

  return lines.join('\n');
}

// ============================
// Main
// ============================

async function main() {
  const args = parseArgs(process.argv);

  if (!args.accountId || !args.apiToken) {
    console.error('錯誤: 請在檔案頂部設定 CLOUDFLARE_ACCOUNT_ID 與 CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }

  DEBUG = args.debug;

  // ── Token 驗證 ────────────────────────────────────────────
  process.stdout.write('驗證 API Token... ');
  try {
    const tokenInfo = await verifyToken(args.accountId, args.apiToken);
    console.log(`OK（status: ${tokenInfo?.status ?? 'active'}）`);
  } catch (err) {
    console.error(`失敗\n${err.message}`);
    process.exit(1);
  }
  console.log('');

  // ── Probe 模式：列出欄位名稱 + 查 3 筆 event ────────────
  if (args.probe) {
    console.log('Cloudflare Workers Observability - Probe 模式');
    console.log('='.repeat(48));
    console.log(`Worker: ${args.worker || '（不限）'}`);
    console.log('');

    // 1. 列出所有欄位名稱
    process.stdout.write('取得欄位清單 (keys)... ');
    const keysBody = {
      datasets: ['workers_trace_events'],
      limit: 100,
      filters: args.worker ? [{ key: 'scriptName', operation: 'eq', type: 'string', value: args.worker }] : [],
    };
    const keysResult = await callObservabilityAPI(args.accountId, args.apiToken, 'keys', keysBody);
    const keys = keysResult.result?.data || [];
    console.log(`${keys.length} 個欄位\n`);
    keys.forEach((k) => console.log(`  ${k.key}  (${k.type})`));

    // 2. 查 3 筆原始 event（最近 1 小時）
    console.log('\n最近 1 小時的原始 events (limit 3):');
    const now = Date.now();
    const sampleBody = {
      queryId: 'adhoc-query',
      timeframe: { from: now - 3600_000, to: now },
      view: 'events',
      limit: 3,
      parameters: {
        filters: args.worker ? [{ key: '$metadata.service', operation: 'eq', type: 'string', value: args.worker }] : [],
        filterCombination: 'and',
      },
    };
    const sampleResult = await callObservabilityAPI(args.accountId, args.apiToken, 'query', sampleBody);
    const sampleRows = sampleResult.result?.events?.events || [];
    if (!sampleRows.length) {
      console.log('  最近 1 小時查無資料');
    } else {
      sampleRows.forEach((r, i) => {
        console.log(`\n--- 第 ${i + 1} 筆 ---`);
        Object.entries(r).forEach(([k, v]) => {
          const display = typeof v === 'object' ? JSON.stringify(v) : v;
          console.log(`  ${k}: ${display}`);
        });
      });
    }
    return;
  }

  // ── Raw 模式：不帶任何 filter，只用時間範圍，確認欄位結構 ──
  if (args.raw) {
    if (!args.date) {
      console.error('錯誤: --raw 模式需要 --date <YYYYMMDD>');
      process.exit(1);
    }
    const dateDigits = normalizeDate(args.date);
    const { fromMs, toMs, startDisplay, endDisplay } = buildUTCRange(dateDigits);
    console.log('Raw 模式 - 不帶任何 filter，查 5 筆確認欄位');
    console.log('='.repeat(48));
    console.log(`時間範圍 (UTC): ${startDisplay} ~ ${endDisplay}`);
    console.log('');
    const rawBody = {
      queryId: 'adhoc-query',
      timeframe: { from: fromMs, to: toMs },
      view: 'events',
      limit: 5,
      parameters: {
        filterCombination: 'and',
      },
    };
    const rawResult = await callObservabilityAPI(args.accountId, args.apiToken, 'query', rawBody);
    const rawRows = rawResult.result?.events?.events || [];
    const count = rawResult.result?.events?.count ?? 0;
    console.log(`API 回報總數: ${count}，本次取得: ${rawRows.length} 筆\n`);
    if (!rawRows.length) {
      console.log('查無資料，請確認時間範圍或 API 權限');
    } else {
      rawRows.forEach((r, i) => {
        console.log(`--- 第 ${i + 1} 筆 ---`);
        Object.entries(r).forEach(([k, v]) => {
          const display = typeof v === 'object' ? JSON.stringify(v) : v;
          console.log(`  ${k}: ${display}`);
        });
        console.log('');
      });
    }
    return;
  }

  if (!args.date) {
    console.error('錯誤: 請指定 --date <YYYYMMDD>');
    console.log('用法: node cloudflare-log-fetcher.js --date <YYYYMMDD>');
    console.log('      node cloudflare-log-fetcher.js --probe  （查欄位名稱）');
    process.exit(1);
  }

  const dateDigits = normalizeDate(args.date);
  if (!dateDigits) {
    console.error(`錯誤: 無效的日期格式 "${args.date}"，請使用 YYYYMMDD 或 YYYY-MM-DD`);
    process.exit(1);
  }

  const dateDash = `${dateDigits.slice(0, 4)}-${dateDigits.slice(4, 6)}-${dateDigits.slice(6, 8)}`;

  console.log('Cloudflare Log Fetcher');
  console.log('='.repeat(48));
  console.log(`帳號 ID  : ${args.accountId}`);
  console.log(`查詢日期 : ${dateDash} 00:00:00 ~ 23:59:59 (台灣時區)`);
  console.log(`Worker   : ${args.worker || '（不限）'}`);
  console.log('');

  const { total, hourly } = await fetchAllLogs(args.accountId, args.apiToken, dateDigits, args.worker);

  console.log(`Astro cache hit 全天總計: ${total} 次`);

  const outDir = args.output || path.join('./daily-analysis-result/cloudflare', dateDigits);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const base = `cloudflare-astro-cache-hit-${dateDigits}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const txtPath = path.join(outDir, `${base}.txt`);

  const jsonOutput = {
    fetched_at: new Date().toISOString(),
    account_id: args.accountId,
    date_tw: dateDash,
    worker: args.worker || null,
    filter: "message regex 'Astro cache hit for'",
    total_count: total,
    hourly,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2), 'utf8');
  fs.writeFileSync(txtPath, buildReport(dateDigits, args.worker, total, hourly), 'utf8');

  console.log('\n結果已儲存:');
  console.log(`• JSON : ${jsonPath}`);
  console.log(`• 文字 : ${txtPath}`);
}

main().catch((err) => {
  console.error('執行錯誤:', err.message);
  process.exit(1);
});
