/**
 * Googlebot 商品頁「單日內」訪問頻率分析工具
 *
 * 問題：Google 爬蟲一天內抓同個商品頁幾次？間隔多久？
 *
 * 輸出：
 *   - 全期間：一天內被抓 1次 / 2次 / 3+次 的商品頁比例
 *   - 每日：當天被重複抓的商品頁數 & Top 重複頁
 *   - 單日重複抓的時間間隔分布（分鐘）
 *
 * 用法：
 *   node googlebot-intraday-frequency-analyzer.js --start 20260101 --end 20260410
 *   node googlebot-intraday-frequency-analyzer.js --start 20260101 --end 20260410 --top 20
 *   node googlebot-intraday-frequency-analyzer.js --start 20260101 --end 20260410 --product 1001141192692310
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BASE_DIR   = path.join(__dirname, 'to-analyze-daily-data/user-agent-log/product');
const OUTPUT_DIR = path.join(__dirname, 'googlebot-analysis');

const GOOGLEBOT_RE = /Googlebot/i;
const URL_RE       = /https:\/\/www\.eslite\.com\/product\/(\d+)/;
const TS_RE        = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/;

// ── Writer ────────────────────────────────────────────────────────────────────

class Writer {
  constructor() { this.lines = []; }
  line(s = '') { console.log(s); this.lines.push(s); }
  save(filepath) {
    if (!fs.existsSync(path.dirname(filepath))) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }
    fs.writeFileSync(filepath, this.lines.join('\n') + '\n', 'utf8');
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { start: null, end: null, top: 10, product: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start')   opts.start   = args[++i];
    if (args[i] === '--end')     opts.end     = args[++i];
    if (args[i] === '--top')     opts.top     = parseInt(args[++i], 10);
    if (args[i] === '--product') opts.product = args[++i];
  }
  if (!opts.start || !opts.end) {
    console.error('用法: node googlebot-intraday-frequency-analyzer.js --start YYYYMMDD --end YYYYMMDD [--top N] [--product ID]');
    process.exit(1);
  }
  return opts;
}

// ── 資料載入 ─────────────────────────────────────────────────────────────────
// 回傳結構：  Map< date(YYYY-MM-DD), Map< productId, timestamp[] > >

function loadVisits(startDate, endDate, targetProduct) {
  if (!fs.existsSync(BASE_DIR)) throw new Error(`找不到資料目錄: ${BASE_DIR}`);

  const files = fs.readdirSync(BASE_DIR)
    .filter(f => {
      if (!f.endsWith('.csv')) return false;
      const d = f.slice(15, 23); // user-agent-log-YYYYMMDD-product.csv
      return d >= startDate && d <= endDate;
    })
    .sort();

  if (files.length === 0) throw new Error(`找不到 ${startDate}~${endDate} 的資料檔案`);

  console.log(`找到 ${files.length} 個檔案（${files[0].slice(15,23)} ~ ${files[files.length-1].slice(15,23)}）`);

  // date -> productId -> [ISO timestamp, ...]
  const byDate = new Map();

  for (const fname of files) {
    const fileDate = fname.slice(15, 23);          // YYYYMMDD
    const dateKey  = `${fileDate.slice(0,4)}-${fileDate.slice(4,6)}-${fileDate.slice(6,8)}`; // YYYY-MM-DD

    const content = fs.readFileSync(path.join(BASE_DIR, fname), 'utf8');
    for (const line of content.split('\n')) {
      if (!GOOGLEBOT_RE.test(line)) continue;
      const urlMatch = URL_RE.exec(line);
      if (!urlMatch) continue;
      const pid = urlMatch[1];
      if (targetProduct && pid !== targetProduct) continue;
      const tsMatch = TS_RE.exec(line);
      if (!tsMatch) continue;

      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      const dayMap = byDate.get(dateKey);
      if (!dayMap.has(pid)) dayMap.set(pid, []);
      dayMap.get(pid).push(tsMatch[1]);
    }
  }

  return byDate;
}

// ── 輔助 ──────────────────────────────────────────────────────────────────────

function fmtMin(ms) {
  const m = ms / 60000;
  return m < 60 ? `${m.toFixed(0)}分鐘` : `${(m/60).toFixed(1)}小時`;
}

function bar(n, max, width = 20) {
  const filled = max === 0 ? 0 : Math.round(n / max * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// 計算一天內多次造訪的間隔（分鐘），去除 1 分鐘以內的重複 log
function intraDayGaps(timestamps) {
  const sorted = [...new Set(timestamps)].map(ts => new Date(ts).getTime()).sort((a,b)=>a-b);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const ms = sorted[i] - sorted[i-1];
    if (ms < 60_000) continue; // 忽略 < 1 分鐘的重複 log
    gaps.push(ms);
  }
  return { sorted, gaps };
}

// ── 報告 ─────────────────────────────────────────────────────────────────────

function report(w, byDate, opts) {
  const allDates = [...byDate.keys()].sort();

  // 全期間彙總
  // 單位：(date, productId) pair 的造訪次數
  let totalPairs = 0;
  let oncePairs  = 0; // 當天只抓1次
  let multiPairs = 0; // 當天抓2次以上
  const freqDist = new Map(); // 次數 -> 幾個 (date,product)
  const allGapMs = []; // 所有單日重複間隔（ms）

  // 每日統計
  const dailyStats = [];

  for (const date of allDates) {
    const dayMap = byDate.get(date);
    let dayOnce = 0, dayMulti = 0, dayGaps = [];
    const multiProducts = []; // { pid, count, gapInfo }

    for (const [pid, timestamps] of dayMap.entries()) {
      const { sorted, gaps } = intraDayGaps(timestamps);
      const count = sorted.length;
      totalPairs++;
      freqDist.set(count, (freqDist.get(count) || 0) + 1);

      if (count === 1) {
        oncePairs++;
        dayOnce++;
      } else {
        multiPairs++;
        dayMulti++;
        allGapMs.push(...gaps);
        dayGaps.push(...gaps);
        multiProducts.push({ pid, count, gaps, sorted });
      }
    }

    multiProducts.sort((a, b) => b.count - a.count);

    dailyStats.push({
      date,
      totalProducts: dayMap.size,
      once: dayOnce,
      multi: dayMulti,
      topMulti: multiProducts.slice(0, opts.top),
      avgGapMs: dayGaps.length ? dayGaps.reduce((s,v)=>s+v,0)/dayGaps.length : null,
      minGapMs: dayGaps.length ? Math.min(...dayGaps) : null,
      maxGapMs: dayGaps.length ? Math.max(...dayGaps) : null,
    });
  }

  // ── 全期間摘要 ────────────────────────────────────────────────────────────

  w.line('='.repeat(70));
  w.line('Googlebot 商品頁單日訪問頻率分析');
  w.line('='.repeat(70));
  w.line(`分析日期範圍: ${allDates[0]} ~ ${allDates[allDates.length-1]}（共 ${allDates.length} 天）`);
  w.line();

  w.line('【全期間彙總】');
  w.line(`  統計 (日期, 商品頁) 組合總數: ${totalPairs.toLocaleString()}`);
  w.line(`  當天只被抓 1 次: ${oncePairs.toLocaleString()} 組（${(oncePairs/totalPairs*100).toFixed(1)}%）`);
  w.line(`  當天被抓 2+ 次:  ${multiPairs.toLocaleString()} 組（${(multiPairs/totalPairs*100).toFixed(1)}%）`);
  w.line();

  // 次數分布
  w.line('【單日訪問次數分布（以 (日期,商品頁) 為單位）】');
  const maxFreq = Math.max(...freqDist.keys());
  const maxCnt  = Math.max(...freqDist.values());
  const sortedFreq = [...freqDist.entries()].sort((a,b)=>a[0]-b[0]);
  for (const [freq, cnt] of sortedFreq) {
    const pct = (cnt / totalPairs * 100).toFixed(1);
    w.line(`  ${String(freq).padStart(2)} 次/天: ${String(cnt).padStart(6)} 組  ${pct.padStart(5)}%  ${bar(cnt, maxCnt)}`);
  }
  w.line();

  // 重複抓的間隔統計
  if (allGapMs.length > 0) {
    const gapSorted = [...allGapMs].sort((a,b)=>a-b);
    const gapAvg = allGapMs.reduce((s,v)=>s+v,0) / allGapMs.length;
    const p50 = gapSorted[Math.floor(gapSorted.length * 0.5)];
    const p90 = gapSorted[Math.floor(gapSorted.length * 0.9)];
    const p95 = gapSorted[Math.floor(gapSorted.length * 0.95)];

    w.line('【單日重複訪問的間隔統計（全期間合計）】');
    w.line(`  樣本數: ${allGapMs.length.toLocaleString()} 個間隔`);
    w.line(`  平均間隔: ${fmtMin(gapAvg)}`);
    w.line(`  最短間隔: ${fmtMin(Math.min(...allGapMs))}`);
    w.line(`  最長間隔: ${fmtMin(Math.max(...allGapMs))}`);
    w.line(`  P50:       ${fmtMin(p50)}`);
    w.line(`  P90:       ${fmtMin(p90)}`);
    w.line(`  P95:       ${fmtMin(p95)}`);
    w.line();

    // 間隔分布（分鐘）
    const gapBuckets = [
      ['< 30 分鐘',    ms => ms < 30*60_000],
      ['30~60 分鐘',   ms => ms < 60*60_000],
      ['1~3 小時',     ms => ms < 3*3600_000],
      ['3~6 小時',     ms => ms < 6*3600_000],
      ['6~12 小時',    ms => ms < 12*3600_000],
      ['12~24 小時',   ms => ms < 24*3600_000],
    ];
    w.line('【單日重複訪問的間隔分布】');
    let prev = 0;
    const bucketCounts = [];
    for (const [label, pred] of gapBuckets) {
      const cnt = allGapMs.filter(pred).length - prev;
      bucketCounts.push({ label, cnt });
      prev += cnt;
    }
    const bcMax = Math.max(...bucketCounts.map(b=>b.cnt));
    for (const { label, cnt } of bucketCounts) {
      const pct = (cnt / allGapMs.length * 100).toFixed(1);
      w.line(`  ${label.padEnd(12)}: ${String(cnt).padStart(5)} 次  ${pct.padStart(5)}%  ${bar(cnt, bcMax)}`);
    }
    w.line();
  }

  // ── 每日摘要 ─────────────────────────────────────────────────────────────

  w.line('='.repeat(70));
  w.line('每日摘要（重複被抓的商品頁數 & 平均間隔）');
  w.line('='.repeat(70));
  w.line(`${'日期'.padEnd(12)} ${'Googlebot商品頁'.padStart(10)} ${'重複'.padStart(6)} ${'佔比'.padStart(6)} ${'平均間隔'}`);
  w.line('-'.repeat(60));

  for (const d of dailyStats) {
    const pct = d.totalProducts > 0 ? (d.multi/d.totalProducts*100).toFixed(0) : '0';
    const avgStr = d.avgGapMs != null ? fmtMin(d.avgGapMs) : '-';
    w.line(`${d.date}  ${String(d.totalProducts).padStart(10)} ${String(d.multi).padStart(6)} ${(pct+'%').padStart(6)} ${avgStr}`);
  }
  w.line();

  // ── 每日 Top 重複商品 ─────────────────────────────────────────────────────

  w.line('='.repeat(70));
  w.line(`每日 Top ${opts.top} 重複被抓商品頁（當天訪問 2+ 次）`);
  w.line('='.repeat(70));

  for (const d of dailyStats) {
    if (d.topMulti.length === 0) continue;
    w.line();
    w.line(`▶ ${d.date}（重複商品頁共 ${d.multi} 個）`);
    for (let i = 0; i < d.topMulti.length; i++) {
      const { pid, count, gaps, sorted } = d.topMulti[i];
      const avgG = gaps.length ? fmtMin(gaps.reduce((s,v)=>s+v,0)/gaps.length) : '-';
      // 時間軸（台灣 UTC+8）
      const times = sorted.map(ts => {
        const d = new Date(ts);
        d.setHours(d.getHours() + 8);
        return d.toISOString().slice(11, 16);
      }).join(' → ');
      w.line(`  ${i+1}. product/${pid}  ${count} 次  平均間隔 ${avgG}`);
      w.line(`     時間軸 (TWN): ${times}`);
    }
  }

  // ── 若指定單一商品 ────────────────────────────────────────────────────────

  if (opts.product) {
    w.line();
    w.line('='.repeat(70));
    w.line(`指定商品頁詳細記錄: product/${opts.product}`);
    w.line('='.repeat(70));
    for (const d of dailyStats) {
      const found = d.topMulti.find(p => p.pid === opts.product);
      if (!found) continue; // 重複才顯示，1次的也輸出
      const { count, gaps, sorted } = found;
      const times = sorted.map(ts => {
        const dt = new Date(ts); dt.setHours(dt.getHours()+8);
        return dt.toISOString().slice(11, 19);
      }).join(' → ');
      w.line(`${d.date}: ${count} 次  ${times}`);
    }
  }
}

// ── 主程式 ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();
  console.log(`Googlebot 單日訪問頻率分析`);
  console.log(`日期範圍: ${opts.start} ~ ${opts.end}`);

  const byDate = loadVisits(opts.start, opts.end, opts.product);

  if (byDate.size === 0) {
    console.log('找不到符合條件的 Googlebot 訪問記錄');
    return;
  }

  const w = new Writer();
  report(w, byDate, opts);

  const tag = opts.product ? `-product-${opts.product}` : `-top${opts.top}`;
  const outFile = path.join(OUTPUT_DIR, `googlebot-intraday-${opts.start}-${opts.end}${tag}.txt`);
  w.save(outFile);
  console.log(`\n已儲存: ${outFile}`);
}

main();
