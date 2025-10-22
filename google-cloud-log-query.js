const { Logging } = require('@google-cloud/logging');
const fs = require('fs');
const moment = require('moment-timezone');

class RateLimiter {
  constructor(maxRequestsPerMinute = 50) {
    this.maxRequests = maxRequestsPerMinute;
    this.requests = [];
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  async waitIfNeeded() {
    const now = Date.now();
    
    this.requests = this.requests.filter(timestamp => now - timestamp < 60000);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = 60000 - (now - oldestRequest) + 1000;
      
      console.log(`⏳ 達到速率限制，等待 ${Math.ceil(waitTime/1000)} 秒...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requests.push(now);
  }

  async executeWithRetry(apiCall, context = '') {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.waitIfNeeded();
        return await apiCall();
      } catch (error) {
        if (error.code === 429 || error.message?.includes('quota')) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt), 30000);
          console.log(`⚠️  ${context} 觸發限制 (嘗試 ${attempt}/${this.maxRetries})，等待 ${backoffTime/1000} 秒後重試...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          
          if (attempt === this.maxRetries) {
            throw new Error(`達到最大重試次數，${context} 失敗: ${error.message}`);
          }
        } else {
          throw error;
        }
      }
    }
  }
}

class LogQueryProcessor {
  constructor(projectId = 'eslite-production', maxRequestsPerMinute = 50, outputDir = null, outputFilename = null) {
    this.logging = new Logging({ projectId });
    this.rateLimiter = new RateLimiter(maxRequestsPerMinute);
    this.csvData = [];
    this.processedCount = 0;
    this.errorCount = 0;
    this.outputDir = outputDir;
    this.outputFilename = outputFilename;
    this.currentQueryProcessedCount = 0; // 當前查詢處理的記錄數
  }

  getTimeRange(targetDate = null, startDate = null, endDate = null) {
    const timezone = 'Asia/Taipei';
    let startTime, endTime, dateString;
    
    // 如果指定了開始和結束日期（時間區間查詢）
    if (startDate && endDate) {
      const startMoment = moment.tz(startDate, timezone).startOf('day');
      const endMoment = moment.tz(endDate, timezone).endOf('day');
      
      startTime = startMoment.format('YYYY-MM-DDTHH:mm:ss.SSS') + '+08:00';
      endTime = endMoment.format('YYYY-MM-DDTHH:mm:ss.SSS') + '+08:00';
      dateString = `${startDate}_to_${endDate}`;
    }
    // 如果只指定了開始日期，結束日期使用今天
    else if (startDate && !endDate) {
      const startMoment = moment.tz(startDate, timezone).startOf('day');
      const endMoment = moment.tz(timezone).endOf('day');
      
      startTime = startMoment.format('YYYY-MM-DDTHH:mm:ss.SSS') + '+08:00';
      endTime = endMoment.format('YYYY-MM-DDTHH:mm:ss.SSS') + '+08:00';
      dateString = `${startDate}_to_${moment.tz(timezone).format('YYYY-MM-DD')}`;
    }
    // 原有的單日查詢邏輯
    else {
      let queryDate;
      
      if (targetDate) {
        queryDate = moment.tz(targetDate, timezone);
      } else {
        const today = moment.tz(timezone);
        queryDate = today.clone().subtract(1, 'day');
      }
      
      // 直接使用台北時間，不轉換為 UTC
      startTime = queryDate.startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSS') + '+08:00';
      endTime = queryDate.endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSS') + '+08:00';
      dateString = queryDate.format('YYYY-MM-DD');
    }
    
    console.log(`🕐 時間範圍調試: ${startTime} 到 ${endTime}`);
    
    return {
      start: startTime,
      end: endTime,
      dateString: dateString
    };
  }

  buildFilter(additionalConditions = '', targetDate = null, startDate = null, endDate = null) {
    const baseCondition = 'resource.labels.container_name="prerender"';
    
    let filter = `${baseCondition}`;
    
    if (additionalConditions) {
      filter += ` AND ${additionalConditions}`;
    }
    
    // 只有在 additionalConditions 不包含 timestamp 條件時才加入日期範圍
    const hasTimestampCondition = additionalConditions && additionalConditions.includes('timestamp');
    
    if (!hasTimestampCondition) {
      const timeRange = this.getTimeRange(targetDate, startDate, endDate);
      filter += ` AND timestamp >= "${timeRange.start}"`;
      filter += ` AND timestamp <= "${timeRange.end}"`;
      return { filter: filter.trim(), timeRange };
    }
    
    // 如果已有 timestamp 條件，返回簡化的 timeRange 物件
    return { 
      filter: filter.trim(), 
      timeRange: { 
        dateString: 'custom_timestamp_range',
        start: null,
        end: null
      }
    };
  }

  escapeCsvValue(value) {
    if (typeof value !== 'string') value = String(value);
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  processLogEntry(entry) {
    // 保持原始 ISO 格式的時間戳記
    let timestamp = '';
    if (entry.metadata.timestamp) {
      // 如果是 Date 物件，轉換為 ISO 字串
      if (entry.metadata.timestamp instanceof Date) {
        timestamp = entry.metadata.timestamp.toISOString();
      } else {
        // 如果已經是字串，直接使用
        timestamp = entry.metadata.timestamp.toString();
      }
    }
    
    const textPayload = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data);
    const podName = entry.metadata.resource?.labels?.pod_name || 'N/A';
    
    const csvRow = [
      this.escapeCsvValue(timestamp),
      this.escapeCsvValue(textPayload),
      this.escapeCsvValue(podName)
    ].join(',');
    
    this.csvData.push(csvRow);
  }

  async queryAllLogs(additionalConditions = '', targetDate = null, startDate = null, endDate = null) {
    try {
      const { filter, timeRange } = this.buildFilter(additionalConditions, targetDate, startDate, endDate);
      
      console.log('🔍 Google Cloud Logging 查詢工具');
      if (startDate && endDate) {
        console.log(`📅 查詢時間範圍: ${startDate} 00:00:00 ~ ${endDate} 23:59:59`);
      } else if (startDate && !endDate) {
        console.log(`📅 查詢時間範圍: ${startDate} 00:00:00 ~ 今天 23:59:59`);
      } else {
        console.log(`📅 查詢時間範圍: ${timeRange.dateString} 00:00:00 ~ 23:59:59`);
      }
      console.log(`🔎 查詢條件: ${filter}`);
      console.log('');

      this.csvData = ['timestamp,textPayload,resource.labels.pod_name'];
      this.currentQueryProcessedCount = 0; // 重置當前查詢計數器
      
      const options = {
        filter: filter,
        orderBy: 'timestamp desc',
        pageSize: 1000,
        autoPaginate: false
      };

      let pageToken = null;
      let pageCount = 0;
      const startTime = Date.now();

      do {
        pageCount++;
        console.log(`📄 處理第 ${pageCount} 頁...`);
        
        try {
          const result = await this.rateLimiter.executeWithRetry(async () => {
            const currentOptions = { ...options };
            if (pageToken) {
              currentOptions.pageToken = pageToken;
            }
            return await this.logging.getEntries(currentOptions);
          }, `第 ${pageCount} 頁查詢`);

          const [entries, request, nextQuery] = result;
          
          // 調試輸出
          // console.log(`🔍 Debug - nextQuery:`, nextQuery);
          
          if (entries.length === 0) {
            console.log('✅ 沒有更多資料');
            break;
          }

          console.log(`📝 本頁取得 ${entries.length} 筆記錄`);

          for (const entry of entries) {
            try {
              this.processLogEntry(entry);
              this.processedCount++;
              this.currentQueryProcessedCount++;
            } catch (error) {
              this.errorCount++;
              console.warn(`⚠️  處理單筆記錄失敗: ${error.message}`);
            }
          }

          pageToken = nextQuery?.nextPageToken || null;
          
          const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
          const rate = this.processedCount / Math.max(elapsedSeconds, 1);
          console.log(`📊 累計處理: ${this.processedCount} 筆 | 錯誤: ${this.errorCount} 筆 | 速率: ${rate.toFixed(1)} 筆/秒`);
          console.log(`🔄 下一頁 Token: ${pageToken && pageToken.length > 0 ? pageToken.substring(0, 20) + '...' : '無'}`);

        } catch (error) {
          this.errorCount++;
          console.error(`❌ 第 ${pageCount} 頁處理失敗:`, error.message);
          
          if (error.message.includes('quota') || error.message.includes('429')) {
            console.log('⏰ 配額限制，等待 60 秒後繼續...');
            await new Promise(resolve => setTimeout(resolve, 60000));
          }
        }

      } while (pageToken);

      return this.saveToCSV(timeRange.dateString);

    } catch (error) {
      console.error('❌ 查詢日誌時發生錯誤:', error);
      throw error;
    }
  }

  saveToCSV(dateString) {
    const defaultFilename = `prerender_logs_${dateString.replace(/-/g, '')}.csv`;
    const filename = this.outputFilename || defaultFilename;
    
    const defaultDir = process.cwd();
    const outputDir = this.outputDir || defaultDir;
    
    // 確保輸出目錄存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`✅ 已建立輸出目錄: ${outputDir}`);
    }
    
    const filePath = `${outputDir}/${filename}`;
    
    try {
      fs.writeFileSync(filePath, this.csvData.join('\n'), 'utf8');
      
      console.log(`\n✅ 查詢完成!`);
      console.log(`📁 檔案已保存: ${filename}`);
      console.log(`📈 總計處理: ${this.processedCount} 筆記錄`);
      console.log(`❌ 錯誤記錄: ${this.errorCount} 筆`);
      
      if (fs.existsSync(filePath)) {
        const fileSizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
        console.log(`💾 檔案大小: ${fileSizeMB} MB`);
      }
      
      return {
        filename,
        filePath,
        processedCount: this.processedCount,
        currentQueryProcessedCount: this.currentQueryProcessedCount,
        errorCount: this.errorCount
      };
    } catch (error) {
      console.error('❌ 保存 CSV 檔案失敗:', error);
      throw error;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let targetDate = null;
  let startDate = null;
  let endDate = null;
  let additionalConditions = '';
  let outputDir = null;
  let outputFilename = null;
  
  // 解析參數
  const filteredArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // 檢查日期參數
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg) && !startDate && !endDate) {
      targetDate = arg;
    }
    // 檢查開始日期參數
    else if (arg === '--start-date' && i + 1 < args.length) {
      startDate = args[i + 1];
      targetDate = null; // 如果使用區間查詢，清除單日查詢
      i++; // 跳過下一個參數
    }
    // 檢查結束日期參數
    else if (arg === '--end-date' && i + 1 < args.length) {
      endDate = args[i + 1];
      i++; // 跳過下一個參數
    }
    // 檢查輸出目錄參數
    else if (arg === '--output-dir' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++; // 跳過下一個參數
    }
    // 檢查輸出檔名參數
    else if (arg === '--filename' && i + 1 < args.length) {
      outputFilename = args[i + 1];
      i++; // 跳過下一個參數
    }
    // 其他參數作為查詢條件
    else if (!arg.startsWith('--')) {
      filteredArgs.push(arg);
    }
  }
  
  additionalConditions = filteredArgs.join(' ');
  
  const processor = new LogQueryProcessor('eslite-production', 50, outputDir, outputFilename);
  
  console.log('🔍 Google Cloud Logging 查詢工具');
  if (targetDate) {
    console.log(`📅 查詢指定日期: ${targetDate}`);
  }
  if (startDate || endDate) {
    if (startDate && endDate) {
      console.log(`📅 查詢日期範圍: ${startDate} ~ ${endDate}`);
    } else if (startDate && !endDate) {
      console.log(`📅 查詢日期範圍: ${startDate} ~ 今天`);
    }
  }
  if (additionalConditions) {
    console.log(`🔧 額外查詢條件: ${additionalConditions}`);
  }
  if (outputDir) {
    console.log(`📂 輸出目錄: ${outputDir}`);
  }
  if (outputFilename) {
    console.log(`📄 輸出檔名: ${outputFilename}`);
  }
  console.log('');
  
  try {
    const result = await processor.queryAllLogs(additionalConditions, targetDate, startDate, endDate);
    console.log(`\n🎉 處理完成: ${result.filename}`);
  } catch (error) {
    console.error('❌ 主程序執行失敗:', error.message);
    
    console.log('\n🔧 故障排除建議:');
    if (error.message.includes('quota') || error.message.includes('429')) {
      console.log('- 配額限制：Google Cloud 每分鐘限制 60 次請求');
      console.log('- 建議將 RateLimiter 設定調低至 30-40/min');
    }
    if (error.message.includes('permission')) {
      console.log('- 權限問題：檢查 Google Cloud 認證設定');
      console.log('- 確認專案 ID 和服務帳號權限');
    }
    
    console.log('\n📖 使用說明:');
    console.log('node google-cloud-log-query.js [選項] [日期] [查詢條件]');
    console.log('');
    console.log('選項:');
    console.log('  --start-date <日期>    指定開始日期 (YYYY-MM-DD)');
    console.log('  --end-date <日期>      指定結束日期 (YYYY-MM-DD)');
    console.log('  --output-dir <路徑>    指定輸出目錄');
    console.log('  --filename <檔名>      指定輸出檔名');
    console.log('');
    console.log('範例:');
    console.log('  # 單日查詢 (原有功能)');
    console.log('  node google-cloud-log-query.js 2024-08-18');
    console.log('  node google-cloud-log-query.js 2024-08-18 "severity>=ERROR"');
    console.log('');
    console.log('  # 時間區間查詢 (新功能)');
    console.log('  node google-cloud-log-query.js --start-date 2024-07-24 --end-date 2024-09-15');
    console.log('  node google-cloud-log-query.js --start-date 2024-07-24 --end-date 2024-09-15 \'textPayload:("X-Original-User-Agent:" AND "https://www.eslite.com/category/")\'');
    console.log('');
    console.log('  # 從指定日期到今天');
    console.log('  node google-cloud-log-query.js --start-date 2024-07-24');
    console.log('');
    console.log('  # 指定輸出選項');
    console.log('  node google-cloud-log-query.js --output-dir ./results --filename my_logs.csv --start-date 2024-07-24 --end-date 2024-09-15');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { LogQueryProcessor, RateLimiter };