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
 * Check and refresh Google Cloud credentials
 */
function checkAndRefreshGCloudAuth() {
    const os = require('os');
    const credentialsPath = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
    
    try {
        // Refresh Google Cloud credentials (every 12 hours)
        if (!fs.existsSync(credentialsPath) || isFileOlderThanTwelveHours(credentialsPath)) {
            log.warning('Google Cloud 認證已過期或不存在，正在重新認證...');
            execSync('gcloud auth application-default login', { stdio: 'inherit' });
            log.success('Google Cloud 認證完成');
        } else {
            log.info('Google Cloud 認證有效 (不到 23 小時)');
        }
    } catch (error) {
        log.error('Google Cloud 認證失敗');
        log.info('請手動執行: gcloud auth application-default login');
        process.exit(1);
    }
}

/**
 * Check if file is older than twelve hours
 */
function isFileOlderThanTwelveHours(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const now = new Date();
        const fileTime = new Date(stats.mtime);
        const hoursDiff = (now - fileTime) / (1000 * 60 * 60);
        return hoursDiff > 12;
    } catch (error) {
        return true; // If we can't read the file, consider it as needing refresh
    }
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
 * Generate filename from URL
 */
function generateFilenameFromUrl(url, date) {
    // Remove protocol (http:// or https://)
    let path = url.replace(/^https?:\/\//, '');
    
    // Remove domain name, keep only path
    path = path.replace(/^[^/]*/, '');
    
    // Remove leading and trailing slashes
    path = path.replace(/^\//, '').replace(/\/$/, '');
    
    // Replace slashes with hyphens
    path = path.replace(/\//g, '-');
    
    // If path is empty, use 'root'
    if (!path) {
        path = 'root';
    }
    
    return `log-${date}-${path}`;
}

/**
 * Check if required files exist (with filename pattern and folder)
 */
function checkDataFiles(date, filenamePattern = null, folder = null) {
    let userAgentFile, logsFile;
    
    if (folder) {
        // Check L1/L2 folder structure
        userAgentFile = `./to-analyze-daily-data/user-agent-log/${folder}/user-agent-log-${date}-category-${folder.slice(-1)}.csv`;
        logsFile = `./to-analyze-daily-data/200-log/${folder}/log-${date}-category-${folder.slice(-1)}.csv`;
    } else if (filenamePattern) {
        userAgentFile = `./to-analyze-daily-data/user-agent-log/user-agent-${filenamePattern}.csv`;
        logsFile = `./to-analyze-daily-data/200-log/${filenamePattern}.csv`;
    } else {
        // Fallback to old naming pattern for backward compatibility
        userAgentFile = `./to-analyze-daily-data/user-agent-log/user-agent-${date}.csv`;
        logsFile = `./to-analyze-daily-data/200-log/logs-${date}.csv`;
    }
    
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
        .command('query <date> <url> [folder]')
        .alias('q')
        .description('Query logs for a specific date and URL')
        .option('-e, --enhanced', 'Use enhanced query script with progress indicators')
        .action((date, url, folder, options) => {
            if (!validateDate(date)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式 (例如: 20250821)');
                process.exit(1);
            }
            
            // Basic URL validation
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                log.error('URL格式錯誤！必須以 http:// 或 https:// 開頭');
                process.exit(1);
            }
            
            // Check Google Cloud authentication before querying
            checkAndRefreshGCloudAuth();
            
            log.title(`🔍 Querying logs for ${formatDate(date)}...`);
            log.info(`URL: ${url}`);
            
            const script = options.enhanced ? 'enhanced-query-daily-log.sh' : 'query-daily-log.sh';
            const folderArg = folder ? ` "${folder}"` : '';
            if (!executeCommand(`bash ${script} ${date} "${url}"${folderArg}`, `查詢 ${formatDate(date)} 的日誌`)) {
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
        .option('-f, --folder <folder>', 'Specify target folder (e.g., L1, L2, category, etc.)')
        .option('-s, --skip-check', 'Skip data file existence check')
        .action((options) => {
            if (!options.date && !options.range) {
                log.error('請指定日期 (-d) 或日期範圍 (-r)');
                log.info('範例:');
                log.info('  npm run cli -- analyze -d 20250821');
                log.info('  npm run cli -- analyze -d 20250821 -f L2');
                log.info('  npm run cli -- analyze -r "20250821 ~ 20250827"');
                log.info('  npm run cli -- analyze -r "20250821 ~ 20250827" -f L1');
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
                        log.info(`  npm run cli query ${options.date}`);
                        process.exit(1);
                    }
                }
            } else {
                dateRange = options.range;
            }
            
            log.title(`📊 Analyzing data for ${dateRange}...`);
            const folderArg = options.folder ? ` "" "${options.folder}"` : '';
            if (options.folder) {
                log.info(`Target folder: ${options.folder}`);
            }
            if (!executeCommand(`bash daily-log-analysis-script.sh "${dateRange}"${folderArg}`, `分析 ${dateRange} 的數據${options.folder ? ` (資料夾: ${options.folder})` : ''}`)) {
                process.exit(1);
            }
        });
    
    // Complete workflow command
    program
        .command('run <date> <url> [folder]')
        .alias('workflow')
        .description('Run complete workflow for a date and URL (query + analyze)')
        .action((date, url, folder) => {
            if (!validateDate(date)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式 (例如: 20250821)');
                process.exit(1);
            }
            
            // Basic URL validation
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                log.error('URL格式錯誤！必須以 http:// 或 https:// 開頭');
                process.exit(1);
            }
            
            // Check Google Cloud authentication before workflow
            checkAndRefreshGCloudAuth();
            
            log.title(`🚀 Running complete workflow for ${formatDate(date)}...`);
            log.info(`URL: ${url}`);
            
            // Determine folder name - use provided folder or auto-generate from URL
            let targetFolder = folder;
            if (!targetFolder) {
                // Auto-generate folder from URL (same logic as enhanced-query-daily-log.sh)
                let urlPath = url.replace(/^https?:\/\//, ''); // Remove protocol
                urlPath = urlPath.replace(/^[^/]*/, ''); // Remove domain
                urlPath = urlPath.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
                urlPath = urlPath.replace(/\//g, '-'); // Replace slashes with hyphens
                if (urlPath === 'category-1') targetFolder = 'L1';
                else if (urlPath === 'category-2') targetFolder = 'L2';
                else if (urlPath === 'category-3') targetFolder = 'L3';
                else if (urlPath === 'category-4') targetFolder = 'L4';
                else if (urlPath === 'category-5') targetFolder = 'L5';
                else if (urlPath === '') targetFolder = 'root';
                else targetFolder = urlPath;
            }
            
            log.info(`Target folder: ${targetFolder}`);
            
            // Step 1: Query logs
            log.info('Step 1: Querying logs...');
            const folderArg = folder ? ` "${folder}"` : '';
            if (!executeCommand(`bash enhanced-query-daily-log.sh ${date} "${url}"${folderArg}`, `查詢 ${formatDate(date)} 的日誌`)) {
                log.error('日誌查詢失敗，停止執行');
                process.exit(1);
            }
            
            // Step 2: Analyze data  
            log.info('Step 2: Analyzing data...');
            const analyzeCmd = `bash daily-log-analysis-script.sh "${date} ~ ${date}" "" "${targetFolder}"`;
            if (!executeCommand(analyzeCmd, `分析 ${formatDate(date)} 的數據`)) {
                log.error('數據分析失敗');
                process.exit(1);
            }
            
            log.success(`🎉 Complete workflow finished for ${formatDate(date)}!`);
            log.info('查看結果:');
            log.info(`  - daily-analysis-result/${targetFolder}/`);
            log.info(`  - daily-pod-analysis-result/${targetFolder}/`);
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
        .command('performance <date> [count] [folder]')
        .alias('perf')
        .description('Run slow render performance analysis')
        .action((date, count = '10', folder) => {
            if (!validateDate(date)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
                process.exit(1);
            }
            
            // Check Google Cloud authentication before performance analysis
            checkAndRefreshGCloudAuth();
            
            log.title(`🐌 Running performance analysis for ${formatDate(date)}...`);
            const folderArg = folder ? ` ${folder}` : '';
            executeCommand(`bash slow-render-analysis-script.sh ${date} ${count}${folderArg}`, `慢渲染分析 (${count} 筆${folder ? `, 資料夾: ${folder}` : ''})`);
        });
    
    // Weekly report command
    program
        .command('weekly <start-date> <end-date> [url-folder]')
        .alias('week')
        .description('Generate weekly report')
        .action((startDate, endDate, urlFolder) => {
            if (!validateDate(startDate) || !validateDate(endDate)) {
                log.error('日期格式錯誤！請使用 YYYYMMDD 格式');
                process.exit(1);
            }
            
            // 基本資料夾名稱由日期決定
            const folderName = `week_${startDate}_${endDate}`;
            const dateRange = `${startDate} ~ ${endDate}`;
            
            log.title(`📈 Generating weekly report for ${formatDate(startDate)} to ${formatDate(endDate)}...`);
            const urlFolderArg = urlFolder ? ` ${urlFolder}` : '';
            executeCommand(`bash week-report-script.sh "${dateRange}" ${folderName}${urlFolderArg}`, `週報生成${urlFolder ? ` (資料夾: ${urlFolder})` : ''}`);
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
                    
                    // 檢查根目錄檔案
                    let files = fs.readdirSync(dir, { withFileTypes: true })
                        .filter(dirent => dirent.isFile())
                        .map(dirent => dirent.name);
                    
                    if (date) {
                        files = files.filter(file => file.includes(date));
                    }
                    
                    if (files.length > 0) {
                        files.forEach(file => {
                            const filePath = path.join(dir, file);
                            const stats = fs.statSync(filePath);
                            const size = (stats.size / 1024).toFixed(1);
                            console.log(`   📄 ${file} (${size} KB)`);
                        });
                    }
                    
                    // 檢查子資料夾
                    const subdirs = fs.readdirSync(dir, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name);
                        
                    subdirs.forEach(subdir => {
                        const subdirPath = path.join(dir, subdir);
                        let subdirFiles = fs.readdirSync(subdirPath);
                        
                        if (date) {
                            subdirFiles = subdirFiles.filter(file => file.includes(date));
                        }
                        
                        if (subdirFiles.length > 0) {
                            console.log(`\n   📁 ${subdir}/:`);
                            subdirFiles.forEach(file => {
                                const filePath = path.join(subdirPath, file);
                                const stats = fs.statSync(filePath);
                                const size = (stats.size / 1024).toFixed(1);
                                console.log(`     📄 ${file} (${size} KB)`);
                            });
                        }
                    });
                    
                    if (files.length === 0 && subdirs.length === 0) {
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
                log.info('範例: npm run cli status 20250821');
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
                    // Check root directory files
                    const files = fs.readdirSync(dir, { withFileTypes: true })
                        .filter(dirent => dirent.isFile())
                        .map(dirent => dirent.name)
                        .filter(file => file.includes(date));
                    
                    // Check subdirectory files (L1, L2, etc.)
                    const subdirs = fs.readdirSync(dir, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name);
                    
                    let subFiles = [];
                    subdirs.forEach(subdir => {
                        const subdirPath = path.join(dir, subdir);
                        const subdirFiles = fs.readdirSync(subdirPath).filter(file => file.includes(date));
                        subFiles = subFiles.concat(subdirFiles.map(f => `${subdir}/${f}`));
                    });
                    
                    const totalFiles = files.length + subFiles.length;
                    console.log(`  ${path.basename(dir)}: ${totalFiles > 0 ? '✅' : '❌'} (${totalFiles} 檔案)`);
                    
                    if (files.length > 0) {
                        files.forEach(file => console.log(`    - ${file}`));
                    }
                    if (subFiles.length > 0) {
                        subFiles.forEach(file => console.log(`    - ${file}`));
                    }
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
        console.log('  npm run cli setup                                     # 環境設置');
        console.log('  npm run cli run 20250821 https://example.com/path/       # 完整工作流程');
        console.log('  npm run cli run 20250821 https://example.com/path/ L2    # 指定資料夾');
        console.log('  npm run cli performance 20250821 10 L1               # 慢渲染分析 (指定資料夾)');
        console.log('  npm run cli weekly 20250821 20250827 L1              # 週報生成 (指定資料夾)');
        console.log('  npm run cli guide                                     # 互動式指南');
        console.log('\n常用命令:');
        console.log('  npm run cli query 20250821 https://example.com/          # 查詢日誌');
        console.log('  npm run cli query 20250821 https://example.com/ L2       # 查詢到指定資料夾');
        console.log('  npm run cli -- analyze -d 20250821                   # 分析數據 (需要 -- 分隔符)');
        console.log('  npm run cli -- analyze -d 20250821 -f L2             # 分析指定資料夾數據');
        console.log('  npm run cli performance 20250821 10                  # 慢渲染分析 (10筆)');
        console.log('  npm run cli performance 20250821 5 L2                # 慢渲染分析 (L2資料夾)');
        console.log('  npm run cli weekly 20250821 20250827                 # 週報生成');
        console.log('  npm run cli weekly 20250821 20250827 L2              # 週報生成 (L2資料夾)');
        console.log('  npm run cli status 20250821                          # 檢查狀態');
        console.log('  npm run cli results                                   # 查看結果');
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