#!/usr/bin/env node

/**
 * URL Extractor Tool
 * 從 log 檔案中提取目標 URL，去重後輸出到 txt 檔案
 * 
 * 使用方式:
 * 方式一: 指定檔案路徑
 * node url-extractor.js <input-file> [output-file]
 * 
 * 方式二: 指定日期和目標類型（自動組成路徑）
 * node url-extractor.js --date <YYYYMMDD> --target <category|product> [output-file]
 * 
 * 範例:
 * node url-extractor.js logs-20251125.csv
 * node url-extractor.js --date 20251125 --target product
 * node url-extractor.js --date 20251124 --target category extracted-urls.txt
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class URLExtractor {
    constructor() {
        this.extractedUrls = new Set(); // 使用 Set 自動去重
        this.processedLines = 0;
        this.extractedCount = 0;
    }

    /**
     * 從 log 行中提取目標 URL
     * @param {string} logLine - log 行內容
     * @returns {string|null} - 提取到的 URL 或 null
     */
    extractTargetURL(logLine) {
        if (!logLine || typeof logLine !== 'string') {
            return null;
        }

        // 匹配 "got 200 in XXXms for URL" 模式
        const got200Pattern = /got 200 in \d+ms for (https?:\/\/[^\s\[\]]+)/;
        const got200Match = logLine.match(got200Pattern);
        
        if (got200Match && got200Match[1]) {
            return got200Match[1];
        }

        // 匹配其他可能的 URL 模式
        const urlPatterns = [
            /Processing URL:\s*(https?:\/\/[^\s\]]+)/i,
            /Navigating to:\s*(https?:\/\/[^\s\]]+)/i,
            /Request URL:\s*(https?:\/\/[^\s\]]+)/i,
            /Visiting:\s*(https?:\/\/[^\s\]]+)/i,
            /Loading:\s*(https?:\/\/[^\s\]]+)/i
        ];

        for (const pattern of urlPatterns) {
            const match = logLine.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * 分析 URL 類型
     * @param {string} url - URL
     * @returns {object} - URL 分析結果
     */
    analyzeURL(url) {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();
            
            let pageType = '其他';
            if (path.includes('/product') || path.includes('/item') || path.includes('/book')) {
                pageType = '商品頁';
            } else if (path.includes('/category') || path.includes('/catalog')) {
                pageType = '分類頁';
            } else if (path.includes('/search') || path.includes('/query')) {
                pageType = '搜尋頁';
            } else if (path === '/' || path === '/index' || path === '/home') {
                pageType = '首頁';
            } else if (path.includes('/cart') || path.includes('/checkout')) {
                pageType = '購物車/結帳';
            }

            return {
                url: url,
                domain: urlObj.hostname,
                path: urlObj.pathname,
                pageType: pageType
            };
        } catch (error) {
            return {
                url: url,
                domain: 'unknown',
                path: 'unknown',
                pageType: '無效URL'
            };
        }
    }

    /**
     * 處理 CSV 檔案
     * @param {string} inputFile - 輸入檔案路徑
     * @returns {Promise<void>}
     */
    async processCSVFile(inputFile) {
        return new Promise((resolve, reject) => {
            const results = [];
            
            fs.createReadStream(inputFile)
                .pipe(csv())
                .on('data', (row) => {
                    this.processedLines++;
                    
                    // 從 textPayload 或其他欄位提取 URL
                    const logContent = row.textPayload || row.message || JSON.stringify(row);
                    const extractedUrl = this.extractTargetURL(logContent);
                    
                    if (extractedUrl) {
                        const urlInfo = this.analyzeURL(extractedUrl);
                        if (!this.extractedUrls.has(extractedUrl)) {
                            this.extractedUrls.add(extractedUrl);
                            results.push(urlInfo);
                            this.extractedCount++;
                        }
                    }

                    // 顯示處理進度
                    if (this.processedLines % 10000 === 0) {
                        console.log(`📊 已處理 ${this.processedLines} 行，提取到 ${this.extractedCount} 個唯一 URL`);
                    }
                })
                .on('end', () => {
                    console.log(`✅ CSV 處理完成！總共處理 ${this.processedLines} 行，提取到 ${this.extractedCount} 個唯一 URL`);
                    resolve(results);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    /**
     * 處理純文字 log 檔案
     * @param {string} inputFile - 輸入檔案路徑
     * @returns {Promise<Array>}
     */
    async processTextFile(inputFile) {
        const content = fs.readFileSync(inputFile, 'utf8');
        const lines = content.split('\n');
        const results = [];

        console.log(`📄 開始處理文字檔案，共 ${lines.length} 行`);

        for (let i = 0; i < lines.length; i++) {
            this.processedLines++;
            const line = lines[i].trim();
            
            if (line) {
                const extractedUrl = this.extractTargetURL(line);
                
                if (extractedUrl) {
                    const urlInfo = this.analyzeURL(extractedUrl);
                    if (!this.extractedUrls.has(extractedUrl)) {
                        this.extractedUrls.add(extractedUrl);
                        results.push(urlInfo);
                        this.extractedCount++;
                    }
                }
            }

            // 顯示處理進度
            if (this.processedLines % 10000 === 0) {
                console.log(`📊 已處理 ${this.processedLines} 行，提取到 ${this.extractedCount} 個唯一 URL`);
            }
        }

        console.log(`✅ 文字檔處理完成！總共處理 ${this.processedLines} 行，提取到 ${this.extractedCount} 個唯一 URL`);
        return results;
    }

    /**
     * 生成輸出內容
     * @param {Array} urlInfoList - URL 資訊列表
     * @returns {string} - 輸出內容
     */
    generateOutput(urlInfoList) {
        let output = '';
        
        // 標題資訊
        output += `URL 提取結果\n`;
        output += `生成時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
        output += `總共提取到 ${urlInfoList.length} 個唯一 URL\n`;
        output += `處理了 ${this.processedLines} 行 log 資料\n`;
        output += `\n${'='.repeat(80)}\n\n`;

        // 按頁面類型分組統計
        const pageTypeStats = {};
        urlInfoList.forEach(urlInfo => {
            const type = urlInfo.pageType;
            if (!pageTypeStats[type]) {
                pageTypeStats[type] = [];
            }
            pageTypeStats[type].push(urlInfo);
        });

        // 輸出統計資訊
        output += `頁面類型統計:\n`;
        Object.keys(pageTypeStats).sort().forEach(pageType => {
            output += `  ${pageType}: ${pageTypeStats[pageType].length} 個 URL\n`;
        });
        output += `\n${'='.repeat(80)}\n\n`;

        // 按頁面類型輸出 URL
        Object.keys(pageTypeStats).sort().forEach(pageType => {
            output += `${pageType} (${pageTypeStats[pageType].length} 個):\n`;
            output += `${'-'.repeat(40)}\n`;
            
            // 按 domain 分組並排序
            const domainGroups = {};
            pageTypeStats[pageType].forEach(urlInfo => {
                const domain = urlInfo.domain;
                if (!domainGroups[domain]) {
                    domainGroups[domain] = [];
                }
                domainGroups[domain].push(urlInfo.url);
            });

            Object.keys(domainGroups).sort().forEach(domain => {
                output += `\n  ${domain}:\n`;
                domainGroups[domain].sort().forEach(url => {
                    output += `    ${url}\n`;
                });
            });
            
            output += `\n`;
        });

        return output;
    }

    /**
     * 處理多個檔案（日期區間模式）
     * @param {Array<string>} inputFiles - 輸入檔案列表
     * @param {string} outputFile - 輸出檔案
     */
    async processMultipleFiles(inputFiles, outputFile) {
        console.log(`🔍 URL 提取工具 (日期區間模式)`);
        console.log(`📁 處理檔案數量: ${inputFiles.length}`);
        console.log(`📄 輸出檔案: ${outputFile}`);
        console.log('');

        const allResults = [];
        
        for (const inputFile of inputFiles) {
            if (!fs.existsSync(inputFile)) {
                console.log(`⚠️ 檔案不存在，跳過: ${inputFile}`);
                continue;
            }

            console.log(`📄 處理檔案: ${inputFile}`);
            
            // 判斷檔案類型並處理
            let urlInfoList;
            const fileExtension = path.extname(inputFile).toLowerCase();
            
            if (fileExtension === '.csv') {
                urlInfoList = await this.processCSVFile(inputFile);
            } else {
                urlInfoList = await this.processTextFile(inputFile);
            }
            
            allResults.push(...urlInfoList);
        }

        if (allResults.length === 0) {
            console.log('⚠️ 沒有找到任何 URL');
            return;
        }

        // 生成輸出內容
        const output = this.generateOutput(allResults);

        // 確保輸出目錄存在
        ensureOutputDir(outputFile);

        // 寫入輸出檔案
        fs.writeFileSync(outputFile, output, 'utf8');

        console.log(`\n🎉 URL 提取完成！`);
        console.log(`📊 統計資訊:`);
        console.log(`  • 處理檔案數: ${inputFiles.length}`);
        console.log(`  • 處理行數: ${this.processedLines}`);
        console.log(`  • 唯一 URL: ${this.extractedCount}`);
        console.log(`📄 結果已保存到: ${outputFile}`);
    }

    /**
     * 主要處理流程
     * @param {string} inputFile - 輸入檔案
     * @param {string} outputFile - 輸出檔案
     */
    async process(inputFile, outputFile) {
        console.log(`🔍 URL 提取工具`);
        console.log(`📁 輸入檔案: ${inputFile}`);
        console.log(`📄 輸出檔案: ${outputFile}`);
        console.log('');

        // 檢查輸入檔案是否存在
        if (!fs.existsSync(inputFile)) {
            throw new Error(`輸入檔案不存在: ${inputFile}`);
        }

        // 判斷檔案類型並處理
        let urlInfoList;
        const fileExtension = path.extname(inputFile).toLowerCase();
        
        if (fileExtension === '.csv') {
            urlInfoList = await this.processCSVFile(inputFile);
        } else {
            urlInfoList = await this.processTextFile(inputFile);
        }

        if (urlInfoList.length === 0) {
            console.log('⚠️ 沒有找到任何 URL');
            return;
        }

        // 生成輸出內容
        const output = this.generateOutput(urlInfoList);

        // 確保輸出目錄存在
        ensureOutputDir(outputFile);

        // 寫入輸出檔案
        fs.writeFileSync(outputFile, output, 'utf8');

        console.log(`\n🎉 URL 提取完成！`);
        console.log(`📊 統計資訊:`);
        console.log(`  • 處理行數: ${this.processedLines}`);
        console.log(`  • 唯一 URL: ${this.extractedCount}`);
        console.log(`📄 結果已保存到: ${outputFile}`);
    }
}

/**
 * 驗證日期格式 (YYYYMMDD)
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
 * 格式化日期顯示 (YYYY-MM-DD)
 */
function formatDate(dateStr) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

/**
 * 生成日期區間內所有日期
 * @param {string} startDate - 開始日期 (YYYYMMDD)
 * @param {string} endDate - 結束日期 (YYYYMMDD)
 * @returns {Array<string>} - 日期列表 (YYYYMMDD)
 */
function generateDateRange(startDate, endDate) {
    if (!validateDate(startDate) || !validateDate(endDate)) {
        throw new Error('日期格式錯誤，請使用 YYYYMMDD 格式');
    }
    
    const start = new Date(startDate.substring(0, 4), startDate.substring(4, 6) - 1, startDate.substring(6, 8));
    const end = new Date(endDate.substring(0, 4), endDate.substring(4, 6) - 1, endDate.substring(6, 8));
    
    if (start > end) {
        throw new Error('開始日期不能晚於結束日期');
    }
    
    const dates = [];
    const current = new Date(start);
    
    while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        dates.push(`${year}${month}${day}`);
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

/**
 * 檢查檔案是否存在並選擇最佳檔案（多日期版本）
 * @param {Array<string>} dates - 日期列表
 * @param {string} target - 目標類型
 * @returns {Array<string>} - 存在的檔案路徑列表
 */
function selectBestFilesForDates(dates, target) {
    const existingFiles = [];
    const missingDates = [];
    
    for (const date of dates) {
        try {
            const filePath = selectBestFile(date, target);
            existingFiles.push(filePath);
        } catch (error) {
            missingDates.push(date);
        }
    }
    
    if (missingDates.length > 0) {
        console.log(`⚠️  以下日期的檔案不存在，將跳過:`);
        missingDates.forEach(date => {
            console.log(`   - ${formatDate(date)}`);
        });
        console.log('');
    }
    
    if (existingFiles.length === 0) {
        throw new Error('日期區間內沒有找到任何可用的檔案');
    }
    
    console.log(`✅ 找到 ${existingFiles.length} 個檔案可以處理`);
    return existingFiles;
}

/**
 * 根據日期和目標類型生成檔案路徑
 * @param {string} date - 日期 (YYYYMMDD)
 * @param {string} target - 目標類型 (category/product)
 * @returns {object} - {userAgentFile, logsFile}
 */
function generateFilePaths(date, target) {
    const baseDir = './to-analyze-daily-data';
    
    let userAgentFile, logsFile;
    
    if (target === 'category') {
        userAgentFile = `${baseDir}/user-agent-log/category/user-agent-log-${date}-category.csv`;
        logsFile = `${baseDir}/200-log/category/log-${date}-category.csv`;
    } else if (target === 'product') {
        userAgentFile = `${baseDir}/user-agent-log/product/user-agent-log-${date}-product.csv`;
        logsFile = `${baseDir}/200-log/product/log-${date}-product.csv`;
    } else {
        throw new Error(`不支援的目標類型: ${target}，請使用 'category' 或 'product'`);
    }
    
    return { userAgentFile, logsFile };
}

/**
 * 檢查檔案是否存在並選擇最佳檔案
 * @param {string} date - 日期
 * @param {string} target - 目標類型
 * @returns {string} - 選擇的檔案路徑
 */
function selectBestFile(date, target) {
    const paths = generateFilePaths(date, target);
    
    // 優先使用 logs 檔案，如果不存在則使用 user-agent 檔案
    if (fs.existsSync(paths.logsFile)) {
        console.log(`✅ 使用檔案: ${paths.logsFile}`);
        return paths.logsFile;
    } else if (fs.existsSync(paths.userAgentFile)) {
        console.log(`✅ 使用檔案: ${paths.userAgentFile}`);
        console.log(`⚠️  注意: logs 檔案不存在，使用 user-agent 檔案`);
        return paths.userAgentFile;
    } else {
        console.log(`❌ 檔案不存在:`);
        console.log(`   - ${paths.logsFile}`);
        console.log(`   - ${paths.userAgentFile}`);
        throw new Error(`找不到 ${formatDate(date)} 的 ${target} 檔案`);
    }
}

/**
 * 解析命令行參數
 */
function parseArguments() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        return { showHelp: true };
    }
    
    // 檢查是否使用日期+目標模式
    const dateIndex = args.findIndex(arg => arg === '--date');
    const startDateIndex = args.findIndex(arg => arg === '--start-date');
    const endDateIndex = args.findIndex(arg => arg === '--end-date');
    const targetIndex = args.findIndex(arg => arg === '--target');
    
    if ((dateIndex !== -1 || (startDateIndex !== -1 && endDateIndex !== -1)) && targetIndex !== -1) {
        // 日期+目標模式或日期區間+目標模式
        if (targetIndex + 1 >= args.length) {
            throw new Error('--target 參數需要提供值');
        }
        
        const target = args[targetIndex + 1];
        
        if (!['category', 'product'].includes(target)) {
            throw new Error(`目標類型錯誤: ${target}，請使用 'category' 或 'product'`);
        }
        
        let dates = [];
        
        if (dateIndex !== -1) {
            // 單日期模式
            if (dateIndex + 1 >= args.length) {
                throw new Error('--date 參數需要提供值');
            }
            
            const date = args[dateIndex + 1];
            if (!validateDate(date)) {
                throw new Error(`日期格式錯誤: ${date}，請使用 YYYYMMDD 格式`);
            }
            
            dates = [date];
        } else if (startDateIndex !== -1 && endDateIndex !== -1) {
            // 日期區間模式
            if (startDateIndex + 1 >= args.length || endDateIndex + 1 >= args.length) {
                throw new Error('--start-date 和 --end-date 參數需要提供值');
            }
            
            const startDate = args[startDateIndex + 1];
            const endDate = args[endDateIndex + 1];
            
            if (!validateDate(startDate) || !validateDate(endDate)) {
                throw new Error(`日期格式錯誤，請使用 YYYYMMDD 格式`);
            }
            
            dates = generateDateRange(startDate, endDate);
        }
        
        // 找輸出檔案參數
        const excludeIndices = new Set();
        if (dateIndex !== -1) {
            excludeIndices.add(dateIndex);
            excludeIndices.add(dateIndex + 1);
        }
        if (startDateIndex !== -1) {
            excludeIndices.add(startDateIndex);
            excludeIndices.add(startDateIndex + 1);
        }
        if (endDateIndex !== -1) {
            excludeIndices.add(endDateIndex);
            excludeIndices.add(endDateIndex + 1);
        }
        excludeIndices.add(targetIndex);
        excludeIndices.add(targetIndex + 1);
        
        const otherArgs = args.filter((arg, index) => !excludeIndices.has(index));
        
        let outputFile;
        if (dates.length === 1) {
            outputFile = otherArgs[0] || `url-extract/${target}/extracted-urls-${dates[0]}-${target}.txt`;
        } else {
            const startDate = dates[0];
            const endDate = dates[dates.length - 1];
            outputFile = otherArgs[0] || `url-extract/${target}/extracted-urls-${startDate}-to-${endDate}-${target}.txt`;
        }
        
        return {
            mode: dates.length === 1 ? 'date-target' : 'date-range-target',
            dates,
            target,
            outputFile
        };
    } else {
        // 檔案路徑模式
        const inputFile = args[0];
        const outputFile = args[1] || generateDefaultOutputFilename(inputFile);
        
        return {
            mode: 'file-path',
            inputFile,
            outputFile
        };
    }
}

/**
 * 主函數
 */
async function main() {
    try {
        const config = parseArguments();
        
        if (config.showHelp) {
            console.log(`🔍 URL 提取工具`);
            console.log(`用途: 從 log 檔案中提取目標 URL 並去重`);
            console.log('');
            console.log(`使用方式:`);
            console.log(`  方式一: 指定檔案路徑`);
            console.log(`    node url-extractor.js <input-file> [output-file]`);
            console.log('');
            console.log(`  方式二: 指定單一日期和目標類型（自動組成路徑）`);
            console.log(`    node url-extractor.js --date <YYYYMMDD> --target <category|product> [output-file]`);
            console.log('');
            console.log(`  方式三: 指定日期區間和目標類型（統整多日資料）`);
            console.log(`    node url-extractor.js --start-date <YYYYMMDD> --end-date <YYYYMMDD> --target <category|product> [output-file]`);
            console.log('');
            console.log(`範例:`);
            console.log(`  node url-extractor.js logs-20251125.csv`);
            console.log(`  node url-extractor.js logs-20251125.csv extracted-urls.txt`);
            console.log(`  node url-extractor.js --date 20251125 --target product`);
            console.log(`  node url-extractor.js --date 20251124 --target category urls-category.txt`);
            console.log(`  node url-extractor.js --start-date 20251120 --end-date 20251125 --target product`);
            console.log(`  node url-extractor.js --start-date 20251201 --end-date 20251203 --target category weekly-urls.txt`);
            console.log('');
            console.log(`支援檔案格式:`);
            console.log(`  • CSV 檔案 (.csv) - 會解析 textPayload 欄位`);
            console.log(`  • 純文字檔案 (.txt, .log) - 逐行解析`);
            console.log('');
            console.log(`目標類型:`);
            console.log(`  • category - 分類頁資料`);
            console.log(`  • product  - 商品頁資料`);
            process.exit(1);
        }

        const extractor = new URLExtractor();
        
        if (config.mode === 'date-target') {
            // 單日期模式
            const inputFile = selectBestFile(config.dates[0], config.target);
            
            console.log(`📅 查詢日期: ${formatDate(config.dates[0])}`);
            console.log(`🎯 目標類型: ${config.target}`);
            
            await extractor.process(inputFile, config.outputFile);
        } else if (config.mode === 'date-range-target') {
            // 日期區間模式
            const inputFiles = selectBestFilesForDates(config.dates, config.target);
            
            console.log(`📅 日期區間: ${formatDate(config.dates[0])} 至 ${formatDate(config.dates[config.dates.length - 1])}`);
            console.log(`🎯 目標類型: ${config.target}`);
            
            await extractor.processMultipleFiles(inputFiles, config.outputFile);
        } else {
            // 檔案路徑模式
            await extractor.process(config.inputFile, config.outputFile);
        }

    } catch (error) {
        console.error(`❌ 處理失敗: ${error.message}`);
        process.exit(1);
    }
}

/**
 * 確保輸出目錄存在
 * @param {string} filePath - 檔案路徑
 */
function ensureOutputDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ 建立輸出目錄: ${dir}`);
    }
}

/**
 * 檢測檔案路徑中的目標類型
 * @param {string} inputFile - 輸入檔案路徑
 * @returns {string|null} - 目標類型或 null
 */
function detectTargetFromPath(inputFile) {
    if (inputFile.includes('/category/') || inputFile.includes('-category')) {
        return 'category';
    }
    if (inputFile.includes('/product/') || inputFile.includes('-product')) {
        return 'product';
    }
    return null;
}

/**
 * 生成預設輸出檔名
 * @param {string} inputFile - 輸入檔案
 * @returns {string} - 輸出檔名
 */
function generateDefaultOutputFilename(inputFile) {
    const basename = path.basename(inputFile, path.extname(inputFile));
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    // 嘗試從輸入檔案路徑檢測目標類型
    const detectedTarget = detectTargetFromPath(inputFile);
    
    if (detectedTarget) {
        return `url-extract/${detectedTarget}/extracted-urls-${basename}-${timestamp}.txt`;
    } else {
        // 如果無法檢測，放在根目錄
        return `url-extract/extracted-urls-${basename}-${timestamp}.txt`;
    }
}

// 執行主函數
if (require.main === module) {
    main();
}

module.exports = { URLExtractor };