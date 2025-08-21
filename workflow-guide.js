#!/usr/bin/env node

/**
 * Interactive Workflow Guide for Analysis Log
 * Provides step-by-step guidance for users
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Helper functions for colored output
const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    title: (msg) => console.log(`${colors.cyan}${msg}${colors.reset}`),
    step: (num, msg) => console.log(`${colors.magenta}[STEP ${num}]${colors.reset} ${msg}`)
};

/**
 * Create readline interface
 */
function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

/**
 * Ask user a question and wait for input
 */
function askQuestion(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

/**
 * Validate date format (YYYYMMDD)
 */
function validateDate(dateStr) {
    const regex = /^\d{8}$/;
    if (!regex.test(dateStr)) {
        return false;
    }
    
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6));
    const day = parseInt(dateStr.substring(6, 8));
    
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && 
           date.getMonth() === month - 1 && 
           date.getDate() === day;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

/**
 * Check if data files exist for a date
 */
function checkDataFiles(date) {
    const userAgentFile = `./to-analyze-daily-data/user-agent-log/user-agent-${date}.csv`;
    const logsFile = `./to-analyze-daily-data/200-log/L2/logs-${date}.csv`;
    
    return {
        userAgent: fs.existsSync(userAgentFile),
        logs: fs.existsSync(logsFile),
        userAgentPath: userAgentFile,
        logsPath: logsFile
    };
}

/**
 * Display workflow overview
 */
function displayWorkflowOverview() {
    console.log('\n' + '='.repeat(60));
    log.title('📊 Analysis Log Workflow Guide');
    console.log('='.repeat(60));
    console.log('\n工作流程概覽:');
    console.log('1. 🔍 查詢 Google Cloud 日誌數據');
    console.log('2. 📊 分析日誌數據並生成報告');
    console.log('3. 📈 檢視分析結果');
    console.log('\n讓我們一步步來進行...\n');
}

/**
 * Guide user through date selection
 */
async function guideDateSelection(rl) {
    log.step(1, '選擇要分析的日期');
    console.log('請輸入要分析的日期 (格式: YYYYMMDD)');
    console.log('例如: 20250821 表示 2025年8月21日');
    
    while (true) {
        const dateInput = await askQuestion(rl, '\n📅 請輸入日期: ');
        
        if (validateDate(dateInput)) {
            log.success(`選擇的日期: ${formatDate(dateInput)}`);
            return dateInput;
        } else {
            log.error('日期格式錯誤！請使用 YYYYMMDD 格式 (例如: 20250821)');
        }
    }
}

/**
 * Guide user through data querying
 */
async function guideDataQuerying(rl, date) {
    log.step(2, '查詢日誌數據');
    
    // Check if data already exists
    const dataStatus = checkDataFiles(date);
    
    if (dataStatus.userAgent && dataStatus.logs) {
        log.info('✅ 數據檔案已存在:');
        console.log(`   - User-Agent 數據: ${dataStatus.userAgentPath}`);
        console.log(`   - 日誌數據: ${dataStatus.logsPath}`);
        
        const requery = await askQuestion(rl, '\n🔄 是否重新查詢數據？ (y/N): ');
        if (requery.toLowerCase() !== 'y' && requery.toLowerCase() !== 'yes') {
            log.info('跳過數據查詢，使用現有數據');
            return true;
        }
    }
    
    console.log(`\n🔍 準備查詢 ${formatDate(date)} 的日誌數據...`);
    console.log('這個過程包含兩個步驟:');
    console.log('  1. 查詢 HTTP 200 回應日誌');
    console.log('  2. 查詢 User-Agent 日誌');
    console.log('  (兩個步驟之間會有 30 秒等待時間)');
    
    const proceed = await askQuestion(rl, '\n▶️  開始查詢？ (Y/n): ');
    if (proceed.toLowerCase() === 'n' || proceed.toLowerCase() === 'no') {
        log.warning('用戶取消了數據查詢');
        return false;
    }
    
    try {
        log.info('執行查詢命令...');
        execSync(`./query-daily-log.sh ${date}`, { stdio: 'inherit' });
        log.success('數據查詢完成！');
        return true;
    } catch (error) {
        log.error('數據查詢失敗！');
        console.log('\n常見解決方法:');
        console.log('1. 檢查 Google Cloud 認證: gcloud auth application-default login');
        console.log('2. 確認網路連接');
        console.log('3. 檢查專案權限');
        console.log('4. 執行環境檢查: npm run check-env');
        return false;
    }
}

/**
 * Guide user through data analysis
 */
async function guideDataAnalysis(rl, date) {
    log.step(3, '分析數據');
    
    // Verify data files exist
    const dataStatus = checkDataFiles(date);
    
    if (!dataStatus.userAgent || !dataStatus.logs) {
        log.error('缺少必要的數據檔案:');
        if (!dataStatus.userAgent) console.log(`   ❌ ${dataStatus.userAgentPath}`);
        if (!dataStatus.logs) console.log(`   ❌ ${dataStatus.logsPath}`);
        
        log.info('請先完成數據查詢步驟');
        return false;
    }
    
    log.success('數據檔案確認完成:');
    console.log(`   ✅ ${dataStatus.userAgentPath}`);
    console.log(`   ✅ ${dataStatus.logsPath}`);
    
    console.log(`\n📊 準備分析 ${formatDate(date)} 的數據...`);
    console.log('分析過程包含:');
    console.log('  - 渲染時間統計分析');
    console.log('  - User-Agent 分佈分析');  
    console.log('  - 時段分析和模式識別');
    console.log('  - Pod 群組分析');
    
    const proceed = await askQuestion(rl, '\n▶️  開始分析？ (Y/n): ');
    if (proceed.toLowerCase() === 'n' || proceed.toLowerCase() === 'no') {
        log.warning('用戶取消了數據分析');
        return false;
    }
    
    try {
        log.info('執行分析命令...');
        execSync(`./daily-log-analysis-script.sh "${date} ~ ${date}"`, { stdio: 'inherit' });
        log.success('數據分析完成！');
        return true;
    } catch (error) {
        log.error('數據分析失敗！');
        console.log('\n請檢查:');
        console.log('1. 數據檔案是否完整');
        console.log('2. Node.js 依賴是否正確安裝');
        console.log('3. 執行環境檢查: npm run check-env');
        return false;
    }
}

/**
 * Show analysis results
 */
async function showResults(rl, date) {
    log.step(4, '檢視結果');
    
    const resultDirs = [
        './daily-analysis-result',
        './daily-pod-analysis-result'
    ];
    
    console.log(`\n📈 ${formatDate(date)} 的分析結果:`);
    
    for (const dir of resultDirs) {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(file => file.includes(date));
            if (files.length > 0) {
                console.log(`\n📁 ${dir}:`);
                files.forEach(file => {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    const size = (stats.size / 1024).toFixed(1);
                    console.log(`   📄 ${file} (${size} KB)`);
                });
            }
        }
    }
    
    const viewResults = await askQuestion(rl, '\n👀 要查看詳細結果嗎？ (Y/n): ');
    if (viewResults.toLowerCase() !== 'n' && viewResults.toLowerCase() !== 'no') {
        console.log('\n💡 建議的查看方式:');
        console.log('1. JSON 格式 (程式讀取): cat daily-analysis-result/*' + date + '*.json');
        console.log('2. 文字報告 (人類閱讀): cat daily-analysis-result/*' + date + '*.txt');
        console.log('3. Pod 分析報告: cat daily-pod-analysis-result/*' + date + '*.txt');
    }
    
    return true;
}

/**
 * Offer next steps
 */
async function offerNextSteps(rl, date) {
    console.log('\n' + '='.repeat(60));
    log.title('🎉 工作流程完成！');
    console.log('='.repeat(60));
    
    console.log('\n接下來您可以:');
    console.log('1. 🔄 分析其他日期的數據');
    console.log('2. 📊 分析日期範圍 (例如一週的數據)');
    console.log('3. 🐌 執行慢渲染分析');
    console.log('4. 📈 生成週報');
    console.log('5. ❌ 退出');
    
    while (true) {
        const choice = await askQuestion(rl, '\n請選擇 (1-5): ');
        
        switch (choice) {
            case '1':
                return 'analyze_other_date';
            case '2':
                return 'analyze_date_range';
            case '3':
                return 'slow_render_analysis';
            case '4':
                return 'weekly_report';
            case '5':
                return 'exit';
            default:
                log.warning('請選擇 1-5 之間的選項');
        }
    }
}

/**
 * Handle date range analysis
 */
async function handleDateRangeAnalysis(rl) {
    log.title('\n📊 日期範圍分析');
    
    console.log('請輸入要分析的日期範圍');
    console.log('格式: 開始日期 結束日期 (都使用 YYYYMMDD 格式)');
    console.log('例如: 20250821 20250827 (分析 2025年8月21日到27日)');
    
    let startDate, endDate;
    
    while (true) {
        const startInput = await askQuestion(rl, '\n📅 開始日期: ');
        if (validateDate(startInput)) {
            startDate = startInput;
            break;
        } else {
            log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
        }
    }
    
    while (true) {
        const endInput = await askQuestion(rl, '📅 結束日期: ');
        if (validateDate(endInput)) {
            if (endInput >= startDate) {
                endDate = endInput;
                break;
            } else {
                log.error('結束日期不能早於開始日期！');
            }
        } else {
            log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
        }
    }
    
    console.log(`\n準備分析 ${formatDate(startDate)} 到 ${formatDate(endDate)} 的數據`);
    
    const proceed = await askQuestion(rl, '▶️  開始分析？ (Y/n): ');
    if (proceed.toLowerCase() === 'n' || proceed.toLowerCase() === 'no') {
        return false;
    }
    
    try {
        execSync(`./daily-log-analysis-script.sh "${startDate} ~ ${endDate}"`, { stdio: 'inherit' });
        log.success('日期範圍分析完成！');
        return true;
    } catch (error) {
        log.error('分析失敗！');
        return false;
    }
}

/**
 * Main workflow function
 */
async function main() {
    const rl = createInterface();
    
    try {
        displayWorkflowOverview();
        
        while (true) {
            // Step 1: Date selection
            const selectedDate = await guideDateSelection(rl);
            
            // Step 2: Data querying
            const querySuccess = await guideDataQuerying(rl, selectedDate);
            if (!querySuccess) {
                const retry = await askQuestion(rl, '\n🔄 是否重試？ (Y/n): ');
                if (retry.toLowerCase() === 'n' || retry.toLowerCase() === 'no') {
                    break;
                }
                continue;
            }
            
            // Step 3: Data analysis
            const analysisSuccess = await guideDataAnalysis(rl, selectedDate);
            if (!analysisSuccess) {
                const retry = await askQuestion(rl, '\n🔄 是否重試？ (Y/n): ');
                if (retry.toLowerCase() === 'n' || retry.toLowerCase() === 'no') {
                    break;
                }
                continue;
            }
            
            // Step 4: Show results
            await showResults(rl, selectedDate);
            
            // Step 5: Next steps
            const nextAction = await offerNextSteps(rl, selectedDate);
            
            if (nextAction === 'exit') {
                break;
            } else if (nextAction === 'analyze_other_date') {
                continue;
            } else if (nextAction === 'analyze_date_range') {
                await handleDateRangeAnalysis(rl);
            } else if (nextAction === 'slow_render_analysis') {
                console.log('\n💡 執行慢渲染分析:');
                console.log(`./slow-render-analysis-script.sh ${selectedDate} 10`);
            } else if (nextAction === 'weekly_report') {
                console.log('\n💡 生成週報:');
                console.log(`./week-report-script.sh "${selectedDate} ~ ${selectedDate}" week_${selectedDate}`);
            }
            
            const continueFlow = await askQuestion(rl, '\n🔄 是否繼續其他操作？ (Y/n): ');
            if (continueFlow.toLowerCase() === 'n' || continueFlow.toLowerCase() === 'no') {
                break;
            }
        }
        
        console.log('\n👋 感謝使用 Analysis Log 工具！');
        
    } catch (error) {
        log.error(`發生錯誤: ${error.message}`);
    } finally {
        rl.close();
    }
}

// Run the workflow guide
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };