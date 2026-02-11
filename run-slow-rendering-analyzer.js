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

function askTarget() {
    return new Promise((resolve) => {
        console.log('\n📊 目標類型:');
        console.log('1. category - 分類頁');
        console.log('2. product - 商品頁');
        
        rl.question('請選擇目標類型 (1-2, 預設為1): ', (choice) => {
            const targets = { '1': 'category', '2': 'product' };
            const target = targets[choice] || 'category';
            console.log(`✅ 已選擇: ${target}`);
            resolve(target);
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

function askHour() {
    return new Promise((resolve) => {
        rl.question('是否要指定特定時段？(y/n, 預設為 n): ', (answer) => {
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                rl.question('請輸入小時 (0-23): ', (hour) => {
                    const hourNum = parseInt(hour);
                    if (hourNum >= 0 && hourNum <= 23) {
                        console.log(`✅ 已選擇時段: ${hourNum}:00 ~ ${hourNum}:59`);
                        resolve(hourNum);
                    } else {
                        console.log('❌ 無效的小時，將查詢全天記錄');
                        resolve(null);
                    }
                });
            } else {
                console.log('✅ 將查詢全天記錄');
                resolve(null);
            }
        });
    });
}

async function runFilterSlowRenders(date, threshold = 20000, target = 'category') {
    try {
        console.log(`\n🔍 執行 filter-slow-renders.js...`);
        console.log(`📅 日期: ${date}`);
        console.log(`🎯 目標類型: ${target}`);
        console.log(`⏱️  閾值: ${threshold}ms`);
        
        const command = `node filter-slow-renders.js ${date} ${threshold} ${target}`;
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

async function queryLogs(analyzer, date, options, target = 'category', shouldAskFilter = true, hour = null) {
    try {
        // 詢問是否先執行 filter-slow-renders
        if (shouldAskFilter) {
            const shouldFilter = await askFilterFirst();

            if (shouldFilter) {
                const threshold = await askThreshold();
                const filterResult = await runFilterSlowRenders(date, threshold, target);

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
        console.log(`🎯 目標類型: ${target}`);
        if (hour !== null) {
            console.log(`🕐 時段範圍: ${hour}:00 ~ ${hour}:59`);
        }

        // 添加 target 和 hour 到 options
        const queryOptions = { ...options, target, hour };
        const result = await analyzer.queryByDate(date, queryOptions);

        if (result.success) {
            console.log('\n✅ 查詢完成！');
            console.log(`📊 統計資訊:`);
            console.log(`  • 總記錄數: ${result.totalRecords}`);
            console.log(`  • 有效記錄數: ${result.validRecords}`);
            console.log(`  • 查詢記錄數: ${result.queriedRecords}`);
            console.log(`  • 成功查詢: ${result.successfulQueries}`);
            console.log(`  • 失敗查詢: ${result.failedQueries}`);
            if (hour !== null) {
                console.log(`  • 時段篩選: ${hour}:00 ~ ${hour}:59`);
            }
        } else {
            console.log(`❌ 查詢失敗: ${result.message}`);
        }

        return result;
    } catch (error) {
        console.error(`❌ 查詢過程中發生錯誤: ${error.message}`);
        return null;
    }
}

async function analyzeCauses(analyzer, date, target = 'category') {
    try {
        console.log(`\n🔍 開始分析 ${date} 的慢渲染原因...`);
        console.log(`🎯 目標類型: ${target}`);
        const results = await analyzer.analyzeSlowRenderingCauses(date, { target });
        
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
                const target1 = await askTarget();
                const hour1 = await askHour();
                const options1 = await askQueryOptions();
                await queryLogs(analyzer, date1, options1, target1, true, hour1);
                break;

            case '2':
                const date2 = await askDate();
                const target2 = await askTarget();
                await analyzeCauses(analyzer, date2, target2);
                break;

            case '3':
                const date3 = await askDate();
                const target3 = await askTarget();
                const hour3 = await askHour();
                const options3 = await askQueryOptions();

                console.log('\n🔄 執行完整流程...');
                const queryResult = await queryLogs(analyzer, date3, options3, target3, true, hour3);

                if (queryResult && queryResult.success && queryResult.successfulQueries > 0) {
                    console.log('\n⏳ 等待 5 秒後開始分析...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    await analyzeCauses(analyzer, date3, target3);
                } else {
                    console.log('⚠️ 查詢未成功，跳過分析步驟');
                }
                break;
                
            case '4':
                const date4 = await askDate();
                const target4 = await askTarget();
                const threshold4 = await askThreshold();
                await runFilterSlowRenders(date4, threshold4, target4);
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