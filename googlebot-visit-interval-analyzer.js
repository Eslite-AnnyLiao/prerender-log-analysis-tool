/**
 * Googlebot 商品頁訪問間隔分析工具
 *
 * 功能：
 * 1. 統計指定日期範圍內各商品頁的 Googlebot 訪問次數
 * 2. 找出訪問頻率最高的 Top N 商品頁
 * 3. 分析每個商品頁的訪問間隔（平均、最短、最長、分布）
 *
 * 使用方式：
 *   node googlebot-visit-interval-analyzer.js --start 20251224 --end 20260224
 *   node googlebot-visit-interval-analyzer.js --start 20251224 --end 20260224 --top 20
 *   node googlebot-visit-interval-analyzer.js --start 20251224 --end 20260224 --product 1001141192692310
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASE_DIR    = path.join(__dirname, 'to-analyze-daily-data/user-agent-log/product');
const OUTPUT_DIR  = path.join(__dirname, 'googlebot-analysis');

// ── Writer（同步輸出到 console + 收集行內容寫檔）───────────────────────────

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
const GOOGLEBOT_RE = /Googlebot/i;
const URL_RE = /https:\/\/www\.eslite\.com\/product\/(\d+)/;
const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/;

// ── CLI 參數 ────────────────────────────────────────────────────────────────

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
    console.error('用法: node googlebot-visit-interval-analyzer.js --start YYYYMMDD --end YYYYMMDD [--top N] [--product ID]');
    process.exit(1);
  }
  return opts;
}

// ── 資料載入 ────────────────────────────────────────────────────────────────

function loadVisits(startDate, endDate, targetProduct) {
  if (!fs.existsSync(BASE_DIR)) {
    throw new Error(`找不到資料目錄: ${BASE_DIR}`);
  }

  const files = fs.readdirSync(BASE_DIR)
    .filter(f => {
      if (!f.endsWith('.csv')) return false;
      const date = f.slice(15, 23); // user-agent-log-YYYYMMDD-product.csv
      return date >= startDate && date <= endDate;
    })
    .sort();

  if (files.length === 0) {
    throw new Error(`找不到 ${startDate} ~ ${endDate} 範圍內的資料檔案`);
  }

  console.log(`📂 找到 ${files.length} 個檔案（${files[0].slice(15, 23)} ~ ${files[files.length - 1].slice(15, 23)}）`);

  // productId -> [ ISO timestamp, ... ]
  const productVisits = new Map();

  for (const fname of files) {
    const fpath = path.join(BASE_DIR, fname);
    const content = fs.readFileSync(fpath, 'utf8');
    for (const line of content.split('\n')) {
      if (!GOOGLEBOT_RE.test(line)) continue;
      const urlMatch = URL_RE.exec(line);
      if (!urlMatch) continue;
      const pid = urlMatch[1];
      if (targetProduct && pid !== targetProduct) continue;
      const tsMatch = TS_RE.exec(line);
      if (!tsMatch) continue;
      if (!productVisits.has(pid)) productVisits.set(pid, []);
      productVisits.get(pid).push(tsMatch[1]);
    }
  }

  return productVisits;
}

// ── 間隔計算 ────────────────────────────────────────────────────────────────

function calcIntervals(timestamps) {
  // 排序、去除 < 60 秒的重複（同批次重複 log）
  const sorted = [...new Set(timestamps)].sort();
  const dts = sorted.map(ts => new Date(ts).getTime());

  const gaps = []; // 小時
  for (let i = 1; i < dts.length; i++) {
    const h = (dts[i] - dts[i - 1]) / 3_600_000;
    if (h < 1 / 60) continue; // 忽略 < 1 分鐘的重複
    gaps.push(h);
  }

  if (gaps.length === 0) return null;

  const avg = gaps.reduce((s, v) => s + v, 0) / gaps.length;
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);

  // 分布
  const dist = { '< 6h': 0, '6~12h': 0, '12~24h': 0, '24~48h': 0, '> 48h': 0 };
  for (const h of gaps) {
    if (h < 6)       dist['< 6h']++;
    else if (h < 12) dist['6~12h']++;
    else if (h < 24) dist['12~24h']++;
    else if (h < 48) dist['24~48h']++;
    else             dist['> 48h']++;
  }

  return { avg, min, max, dist, gaps, sorted, count: sorted.length };
}

// ── 報告輸出 ────────────────────────────────────────────────────────────────

function fmtH(h) {
  return h < 24
    ? `${h.toFixed(1)}h`
    : `${(h / 24).toFixed(1)}天`;
}

function printSummaryTable(w, ranked, topN) {
  w.line(`\n${'='.repeat(80)}`);
  w.line(`訪問頻率 Top ${topN} 商品頁 — Googlebot 訪問間隔分析`);
  w.line('='.repeat(80));
  w.line(
    `${'排名'.padEnd(4)} ${'商品頁 ID'.padEnd(20)} ${'次數'.padStart(5)} ${'天數'.padStart(4)}  ${'平均間隔'.padStart(8)}  ${'最短'.padStart(6)}  ${'最長'.padStart(8)}`
  );
  w.line('-'.repeat(80));

  for (const { rank, pid, total, days, intervals } of ranked) {
    if (!intervals) {
      w.line(`${String(rank).padStart(3)}. ${pid.padEnd(20)} ${String(total).padStart(5)} ${String(days).padStart(4)}天  (資料不足)`);
      continue;
    }
    w.line(
      `${String(rank).padStart(3)}. ${pid.padEnd(20)} ${String(total).padStart(5)} ${String(days).padStart(4)}天` +
      `  ${fmtH(intervals.avg).padStart(8)}  ${fmtH(intervals.min).padStart(6)}  ${fmtH(intervals.max).padStart(8)}`
    );
  }
}

function printDetail(w, pid, intervals) {
  w.line(`\n${'─'.repeat(60)}`);
  w.line(`product/${pid}`);
  w.line(`${'─'.repeat(60)}`);
  w.line(`  訪問次數: ${intervals.count} 次`);
  w.line(`  平均間隔: ${fmtH(intervals.avg)}`);
  w.line(`  最短間隔: ${fmtH(intervals.min)}`);
  w.line(`  最長間隔: ${fmtH(intervals.max)}`);
  w.line(`  間隔分布:`);
  for (const [label, cnt] of Object.entries(intervals.dist)) {
    const bar = '█'.repeat(cnt);
    w.line(`    ${label.padEnd(8)}: ${String(cnt).padStart(3)} 次  ${bar}`);
  }
  w.line(`  首次訪問: ${intervals.sorted[0]}`);
  w.line(`  末次訪問: ${intervals.sorted[intervals.sorted.length - 1]}`);
  w.line(`  各次間隔:`);
  for (let i = 0; i < intervals.gaps.length; i++) {
    const from = intervals.sorted[i].slice(0, 16);
    const to   = intervals.sorted[i + 1].slice(0, 16);
    w.line(`    ${from} → ${to}  ${fmtH(intervals.gaps[i])}`);
  }
}

// ── 主程式 ──────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();

  console.log(`\n🔍 Googlebot 訪問間隔分析`);
  console.log(`📅 日期範圍: ${opts.start} ~ ${opts.end}`);

  const productVisits = loadVisits(opts.start, opts.end, opts.product);

  if (productVisits.size === 0) {
    console.log('⚠️  找不到符合條件的訪問記錄');
    return;
  }

  const w = new Writer();

  // 若指定單一商品，直接輸出詳細
  if (opts.product) {
    const timestamps = productVisits.get(opts.product) || [];
    if (timestamps.length === 0) {
      console.log(`⚠️  找不到 product/${opts.product} 的訪問記錄`);
      return;
    }
    const intervals = calcIntervals(timestamps);
    printDetail(w, opts.product, intervals);
    const outFile = path.join(OUTPUT_DIR, `googlebot-interval-${opts.start}-${opts.end}-product-${opts.product}.txt`);
    w.save(outFile);
    console.log(`\n✅ 已儲存: ${outFile}`);
    return;
  }

  // Top N 排行
  const ranked = [...productVisits.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, opts.top)
    .map(([ pid, timestamps ], i) => ({
      rank: i + 1,
      pid,
      total: timestamps.length,
      days: new Set(timestamps.map(ts => ts.slice(0, 10))).size,
      intervals: calcIntervals(timestamps),
    }));

  printSummaryTable(w, ranked, opts.top);

  w.line(`\n${'='.repeat(80)}`);
  w.line('各商品頁詳細間隔分析');
  for (const item of ranked) {
    if (item.intervals) printDetail(w, item.pid, item.intervals);
  }

  const outFile = path.join(OUTPUT_DIR, `googlebot-interval-${opts.start}-${opts.end}-top${opts.top}.txt`);
  w.save(outFile);
  console.log(`\n✅ 已儲存: ${outFile}`);
}

main();
