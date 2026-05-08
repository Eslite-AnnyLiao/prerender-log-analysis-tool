'use strict';

// 分析 Datadog Export CSV 格式（SSG / SSR）
// 用法:
//   node gcp-export-analyzer.js --type ssg --input ./to-analyze-daily-data/ssg/xxx.csv
//   node gcp-export-analyzer.js --type ssr --input ./to-analyze-daily-data/ssr/xxx.csv [--output <dir>]

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const SSG_EXCLUDE_UA = ['EsliteDeployValidator/1.0'];

// ============================
// 時間工具
// ============================

function toTW(utcStr) {
    const d = new Date(String(utcStr).replace(/'/g, ''));
    if (isNaN(d.getTime())) return null;
    const tw = new Date(d.getTime() + 8 * 3600 * 1000);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}:${p(tw.getUTCSeconds())}.${p(tw.getUTCMilliseconds(), 3)}`;
}

function hourLabel(utcStr) {
    const d = new Date(String(utcStr).replace(/'/g, ''));
    if (isNaN(d.getTime())) return null;
    const tw = new Date(d.getTime() + 8 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:00`;
}

function minuteLabel(utcStr) {
    const d = new Date(String(utcStr).replace(/'/g, ''));
    if (isNaN(d.getTime())) return null;
    const tw = new Date(d.getTime() + 8 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}`;
}

function hmLabel(utcStr) {
    const d = new Date(String(utcStr).replace(/'/g, ''));
    if (isNaN(d.getTime())) return null;
    const tw = new Date(d.getTime() + 8 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}`;
}

function secondLabel(utcStr) {
    const d = new Date(String(utcStr).replace(/'/g, ''));
    if (isNaN(d.getTime())) return null;
    const tw = new Date(d.getTime() + 8 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}:${p(tw.getUTCSeconds())}`;
}

// ============================
// Duration 解析
// ============================

function parseDurationMs(str) {
    if (!str) return null;
    const ms = String(str).match(/^([\d.]+)\s*ms$/i);
    if (ms) return Math.round(parseFloat(ms[1]));
    const s = String(str).match(/^([\d.]+)\s*s$/i);
    if (s) return Math.round(parseFloat(s[1]) * 1000);
    return null;
}

// ============================
// User-Agent 解析
// ============================

function parseUA(ua) {
    if (!ua) return { browser: 'Unknown', os: 'Unknown' };
    let browser = 'Unknown';
    if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
        const m = ua.match(/Chrome\/([\d.]+)/);
        browser = m ? `Chrome ${m[1]}` : 'Chrome';
    } else if (ua.includes('Firefox/')) {
        const m = ua.match(/Firefox\/([\d.]+)/);
        browser = m ? `Firefox ${m[1]}` : 'Firefox';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
        const m = ua.match(/Version\/([\d.]+).*Safari/);
        browser = m ? `Safari ${m[1]}` : 'Safari';
    } else if (ua.includes('Edg/')) {
        const m = ua.match(/Edg\/([\d.]+)/);
        browser = m ? `Edge ${m[1]}` : 'Edge';
    } else if (ua.includes('StatusCake')) {
        browser = 'StatusCake Bot';
    }
    let os = 'Unknown';
    if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
    else if (ua.includes('Windows NT')) os = 'Windows';
    else if (ua.includes('Mac OS X')) {
        const m = ua.match(/Mac OS X ([\d_]+)/);
        os = m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS';
    } else if (ua.includes('Android')) {
        const m = ua.match(/Android ([\d.]+)/);
        os = m ? `Android ${m[1]}` : 'Android';
    } else if (ua.includes('iPhone')) os = 'iOS (iPhone)';
    else if (ua.includes('iPad')) os = 'iOS (iPad)';
    else if (ua.includes('Linux')) os = 'Linux';
    return { browser, os };
}

// ============================
// 統計工具
// ============================

function pct(sorted, p) {
    if (!sorted.length) return 0;
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

// ============================
// CSV 讀取
// ============================

function extractReqId(content) {
    const m = String(content || '').match(/page-render\s*\|\s*(.+)/);
    return m ? m[1].trim() : null;
}

async function readCSV(filePath, type) {
    return new Promise((resolve, reject) => {
        const records = [];
        fs.createReadStream(filePath)
            .pipe(parse({ columns: true, trim: true, bom: true }))
            .on('data', row => {
                const ua = row['User agent'] || row['User Agent'] || row['user agent'] || '';
                const rec = {
                    date: row['Date'] || row['date'] || '',
                    durationMs: parseDurationMs(row['Duration'] || row['duration']),
                    userAgent: ua,
                    content: row['Content'] || row['content'] || '',
                    reqId: extractReqId(row['Content'] || row['content'])
                };
                if (type === 'ssr') {
                    rec.productId = (row['@product_id'] || '').trim() || null;
                }
                records.push(rec);
            })
            .on('end', () => resolve(records))
            .on('error', reject);
    });
}

// ============================
// 核心分析
// ============================

function buildAggregates(records, type) {
    const minuteCount = {};
    const hourCount = {};
    const uaCount = {};
    const uaHourly = {};
    const uaMinutely = {};
    const uaSecondly = {};
    const renderItems = [];
    const slowItems = [];
    const productIdCount = {};

    // SSG 模式下統計時排除特定 UA
    const shouldExclude = (ua) => type === 'ssg' && SSG_EXCLUDE_UA.includes(ua);

    for (const r of records) {
        if (!r.date) continue;
        const ua = r.userAgent || 'Unknown';

        // 全部記錄計入小時（用於總筆數統計）
        const hr = hourLabel(r.date);
        if (hr) hourCount[hr] = (hourCount[hr] || 0) + 1;

        // 以下統計排除指定 UA
        if (shouldExclude(ua)) continue;

        const min = minuteLabel(r.date);
        const sec = secondLabel(r.date);
        const hm = hmLabel(r.date);

        if (min) minuteCount[min] = (minuteCount[min] || 0) + 1;
        uaCount[ua] = (uaCount[ua] || 0) + 1;

        if (hr) {
            if (!uaHourly[hr]) uaHourly[hr] = {};
            uaHourly[hr][ua] = (uaHourly[hr][ua] || 0) + 1;
        }
        if (min) {
            if (!uaMinutely[min]) uaMinutely[min] = {};
            uaMinutely[min][ua] = (uaMinutely[min][ua] || 0) + 1;
        }
        if (sec) {
            if (!uaSecondly[sec]) uaSecondly[sec] = {};
            uaSecondly[sec][ua] = (uaSecondly[sec][ua] || 0) + 1;
        }

        if (r.durationMs != null) {
            renderItems.push({ ms: r.durationMs, ua, date: r.date, reqId: r.reqId });
            if (r.durationMs >= 3000) {
                slowItems.push({ ms: r.durationMs, ua, date: r.date, hm });
            }
        }

        if (type === 'ssr' && r.productId) {
            productIdCount[r.productId] = (productIdCount[r.productId] || 0) + 1;
        }
    }

    return { minuteCount, hourCount, uaCount, uaHourly, uaMinutely, uaSecondly, renderItems, slowItems, productIdCount };
}

function calcRenderStats(renderItems) {
    if (!renderItems.length) return null;
    const ms = renderItems.map(r => r.ms).sort((a, b) => a - b);
    const sum = ms.reduce((s, v) => s + v, 0);
    return {
        count: ms.length,
        avg: Math.round(sum / ms.length * 100) / 100,
        min: ms[0],
        max: ms[ms.length - 1],
        p50: Math.round(pct(ms, 50)),
        p90: Math.round(pct(ms, 90)),
        p95: Math.round(pct(ms, 95)),
        p98: Math.round(pct(ms, 98)),
        p99: Math.round(pct(ms, 99) * 10) / 10,
        slow3to5: ms.filter(v => v >= 3000 && v < 5000).length,
        slowOver5: ms.filter(v => v >= 5000).length
    };
}

function calcMinuteStats(minuteCount) {
    const entries = Object.entries(minuteCount).filter(([k]) => k);
    if (!entries.length) return { max: 0, min: 0, avg: 0, total: 0, sorted: [] };
    const counts = entries.map(([, c]) => c);
    return {
        max: Math.max(...counts),
        min: Math.min(...counts),
        avg: Math.round(counts.reduce((s, v) => s + v, 0) / counts.length * 100) / 100,
        total: counts.length,
        sorted: [...entries].sort((a, b) => b[1] - a[1])
    };
}

function calcPeakMinuteUA(minuteCount, records, type) {
    const entries = Object.entries(minuteCount).filter(([k]) => k);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const [peakMin, peakCount] = entries[0];
    const tied = entries.filter(([, c]) => c === peakCount).map(([m]) => m);
    const uaInPeak = {};
    records
        .filter(r => {
            if (minuteLabel(r.date) !== peakMin) return false;
            if (type === 'ssg' && SSG_EXCLUDE_UA.includes(r.userAgent)) return false;
            return true;
        })
        .forEach(r => {
            const ua = r.userAgent || 'Unknown';
            uaInPeak[ua] = (uaInPeak[ua] || 0) + 1;
        });
    const uaRanking = Object.entries(uaInPeak).map(([ua, count]) => {
        const { browser, os } = parseUA(ua);
        return { ua, count, pct: Math.round(count / peakCount * 10000) / 100, browser, os };
    }).sort((a, b) => b.count - a.count);
    const bd = {}, od = {};
    uaRanking.forEach(({ ua, count }) => {
        const { browser, os } = parseUA(ua);
        bd[browser] = (bd[browser] || 0) + count;
        od[os] = (od[os] || 0) + count;
    });
    return {
        peakMin,
        peakCount,
        tiedCount: tied.length,
        uniqueUA: uaRanking.length,
        uaRanking: uaRanking.slice(0, 20),
        browserDist: Object.entries(bd).sort((a, b) => b[1] - a[1]).map(([browser, count]) => ({ browser, count, pct: Math.round(count / peakCount * 10000) / 100 })),
        osDist: Object.entries(od).sort((a, b) => b[1] - a[1]).map(([os, count]) => ({ os, count, pct: Math.round(count / peakCount * 10000) / 100 }))
    };
}

function calcHighFreq(uaMinutely, uaSecondly) {
    const minVio = [], secVio = [];
    const violatingUA = new Set();

    Object.entries(uaMinutely).forEach(([min, uas]) => {
        Object.entries(uas).forEach(([ua, count]) => {
            if (count > 2) { minVio.push({ min, ua, count }); violatingUA.add(ua); }
        });
    });
    Object.entries(uaSecondly).forEach(([sec, uas]) => {
        Object.entries(uas).forEach(([ua, count]) => {
            if (count > 2) { secVio.push({ sec, ua, count }); violatingUA.add(ua); }
        });
    });

    const aggMin = {}, aggSec = {};
    minVio.forEach(({ ua, count }) => {
        if (!aggMin[ua]) aggMin[ua] = { ua, total: 0, maxCount: 0 };
        aggMin[ua].total += count;
        aggMin[ua].maxCount = Math.max(aggMin[ua].maxCount, count);
    });
    secVio.forEach(({ ua, count }) => {
        if (!aggSec[ua]) aggSec[ua] = { ua, total: 0, maxCount: 0 };
        aggSec[ua].total += count;
        aggSec[ua].maxCount = Math.max(aggSec[ua].maxCount, count);
    });

    return {
        minuteTop10: Object.values(aggMin).sort((a, b) => b.total - a.total).slice(0, 10),
        secondTop10: Object.values(aggSec).sort((a, b) => b.total - a.total).slice(0, 10),
        totalMinVio: minVio.length,
        totalSecVio: secVio.length,
        uniqueViolatingUA: violatingUA.size
    };
}

function calcUAStats(uaCount, uaHourly, renderItems) {
    const rtByUA = {};
    renderItems.forEach(({ ua, ms }) => {
        if (!rtByUA[ua]) rtByUA[ua] = [];
        rtByUA[ua].push(ms);
    });
    const total = Object.values(uaCount).reduce((s, v) => s + v, 0);
    const ranking = Object.entries(uaCount).map(([ua, count]) => {
        const { browser, os } = parseUA(ua);
        const rts = rtByUA[ua] || [];
        const avgMs = rts.length ? Math.round(rts.reduce((s, v) => s + v, 0) / rts.length * 100) / 100 : null;
        return { ua, count, pct: Math.round(count / total * 10000) / 100, browser, os, avgMs };
    }).sort((a, b) => b.count - a.count);
    const bd = {}, od = {};
    ranking.forEach(({ browser, os, count }) => {
        bd[browser] = (bd[browser] || 0) + count;
        od[os] = (od[os] || 0) + count;
    });
    const hourlyTop = {};
    Object.entries(uaHourly).forEach(([hr, uas]) => {
        const sorted = Object.entries(uas).sort((a, b) => b[1] - a[1]);
        hourlyTop[hr] = {
            top: sorted[0] ? { ua: sorted[0][0], count: sorted[0][1] } : null,
            total: sorted.reduce((s, [, c]) => s + c, 0),
            unique: sorted.length
        };
    });
    return {
        total,
        unique: ranking.length,
        ranking: ranking.slice(0, 10),
        browsers: Object.entries(bd).sort((a, b) => b[1] - a[1]).map(([browser, count]) => ({ browser, count, pct: Math.round(count / total * 10000) / 100 })),
        oses: Object.entries(od).sort((a, b) => b[1] - a[1]).map(([os, count]) => ({ os, count, pct: Math.round(count / total * 10000) / 100 })),
        hourlyTop
    };
}

function calcSlowHM(slowItems) {
    const hmCount = {};
    slowItems.forEach(({ hm }) => { if (hm) hmCount[hm] = (hmCount[hm] || 0) + 1; });
    const all = Object.entries(hmCount).sort((a, b) => a[0].localeCompare(b[0])).map(([time, count]) => ({ time, count }));
    const maxC = all.length ? Math.max(...all.map(i => i.count)) : 0;
    return {
        all,
        duplicates: [...all].filter(i => i.count > 1).sort((a, b) => b.count - a.count),
        mostFrequent: all.filter(i => i.count === maxC),
        total: slowItems.length
    };
}

// ============================
// 報告產生（共用段落）
// ============================

function nowTW() {
    return new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: true });
}

function appendCommonSections(lines, records, agg, computed, type) {
    const { hourCount } = agg;
    const { minStats, peakUA, hf, uaStats } = computed;
    const avgPerHour = Object.keys(hourCount).length
        ? Math.round(Object.values(hourCount).reduce((s, v) => s + v, 0) / Object.keys(hourCount).length * 100) / 100
        : 0;

    lines.push(`每小時資料筆數平均值: ${avgPerHour}`);
    lines.push('');
    lines.push('每分鐘 Request 數量統計:');
    lines.push(`• 最高值: ${minStats.max} requests/分鐘`);
    lines.push(`• 最低值: ${minStats.min} requests/分鐘`);
    lines.push(`• 平均值: ${minStats.avg} requests/分鐘`);
    lines.push(`• 統計分鐘數: ${minStats.total} 分鐘`);
    lines.push('');
    lines.push('每分鐘 Request 數量 TOP 15:');
    minStats.sorted.slice(0, 15).forEach(([min, count], i) => {
        lines.push(`${i + 1}. ${min} - ${count} requests`);
    });
    lines.push('');

    if (peakUA) {
        lines.push('每分鐘Request數量最高值的分鐘中User-Agent分析 (台灣時區):');
        lines.push('='.repeat(48));
        lines.push('峰值分鐘總體資訊:');
        lines.push(`• 峰值分鐘: ${peakUA.peakMin}`);
        lines.push(`• 峰值請求數: ${peakUA.peakCount} 筆`);
        lines.push(`• 並列峰值分鐘數: ${peakUA.tiedCount} 個`);
        lines.push(`• 該分鐘不同User-Agent數量: ${peakUA.uniqueUA} 種`);
        lines.push('');
        lines.push('峰值分鐘User-Agent排行榜 (前20名):');
        peakUA.uaRanking.forEach((item, i) => {
            lines.push(`${i + 1}. User-Agent: ${item.ua}`);
            lines.push(`   • 請求數: ${item.count} 筆`);
            lines.push(`   • 佔比: ${item.pct}%`);
            lines.push(`   • 瀏覽器: ${item.browser}`);
        });
        lines.push('');
    }

    lines.push('高頻訪問模式分析:');
    lines.push('='.repeat(48));
    lines.push('📊 高頻訪問整體統計:');
    lines.push(`• 一分鐘內 >2次 筆數: ${hf.totalMinVio}`);
    lines.push(`• 一秒內 >2次 筆數: ${hf.totalSecVio}`);
    lines.push(`• 涉及 UserAgent 種數: ${hf.uniqueViolatingUA}`);
    lines.push('');
    lines.push('🚨 一分鐘內訪問大於2次的 UserAgent (前10名):');
    if (hf.minuteTop10.length) {
        hf.minuteTop10.forEach((item, i) => {
            lines.push(`${i + 1}. ${item.ua}`);
            lines.push(`   • 觸發次數: ${item.total}, 最高單分鐘: ${item.maxCount}`);
        });
    } else {
        lines.push('• 無紀錄');
    }
    lines.push('');
    lines.push('⚡ 一秒內訪問大於2次的 UserAgent (前10名):');
    if (hf.secondTop10.length) {
        hf.secondTop10.forEach((item, i) => {
            lines.push(`${i + 1}. ${item.ua}`);
            lines.push(`   • 觸發次數: ${item.total}, 最高單秒: ${item.maxCount}`);
        });
    } else {
        lines.push('• 無紀錄');
    }
    lines.push('');

    lines.push('User-Agent 分析結果:');
    lines.push('='.repeat(48));
    lines.push('User-Agent 總體統計:');
    lines.push(`• 總請求數: ${uaStats.total}`);
    lines.push(`• 不同 User-Agent 數量: ${uaStats.unique}`);
    lines.push('');
    const rankTitle = type === 'ssr'
        ? 'User-Agent 排行榜 (前10名，包含平均 Render 時間):'
        : 'User-Agent 排行榜 (前10名):';
    lines.push(rankTitle);
    uaStats.ranking.forEach((item, i) => {
        lines.push(`${i + 1}. User-Agent: ${item.ua}`);
        lines.push(`   • 請求數: ${item.count} 筆 (${item.pct}%)`);
        lines.push(`   • 瀏覽器: ${item.browser} / OS: ${item.os}`);
        if (item.avgMs != null) lines.push(`   • 平均Duration: ${item.avgMs} ms`);
    });
    lines.push('');
    lines.push('每小時最常訪問的 User-Agent (前24小時):');
    Object.entries(uaStats.hourlyTop)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([hr, info]) => {
            if (info.top) lines.push(`${hr}: ${info.top.ua} (${info.top.count} 筆, 共 ${info.total} 筆, ${info.unique} 種UA)`);
        });
    lines.push('');
    lines.push('每小時資料筆數詳細 (台灣時區):');
    Object.entries(hourCount)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([hr, count]) => lines.push(`${hr}: ${count} 筆`));
    lines.push('');
}

function generateSSGReport(filePath, records, agg, computed) {
    const excludedCount = records.filter(r => SSG_EXCLUDE_UA.includes(r.userAgent)).length;
    const lines = [];
    lines.push('Datadog Log 分析報告 (SSG 模式)');
    lines.push(`生成時間: ${nowTW()}`);
    lines.push('時區說明: 所有時間已轉換為台灣時區 (UTC+8)');
    lines.push('='.repeat(64));
    lines.push('');
    lines.push('檔案資訊:');
    lines.push(`• 輸入檔案: ${filePath}`);
    lines.push('');
    lines.push('資料來源統計:');
    lines.push('• 分析模式: Datadog Export SSG 單檔案模式');
    lines.push(`• 總記錄筆數: ${records.length} 筆`);
    lines.push(`• 排除 EsliteDeployValidator 筆數: ${excludedCount} 筆`);
    lines.push(`• 實際分析筆數: ${records.length - excludedCount} 筆`);
    lines.push('');
    appendCommonSections(lines, records, agg, computed, 'ssg');
    return lines.join('\n');
}

function generateSSRReport(filePath, records, agg, computed) {
    const { renderItems, slowItems, productIdCount } = agg;
    const { renderStats, slowHM } = computed;
    const lines = [];
    lines.push('Datadog Log 分析報告 (SSR 模式)');
    lines.push(`生成時間: ${nowTW()}`);
    lines.push('時區說明: 所有時間已轉換為台灣時區 (UTC+8)');
    lines.push('='.repeat(64));
    lines.push('');
    lines.push('檔案資訊:');
    lines.push(`• 輸入檔案: ${filePath}`);
    lines.push('');
    lines.push('資料來源統計:');
    lines.push('• 分析模式: Datadog Export SSR 單檔案模式');
    lines.push(`• 總記錄筆數: ${records.length} 筆`);
    lines.push(`• 有效 Duration 記錄: ${renderItems.length} 筆`);
    lines.push('');

    if (renderStats) {
        lines.push('Render Time 統計:');
        lines.push(`• 平均值: ${renderStats.avg} ms`);
        lines.push(`• 最小值: ${renderStats.min} ms`);
        lines.push(`• 最大值: ${renderStats.max} ms`);
        lines.push(`• 中位數 (P50): ${renderStats.p50} ms`);
        lines.push(`• 第90百分位數 (P90): ${renderStats.p90} ms`);
        lines.push(`• 第95百分位數 (P95): ${renderStats.p95} ms`);
        lines.push(`• 第98百分位數 (P98): ${renderStats.p98} ms`);
        lines.push(`• 第99百分位數 (P99): ${renderStats.p99} ms`);
        lines.push(`• 慢渲染 (3-5秒)的總數: ${renderStats.slow3to5}`);
        lines.push(`• 異常渲染 (5秒以上)的總數: ${renderStats.slowOver5}`);
        lines.push(`• 總資料筆數: ${renderStats.count}`);
        lines.push('');
    }

    appendCommonSections(lines, records, agg, computed, 'ssr');

    lines.push('慢渲染時段同時同分統計 (>3000ms, 台灣時區):');
    lines.push('='.repeat(48));
    lines.push('慢渲染時段同時同分總體統計:');
    lines.push(`• 慢渲染總筆數: ${slowHM.total}`);
    lines.push(`• 出現慢渲染的不同時分點數: ${slowHM.all.length}`);
    lines.push('');
    lines.push('慢渲染出現次數最多的時分:');
    if (slowHM.mostFrequent.length) {
        slowHM.mostFrequent.forEach((item, i) => lines.push(`${i + 1}. ${item.time} - ${item.count} 次`));
    } else {
        lines.push('• 無慢渲染記錄');
    }
    lines.push('');
    lines.push('慢渲染重複出現的時分點 (出現次數 > 1):');
    if (slowHM.duplicates.length) {
        slowHM.duplicates.forEach((item, i) => lines.push(`${i + 1}. ${item.time} - ${item.count} 次`));
    } else {
        lines.push('• 無重複時分點');
    }
    lines.push('');
    lines.push('所有慢渲染時分點統計 (按時間排序):');
    slowHM.all.forEach(item => lines.push(`${item.time}: ${item.count} 次`));
    lines.push('');

    lines.push('Render 時間前 15 名 (最慢的請求，包含 User-Agent):');
    [...renderItems].sort((a, b) => b.ms - a.ms).slice(0, 15).forEach((item, i) => {
        const tw = toTW(item.date);
        lines.push(`${i + 1}. ${item.ms} ms | ${item.ua} | ${tw || item.date}`);
    });
    lines.push('');

    lines.push('大於 3000ms 的時段 (台灣時區，按時間排序，前10筆):');
    [...slowItems].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 10).forEach((item, i) => {
        const tw = toTW(item.date);
        lines.push(`${i + 1}. ${tw || item.date} | ${item.ms} ms | ${item.ua}`);
    });
    lines.push('');

    const pidEntries = Object.entries(productIdCount).sort((a, b) => b[1] - a[1]);
    if (pidEntries.length) {
        lines.push('@product_id 統計 (前10名):');
        pidEntries.slice(0, 10).forEach(([pid, count], i) => {
            lines.push(`${i + 1}. ${pid}: ${count} 次`);
        });
        lines.push('');
    }

    return lines.join('\n');
}

// ============================
// Combined 模式
// ============================

function mergeCombinedAggregates(ssgRecords, ssrRecords) {
    const minuteCount = {};
    const hourCount = { ssg: {}, ssr: {}, total: {} };
    const uaCount = { ssg: {}, ssr: {}, total: {} };
    const uaMinutely = {};
    const uaSecondly = {};

    function processRecords(records, label) {
        for (const r of records) {
            if (!r.date) continue;
            const ua = r.userAgent || 'Unknown';
            const min = minuteLabel(r.date);
            const hr = hourLabel(r.date);
            const sec = secondLabel(r.date);

            if (min) minuteCount[min] = (minuteCount[min] || 0) + 1;

            if (hr) {
                hourCount[label][hr] = (hourCount[label][hr] || 0) + 1;
                hourCount.total[hr] = (hourCount.total[hr] || 0) + 1;
            }

            uaCount[label][ua] = (uaCount[label][ua] || 0) + 1;
            uaCount.total[ua] = (uaCount.total[ua] || 0) + 1;

            if (min) {
                if (!uaMinutely[min]) uaMinutely[min] = {};
                uaMinutely[min][ua] = (uaMinutely[min][ua] || 0) + 1;
            }
            if (sec) {
                if (!uaSecondly[sec]) uaSecondly[sec] = {};
                uaSecondly[sec][ua] = (uaSecondly[sec][ua] || 0) + 1;
            }
        }
    }

    processRecords(ssgRecords, 'ssg');
    processRecords(ssrRecords, 'ssr');

    return { minuteCount, hourCount, uaCount, uaMinutely, uaSecondly };
}

function calcCombinedUAStats(uaCount) {
    const total = Object.values(uaCount.total).reduce((s, v) => s + v, 0);
    const ranking = Object.entries(uaCount.total).map(([ua, count]) => {
        const { browser, os } = parseUA(ua);
        return {
            ua,
            total: count,
            ssg: uaCount.ssg[ua] || 0,
            ssr: uaCount.ssr[ua] || 0,
            pct: Math.round(count / total * 10000) / 100,
            browser,
            os
        };
    }).sort((a, b) => b.total - a.total);
    return { total, unique: ranking.length, ranking: ranking.slice(0, 20) };
}

function generateCombinedReport(dateDigits, ssgFile, ssrFile, rawSsgCount, ssgRecords, ssrRecords, agg) {
    const { minuteCount, hourCount, uaCount, uaMinutely, uaSecondly } = agg;
    const minStats = calcMinuteStats(minuteCount);
    const peakUA = calcPeakMinuteUA(minuteCount, [...ssgRecords, ...ssrRecords], 'combined');
    const hf = calcHighFreq(uaMinutely, uaSecondly);
    const uaStats = calcCombinedUAStats(uaCount);

    const ssgExcluded = rawSsgCount - ssgRecords.length;
    const dateDash = `${dateDigits.slice(0,4)}-${dateDigits.slice(4,6)}-${dateDigits.slice(6,8)}`;

    const lines = [];
    lines.push('Datadog Log 分析報告 (Combined 模式)');
    lines.push(`生成時間: ${nowTW()}`);
    lines.push('時區說明: 所有時間已轉換為台灣時區 (UTC+8)');
    lines.push('='.repeat(64));
    lines.push('');
    lines.push('檔案資訊:');
    lines.push(`• 日期: ${dateDash}`);
    lines.push(`• SSG 檔案: ${ssgFile}`);
    lines.push(`• SSR 檔案: ${ssrFile}`);
    lines.push('');
    lines.push('資料來源統計:');
    lines.push('• 分析模式: Combined（SSG + SSR 合併）');
    lines.push(`• SSG 原始記錄: ${rawSsgCount} 筆（排除 EsliteDeployValidator: ${ssgExcluded} 筆）`);
    lines.push(`• SSR 記錄: ${ssrRecords.length} 筆`);
    lines.push(`• 合併分析總筆數: ${uaStats.total} 筆`);
    lines.push('');

    const totalHours = Object.keys(hourCount.total).length;
    const avgPerHour = totalHours
        ? Math.round(Object.values(hourCount.total).reduce((s, v) => s + v, 0) / totalHours * 100) / 100
        : 0;
    lines.push(`每小時資料筆數平均值 (合計): ${avgPerHour}`);
    lines.push('');

    lines.push('每分鐘 Request 數量統計 (合計):');
    lines.push(`• 最高值: ${minStats.max} requests/分鐘`);
    lines.push(`• 最低值: ${minStats.min} requests/分鐘`);
    lines.push(`• 平均值: ${minStats.avg} requests/分鐘`);
    lines.push(`• 統計分鐘數: ${minStats.total} 分鐘`);
    lines.push('');
    lines.push('每分鐘 Request 數量 TOP 15 (合計):');
    minStats.sorted.slice(0, 15).forEach(([min, count], i) => {
        lines.push(`${i + 1}. ${min} - ${count} requests`);
    });
    lines.push('');

    if (peakUA) {
        lines.push('峰值分鐘 User-Agent 分析 (台灣時區):');
        lines.push('='.repeat(48));
        lines.push(`• 峰值分鐘: ${peakUA.peakMin}`);
        lines.push(`• 峰值請求數: ${peakUA.peakCount} 筆`);
        lines.push(`• 並列峰值分鐘數: ${peakUA.tiedCount} 個`);
        lines.push(`• 該分鐘不同User-Agent數量: ${peakUA.uniqueUA} 種`);
        lines.push('');
        lines.push('峰值分鐘 User-Agent 排行 (前20名):');
        peakUA.uaRanking.forEach((item, i) => {
            lines.push(`${i + 1}. User-Agent: ${item.ua}`);
            lines.push(`   • 請求數: ${item.count} 筆 (${item.pct}%)`);
        });
        lines.push('');
    }

    lines.push('高頻訪問模式分析 (合計):');
    lines.push('='.repeat(48));
    lines.push('📊 高頻訪問整體統計:');
    lines.push(`• 一分鐘內 >2次 筆數: ${hf.totalMinVio}`);
    lines.push(`• 一秒內 >2次 筆數: ${hf.totalSecVio}`);
    lines.push(`• 涉及 UserAgent 種數: ${hf.uniqueViolatingUA}`);
    lines.push('');
    lines.push('🚨 一分鐘內訪問大於2次的 UserAgent (前10名):');
    if (hf.minuteTop10.length) {
        hf.minuteTop10.forEach((item, i) => {
            lines.push(`${i + 1}. ${item.ua}`);
            lines.push(`   • 觸發次數: ${item.total}, 最高單分鐘: ${item.maxCount}`);
        });
    } else {
        lines.push('• 無紀錄');
    }
    lines.push('');
    lines.push('⚡ 一秒內訪問大於2次的 UserAgent (前10名):');
    if (hf.secondTop10.length) {
        hf.secondTop10.forEach((item, i) => {
            lines.push(`${i + 1}. ${item.ua}`);
            lines.push(`   • 觸發次數: ${item.total}, 最高單秒: ${item.maxCount}`);
        });
    } else {
        lines.push('• 無紀錄');
    }
    lines.push('');

    lines.push('User-Agent 進站總數排行 (前20名，含 SSG/SSR 分類):');
    lines.push('='.repeat(48));
    lines.push(`總計: ${uaStats.total} 筆 / 不同 UA: ${uaStats.unique} 種`);
    lines.push('');
    uaStats.ranking.forEach((item, i) => {
        lines.push(`${i + 1}. User-Agent: ${item.ua}`);
        lines.push(`   • 總計: ${item.total} 筆 (${item.pct}%)  SSG: ${item.ssg} 筆  SSR: ${item.ssr} 筆`);
    });
    lines.push('');

    lines.push('每小時資料筆數詳細 (台灣時區):');
    const allHours = [...new Set([
        ...Object.keys(hourCount.ssg),
        ...Object.keys(hourCount.ssr)
    ])].sort();
    allHours.forEach(hr => {
        const s = hourCount.ssg[hr] || 0;
        const r = hourCount.ssr[hr] || 0;
        lines.push(`${hr}: 合計 ${s + r} 筆  (SSG: ${s}, SSR: ${r})`);
    });
    lines.push('');

    return lines.join('\n');
}

// ============================
// Main
// ============================

function parseArgs(argv) {
    const args = { type: null, input: null, date: null, output: null };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--type' && argv[i + 1]) args.type = argv[++i];
        else if (argv[i] === '--input' && argv[i + 1]) args.input = argv[++i];
        else if (argv[i] === '--date' && argv[i + 1]) args.date = argv[++i];
        else if (argv[i] === '--output' && argv[i + 1]) args.output = argv[++i];
    }
    return args;
}

// 將 20260508 或 2026-05-08 統一轉為 8 碼純數字 YYYYMMDD
function normalizeDate(dateStr) {
    const clean = dateStr.replace(/\D/g, '');
    return clean.length === 8 ? clean : null;
}

// 依固定命名規則 {type}-product-log-YYYYMMDD.csv 組出路徑
function findInputByDate(type, dateDigits) {
    const filePath = `./to-analyze-daily-data/${type}/${type}-product-log-${dateDigits}.csv`;
    if (!fs.existsSync(filePath)) {
        console.error(`錯誤: 找不到檔案 "${filePath}"`);
        process.exit(1);
    }
    return filePath;
}

async function main() {
    const { type, input: inputArg, date, output } = parseArgs(process.argv);

    if (!type || !['ssg', 'ssr', 'combined'].includes(type)) {
        console.error('錯誤: 請指定 --type ssg / ssr / combined');
        console.log('用法: node datadog-export-analyzer.js --type <ssg|ssr|combined> --date <YYYYMMDD>');
        console.log('      node datadog-export-analyzer.js --type <ssg|ssr> --input <csv_file>');
        process.exit(1);
    }

    // ── Combined 模式 ──────────────────────────────────────
    if (type === 'combined') {
        if (!date) {
            console.error('錯誤: combined 模式需要指定 --date <YYYYMMDD>');
            process.exit(1);
        }
        const dateDigits = normalizeDate(date);
        if (!dateDigits) {
            console.error(`錯誤: 無效的日期格式 "${date}"`);
            process.exit(1);
        }
        const ssgFile = findInputByDate('ssg', dateDigits);
        const ssrFile = findInputByDate('ssr', dateDigits);

        console.log(`\n分析模式: COMBINED`);
        console.log(`SSG 檔案: ${ssgFile}`);
        console.log(`SSR 檔案: ${ssrFile}`);

        const [rawSsg, rawSsr] = await Promise.all([
            readCSV(ssgFile, 'ssg'),
            readCSV(ssrFile, 'ssr')
        ]);

        // SSG 排除指定 UA
        const ssgRecords = rawSsg.filter(r => !SSG_EXCLUDE_UA.includes(r.userAgent));
        const ssrRecords = rawSsr;

        console.log(`SSG: ${rawSsg.length} 筆（排除後 ${ssgRecords.length} 筆）`);
        console.log(`SSR: ${ssrRecords.length} 筆`);

        const combinedAgg = mergeCombinedAggregates(ssgRecords, ssrRecords);
        const report = generateCombinedReport(dateDigits, ssgFile, ssrFile, rawSsg.length, ssgRecords, ssrRecords, combinedAgg);

        const outDir = output || `./daily-analysis-result/datadog-export/combined`;
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const txtPath = path.join(outDir, `combined-${dateDigits}_analysis.txt`);
        const jsonPath = path.join(outDir, `combined-${dateDigits}_analysis.json`);

        fs.writeFileSync(txtPath, report, 'utf8');

        const jsonOut = {
            generatedAt: new Date().toISOString(),
            type: 'combined',
            date: dateDigits,
            ssgFile,
            ssrFile,
            ssgRecords: rawSsg.length,
            ssrRecords: ssrRecords.length,
            combinedTotal: Object.values(combinedAgg.uaCount.total).reduce((s, v) => s + v, 0),
            hourCount: combinedAgg.hourCount,
            minuteStats: calcMinuteStats(combinedAgg.minuteCount),
            highFrequency: calcHighFreq(combinedAgg.uaMinutely, combinedAgg.uaSecondly),
            uaStats: calcCombinedUAStats(combinedAgg.uaCount)
        };
        fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), 'utf8');

        console.log(`\n分析完成！`);
        console.log(`• 文字報告: ${txtPath}`);
        console.log(`• JSON 資料: ${jsonPath}`);
        return;
    }

    // ── SSG / SSR 模式 ─────────────────────────────────────
    let input = inputArg;

    if (!input && date) {
        const dateDigits = normalizeDate(date);
        if (!dateDigits) {
            console.error(`錯誤: 無效的日期格式 "${date}"，請使用 YYYYMMDD 或 YYYY-MM-DD`);
            process.exit(1);
        }
        input = findInputByDate(type, dateDigits);
    }

    if (!input) {
        console.error('錯誤: 請指定 --date <YYYYMMDD> 或 --input <csv_file>');
        process.exit(1);
    }
    if (!fs.existsSync(input)) {
        console.error(`錯誤: 找不到檔案 "${input}"`);
        process.exit(1);
    }

    console.log(`\n讀取檔案: ${input}`);
    console.log(`分析模式: ${type.toUpperCase()}`);
    if (type === 'ssg') console.log(`排除 UA: ${SSG_EXCLUDE_UA.join(', ')}`);

    const records = await readCSV(input, type);
    console.log(`共 ${records.length} 筆記錄`);

    const agg = buildAggregates(records, type);

    const computed = {
        renderStats: calcRenderStats(agg.renderItems),
        minStats: calcMinuteStats(agg.minuteCount),
        peakUA: calcPeakMinuteUA(agg.minuteCount, records, type),
        slowHM: calcSlowHM(agg.slowItems),
        hf: calcHighFreq(agg.uaMinutely, agg.uaSecondly),
        uaStats: calcUAStats(agg.uaCount, agg.uaHourly, agg.renderItems)
    };

    const report = type === 'ssg'
        ? generateSSGReport(input, records, agg, computed)
        : generateSSRReport(input, records, agg, computed);

    const outDir = output || `./daily-analysis-result/datadog-export/${type}`;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const base = path.basename(input, '.csv');
    const txtPath = path.join(outDir, `${base}_analysis.txt`);
    const jsonPath = path.join(outDir, `${base}_analysis.json`);

    fs.writeFileSync(txtPath, report, 'utf8');

    const jsonOut = {
        generatedAt: new Date().toISOString(),
        type,
        inputFile: input,
        totalRecords: records.length,
        excludedUA: type === 'ssg' ? SSG_EXCLUDE_UA : undefined,
        renderStats: computed.renderStats,
        minuteStats: computed.minStats,
        peakMinuteUA: computed.peakUA,
        slowHourMinute: type === 'ssr' ? computed.slowHM : undefined,
        highFrequency: computed.hf,
        userAgentStats: computed.uaStats,
        hourCount: agg.hourCount,
        top15SlowRenders: type === 'ssr'
            ? [...agg.renderItems].sort((a, b) => b.ms - a.ms).slice(0, 15).map(r => ({ ms: r.ms, ua: r.ua, tw: toTW(r.date) }))
            : undefined,
        productIdStats: type === 'ssr'
            ? Object.entries(agg.productIdCount).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([id, count]) => ({ id, count }))
            : undefined
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), 'utf8');

    console.log(`\n分析完成！`);
    console.log(`• 文字報告: ${txtPath}`);
    console.log(`• JSON 資料: ${jsonPath}`);
}

main().catch(err => {
    console.error('執行錯誤:', err.message);
    process.exit(1);
});
