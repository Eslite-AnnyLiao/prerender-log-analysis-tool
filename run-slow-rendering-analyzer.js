#!/usr/bin/env node

const readline = require('readline');
const { execSync } = require('child_process');
const SlowRenderingAnalyzer = require('./slow-rendering-analyzer');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function showMenu() {
    console.log('\n🔍 慢渲染分析工具');
    console.log('='.repeat(30));
    console.log('1. 查詢並下載日誌');
    console.log('2. 分析慢渲染原因');
    console.log('3. 執行完整流程 (查詢 + 分析)');
    console.log('4. 篩選慢渲染記錄 (filter-slow-renders)');
    console.log('5. 顯示使用說明');
    console.log('6. 退出');
    console.log('='.repeat(30));
}

function askDate() {
    return new Promise((resolve) => {
        rl.question('請輸入日期 (格式: YYYYMMDD 或 YYYY-MM-DD): ', (date) => {
            resolve(date.trim());
        });
    });
}

function askQueryOptions() {
    return new Promise((resolve) => {
        console.log('\n📋 查詢選項:');
        console.log('1. 查詢所有記錄 (all)');
        console.log('2. 只查詢超過20秒的記錄 (over20s)');
        console.log('3. 只查詢8-20秒的記錄 (standard)');
        
        rl.question('請選擇查詢類型 (1-3, 預設為1): ', (choice) => {
            const queryTypes = { '1': 'all', '2': 'over20s', '3': 'standard' };
            const queryType = queryTypes[choice] || 'all';
            
            rl.question('限制查詢記錄數 (直接按Enter為不限制): ', (maxRecords) => {
                rl.question('查詢間隔毫秒數 (預設2000ms): ', (delayMs) => {
                    resolve({
                        queryType,
                        maxRecords: maxRecords ? parseInt(maxRecords) : null,
                        delayMs: delayMs ? parseInt(delayMs) : 2000
                    });
                });
            });
        });
    });
}

function askChoice() {
    return new Promise((resolve) => {
        rl.question('請選擇操作 (1-6): ', (choice) => {
            resolve(choice.trim());
        });
    });
}

function askFilterFirst() {
    return new Promise((resolve) => {
        rl.question('是否先執行 filter-slow-renders 篩選慢渲染記錄？ (y/n, 預設為 y): ', (answer) => {
            const shouldFilter = !answer || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
            resolve(shouldFilter);
        });
    });
}

function askThreshold() {
    return new Promise((resolve) => {
        rl.question('請輸入渲染時間閾值 (毫秒，預設 20000): ', (threshold) => {
            const thresholdMs = threshold ? parseInt(threshold) : 20000;
            resolve(thresholdMs);
        });
    });
}

async function runFilterSlowRenders(date, threshold = 20000) {
    try {
        console.log(`\n🔍 執行 filter-slow-renders.js...`);
        console.log(`📅 日期: ${date}`);
        console.log(`⏱️  閾值: ${threshold}ms`);
        
        const command = `node filter-slow-renders.js ${date} ${threshold}`;
        console.log(`🚀 執行命令: ${command}`);
        
        const output = execSync(command, { encoding: 'utf8', cwd: __dirname });
        console.log(output);
        
        console.log('✅ filter-slow-renders 執行完成！');
        return { success: true };
    } catch (error) {
        console.error(`❌ filter-slow-renders 執行失敗: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function queryLogs(analyzer, date, options, shouldAskFilter = true) {
    try {
        // 詢問是否先執行 filter-slow-renders
        if (shouldAskFilter) {
            const shouldFilter = await askFilterFirst();
            
            if (shouldFilter) {
                const threshold = await askThreshold();
                const filterResult = await runFilterSlowRenders(date, threshold);
                
                if (!filterResult.success) {
                    console.log('⚠️ filter-slow-renders 執行失敗，是否繼續查詢？');
                    const continueQuery = await new Promise((resolve) => {
                        rl.question('繼續查詢？ (y/n, 預設為 y): ', (answer) => {
                            resolve(!answer || answer.toLowerCase() === 'y');
                        });
                    });
                    
                    if (!continueQuery) {
                        return null;
                    }
                }
                
                console.log('\n⏳ 等待 2 秒後開始查詢...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`\n🚀 開始查詢 ${date} 的慢渲染日誌...`);
        const result = await analyzer.queryByDate(date, options);
        
        if (result.success) {
            console.log('\n✅ 查詢完成！');
            console.log(`📊 統計資訊:`);
            console.log(`  • 總記錄數: ${result.totalRecords}`);
            console.log(`  • 有效記錄數: ${result.validRecords}`);
            console.log(`  • 查詢記錄數: ${result.queriedRecords}`);
            console.log(`  • 成功查詢: ${result.successfulQueries}`);
            console.log(`  • 失敗查詢: ${result.failedQueries}`);
        } else {
            console.log(`❌ 查詢失敗: ${result.message}`);
        }
        
        return result;
    } catch (error) {
        console.error(`❌ 查詢過程中發生錯誤: ${error.message}`);
        return null;
    }
}

async function analyzeCauses(analyzer, date) {
    try {
        console.log(`\n🔍 開始分析 ${date} 的慢渲染原因...`);
        const results = await analyzer.analyzeSlowRenderingCauses(date);
        
        console.log('\n✅ 分析完成！');
        console.log(`📊 分析了 ${results.length} 個檔案`);
        
        const successCount = results.filter(r => r.analysis && !r.error).length;
        console.log(`✅ 成功分析: ${successCount}`);
        console.log(`❌ 分析失敗: ${results.length - successCount}`);
        
        return results;
    } catch (error) {
        console.error(`❌ 分析過程中發生錯誤: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('歡迎使用慢渲染分析工具！');
    
    const analyzer = new SlowRenderingAnalyzer();
    
    while (true) {
        showMenu();
        const choice = await askChoice();
        
        switch (choice) {
            case '1':
                const date1 = await askDate();
                const options1 = await askQueryOptions();
                await queryLogs(analyzer, date1, options1);
                break;
                
            case '2':
                const date2 = await askDate();
                await analyzeCauses(analyzer, date2);
                break;
                
            case '3':
                const date3 = await askDate();
                const options3 = await askQueryOptions();
                
                console.log('\n🔄 執行完整流程...');
                const queryResult = await queryLogs(analyzer, date3, options3);
                
                if (queryResult && queryResult.success && queryResult.successfulQueries > 0) {
                    console.log('\n⏳ 等待 5 秒後開始分析...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    await analyzeCauses(analyzer, date3);
                } else {
                    console.log('⚠️ 查詢未成功，跳過分析步驟');
                }
                break;
                
            case '4':
                const date4 = await askDate();
                const threshold4 = await askThreshold();
                await runFilterSlowRenders(date4, threshold4);
                break;
                
            case '5':
                analyzer.showUsage();
                break;
                
            case '6':
                console.log('👋 感謝使用，再見！');
                rl.close();
                return;
                
            default:
                console.log('❌ 無效的選擇，請重新輸入');
        }
        
        console.log('\n按 Enter 繼續...');
        await new Promise((resolve) => {
            rl.question('', () => resolve());
        });
    }
}

// 處理錯誤和退出
process.on('SIGINT', () => {
    console.log('\n\n👋 程式已中斷，再見！');
    rl.close();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ 發生未預期的錯誤:', error.message);
    rl.close();
    process.exit(1);
});

// 執行主程式
main().catch((error) => {
    console.error('❌ 程式執行失敗:', error.message);
    rl.close();
    process.exit(1);
});