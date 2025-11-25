#!/usr/bin/env node

const SlowRenderingAnalyzer = require('./slow-rendering-analyzer');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        showUsage();
        return;
    }

    const dateStr = args[0];
    
    // 解析命令列參數
    const options = {
        queryType: 'all',    // 預設查詢所有記錄
        maxRecords: null,    // 預設不限制數量
        delayMs: 2000       // 預設間隔 2 秒
    };

    // 解析其他參數
    for (let i = 1; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];
        
        switch(flag) {
            case '--type':
                if (['all', 'over20s', 'standard'].includes(value)) {
                    options.queryType = value;
                } else {
                    console.error(`❌ 無效的查詢類型: ${value}`);
                    return;
                }
                break;
            case '--max':
                const maxRecords = parseInt(value);
                if (!isNaN(maxRecords) && maxRecords > 0) {
                    options.maxRecords = maxRecords;
                } else {
                    console.error(`❌ 無效的最大記錄數: ${value}`);
                    return;
                }
                break;
            case '--delay':
                const delayMs = parseInt(value);
                if (!isNaN(delayMs) && delayMs >= 0) {
                    options.delayMs = delayMs;
                } else {
                    console.error(`❌ 無效的延遲時間: ${value}`);
                    return;
                }
                break;
            default:
                console.warn(`⚠️ 未知的參數: ${flag}`);
        }
    }

    try {
        console.log('🚀 SlowRenderingAnalyzer 啟動');
        console.log('=' .repeat(50));
        
        const analyzer = new SlowRenderingAnalyzer({
            baseOutputDir: './slow-render-query-results'
        });

        const result = await analyzer.queryByDate(dateStr, options);
        
        if (result.success) {
            console.log('\n📋 最終報告:');
            console.log(`📅 查詢日期: ${result.date}`);
            console.log(`📊 總記錄數: ${result.totalRecords}`);
            console.log(`✅ 有效記錄: ${result.validRecords}`);
            console.log(`🎯 查詢記錄: ${result.queriedRecords}`);
            console.log(`✅ 成功查詢: ${result.successfulQueries}`);
            console.log(`❌ 失敗查詢: ${result.failedQueries}`);
            console.log(`📁 結果存放: ./slow-render-query-results/${result.date}/batch-query/`);
        }
        
    } catch (error) {
        console.error('\n❌ 執行失敗:', error.message);
        process.exit(1);
    }
}

function showUsage() {
    console.log('\n📖 慢渲染查詢工具 - 按日期查詢');
    console.log('=' .repeat(50));
    console.log('\n使用方式:');
    console.log('  node query-slow-renders-by-date.js <日期> [選項]');
    console.log('\n📅 日期格式:');
    console.log('  • YYYYMMDD: 20251019');
    console.log('  • YYYY-MM-DD: 2025-10-19');
    console.log('\n⚙️ 可用選項:');
    console.log('  --type <類型>     查詢類型 (all|over20s|standard)');
    console.log('                    • all: 查詢所有記錄 (預設)');
    console.log('                    • over20s: 只查詢超過 20 秒的記錄');
    console.log('                    • standard: 只查詢 8-20 秒的記錄');
    console.log('  --max <數量>      限制查詢記錄數量');
    console.log('  --delay <毫秒>    查詢間隔時間 (預設 2000ms)');
    console.log('\n💡 使用範例:');
    console.log('  # 查詢 2025-10-19 的所有慢渲染記錄');
    console.log('  node query-slow-renders-by-date.js 20251019');
    console.log('');
    console.log('  # 只查詢超過 20 秒的記錄，最多 5 筆');
    console.log('  node query-slow-renders-by-date.js 2025-10-19 --type over20s --max 5');
    console.log('');
    console.log('  # 查詢標準慢渲染記錄，間隔 1 秒');
    console.log('  node query-slow-renders-by-date.js 20251019 --type standard --delay 1000');
    console.log('\n📁 輸出位置:');
    console.log('  結果將存放在 ./slow-render-query-results/{日期}/batch-query/ 目錄');
    console.log('\n📄 相關檔案:');
    console.log('  • 查詢結果: slow_render_*.csv');
    console.log('  • 查詢摘要: batch_query_summary.json');
}

// 主程式執行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;