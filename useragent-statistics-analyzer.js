/**
 * User Agent 統計分析工具
 * 
 * 功能：
 * 1. 分析指定日期範圍內的 User Agent 日誌檔案
 * 2. 統計每個 User Agent 的出現次數和佔比
 * 3. 支援多種日誌格式（早期格式和後期格式）
 * 4. 生成詳細統計報告和 CSV 匯出
 * 
 * 使用方式：node useragent-statistics-analyzer.js [選項]
 */
const fs = require('fs');
const path = require('path');

/**
 * User Agent 統計分析器類別
 * 負責處理 User Agent 日誌檔案的分析和統計
 */
class UserAgentStatisticsAnalyzer {
  /**
   * 建構函數
   * @param {string} dataDir - 資料目錄路徑，預設為 './to-analyze-daily-data'
   * @param {string} startDate - 開始日期 (YYYY-MM-DD 格式)
   * @param {string} endDate - 結束日期 (YYYY-MM-DD 格式)
   */
  constructor(dataDir = './to-analyze-daily-data', startDate = null, endDate = null) {
    this.dataDir = dataDir;                // 資料目錄路徑
    this.startDate = startDate;            // 開始日期
    this.endDate = endDate;                // 結束日期
    this.userAgentStats = new Map();       // User Agent 統計資料 (Map: userAgent -> count)
    this.totalRecords = 0;                 // 總記錄數
    this.processedFiles = [];              // 已處理檔案列表
    this.skippedFiles = [];                // 跳過檔案列表
  }

  /**
   * 生成指定範圍內的日期陣列
   * @param {string} startDate - 開始日期 (YYYY-MM-DD 格式)
   * @param {string} endDate - 結束日期 (YYYY-MM-DD 格式)
   * @returns {Date[]} 日期物件陣列
   */
  generateDateRange(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // 逐日生成日期，包含開始和結束日期
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    
    return dates;
  }

  /**
   * 將日期物件格式化為 YYYYMMDD 字串
   * @param {Date} date - 日期物件
   * @returns {string} 格式化後的日期字串 (YYYYMMDD)
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * 從日誌文本中提取 User Agent 字串
   * @param {string} textPayload - 日誌文本內容
   * @returns {string|null} 提取到的 User Agent 字串，失敗時返回 null
   */
  extractUserAgent(textPayload) {
    if (!textPayload || typeof textPayload !== 'string') {
      return null;
    }

    // 尋找 X-Original-User-Agent: 後的內容
    // 格式: ${時間綴} X-Original-User-Agent: ${userAgent} ${reqUrl} ${[reqId]}
    const userAgentMatch = textPayload.match(/X-Original-User-Agent:\s*([^\n\r]+)/);
    
    if (userAgentMatch && userAgentMatch[1]) {
      let fullLine = userAgentMatch[1].trim();
      
      // 先移除最後的 reqId 部分 [reqId: ...]
      fullLine = fullLine.replace(/\s+\[reqId:[^\]]+\]$/, '');
      
      // 然後移除最後的 URL 部分 (https://...)
      // 使用非貪婪匹配，從最後一個 http 開始移除
      fullLine = fullLine.replace(/\s+https?:\/\/\S+$/, '');
      
      const userAgent = fullLine.trim();
      
      // 正規化 Yahoo! Slurp 格式
      // 將包含 sieve.k8s.crawler-production/ 的格式統一處理
      const yahooSlurpPattern = /^(Mozilla\/5\.0 \(compatible; Yahoo! Slurp; http:\/\/help\.yahoo\.com\/help\/us\/ysearch\/slurp\)) sieve\.k8s\.crawler-production\/\d+-0$/;
      const yahooSlurpMatch = userAgent.match(yahooSlurpPattern);
      if (yahooSlurpMatch) {
        return yahooSlurpMatch[1]; // 只返回標準化的 Yahoo! Slurp 部分
      }
      
      return userAgent;
    }
    
    return null;
  }

  /**
   * 解析 CSV 行，處理引號包圍的欄位和轉義字元
   * @param {string} line - CSV 行字串
   * @returns {string[]} 解析後的欄位陣列
   */
  parseCSVLine(line) {
    // 簡化的 CSV 解析，處理引號包圍的欄位
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"' && !inQuotes) {
        inQuotes = true;                    // 開始引號
      } else if (char === '"' && inQuotes) {
        if (line[i + 1] === '"') {
          // 雙引號轉義
          current += '"';
          i++;
        } else {
          inQuotes = false;                 // 結束引號
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);               // 找到分隔符，儲存欄位
        current = '';
      } else {
        current += char;                    // 累積字元
      }
      i++;
    }
    
    result.push(current);                   // 最後一個欄位
    return result;
  }

  /**
   * 處理早期格式的日誌檔案
   * 早期格式：多欄位 CSV，需要搜尋包含 X-Original-User-Agent 的欄位
   * @param {string} filePath - 檔案路徑
   */
  async processEarlyFormatFile(filePath) {
    try {
      console.log(`📄 處理早期格式檔案: ${path.basename(filePath)}`);
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      let fileRecordCount = 0;              // 檔案總記錄數
      let fileUserAgentCount = 0;           // 有效 User Agent 記錄數
      
      // 跳過標頭行，從第二行開始處理
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        fileRecordCount++;
        
        try {
          const columns = this.parseCSVLine(line);
          
          // textPayload 通常在最後幾列，需要找到包含 X-Original-User-Agent 的欄位
          let textPayload = null;
          
          for (const column of columns) {
            if (column && column.includes('X-Original-User-Agent:')) {
              textPayload = column;
              break;
            }
          }
          
          if (textPayload) {
            const userAgent = this.extractUserAgent(textPayload);
            
            if (userAgent) {
              fileUserAgentCount++;
              this.totalRecords++;
              
              // 更新統計資料
              if (this.userAgentStats.has(userAgent)) {
                this.userAgentStats.set(userAgent, this.userAgentStats.get(userAgent) + 1);
              } else {
                this.userAgentStats.set(userAgent, 1);
              }
            }
          }
        } catch (error) {
          // 跳過無法解析的行，繼續處理下一行
          continue;
        }
      }
      
      console.log(`   📊 檔案記錄數: ${fileRecordCount}, User Agent 記錄數: ${fileUserAgentCount}`);
      this.processedFiles.push({
        file: path.basename(filePath),
        records: fileRecordCount,
        userAgents: fileUserAgentCount,
        format: 'early'
      });
      
    } catch (error) {
      console.error(`❌ 處理檔案失敗: ${filePath} - ${error.message}`);
      this.skippedFiles.push({
        file: path.basename(filePath),
        error: error.message
      });
    }
  }

  /**
   * 處理後期格式的日誌檔案
   * 後期格式：timestamp,textPayload,resource.labels.pod_name (textPayload 在第二欄)
   * @param {string} filePath - 檔案路徑
   */
  async processLaterFormatFile(filePath) {
    try {
      console.log(`📄 處理後期格式檔案: ${path.basename(filePath)}`);
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      let fileRecordCount = 0;              // 檔案總記錄數
      let fileUserAgentCount = 0;           // 有效 User Agent 記錄數
      
      // 跳過標頭行，從第二行開始處理
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        fileRecordCount++;
        
        try {
          const columns = this.parseCSVLine(line);
          
          // 後期格式: timestamp,textPayload,resource.labels.pod_name
          // textPayload 在第二欄（索引 1）
          if (columns.length >= 2) {
            const textPayload = columns[1];
            
            if (textPayload && textPayload.includes('X-Original-User-Agent:')) {
              const userAgent = this.extractUserAgent(textPayload);
              
              if (userAgent) {
                fileUserAgentCount++;
                this.totalRecords++;
                
                // 更新統計資料
                if (this.userAgentStats.has(userAgent)) {
                  this.userAgentStats.set(userAgent, this.userAgentStats.get(userAgent) + 1);
                } else {
                  this.userAgentStats.set(userAgent, 1);
                }
              }
            }
          }
        } catch (error) {
          // 跳過無法解析的行，繼續處理下一行
          continue;
        }
      }
      
      console.log(`   📊 檔案記錄數: ${fileRecordCount}, User Agent 記錄數: ${fileUserAgentCount}`);
      this.processedFiles.push({
        file: path.basename(filePath),
        records: fileRecordCount,
        userAgents: fileUserAgentCount,
        format: 'later'
      });
      
    } catch (error) {
      console.error(`❌ 處理檔案失敗: ${filePath} - ${error.message}`);
      this.skippedFiles.push({
        file: path.basename(filePath),
        error: error.message
      });
    }
  }

  /**
   * 執行主要分析流程
   * 分析指定日期範圍內的所有 User Agent 日誌檔案
   * @returns {Object} 分析結果物件
   */
  async analyze() {
    console.log('🔍 開始分析 User Agent 統計');
    console.log(`📂 資料目錄: ${this.dataDir}`);
    
    // 設置預設日期範圍（如果沒有指定的話）
    const startDate = this.startDate || '2025-10-09';
    const endDate = this.endDate || '2025-11-09';
    
    console.log(`\n📅 處理 ${startDate} 到 ${endDate} 期間的檔案...`);
    
    const userAgentLogDir = path.join(this.dataDir, 'prerender/user-agent-log');
    const targetDates = this.generateDateRange(startDate, endDate);
    
    for (const date of targetDates) {
      const dateStr = this.formatDate(date);
      const fileName = `user-agent-log-${dateStr}-category.csv`;
      const filePath = path.join(userAgentLogDir, 'category', fileName);
      
      if (fs.existsSync(filePath)) {
        await this.processLaterFormatFile(filePath);
      } else {
        console.log(`⚠️  檔案不存在: category/${fileName}`);
        this.skippedFiles.push({
          file: `category/${fileName}`,
          error: '檔案不存在'
        });
      }
    }
    
    return this.generateResults();
  }

  /**
   * 生成分析結果摘要
   * 將統計資料整理成結構化的結果物件
   * @returns {Object} 包含統計摘要、詳細數據和檔案處理狀況的結果物件
   */
  generateResults() {
    console.log('\n📊 生成統計結果...');
    
    // 轉換為陣列並依出現次數排序
    const sortedStats = Array.from(this.userAgentStats.entries())
      .map(([userAgent, count]) => ({
        userAgent,
        count,
        percentage: ((count / this.totalRecords) * 100).toFixed(4)
      }))
      .sort((a, b) => b.count - a.count);
    
    const results = {
      summary: {
        totalRecords: this.totalRecords,                    // 總記錄數
        uniqueUserAgents: this.userAgentStats.size,         // 唯一 User Agent 數量
        processedFiles: this.processedFiles.length,         // 已處理檔案數
        skippedFiles: this.skippedFiles.length,            // 跳過檔案數
        analysisDate: new Date().toISOString(),            // 分析時間
        dateRange: `${this.startDate || '2025-10-09'} to ${this.endDate || '2025-11-09'}`  // 分析日期範圍
      },
      statistics: sortedStats,                             // 排序後的統計資料
      processedFiles: this.processedFiles,                 // 已處理檔案詳情
      skippedFiles: this.skippedFiles                      // 跳過檔案詳情
    };
    
    return results;
  }

  /**
   * 儲存分析結果到檔案
   * 生成 JSON、CSV 和詳細報告三種格式的輸出檔案
   * @param {Object} results - 分析結果物件
   * @param {string} outputDir - 輸出目錄路徑
   * @param {string|null} filename - 自訂檔名前綴，null 時使用預設檔名
   * @returns {Object} 包含各檔案路徑的物件
   */
  saveResults(results, outputDir = './', filename = null) {
    const timestamp = Date.now();
    const defaultFilename = `useragent_statistics_analysis_${timestamp}`;
    const baseFilename = filename || defaultFilename;
    
    // 確保輸出目錄存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 保存 JSON 格式（詳細統計資料）
    const jsonPath = path.join(outputDir, `${baseFilename}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
    
    // 保存 CSV 格式（統計表格）
    const csvPath = path.join(outputDir, `${baseFilename}.csv`);
    const csvContent = this.generateCSV(results);
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    
    // 保存詳細報告（可讀性高的文字報告）
    const reportPath = path.join(outputDir, `${baseFilename}_report.txt`);
    const reportContent = this.generateReport(results);
    fs.writeFileSync(reportPath, reportContent, 'utf8');
    
    console.log(`\n✅ 結果已保存:`);
    console.log(`📄 JSON: ${path.basename(jsonPath)}`);
    console.log(`📊 CSV: ${path.basename(csvPath)}`);
    console.log(`📋 報告: ${path.basename(reportPath)}`);
    
    return {
      jsonPath,
      csvPath,
      reportPath
    };
  }

  /**
   * 生成 CSV 格式的統計報告
   * @param {Object} results - 分析結果物件
   * @returns {string} CSV 格式的字串
   */
  generateCSV(results) {
    let csv = 'User Agent,Count,Percentage\n';
    
    for (const stat of results.statistics) {
      // 處理 User Agent 字串中的引號，避免 CSV 格式錯誤
      const escapedUserAgent = `"${stat.userAgent.replace(/"/g, '""')}"`;
      csv += `${escapedUserAgent},${stat.count},${stat.percentage}%\n`;
    }
    
    return csv;
  }

  /**
   * 生成詳細的文字格式統計報告
   * 包含統計摘要、Top N 排行榜、分布分析等內容
   * @param {Object} results - 分析結果物件
   * @returns {string} 格式化的文字報告
   */
  generateReport(results) {
    const report = [];
    
    report.push('🔍 User Agent 統計分析報告');
    report.push('='.repeat(50));
    report.push('');
    
    // 統計摘要區塊
    report.push('📊 統計摘要:');
    report.push(`   總記錄數: ${results.summary.totalRecords.toLocaleString()}`);
    report.push(`   唯一 User Agent 數量: ${results.summary.uniqueUserAgents.toLocaleString()}`);
    report.push(`   處理檔案數: ${results.summary.processedFiles}`);
    report.push(`   跳過檔案數: ${results.summary.skippedFiles}`);
    report.push(`   分析日期範圍: ${results.summary.dateRange}`);
    report.push(`   分析時間: ${new Date(results.summary.analysisDate).toLocaleString('zh-TW')}`);
    report.push('');
    
    // Top 30 排行榜
    report.push('🏆 Top 30 最常見的 User Agent:');
    report.push('-'.repeat(50));
    
    const top30 = results.statistics.slice(0, 30);
    for (let i = 0; i < top30.length; i++) {
      const stat = top30[i];
      report.push(`${i + 1}. [${stat.percentage}%] ${stat.count.toLocaleString()} 次`);
      report.push(`   ${stat.userAgent}`);
      report.push('');
    }
    
    // 統計分析區塊
    report.push('📈 統計分析:');
    report.push('-'.repeat(30));
    
    const totalCount = results.summary.totalRecords;
    const top10Count = top30.slice(0, 10).reduce((sum, stat) => sum + stat.count, 0);
    const top20Count = top30.slice(0, 20).reduce((sum, stat) => sum + stat.count, 0);
    const top30Count = top30.reduce((sum, stat) => sum + stat.count, 0);
    
    report.push(`   Top 10 佔總數的 ${((top10Count / totalCount) * 100).toFixed(2)}%`);
    report.push(`   Top 20 佔總數的 ${((top20Count / totalCount) * 100).toFixed(2)}%`);
    report.push(`   Top 30 佔總數的 ${((top30Count / totalCount) * 100).toFixed(2)}%`);
    report.push('');
    
    // 使用頻率分布分析
    const singleUseUAs = results.statistics.filter(stat => stat.count === 1).length;
    const lowUseUAs = results.statistics.filter(stat => stat.count >= 2 && stat.count <= 10).length;
    const mediumUseUAs = results.statistics.filter(stat => stat.count >= 11 && stat.count <= 100).length;
    const highUseUAs = results.statistics.filter(stat => stat.count > 100).length;
    
    report.push('📊 使用頻率分布:');
    report.push(`   單次使用 (1次): ${singleUseUAs} 個 (${((singleUseUAs / results.summary.uniqueUserAgents) * 100).toFixed(2)}%)`);
    report.push(`   低頻使用 (2-10次): ${lowUseUAs} 個 (${((lowUseUAs / results.summary.uniqueUserAgents) * 100).toFixed(2)}%)`);
    report.push(`   中頻使用 (11-100次): ${mediumUseUAs} 個 (${((mediumUseUAs / results.summary.uniqueUserAgents) * 100).toFixed(2)}%)`);
    report.push(`   高頻使用 (>100次): ${highUseUAs} 個 (${((highUseUAs / results.summary.uniqueUserAgents) * 100).toFixed(2)}%)`);
    report.push('');
    
    // 跳過檔案報告（如果有的話）
    if (results.skippedFiles.length > 0) {
      report.push('⚠️  跳過的檔案:');
      report.push('-'.repeat(30));
      for (const skipped of results.skippedFiles) {
        report.push(`   ${skipped.file}: ${skipped.error}`);
      }
      report.push('');
    }
    
    // 處理檔案詳情
    report.push('📁 處理的檔案詳情:');
    report.push('-'.repeat(30));
    for (const file of results.processedFiles) {
      report.push(`   ${file.file} (${file.format}): ${file.records} 筆記錄, ${file.userAgents} 筆 User Agent`);
    }
    
    return report.join('\n');
  }
}

/**
 * 主要執行函數
 * 處理命令列參數並執行 User Agent 統計分析
 */
async function main() {
  const args = process.argv.slice(2);
  let dataDir = './to-analyze-daily-data';         // 預設資料目錄
  let outputDir = './';                           // 預設輸出目錄
  let filename = null;                            // 自訂檔名前綴
  let startDate = null;                           // 開始日期
  let endDate = null;                             // 結束日期
  
  // 解析命令列參數
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--data-dir' && i + 1 < args.length) {
      dataDir = args[i + 1];
      i++;
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else if (arg === '--filename' && i + 1 < args.length) {
      filename = args[i + 1];
      i++;
    } else if (arg === '--start-date' && i + 1 < args.length) {
      startDate = args[i + 1];
      i++;
    } else if (arg === '--end-date' && i + 1 < args.length) {
      endDate = args[i + 1];
      i++;
    } else if (arg === '--help') {
      console.log('🔍 User Agent 統計分析工具');
      console.log('');
      console.log('分析指定日期範圍內的 User Agent 資料，');
      console.log('統計每個 User Agent 的總數和佔比。');
      console.log('');
      console.log('使用方法:');
      console.log('  node useragent-statistics-analyzer.js [選項]');
      console.log('');
      console.log('選項:');
      console.log('  --data-dir <路徑>     指定資料目錄 (預設: ./to-analyze-daily-data)');
      console.log('  --output-dir <路徑>   指定輸出目錄 (預設: ./)');
      console.log('  --filename <檔名>     指定輸出檔名前綴 (預設: 自動生成)');
      console.log('  --start-date <日期>   開始日期 YYYY-MM-DD 格式 (預設: 2025-10-09)');
      console.log('  --end-date <日期>     結束日期 YYYY-MM-DD 格式 (預設: 2025-11-09)');
      console.log('  --help               顯示此說明');
      console.log('');
      console.log('輸入資料格式:');
      console.log('  category/user-agent-log-${date}-category.csv');
      console.log('');
      console.log('範例:');
      console.log('  node useragent-statistics-analyzer.js');
      console.log('  node useragent-statistics-analyzer.js --start-date 2025-10-01 --end-date 2025-10-31');
      console.log('  node useragent-statistics-analyzer.js --output-dir ./results --start-date 2025-09-01');
      console.log('  node useragent-statistics-analyzer.js --filename ua_stats_custom --start-date 2025-10-15 --end-date 2025-10-20');
      return;
    }
  }
  
  try {
    // 建立分析器並執行分析
    const analyzer = new UserAgentStatisticsAnalyzer(dataDir, startDate, endDate);
    const results = await analyzer.analyze();
    const savedFiles = analyzer.saveResults(results, outputDir, filename);
    
    // 顯示分析完成訊息
    console.log(`\n🎉 分析完成!`);
    console.log(`📊 總計處理: ${results.summary.totalRecords.toLocaleString()} 筆記錄`);
    console.log(`🔢 唯一 User Agent: ${results.summary.uniqueUserAgents.toLocaleString()} 個`);
    
    if (results.statistics.length > 0) {
      const topUA = results.statistics[0];
      console.log(`🏆 最常見的 User Agent: ${topUA.userAgent.substring(0, 80)}... (${topUA.percentage}%)`);
    }
    
  } catch (error) {
    console.error('❌ 分析過程發生錯誤:', error.message);
    
    console.log('\n🔧 故障排除建議:');
    console.log('- 確認資料目錄路徑正確');
    console.log('- 確認檔案權限');
    console.log('- 檢查檔案格式是否正確');
    
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { UserAgentStatisticsAnalyzer };