const { LogQueryProcessor } = require('./google-cloud-log-query');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class SlowRenderingAnalyzer {
    constructor(options = {}) {
        this.baseOutputDir = options.baseOutputDir || './slow-render-query-results';
        this.logProcessor = new LogQueryProcessor(
            options.projectId || 'eslite-production', 
            options.maxRequestsPerMinute || 50,
            this.baseOutputDir,
            options.outputFilename
        );
    }

    async downloadSlowRenderLogs(options = {}) {
        const {
            targetDate = null,
            startDate = null,
            endDate = null,
            renderThreshold = 1000 // milliseconds
        } = options;

        // 查詢慢渲染相關的日誌條件
        const slowRenderConditions = [
            `textPayload:"render"`,
            `textPayload:"slow"`,
            `textPayload:"performance"`,
            `textPayload:"timeout"`,
            `severity>="WARNING"`
        ].join(' OR ');

        try {
            console.log('開始下載慢渲染分析日誌...');
            const result = await this.logProcessor.queryAllLogs(
                slowRenderConditions,
                targetDate,
                startDate,
                endDate
            );

            console.log('慢渲染日誌下載完成');
            return result;
        } catch (error) {
            console.error('下載慢渲染日誌失敗:', error);
            throw error;
        }
    }

    async querySpecificSlowRender(record, options = {}) {
        // 建立基於日期和類型的輸出目錄結構
        const dateStr = options.dateStr || this.extractDateFromRecord(record);
        
        const recordType = record.render_time_ms >= 20000 ? 'over-20s' : 'standard';
        const outputDir = options.outputDir || `${this.baseOutputDir}/${dateStr}/${recordType}`;
        
        // 確保輸出目錄存在
        const fs = require('fs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`📁 建立輸出目錄: ${outputDir}`);
        }
        
        const { outputFilename } = options;
        
        // 使用 user_agent_record_time 和 got_200_record_time 建立精確時間範圍查詢
        if (record.user_agent_record_time && record.got_200_record_time && record.pod_name) {
            
            // 為 got_200_record_time 加上 10ms
            const got200Time = new Date(record.got_200_record_time);
            got200Time.setMilliseconds(got200Time.getMilliseconds() + 10);
            const adjustedGot200Time = got200Time.toISOString();
            
            // 建立精確的查詢條件 (不包含 req_id)
            const timeRangeCondition = `timestamp >= "${record.user_agent_record_time}" AND timestamp <= "${adjustedGot200Time}"`;
            const podCondition = `resource.labels.pod_name="${record.pod_name}"`;
            
            const conditions = [podCondition, timeRangeCondition].join(' AND ');
            
            console.log(`🔍 執行精確時間範圍查詢:`);
            console.log(`   ⏰ 時間範圍: ${record.user_agent_record_time} ~ ${adjustedGot200Time} (+10ms)`);
            console.log(`   🏷️  Pod: ${record.pod_name}`);
            
            // 提取日期部分
            const startDate = record.user_agent_record_time.split('T')[0];
            const endDate = record.got_200_record_time.split('T')[0];
            
            try {
                // 更新 logProcessor 的輸出目錄
                this.logProcessor.outputDir = outputDir;
                if (outputFilename) {
                    this.logProcessor.outputFilename = outputFilename;
                }
                
                const result = await this.logProcessor.queryAllLogs(
                    conditions,
                    null, // targetDate
                    startDate,
                    endDate
                );
                
                console.log(`✅ 精確時間範圍查詢完成，檔案存放在: ${outputDir}`);
                return result;
            } catch (error) {
                console.error('❌ 精確時間範圍查詢失敗:', error);
                throw error;
            }
        } else {
            throw new Error('記錄中缺少必要的時間戳記 (user_agent_record_time, got_200_record_time) 或 pod_name 資訊');
        }
    }

    async batchQuerySlowRenders(records, options = {}) {
        const results = [];
        const { delayMs = 2000 } = options;
        
        // 建立批次查詢的統一目錄
        const batchDate = options.dateStr || this.extractDateFromRecord(records[0]);
        const target = options.target || 'category';
        
        const batchOutputDir = `${this.baseOutputDir}/${batchDate}/${target}/batch-query`;
        const logDataDir = `${batchOutputDir}/log-data`;
        const fs = require('fs');
        if (!fs.existsSync(logDataDir)) {
            fs.mkdirSync(logDataDir, { recursive: true });
            console.log(`📁 建立批次查詢輸出目錄: ${logDataDir}`);
        }

        console.log(`🔄 開始批次查詢 ${records.length} 筆慢渲染記錄...`);
        console.log(`📂 所有檔案將存放在: ${logDataDir}`);

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            console.log(`\n[${i + 1}/${records.length}]`);

            try {
                const result = await this.querySpecificSlowRender(record, {
                    ...options,
                    outputDir: logDataDir,
                    outputFilename: `slow_render_${record.req_id || (i + 1).toString().padStart(4, '0')}.csv`,
                    dateStr: batchDate
                });
                
                // 加入單一查詢處理的記錄數
                const resultWithSingleCount = {
                    ...result,
                    singleQueryProcessedCount: result.currentQueryProcessedCount || 0
                };
                
                results.push({ record, result: resultWithSingleCount, success: true });
            } catch (error) {
                console.error(`❌ 查詢失敗: ${error.message}`);
                results.push({ record, error: error.message, success: false });
            }
            
            // 添加延遲避免 API 限制
            if (i < records.length - 1) {
                console.log(`⏳ 等待 ${delayMs/1000} 秒...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        console.log(`\n🎉 批次查詢完成！成功: ${successCount}/${records.length}`);
        console.log(`📁 所有結果檔案存放在: ${batchOutputDir}`);
        
        // 建立查詢摘要檔案
        const summaryFile = `${batchOutputDir}/batch_query_summary.json`;
        const summaryData = {
            query_date: new Date().toISOString(),
            total_records: records.length,
            successful_queries: successCount,
            failed_queries: records.length - successCount,
            output_directory: batchOutputDir,
            results: results
        };
        
        fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2), 'utf8');
        console.log(`📄 查詢摘要已存放在: ${summaryFile}`);
        
        return results;
    }

    async queryByDate(dateStr, options = {}) {
        const target = options.target || 'category';
        const hour = options.hour !== undefined ? options.hour : null;

        // 格式化日期 (支援 YYYYMMDD 或 YYYY-MM-DD 格式)
        const formattedDate = this.formatDate(dateStr);

        // 建立檔案路徑
        const slowRenderFile = `./slow-render-periods-log/${target}/slow_render_periods_${formattedDate}.json`;

        console.log(`🔍 查詢日期: ${formattedDate}`);
        if (hour !== null) {
            console.log(`🕐 指定時段: ${hour}:00 ~ ${hour}:59`);
        }
        console.log(`📖 讀取檔案: ${slowRenderFile}`);

        // 檢查檔案是否存在
        if (!fs.existsSync(slowRenderFile)) {
            throw new Error(`找不到日期 ${formattedDate} 的慢渲染檔案: ${slowRenderFile}`);
        }

        try {
            // 讀取慢渲染記錄
            const data = JSON.parse(fs.readFileSync(slowRenderFile, 'utf8'));

            if (!Array.isArray(data)) {
                throw new Error('檔案格式錯誤，應為陣列格式');
            }

            // 篩選有完整時間戳記的記錄
            let validRecords = data.filter(record =>
                record.user_agent_record_time &&
                record.got_200_record_time &&
                record.pod_name
            );

            // 如果指定了小時，進一步篩選該時段的記錄
            if (hour !== null) {
                validRecords = validRecords.filter(record => {
                    // 解析 user_agent_record_time 的小時部分
                    const recordTime = new Date(record.user_agent_record_time);
                    const recordHour = recordTime.getHours();
                    return recordHour === parseInt(hour);
                });
                console.log(`🔍 時段篩選後記錄數: ${validRecords.length}`);
            }

            const over20sRecords = validRecords.filter(record => 
                record.render_time_ms >= 20000
            );

            console.log(`📊 檔案分析:`);
            console.log(`  • 總記錄數: ${data.length}`);
            console.log(`  • 有效記錄數: ${validRecords.length}`);
            console.log(`  • 超過 20 秒記錄: ${over20sRecords.length}`);
            console.log(`  • 8-20 秒記錄: ${validRecords.length - over20sRecords.length}`);

            if (validRecords.length === 0) {
                console.log('⚠️ 沒有找到有效的記錄');
                return { success: false, message: '沒有有效記錄' };
            }

            // 根據選項決定查詢哪些記錄
            const { 
                queryType = 'all',        // 'all', 'over20s', 'standard'
                maxRecords = null,        // 限制查詢記錄數
                delayMs = 2000           // 查詢間隔
            } = options;

            let recordsToQuery = validRecords;
            
            switch(queryType) {
                case 'over20s':
                    recordsToQuery = over20sRecords;
                    console.log(`🎯 查詢模式: 只查詢超過 20 秒的記錄 (${recordsToQuery.length} 筆)`);
                    break;
                case 'standard':
                    recordsToQuery = validRecords.filter(record => 
                        record.render_time_ms >= 8000 && record.render_time_ms < 20000
                    );
                    console.log(`🎯 查詢模式: 只查詢 8-20 秒的記錄 (${recordsToQuery.length} 筆)`);
                    break;
                default:
                    console.log(`🎯 查詢模式: 查詢所有有效記錄 (${recordsToQuery.length} 筆)`);
            }

            if (maxRecords && maxRecords > 0) {
                recordsToQuery = recordsToQuery.slice(0, maxRecords);
                console.log(`📏 限制查詢數量: ${recordsToQuery.length} 筆`);
            }

            if (recordsToQuery.length === 0) {
                console.log('⚠️ 沒有符合條件的記錄');
                return { success: false, message: '沒有符合條件的記錄' };
            }

            // 執行批次查詢
            console.log(`\n🚀 開始執行批次查詢...`);
            const results = await this.batchQuerySlowRenders(recordsToQuery, { delayMs, dateStr: formattedDate, target });

            const successCount = results.filter(r => r.success).length;
            
            console.log(`\n🎉 查詢完成！`);
            console.log(`✅ 成功: ${successCount}/${results.length}`);
            console.log(`❌ 失敗: ${results.length - successCount}`);

            return {
                success: true,
                date: formattedDate,
                totalRecords: data.length,
                validRecords: validRecords.length,
                queriedRecords: recordsToQuery.length,
                successfulQueries: successCount,
                failedQueries: results.length - successCount,
                results: results
            };

        } catch (error) {
            console.error('❌ 處理檔案時發生錯誤:', error.message);
            throw error;
        }
    }

    formatDate(dateStr) {
        // 移除所有非數字字符
        const cleaned = dateStr.replace(/[^0-9]/g, '');
        
        if (cleaned.length === 8) {
            // YYYYMMDD 格式
            return cleaned;
        } else if (cleaned.length === 6) {
            // YYMMDD 格式，假設是 20XX 年
            return '20' + cleaned;
        } else {
            throw new Error(`無效的日期格式: ${dateStr}，請使用 YYYYMMDD 或 YYYY-MM-DD 格式`);
        }
    }

    async analyzeSlowRenderingCauses(dateStr, options = {}) {
        const formattedDate = this.formatDate(dateStr);
        const target = options.target || 'category';
        const batchQueryDir = `${this.baseOutputDir}/${formattedDate}/${target}/batch-query`;
        
        if (!fs.existsSync(batchQueryDir)) {
            throw new Error(`找不到批次查詢目錄: ${batchQueryDir}`);
        }

        const logDataDir = `${batchQueryDir}/log-data`;
        const csvSourceDir = fs.existsSync(logDataDir) ? logDataDir : batchQueryDir;
        const csvFiles = fs.readdirSync(csvSourceDir).filter(file => file.endsWith('.csv'));
        if (csvFiles.length === 0) {
            throw new Error(`目錄中沒有找到 CSV 檔案: ${csvSourceDir}`);
        }

        console.log(`🔍 開始分析 ${formattedDate} 的慢渲染原因`);
        console.log(`📁 找到 ${csvFiles.length} 個 CSV 檔案`);

        const analysisResults = [];

        for (const csvFile of csvFiles) {
            const reqId = this.extractReqIdFromFilename(csvFile);
            console.log(`\n📊 分析檔案: ${csvFile} (reqId: ${reqId})`);

            try {
                const analysis = await this.analyzeSingleCSV(path.join(csvSourceDir, csvFile), reqId);
                analysisResults.push({
                    filename: csvFile,
                    reqId: reqId,
                    analysis: analysis
                });
                
                console.log(`✅ 分析完成: ${analysis.cause}`);
            } catch (error) {
                console.error(`❌ 分析失敗: ${error.message}`);
                analysisResults.push({
                    filename: csvFile,
                    reqId: reqId,
                    error: error.message
                });
            }
        }

        const outputFile = `${batchQueryDir}/slow_rendering_analysis_${formattedDate}.json`;
        fs.writeFileSync(outputFile, JSON.stringify(analysisResults, null, 2), 'utf8');
        
        const summary = this.generateAnalysisSummary(analysisResults);
        const summaryFile = `${batchQueryDir}/slow_rendering_summary_${formattedDate}.txt`;
        fs.writeFileSync(summaryFile, summary, 'utf8');
        
        console.log(`\n🎉 分析完成！`);
        console.log(`📄 詳細結果: ${outputFile}`);
        console.log(`📋 摘要報告: ${summaryFile}`);
        
        return analysisResults;
    }

    extractReqIdFromFilename(filename) {
        const match = filename.match(/slow_render_(.+)\.csv$/);
        return match ? match[1] : filename.replace('.csv', '');
    }

    async analyzeSingleCSV(csvPath, reqId) {
        return new Promise((resolve, reject) => {
            const logs = [];
            
            fs.createReadStream(csvPath)
                .pipe(csv())
                .on('data', (row) => {
                    if (row.textPayload && row.textPayload !== 'undefined') {
                        logs.push({
                            timestamp: row.timestamp,
                            message: row.textPayload,
                            podName: row['resource.labels.pod_name']
                        });
                    }
                })
                .on('end', () => {
                    try {
                        const analysis = this.performLogAnalysis(logs, reqId);
                        resolve(analysis);
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    performLogAnalysis(logs, reqId) {
        // 分成兩組：含有 reqId 的日誌和系統訊息
        const filteredLogs = logs.filter(log => 
            log.message.includes(`[reqId: ${reqId}]`)
        );
        
        // 系統訊息包括 inflight 和瀏覽器重啟訊息
        const systemLogs = logs.filter(log => 
            log.message.includes('Adding request to in-flight') ||
            log.message.toLowerCase().includes('restarting browser')
        );
        
        // 合併用於分析的日誌 (避免重複)
        const analysisLogs = [...filteredLogs];
        systemLogs.forEach(sysLog => {
            if (!analysisLogs.some(log => log.timestamp === sysLog.timestamp && log.message === sysLog.message)) {
                analysisLogs.push(sysLog);
            }
        });

        const analysis = {
            reqId: reqId,
            totalLogs: logs.length,
            relevantLogs: filteredLogs.length,
            systemLogs: systemLogs.length,
            cause: 'unknown',
            details: {},
            logSamples: []
        };

        // 按照指定順序分析：
        // 1. 遇重啟瀏覽器
        if (this.checkBrowserRestart(analysisLogs)) {
            analysis.cause = 'browser_restart';
            analysis.details = this.analyzeBrowserRestart(analysisLogs);
        }
        // 2. 真正高併發請求（一開始就是2+，或者達到3+）
        else if (this.checkTrueHighConcurrency(analysisLogs)) {
            analysis.cause = 'high_request_count';
            analysis.details = this.analyzeHighRequestCount(analysisLogs);
        }
        // 3. 資源載入問題（一開始是1）
        else if (this.checkResourceLoadingIssue(analysisLogs, reqId)) {
            analysis.cause = 'resource_timeout';
            analysis.details = this.analyzeResourceTimeout(analysisLogs, reqId);
        }
        // 4. 檢查是否有資源載入與渲染時間不符的異常
        else if (this.checkResourceRenderMismatch(analysisLogs, reqId)) {
            analysis.cause = 'other_anomaly';
            analysis.details = this.analyzeOtherAnomalies(analysisLogs, reqId);
        }
        // 5. 其他異常
        else {
            analysis.cause = 'other_anomaly';
            analysis.details = this.analyzeOtherAnomalies(analysisLogs, reqId);
        }

        analysis.logSamples = filteredLogs.slice(0, 5).map(log => ({
            timestamp: log.timestamp,
            message: log.message
        }));

        return analysis;
    }

    checkBrowserRestart(logs) {
        return logs.some(log => 
            log.message.toLowerCase().includes('restarting browser')
        );
    }

    analyzeBrowserRestart(logs) {
        const restartLogs = logs.filter(log => 
            log.message.toLowerCase().includes('restarting browser')
        );
        
        return {
            description: '遇到瀏覽器重啟導致渲染延遲',
            restartCount: restartLogs.length,
            restartTimestamps: restartLogs.map(log => log.timestamp)
        };
    }

    checkResourceLoadingIssue(logs, reqId = null) {
        const inflightPattern = /Adding request to in-flight: (\d+) requests in flight/;
        
        // 檢查一開始的 Adding request to in-flight 是否為 1
        const inflightRecords = [];
        logs.forEach(log => {
            const match = log.message.match(inflightPattern);
            if (match) {
                inflightRecords.push({
                    timestamp: log.timestamp,
                    count: parseInt(match[1])
                });
            }
        });
        
        if (inflightRecords.length === 0) {
            return false; // 沒有 inflight 記錄
        }
        
        // 按時間排序，檢查第一條記錄
        inflightRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const firstInflightCount = inflightRecords[0].count;
        
        if (firstInflightCount !== 1) {
            return false; // 如果一開始不是 inflight=1，就不分析資源載入
        }
        
        // 優先檢查是否為高併發情況
        // 如果檢測到併發請求影響，優先歸類為高併發而不是資源載入問題
        const maxCount = Math.max(...inflightRecords.map(r => r.count));
        if (maxCount >= 2 && inflightRecords.length >= 2) {
            const concurrentRecords = inflightRecords.filter(r => r.count >= 2);
            if (concurrentRecords.length >= 2) {
                // 有明顯的併發影響，不歸類為資源載入問題
                return false;
            }
        }
        
        // 分析資源載入時間和 render time 是否對得起來
        const renderTimeInfo = this.extractRenderTime(logs);
        const resourceLoadingInfo = this.analyzeResourceLoadingTimes(logs, reqId);
        
        // 如果有明顯的 timeout 訊息，但還要檢查資源載入時間是否合理
        const hasTimeoutMessages = logs.some(log => /\[TIMEOUT\]|timeout|timed out/i.test(log.message));
        if (hasTimeoutMessages) {
            // 即使有 timeout，如果資源載入很快但 render time 很長，仍歸類為異常
            if (renderTimeInfo.renderTimeMs && resourceLoadingInfo.longestDuration) {
                const isResourceFastButRenderSlow = 
                    resourceLoadingInfo.longestDuration < 2000 && renderTimeInfo.renderTimeMs > 10000;
                
                if (isResourceFastButRenderSlow) {
                    return false; // 歸類為其他異常
                }
            }
            return true; // timeout 且資源載入時間合理，認定為資源載入問題
        }
        
        // 如果有慢資源 (>3秒)，認定為資源載入問題
        if (resourceLoadingInfo.slowResources.length > 0) {
            return true;
        }
        
        // 檢查資源載入時間與 render time 是否合理
        if (renderTimeInfo.renderTimeMs && resourceLoadingInfo.longestDuration) {
            // 如果資源載入很快但 render time 很長，這是異常 (將在 other_anomaly 中處理)
            const isResourceFastButRenderSlow = 
                resourceLoadingInfo.longestDuration < 2000 && renderTimeInfo.renderTimeMs > 10000;
            
            if (isResourceFastButRenderSlow) {
                return false; // 這種情況歸類到 other_anomaly
            }
            
            // 如果資源載入時間接近或超過 render time，認定為資源載入問題
            const resourceTimeRatio = resourceLoadingInfo.longestDuration / renderTimeInfo.renderTimeMs;
            if (resourceTimeRatio > 0.3) { // 資源載入時間佔 render time 30% 以上
                return true;
            }
        }
        
        return false;
    }

    extractRenderTime(logs) {
        // 尋找 "got 200 in XXXXms" 或類似的 render time 訊息
        for (const log of logs) {
            const renderTimeMatch = log.message.match(/got 200 in (\d+)ms/);
            if (renderTimeMatch) {
                return {
                    renderTimeMs: parseInt(renderTimeMatch[1]),
                    message: log.message
                };
            }
            
            // 也尋找 "Page is done loading XXXXms" 的訊息
            const pageLoadMatch = log.message.match(/Page is done loading (\d+)ms/);
            if (pageLoadMatch) {
                return {
                    renderTimeMs: parseInt(pageLoadMatch[1]),
                    message: log.message
                };
            }
        }
        
        return { renderTimeMs: null, message: null };
    }

    analyzeResourceTimeout(logs, reqId = null) {
        const resourceLoadingInfo = this.analyzeResourceLoadingTimes(logs, reqId);
        const timeoutLogs = logs.filter(log => 
            /\[TIMEOUT\]|timeout|timed out/i.test(log.message)
        );

        const inflightAnalysis = this.analyzeInflightRequestProgression(logs);
        const requestUrl = this.extractRequestURL(logs, reqId);
        const urlAnalysis = this.analyzeRequestURL(requestUrl);

        let description = 'API 或圖片載入時間過長導致渲染延遲';
        if (inflightAnalysis.hasConcurrentRequests) {
            description += '，期間有其他 request 進來';
        }

        return {
            description: description,
            timeoutCount: timeoutLogs.length,
            requestUrl: requestUrl,
            urlAnalysis: urlAnalysis,
            resourceLoadingAnalysis: {
                totalResources: resourceLoadingInfo.totalResources,
                slowResources: resourceLoadingInfo.slowResources,
                averageLoadTime: resourceLoadingInfo.averageLoadTime,
                longestDuration: resourceLoadingInfo.longestDuration,
                longestResource: resourceLoadingInfo.longestResource
            },
            inflightRequestAnalysis: inflightAnalysis,
            timeoutMessages: timeoutLogs.map(log => log.message),
            suggestions: this.generateResourceOptimizationSuggestions(resourceLoadingInfo)
        };
    }

    analyzeResourceLoadingTimes(logs, reqId = null) {
        const resourceEvents = new Map(); // URL -> {startTimes: [], endTimes: []}
        const completedResources = [];
        
        logs.forEach(log => {
            // 如果提供 reqId，只分析含有該 reqId 的資源載入記錄
            if (reqId && !log.message.includes(`[reqId: ${reqId}]`)) {
                return;
            }
            
            // 解析新格式： "2025-10-19T12:33:56.984Z - 1 https://..."
            const newFormatMatch = log.message.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+([+-])\s+(\d+)\s+(https?:\/\/[^\s\[]+)/);
            
            if (newFormatMatch) {
                const timestamp = new Date(newFormatMatch[1]).getTime();
                const action = newFormatMatch[2]; // + 或 -
                const url = newFormatMatch[4];
                
                if (!resourceEvents.has(url)) {
                    resourceEvents.set(url, { startTimes: [], endTimes: [] });
                }
                
                const urlData = resourceEvents.get(url);
                if (action === '+') {
                    urlData.startTimes.push(timestamp);
                } else if (action === '-') {
                    urlData.endTimes.push(timestamp);
                }
                return;
            }

            // 解析舊格式： "timestamp + 1 https://..." 或 "timestamp - 1 https://..."
            const oldFormatMatch = log.message.match(/([+-])\s+\d+\s+(https?:\/\/[^\s\[]+)/);
            if (oldFormatMatch) {
                const timestamp = new Date(log.timestamp).getTime();
                const action = oldFormatMatch[1];
                const url = oldFormatMatch[2];
                
                if (!resourceEvents.has(url)) {
                    resourceEvents.set(url, { startTimes: [], endTimes: [] });
                }
                
                const urlData = resourceEvents.get(url);
                if (action === '+') {
                    urlData.startTimes.push(timestamp);
                } else if (action === '-') {
                    urlData.endTimes.push(timestamp);
                }
            }
        });

        // 配對開始和結束時間
        resourceEvents.forEach((urlData, url) => {
            urlData.startTimes.sort((a, b) => a - b);
            urlData.endTimes.sort((a, b) => a - b);
            
            const usedEndTimes = new Set();
            urlData.startTimes.forEach(startTime => {
                const matchingEndTime = urlData.endTimes.find(endTime =>
                    endTime > startTime &&
                    !usedEndTimes.has(endTime) &&
                    (endTime - startTime) < 120000 // 假設請求不會超過2分鐘
                );
                
                if (matchingEndTime) {
                    usedEndTimes.add(matchingEndTime);
                    const duration = matchingEndTime - startTime;
                    completedResources.push({
                        url: url,
                        startTime: startTime,
                        endTime: matchingEndTime,
                        duration: duration,
                        type: this.getResourceType(url)
                    });
                }
            });
        });

        // 計算統計信息
        const durations = completedResources.map(r => r.duration);
        const slowResources = completedResources.filter(r => r.duration > 3000).sort((a, b) => b.duration - a.duration);
        const averageLoadTime = durations.length > 0 ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) : 0;
        const longestDuration = durations.length > 0 ? Math.max(...durations) : 0;
        const longestResource = completedResources.find(r => r.duration === longestDuration);

        return {
            totalResources: completedResources.length,
            slowResources: slowResources.slice(0, 5), // 最慢的5個資源
            averageLoadTime: averageLoadTime,
            longestDuration: longestDuration,
            longestResource: longestResource,
            allResources: completedResources
        };
    }

    getResourceType(url) {
        if (!url || typeof url !== 'string') return '其他';
        
        const urlStr = url.toLowerCase();
        if (urlStr.includes('.js')) return 'JavaScript';
        if (urlStr.includes('.css')) return 'CSS';
        if (urlStr.includes('.woff') || urlStr.includes('.woff2') || urlStr.includes('.ttf')) return '字體';
        if (urlStr.includes('.jpg') || urlStr.includes('.jpeg') || urlStr.includes('.png') || urlStr.includes('.webp') || urlStr.includes('.svg')) return '圖片';
        if (urlStr.includes('/api/') || urlStr.includes('api.') || urlStr.includes('.com/v')) return 'API';
        if (urlStr.includes('.html')) return 'HTML頁面';
        return '其他';
    }

    extractRequestURL(logs, reqId = null) {
        // 尋找包含 request URL 的日誌訊息
        for (const log of logs) {
            // 如果提供 reqId，只查找含有該 reqId 的日誌
            if (reqId && !log.message.includes(`[reqId: ${reqId}]`)) {
                continue;
            }
            
            // 優先尋找 "got 200 in XXXms for" 模式，這是 main request URL
            const got200Pattern = /got 200 in \d+ms for (https?:\/\/[^\s\[\]]+)/;
            const got200Match = log.message.match(got200Pattern);
            if (got200Match && got200Match[1]) {
                return got200Match[1];
            }
            
            // 其他 URL 模式（按優先順序）
            const urlPatterns = [
                /Processing URL:\s*(https?:\/\/[^\s\]]+)/i,
                /Navigating to:\s*(https?:\/\/[^\s\]]+)/i,
                /Request URL:\s*(https?:\/\/[^\s\]]+)/i,
                /URL:\s*(https?:\/\/[^\s\]]+)/i,
                /Visiting:\s*(https?:\/\/[^\s\]]+)/i,
                /Loading:\s*(https?:\/\/[^\s\]]+)/i
            ];
            
            for (const pattern of urlPatterns) {
                const match = log.message.match(pattern);
                if (match && match[1]) {
                    return match[1];
                }
            }
        }
        
        return null;
    }

    analyzeRequestURL(url) {
        if (!url || typeof url !== 'string') {
            return {
                url: null,
                pageType: 'unknown',
                domain: null,
                summary: '無法提取 Request URL'
            };
        }

        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const path = urlObj.pathname;
            const pageType = this.analyzePageType(path);

            return {
                url: url,
                domain: domain,
                path: path,
                pageType: pageType,
                summary: `${pageType} (${domain})`
            };
        } catch (error) {
            return {
                url: url,
                pageType: 'invalid',
                domain: null,
                summary: `無效 URL: ${url}`
            };
        }
    }


    analyzePageType(path) {
        if (!path || typeof path !== 'string') return 'unknown';
        
        const pathStr = path.toLowerCase();
        
        // 商品頁面
        if (pathStr.includes('/product') || pathStr.includes('/item') || pathStr.includes('/book')) {
            return '商品頁';
        }
        
        // 搜尋結果頁
        if (pathStr.includes('/search') || pathStr.includes('/query')) {
            return '搜尋頁';
        }
        
        // 分類頁面
        if (pathStr.includes('/category') || pathStr.includes('/catalog')) {
            return '分類頁';
        }
        
        // 首頁
        if (pathStr === '/' || pathStr === '/index' || pathStr === '/home') {
            return '首頁';
        }
        
        // 購物車/結帳
        if (pathStr.includes('/cart') || pathStr.includes('/checkout') || pathStr.includes('/order')) {
            return '購物車/結帳';
        }
        
        // 會員相關
        if (pathStr.includes('/member') || pathStr.includes('/account') || pathStr.includes('/profile')) {
            return '會員頁';
        }
        
        // 活動頁面
        if (pathStr.includes('/event') || pathStr.includes('/promotion') || pathStr.includes('/campaign')) {
            return '活動頁';
        }
        
        return '其他頁面';
    }


    generateResourceOptimizationSuggestions(resourceInfo) {
        const suggestions = [];
        
        if (resourceInfo.slowResources.length > 0) {
            const slowestResource = resourceInfo.slowResources[0];
            const fileName = slowestResource.url.split('/').pop() || slowestResource.url;
            suggestions.push(`最慢資源: ${fileName} (${slowestResource.duration}ms) - ${this.getSuggestionForResourceType(slowestResource.type)}`);
        }
        
        if (resourceInfo.averageLoadTime > 2000) {
            suggestions.push(`平均載入時間過長 (${resourceInfo.averageLoadTime}ms) - 考慮使用CDN加速或優化網路連線`);
        }
        
        const slowResourcesByType = {};
        resourceInfo.slowResources.forEach(resource => {
            slowResourcesByType[resource.type] = (slowResourcesByType[resource.type] || 0) + 1;
        });
        
        Object.entries(slowResourcesByType).forEach(([type, count]) => {
            if (count > 1) {
                suggestions.push(`${type}類型資源載入慢 (${count}個) - ${this.getSuggestionForResourceType(type)}`);
            }
        });
        
        return suggestions;
    }

    getSuggestionForResourceType(type) {
        const suggestions = {
            'JavaScript': '考慮程式碼分割、壓縮或使用CDN',
            'CSS': '合併CSS檔案、移除未使用樣式',
            'API': '優化API響應時間、實施快取策略',
            '圖片': '使用WebP格式、適當壓縮、實施懶載入',
            '字體': '使用字體顯示策略、預載入關鍵字體',
            'HTML頁面': '檢查伺服器響應時間'
        };
        return suggestions[type] || '檢查資源載入策略';
    }

    checkTrueHighConcurrency(logs) {
        const inflightPattern = /Adding request to in-flight: (\d+) requests in flight/;
        const inflightRecords = [];
        
        // 收集所有 Adding request to in-flight 記錄
        logs.forEach(log => {
            const match = log.message.match(inflightPattern);
            if (match) {
                inflightRecords.push({
                    timestamp: log.timestamp,
                    count: parseInt(match[1])
                });
            }
        });
        
        if (inflightRecords.length === 0) {
            return false;
        }
        
        // 按時間排序
        inflightRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        const firstCount = inflightRecords[0].count;
        const maxCount = Math.max(...inflightRecords.map(r => r.count));
        
        // 高併發的判定條件（放寬標準）：
        // 1. 一開始就是2+
        // 2. 或者達到3+
        // 3. 或者從1開始增加到2且維持一段時間（針對併發影響的情況）
        if (firstCount >= 2 || maxCount >= 3) {
            return true;
        }
        
        // 檢查是否從1開始增加到2且維持併發狀態
        if (firstCount === 1 && maxCount >= 2 && inflightRecords.length >= 2) {
            // 計算維持併發狀態的時間
            const concurrentRecords = inflightRecords.filter(r => r.count >= 2);
            if (concurrentRecords.length >= 2) {
                // 如果有多次併發記錄，或者併發狀態維持一段時間，認定為高併發影響
                const firstConcurrent = concurrentRecords[0];
                const lastConcurrent = concurrentRecords[concurrentRecords.length - 1];
                const concurrentDuration = new Date(lastConcurrent.timestamp).getTime() - new Date(firstConcurrent.timestamp).getTime();
                
                // 如果併發狀態維持超過30秒，或者有多次併發記錄，認定為高併發
                return concurrentDuration > 30000 || concurrentRecords.length >= 2;
            }
        }
        
        return false;
    }

    checkHighRequestCount(logs) {
        const inflightPattern = /Adding request to in-flight: (\d+) requests in flight/;
        const inflightRecords = [];
        
        // 收集所有 Adding request to in-flight 記錄
        logs.forEach(log => {
            const match = log.message.match(inflightPattern);
            if (match) {
                inflightRecords.push({
                    timestamp: log.timestamp,
                    count: parseInt(match[1])
                });
            }
        });
        
        // 如果記錄少於2條，不認定為高併發
        if (inflightRecords.length < 2) {
            return false;
        }
        
        // 按時間排序
        inflightRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // 檢查數字是否呈現遞增趨勢或維持高併發數字
        let hasIncreasingTrend = false;
        let hasHighConcurrency = false;
        
        for (let i = 1; i < inflightRecords.length; i++) {
            // 檢查遞增趨勢
            if (inflightRecords[i].count > inflightRecords[i-1].count) {
                hasIncreasingTrend = true;
            }
            // 檢查是否維持高併發數字 (2或以上)
            if (inflightRecords[i].count >= 2 && inflightRecords[i-1].count >= 2) {
                hasHighConcurrency = true;
            }
        }
        
        return hasIncreasingTrend || hasHighConcurrency;
    }

    checkResourceRenderMismatch(logs, reqId = null) {
        const renderTimeInfo = this.extractRenderTime(logs);
        const resourceLoadingInfo = this.analyzeResourceLoadingTimes(logs, reqId);
        
        if (renderTimeInfo.renderTimeMs && resourceLoadingInfo.totalResources > 0) {
            // 計算總資源載入時間
            const totalResourceLoadingTime = this.calculateTotalResourceLoadingTime(logs);
            
            // 如果總資源載入時間與整體渲染時間差距過大，認為異常
            const timeDifference = renderTimeInfo.renderTimeMs - totalResourceLoadingTime;
            const isSignificantMismatch = 
                totalResourceLoadingTime > 0 && 
                timeDifference > 20000 && // 差距超過 20 秒
                (timeDifference / renderTimeInfo.renderTimeMs) > 0.8; // 差距占總時間80%以上
                
            return isSignificantMismatch;
        }
        
        return false;
    }

    analyzeHighRequestCount(logs) {
        const inflightPattern = /Adding request to in-flight: (\d+) requests in flight/;
        const resourceRequestPattern = /- \d+ https?:\/\/[^\s]+/;
        const inflightCounts = [];
        
        logs.forEach(log => {
            const match = log.message.match(inflightPattern);
            if (match) {
                inflightCounts.push({
                    timestamp: log.timestamp,
                    count: parseInt(match[1]),
                    message: log.message
                });
            }
        });

        const resourceRequests = logs.filter(log => resourceRequestPattern.test(log.message));
        const maxCount = inflightCounts.length > 0 ? Math.max(...inflightCounts.map(item => item.count)) : 0;
        
        return {
            description: '大量併發請求導致渲染延遲',
            maxConcurrentRequests: maxCount,
            resourceRequestCount: resourceRequests.length,
            inflightRequestLogs: inflightCounts,
            highCountOccurrences: inflightCounts.filter(item => item.count >= 3).length,
            resourceRequestSamples: resourceRequests.slice(0, 5).map(log => log.message)
        };
    }

    analyzeOtherAnomalies(logs, reqId = null) {
        const errorPatterns = [
            /error/i,
            /failed/i,
            /exception/i,
            /crash/i,
            /memory/i,
            /cpu/i
        ];

        const anomalies = [];

        logs.forEach(log => {
            errorPatterns.forEach(pattern => {
                if (pattern.test(log.message)) {
                    anomalies.push({
                        timestamp: log.timestamp,
                        message: log.message,
                        pattern: pattern.toString()
                    });
                }
            });
        });

        // 檢查資源載入與 render time 不符的情況
        const renderTimeInfo = this.extractRenderTime(logs);
        const resourceLoadingInfo = this.analyzeResourceLoadingTimes(logs, reqId);
        const requestUrl = this.extractRequestURL(logs, reqId);
        const urlAnalysis = this.analyzeRequestURL(requestUrl);
        let resourceRenderMismatch = null;

        if (renderTimeInfo.renderTimeMs && resourceLoadingInfo.totalResources > 0) {
            // 計算總資源載入時間（類似 performance-analyzer.js 的邏輯）
            const totalResourceLoadingTime = this.calculateTotalResourceLoadingTime(logs);

            // 如果總資源載入時間與整體渲染時間差距過大，認為異常
            const timeDifference = renderTimeInfo.renderTimeMs - totalResourceLoadingTime;
            const isSignificantMismatch =
                totalResourceLoadingTime > 0 &&
                timeDifference > 20000 && // 差距超過 20 秒
                (timeDifference / renderTimeInfo.renderTimeMs) > 0.8; // 差距占總時間80%以上

            if (isSignificantMismatch) {
                resourceRenderMismatch = {
                    renderTime: renderTimeInfo.renderTimeMs,
                    totalResourceLoadingTime: totalResourceLoadingTime,
                    timeDifference: timeDifference,
                    longestResourceTime: resourceLoadingInfo.longestDuration,
                    averageResourceTime: resourceLoadingInfo.averageLoadTime,
                    description: `資源載入時間 (${totalResourceLoadingTime}ms) 與整體渲染時間 (${renderTimeInfo.renderTimeMs}ms) 差距過大，可能存在其他延遲因素`
                };
            }
        }

        // 分析未結束的資源
        const unfinishedResources = this.analyzeUnfinishedResources(logs, reqId);

        const possibleCauses = this.identifyPossibleCauses(logs);
        if (resourceRenderMismatch) {
            possibleCauses.push('資源載入與渲染時間不符');
        }
        if (unfinishedResources.count > 0) {
            possibleCauses.push(`有 ${unfinishedResources.count} 個資源未完成載入`);
        }

        return {
            description: '其他異常情況導致渲染延遲',
            anomalyCount: anomalies.length,
            anomalies: anomalies,
            requestUrl: requestUrl,
            urlAnalysis: urlAnalysis,
            resourceRenderMismatch: resourceRenderMismatch,
            unfinishedResources: unfinishedResources,
            renderTimeAnalysis: renderTimeInfo.renderTimeMs ? {
                renderTime: renderTimeInfo.renderTimeMs,
                resourceLoadingTime: resourceLoadingInfo.longestDuration,
                averageResourceTime: resourceLoadingInfo.averageLoadTime
            } : null,
            possibleCauses: possibleCauses
        };
    }

    analyzeUnfinishedResources(logs, reqId = null) {
        const resourceEvents = new Map(); // URL -> { starts: [], ends: [] }

        logs.forEach(log => {
            // 如果提供 reqId，只分析含有該 reqId 的資源載入記錄
            if (reqId && !log.message.includes(`[reqId: ${reqId}]`)) {
                return;
            }

            // 解析新格式： "2025-10-19T12:33:56.984Z + 1 https://..." (+ = 開始)
            // 或 "2025-10-19T12:33:56.984Z - 1 https://..." (- = 完成)
            const newFormatMatch = log.message.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+([+-])\s+(\d+)\s+(https?:\/\/[^\s\[]+)/);

            if (newFormatMatch) {
                const timestamp = newFormatMatch[1];
                const action = newFormatMatch[2]; // + 或 -
                const url = newFormatMatch[4];

                if (!resourceEvents.has(url)) {
                    resourceEvents.set(url, { starts: [], ends: [] });
                }

                const urlData = resourceEvents.get(url);
                // 修正：+ 表示開始，- 表示結束
                if (action === '+') {
                    urlData.starts.push({ timestamp, message: log.message });
                } else if (action === '-') {
                    urlData.ends.push({ timestamp, message: log.message });
                }
                return;
            }

            // 解析舊格式： "timestamp + 1 https://..." (+ = 開始) 或 "timestamp - 1 https://..." (- = 完成)
            const oldFormatMatch = log.message.match(/([+-])\s+\d+\s+(https?:\/\/[^\s\[]+)/);
            if (oldFormatMatch) {
                const timestamp = log.timestamp;
                const action = oldFormatMatch[1];
                const url = oldFormatMatch[2];

                if (!resourceEvents.has(url)) {
                    resourceEvents.set(url, { starts: [], ends: [] });
                }

                const urlData = resourceEvents.get(url);
                // 修正：+ 表示開始，- 表示結束
                if (action === '+') {
                    urlData.starts.push({ timestamp, message: log.message });
                } else if (action === '-') {
                    urlData.ends.push({ timestamp, message: log.message });
                }
            }
        });

        // 找出未結束的資源（考慮時間順序）
        const unfinishedResources = [];

        resourceEvents.forEach((events, url) => {
            // 按時間排序所有事件
            const allEvents = [];

            events.starts.forEach(start => {
                allEvents.push({
                    type: 'start',
                    timestamp: start.timestamp,
                    message: start.message
                });
            });

            events.ends.forEach(end => {
                allEvents.push({
                    type: 'end',
                    timestamp: end.timestamp,
                    message: end.message
                });
            });

            // 按時間排序
            allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // 追蹤未配對的開始事件
            let unmatchedStarts = 0;
            const detailedEvents = [];

            allEvents.forEach(event => {
                if (event.type === 'start') {
                    unmatchedStarts++;
                    detailedEvents.push({
                        type: 'start',
                        timestamp: event.timestamp,
                        status: 'pending'
                    });
                } else if (event.type === 'end') {
                    if (unmatchedStarts > 0) {
                        unmatchedStarts--;
                        detailedEvents.push({
                            type: 'end',
                            timestamp: event.timestamp,
                            status: 'matched'
                        });
                    } else {
                        // 結束事件出現在開始事件之前（不正常）
                        detailedEvents.push({
                            type: 'end',
                            timestamp: event.timestamp,
                            status: 'orphan'
                        });
                    }
                }
            });

            const startCount = events.starts.length;
            const endCount = events.ends.length;

            // 如果有未配對的開始事件，表示有資源未完成
            if (unmatchedStarts > 0) {
                unfinishedResources.push({
                    url: url,
                    type: this.getResourceType(url),
                    startCount: startCount,
                    endCount: endCount,
                    unfinishedCount: unmatchedStarts,
                    lastStartTime: events.starts[events.starts.length - 1]?.timestamp,
                    lastStartMessage: events.starts[events.starts.length - 1]?.message,
                    detailedEvents: detailedEvents
                });
            }
        });

        // 按未完成數量排序
        unfinishedResources.sort((a, b) => b.unfinishedCount - a.unfinishedCount);

        return {
            count: unfinishedResources.length,
            totalUnfinished: unfinishedResources.reduce((sum, r) => sum + r.unfinishedCount, 0),
            resources: unfinishedResources,
            summary: unfinishedResources.length > 0
                ? `發現 ${unfinishedResources.length} 個 URL 有未完成的載入，總計 ${unfinishedResources.reduce((sum, r) => sum + r.unfinishedCount, 0)} 次未完成載入`
                : '所有資源都已完成載入'
        };
    }

    calculateTotalResourceLoadingTime(logs) {
        // 使用類似 performance-analyzer.js 的邏輯計算總載入時間
        const startTimes = [];
        const endTimes = [];

        logs.forEach(log => {
            // 簡化匹配：查找包含 + 或 - 的資源載入日誌
            if (log.message.includes(' + ')) {
                const match = log.message.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
                if (match) {
                    const timestamp = new Date(match[1]).getTime();
                    startTimes.push(timestamp);
                }
            } else if (log.message.includes(' - ')) {
                const match = log.message.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
                if (match) {
                    const timestamp = new Date(match[1]).getTime();
                    endTimes.push(timestamp);
                }
            }
        });

        // 計算實際總時間（從最早開始到最晚結束）
        if (startTimes.length > 0 && endTimes.length > 0) {
            const earliestStart = Math.min(...startTimes);
            const latestEnd = Math.max(...endTimes);
            return latestEnd - earliestStart;
        }

        return 0;
    }

    identifyPossibleCauses(logs) {
        const causes = [];
        
        if (logs.some(log => /memory/i.test(log.message))) {
            causes.push('記憶體不足');
        }
        
        if (logs.some(log => /cpu/i.test(log.message))) {
            causes.push('CPU 使用率過高');
        }
        
        if (logs.some(log => /network/i.test(log.message))) {
            causes.push('網路連線問題');
        }
        
        if (logs.some(log => /database/i.test(log.message))) {
            causes.push('資料庫查詢延遲');
        }
        
        return causes.length > 0 ? causes : ['未知原因'];
    }

    generateAnalysisSummary(results) {
        const summary = [];
        summary.push('慢渲染原因分析摘要');
        summary.push('='.repeat(50));
        summary.push(`總檔案數: ${results.length}`);
        summary.push('');

        const causeCounts = {};
        const successfulAnalyses = results.filter(r => r.analysis && !r.error);
        
        successfulAnalyses.forEach(result => {
            const cause = result.analysis.cause;
            causeCounts[cause] = (causeCounts[cause] || 0) + 1;
        });

        summary.push('原因統計:');
        Object.entries(causeCounts).forEach(([cause, count]) => {
            const percentage = ((count / successfulAnalyses.length) * 100).toFixed(1);
            const displayName = this.getCauseDisplayName(cause);
            
            if (cause === 'resource_timeout') {
                // 計算有併發請求的數量
                const resourceTimeoutCases = successfulAnalyses.filter(r => r.analysis.cause === 'resource_timeout');
                const concurrentCases = resourceTimeoutCases.filter(r => 
                    r.analysis.details.inflightRequestAnalysis && 
                    r.analysis.details.inflightRequestAnalysis.hasConcurrentRequests
                );
                
                const concurrentCount = concurrentCases.length;
                const concurrentPercentage = resourceTimeoutCases.length > 0 ? 
                    ((concurrentCount / resourceTimeoutCases.length) * 100).toFixed(1) : '0.0';
                
                summary.push(`  ${displayName}: ${count} 次 (${percentage}%)`);
                summary.push(`    - 期間有其他 request 進來: ${concurrentCount} 次 (${concurrentPercentage}%)`);
            } else {
                summary.push(`  ${displayName}: ${count} 次 (${percentage}%)`);
            }
        });

        // 新增 URL 分析統計
        summary.push('');
        summary.push('API/圖片載入超時 URL 分析:');
        const urlAnalysisStats = this.generateURLAnalysisStats(successfulAnalyses);
        if (urlAnalysisStats.hasData) {
            summary.push(`  總 URL 數: ${urlAnalysisStats.totalUrls}`);
            
            if (urlAnalysisStats.pageTypeStats && Object.keys(urlAnalysisStats.pageTypeStats).length > 0) {
                summary.push('  頁面類型分布:');
                Object.entries(urlAnalysisStats.pageTypeStats)
                    .sort(([,a], [,b]) => b - a)
                    .forEach(([pageType, count]) => {
                        const percentage = ((count / urlAnalysisStats.totalUrls) * 100).toFixed(1);
                        summary.push(`    ${pageType}: ${count} 個 (${percentage}%)`);
                    });
            }
            
            // 最慢資源排行 (resource_timeout)
            const resourceTimeoutCases = successfulAnalyses.filter(r =>
                r.analysis.cause === 'resource_timeout' &&
                r.analysis.details.resourceLoadingAnalysis &&
                r.analysis.details.resourceLoadingAnalysis.longestResource
            );
            if (resourceTimeoutCases.length > 0) {
                summary.push('');
                summary.push('  最慢資源排行:');
                const resourceStats = {};
                resourceTimeoutCases.forEach(result => {
                    const lr = result.analysis.details.resourceLoadingAnalysis.longestResource;
                    const normalizedUrl = lr.url.split('?')[0].replace(/\/\d{6,}/g, '/{id}');
                    if (!resourceStats[normalizedUrl]) {
                        resourceStats[normalizedUrl] = { url: normalizedUrl, type: lr.type, count: 0, durations: [] };
                    }
                    resourceStats[normalizedUrl].count++;
                    resourceStats[normalizedUrl].durations.push(lr.duration);
                });
                Object.values(resourceStats)
                    .sort((a, b) => b.count - a.count)
                    .forEach((stat, index) => {
                        const avg = Math.round(stat.durations.reduce((s, d) => s + d, 0) / stat.durations.length);
                        const max = Math.max(...stat.durations);
                        summary.push(`    ${index + 1}. ${stat.url}  [${stat.type}]`);
                        summary.push(`       出現: ${stat.count} 次  平均耗時: ${avg} ms  最長: ${max} ms`);
                    });
            }

            if (urlAnalysisStats.urlList && urlAnalysisStats.urlList.length > 0) {
                summary.push('');
                summary.push('所有 Request URL 列表:');
                urlAnalysisStats.urlList.forEach((urlInfo, index) => {
                    summary.push(`  ${index + 1}. ${urlInfo.url}`);
                });
            }
        } else {
            summary.push('  無法提取 URL 資訊');
        }

        summary.push('');
        summary.push('詳細分析:');

        successfulAnalyses.forEach(result => {
            summary.push(`\nreqId: ${result.reqId}`);
            summary.push(`檔案: ${result.filename}`);
            summary.push(`原因: ${this.getCauseDisplayName(result.analysis.cause)}`);
            summary.push(`說明: ${result.analysis.details.description || '無詳細說明'}`);

            // 顯示 URL 分析資訊
            if (result.analysis.details.urlAnalysis && result.analysis.details.urlAnalysis.url) {
                summary.push(`URL: ${result.analysis.details.urlAnalysis.url}`);
            }

            // 如果是 resource_timeout，顯示最慢資源
            if (result.analysis.cause === 'resource_timeout' &&
                result.analysis.details.resourceLoadingAnalysis &&
                result.analysis.details.resourceLoadingAnalysis.longestResource) {
                const lr = result.analysis.details.resourceLoadingAnalysis.longestResource;
                summary.push(`最慢資源: ${lr.url}`);
                summary.push(`  類型: ${lr.type}  耗時: ${lr.duration} ms`);
            }

            // 如果是其他異常且有未結束的資源，顯示詳細資訊
            if (result.analysis.cause === 'other_anomaly' &&
                result.analysis.details.unfinishedResources &&
                result.analysis.details.unfinishedResources.count > 0) {
                const unfinished = result.analysis.details.unfinishedResources;
                summary.push(`未結束資源: ${unfinished.summary}`);

                // 顯示前 5 個未結束的資源
                const topResources = unfinished.resources.slice(0, 5);
                if (topResources.length > 0) {
                    summary.push(`  詳細列表 (顯示前 ${topResources.length} 個):`);
                    topResources.forEach((resource, index) => {
                        const fileName = resource.url.split('/').pop() || resource.url;
                        summary.push(`    ${index + 1}. [${resource.type}] ${fileName}`);
                        summary.push(`       開始: ${resource.startCount} 次, 結束: ${resource.endCount} 次, 未完成: ${resource.unfinishedCount} 次`);
                        summary.push(`       完整 URL: ${resource.url}`);
                    });
                }
            }
        });

        if (results.some(r => r.error)) {
            summary.push('\n錯誤記錄:');
            results.filter(r => r.error).forEach(result => {
                summary.push(`${result.filename}: ${result.error}`);
            });
        }

        return summary.join('\n');
    }

    generateURLAnalysisStats(analyses) {
        const relevantAnalyses = analyses.filter(a => 
            (a.analysis.cause === 'resource_timeout' || a.analysis.cause === 'other_anomaly') &&
            a.analysis.details.urlAnalysis && 
            a.analysis.details.urlAnalysis.url
        );

        if (relevantAnalyses.length === 0) {
            return { hasData: false };
        }

        const pageTypeStats = {};
        const urlList = [];

        relevantAnalyses.forEach(analysis => {
            const urlAnalysis = analysis.analysis.details.urlAnalysis;
            
            // 統計頁面類型
            pageTypeStats[urlAnalysis.pageType] = (pageTypeStats[urlAnalysis.pageType] || 0) + 1;
            
            // 收集 URL 資訊
            urlList.push({
                url: urlAnalysis.url,
                pageType: urlAnalysis.pageType
            });
        });

        const totalUrls = relevantAnalyses.length;

        return {
            hasData: true,
            totalUrls: totalUrls,
            pageTypeStats: pageTypeStats,
            urlList: urlList
        };
    }

    analyzeInflightRequestProgression(logs) {
        const inflightPattern = /Adding request to in-flight: (\d+) requests in flight/;
        const inflightCounts = [];
        
        logs.forEach(log => {
            const match = log.message.match(inflightPattern);
            if (match) {
                inflightCounts.push({
                    timestamp: log.timestamp,
                    count: parseInt(match[1]),
                    message: log.message
                });
            }
        });

        if (inflightCounts.length === 0) {
            return {
                hasConcurrentRequests: false,
                inflightProgression: [],
                maxConcurrentRequests: 0,
                description: '無 in-flight request 記錄'
            };
        }

        // 依時間排序
        inflightCounts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // 檢查是否從 1 開始然後增加到 2 或更多
        const hasProgression = inflightCounts.length >= 2 && 
                              inflightCounts[0].count === 1 && 
                              inflightCounts.some(item => item.count >= 2);
        
        const maxCount = Math.max(...inflightCounts.map(item => item.count));
        
        return {
            hasConcurrentRequests: hasProgression,
            inflightProgression: inflightCounts,
            maxConcurrentRequests: maxCount,
            description: hasProgression ? 
                `render 期間 in-flight 請求從 1 增加到 ${maxCount}` : 
                `最大併發請求數: ${maxCount}`
        };
    }

    extractDateFromRecord(record) {
        // 優先使用 user_agent_record_time
        if (record?.user_agent_record_time) {
            try {
                const date = new Date(record.user_agent_record_time);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0].replace(/-/g, '');
                }
            } catch (error) {
                console.warn('解析 user_agent_record_time 失敗:', record.user_agent_record_time);
            }
        }
        
        // 備用：使用 got_200_record_time
        if (record?.got_200_record_time) {
            try {
                const date = new Date(record.got_200_record_time);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0].replace(/-/g, '');
                }
            } catch (error) {
                console.warn('解析 got_200_record_time 失敗:', record.got_200_record_time);
            }
        }
        
        // 最後備用：使用今天的日期
        console.warn('無法從記錄中提取有效日期，使用今天的日期');
        return new Date().toISOString().split('T')[0].replace(/-/g, '');
    }

    getCauseDisplayName(cause) {
        const displayNames = {
            'browser_restart': '瀏覽器重啟',
            'resource_timeout': 'API/圖片載入超時',
            'high_request_count': '高併發請求',
            'other_anomaly': '其他異常',
            'unknown': '未知原因'
        };
        
        return displayNames[cause] || cause;
    }

    showUsage() {
        console.log('\n📖 SlowRenderingAnalyzer 使用說明');
        console.log('=' .repeat(50));
        console.log('\n🔧 程式化使用:');
        console.log('  const analyzer = new SlowRenderingAnalyzer();');
        console.log('  await analyzer.queryByDate("20251019");');
        console.log('  await analyzer.analyzeSlowRenderingCauses("20251019");');
        console.log('\n📅 支援的日期格式:');
        console.log('  • YYYYMMDD: 20251019');
        console.log('  • YYYY-MM-DD: 2025-10-19');
        console.log('\n⚙️ 查詢選項:');
        console.log('  • queryType: "all" | "over20s" | "standard"');
        console.log('  • maxRecords: 限制查詢記錄數');
        console.log('  • delayMs: 查詢間隔毫秒數');
        console.log('\n💡 範例:');
        console.log('  await analyzer.queryByDate("20251019", {');
        console.log('    queryType: "over20s",');
        console.log('    maxRecords: 10,');
        console.log('    delayMs: 1000');
        console.log('  });');
        console.log('\n🔍 慢渲染原因分析:');
        console.log('  await analyzer.analyzeSlowRenderingCauses("20251019");');
    }
}

module.exports = SlowRenderingAnalyzer;