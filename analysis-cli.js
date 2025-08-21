#!/usr/bin/env node

/**
 * Unified CLI Interface for Analysis Log
 * Provides a single entry point for all analysis operations
 */

const { Command } = require('commander');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Helper functions for colored output
const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    title: (msg) => console.log(`${colors.cyan}${msg}${colors.reset}`)
};

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
 * Execute shell command with proper error handling
 */
function executeCommand(command, description) {
    try {
        log.info(`執行: ${description}`);
        execSync(command, { stdio: 'inherit' });
        log.success(`完成: ${description}`);
        return true;
    } catch (error) {
        log.error(`失敗: ${description}`);
        return false;
    }
}

/**
 * Check if required files exist
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
 * Create the CLI program
 */
function createProgram() {
    const program = new Command();
    
    program
        .name('analysis-cli')
        .description('Unified CLI for Analysis Log operations')
        .version('1.0.0');
    
    // Setup command
    program
        .command('setup')
        .description('Setup environment automatically')
        .action(() => {
            log.title('🔧 Setting up environment...');
            executeCommand('bash setup-environment.sh', '環境自動設置');
        });
    
    // Check environment command
    program
        .command('check')
        .alias('check-env')
        .description('Check environment status')
        .action(() => {
            log.title('🔍 Checking environment...');
            executeCommand('node environment-check.js', '環境狀態檢查');
        });
    
    // Query logs command
    program
        .command('query <date>')
        .alias('q')
        .description('Query logs for a specific date')
        .option('-e, --enhanced', 'Use enhanced query script with progress indicators')
        .action((date, options) => {
            if (!validateDate(date)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式 (例如: 20250821)');
                process.exit(1);
            }
            
            log.title(`🔍 Querying logs for ${formatDate(date)}...`);
            
            const script = options.enhanced ? 'enhanced-query-daily-log.sh' : 'query-daily-log.sh';
            if (!executeCommand(`bash ${script} ${date}`, `查詢 ${formatDate(date)} 的日誌`)) {
                process.exit(1);
            }
        });
    
    // Analyze command
    program
        .command('analyze')
        .alias('a')
        .description('Analyze data')
        .option('-d, --date <date>', 'Analyze single date (YYYYMMDD)')
        .option('-r, --range <range>', 'Analyze date range (YYYYMMDD ~ YYYYMMDD)')
        .option('-s, --skip-check', 'Skip data file existence check')
        .action((options) => {
            if (!options.date && !options.range) {
                log.error('請指定日期 (-d) 或日期範圍 (-r)');
                log.info('範例:');
                log.info('  analysis-cli analyze -d 20250821');
                log.info('  analysis-cli analyze -r "20250821 ~ 20250827"');
                process.exit(1);
            }
            
            let dateRange;
            if (options.date) {
                if (!validateDate(options.date)) {
                    log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
                    process.exit(1);
                }
                dateRange = `${options.date} ~ ${options.date}`;
                
                // Check if data files exist (unless skipped)
                if (!options.skipCheck) {
                    const dataStatus = checkDataFiles(options.date);
                    if (!dataStatus.userAgent || !dataStatus.logs) {
                        log.error('缺少必要的數據檔案:');
                        if (!dataStatus.userAgent) log.error(`  - ${dataStatus.userAgentPath}`);
                        if (!dataStatus.logs) log.error(`  - ${dataStatus.logsPath}`);
                        log.info('請先執行日誌查詢:');
                        log.info(`  analysis-cli query ${options.date}`);
                        process.exit(1);
                    }
                }
            } else {
                dateRange = options.range;
            }
            
            log.title(`📊 Analyzing data for ${dateRange}...`);
            if (!executeCommand(`bash daily-log-analysis-script.sh "${dateRange}"`, `分析 ${dateRange} 的數據`)) {
                process.exit(1);
            }
        });
    
    // Complete workflow command
    program
        .command('run <date>')
        .alias('workflow')
        .description('Run complete workflow for a date (query + analyze)')
        .action((date) => {
            if (!validateDate(date)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式 (例如: 20250821)');
                process.exit(1);
            }
            
            log.title(`🚀 Running complete workflow for ${formatDate(date)}...`);
            
            // Step 1: Query logs
            log.info('Step 1: Querying logs...');
            if (!executeCommand(`bash enhanced-query-daily-log.sh ${date}`, `查詢 ${formatDate(date)} 的日誌`)) {
                log.error('日誌查詢失敗，停止執行');
                process.exit(1);
            }
            
            // Step 2: Analyze data
            log.info('Step 2: Analyzing data...');
            if (!executeCommand(`bash daily-log-analysis-script.sh "${date} ~ ${date}"`, `分析 ${formatDate(date)} 的數據`)) {
                log.error('數據分析失敗');
                process.exit(1);
            }
            
            log.success(`🎉 Complete workflow finished for ${formatDate(date)}!`);
            log.info('查看結果:');
            log.info('  - daily-analysis-result/');
            log.info('  - daily-pod-analysis-result/');
        });
    
    // Interactive guide command
    program
        .command('guide')
        .alias('interactive')
        .description('Start interactive workflow guide')
        .action(() => {
            log.title('🎯 Starting interactive workflow guide...');
            executeCommand('node workflow-guide.js', '互動式工作流程指南');
        });
    
    // Performance analysis command
    program
        .command('performance <date> [count]')
        .alias('perf')
        .description('Run slow render performance analysis')
        .action((date, count = '10') => {
            if (!validateDate(date)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
                process.exit(1);
            }
            
            log.title(`🐌 Running performance analysis for ${formatDate(date)}...`);
            executeCommand(`bash slow-render-analysis-script.sh ${date} ${count}`, `慢渲染分析 (${count} 筆)`);
        });
    
    // Weekly report command
    program
        .command('weekly <start-date> <end-date> [folder]')
        .alias('week')
        .description('Generate weekly report')
        .action((startDate, endDate, folder) => {
            if (!validateDate(startDate) || !validateDate(endDate)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
                process.exit(1);
            }
            
            const folderName = folder || `week_${startDate}_${endDate}`;
            const dateRange = `${startDate} ~ ${endDate}`;
            
            log.title(`📈 Generating weekly report for ${formatDate(startDate)} to ${formatDate(endDate)}...`);
            executeCommand(`bash week-report-script.sh "${dateRange}" ${folderName}`, '週報生成');
        });
    
    // List results command
    program
        .command('results [date]')
        .alias('ls')
        .description('List analysis results')
        .action((date) => {
            log.title('📂 Analysis Results:');
            
            const resultDirs = [
                './daily-analysis-result',
                './daily-pod-analysis-result',
                './weekly_aggregated_results',
                './performance-analyze-result'
            ];
            
            resultDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    console.log(`\n📁 ${dir}:`);
                    let files = fs.readdirSync(dir);
                    
                    if (date) {
                        files = files.filter(file => file.includes(date));
                    }
                    
                    if (files.length === 0) {
                        console.log('   (空的)');
                    } else {
                        files.forEach(file => {
                            const filePath = path.join(dir, file);
                            const stats = fs.statSync(filePath);
                            const size = (stats.size / 1024).toFixed(1);
                            const dateStr = stats.mtime.toLocaleDateString('zh-TW');
                            console.log(`   📄 ${file} (${size} KB, ${dateStr})`);
                        });
                    }
                }
            });
        });
    
    // Status command
    program
        .command('status [date]')
        .alias('st')
        .description('Check analysis status for a date')
        .action((date) => {
            if (date && !validateDate(date)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
                process.exit(1);
            }
            
            if (!date) {
                log.info('請指定要檢查的日期');
                log.info('範例: analysis-cli status 20250821');
                return;
            }
            
            log.title(`📊 Analysis Status for ${formatDate(date)}:`);
            
            // Check data files
            const dataStatus = checkDataFiles(date);
            console.log('\n數據檔案:');
            console.log(`  User-Agent: ${dataStatus.userAgent ? '✅' : '❌'} ${dataStatus.userAgentPath}`);
            console.log(`  Logs:       ${dataStatus.logs ? '✅' : '❌'} ${dataStatus.logsPath}`);
            
            // Check result files
            const resultDirs = ['./daily-analysis-result', './daily-pod-analysis-result'];
            console.log('\n分析結果:');
            
            resultDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir).filter(file => file.includes(date));
                    console.log(`  ${path.basename(dir)}: ${files.length > 0 ? '✅' : '❌'} (${files.length} 檔案)`);
                }
            });
        });
    
    return program;
}

/**
 * Main function
 */
function main() {
    const program = createProgram();
    
    // Show help if no arguments provided
    if (process.argv.length <= 2) {
        console.log(`${colors.cyan}📊 Analysis Log - Unified CLI${colors.reset}`);
        console.log('================================\n');
        console.log('快速開始:');
        console.log('  analysis-cli setup              # 環境設置');
        console.log('  analysis-cli run 20250821       # 完整工作流程');
        console.log('  analysis-cli guide              # 互動式指南');
        console.log('\n常用命令:');
        console.log('  analysis-cli query 20250821     # 查詢日誌');
        console.log('  analysis-cli analyze -d 20250821 # 分析數據');
        console.log('  analysis-cli status 20250821    # 檢查狀態');
        console.log('  analysis-cli results             # 查看結果');
        console.log('\n使用 --help 查看完整說明');
        return;
    }
    
    program.parse();
}

// Run the CLI
if (require.main === module) {
    main();
}

module.exports = { createProgram };