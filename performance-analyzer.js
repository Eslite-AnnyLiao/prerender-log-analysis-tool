// 網頁載入效能分析工具 - 修改版
// 支援讀取 JSON 格式的日誌檔案並分析最耗時的資源
// 特別優化處理 Google Cloud Logging textPayload 格式
// 移除累積載入時間、並行載入效益分析、API 重複載入分析
// 支援 txt 結果輸出

const fs = require('fs');
const path = require('path');

class PerformanceAnalyzer {
    constructor(options = {}) {
        this.urlRequests = new Map(); // 以 URL 為主鍵存儲請求資訊
        this.completedRequests = [];
        this.debugTimestamps = []; // 用於調試時間戳解析

        // 選項設定
        this.options = {
            verbose: options.verbose !== undefined ? options.verbose : false, // 是否顯示詳細處理日誌
            showProgress: options.showProgress !== undefined ? options.showProgress : true, // 是否顯示進度
            showMatching: options.showMatching !== undefined ? options.showMatching : false, // 是否顯示配對過程
            debugTimestamp: options.debugTimestamp !== undefined ? options.debugTimestamp : false, // 調試時間戳
            outputTxt: options.outputTxt !== undefined ? options.outputTxt : true, // 是否輸出txt檔案
            ...options
        };
    }

    /**
     * 設定詳細日誌模式
     * @param {boolean} verbose - 是否顯示詳細日誌
     */
    setVerbose(verbose) {
        this.options.verbose = verbose;
    }

    /**
     * 設定配對過程顯示
     * @param {boolean} showMatching - 是否顯示配對過程
     */
    setShowMatching(showMatching) {
        this.options.showMatching = showMatching;
    }

    /**
     * 設定時間戳調試模式
     * @param {boolean} debugTimestamp - 是否顯示時間戳調試信息
     */
    setDebugTimestamp(debugTimestamp) {
        this.options.debugTimestamp = debugTimestamp;
    }

    /**
     * 輸出詳細日誌（可控制）
     * @param {string} message - 日誌訊息
     * @param {...any} args - 額外參數
     */
    logVerbose(message, ...args) {
        if (this.options.verbose) {
            console.log(message, ...args);
        }
    }

    /**
     * 輸出配對過程日誌（可控制）
     * @param {string} message - 日誌訊息
     * @param {...any} args - 額外參數
     */
    logMatching(message, ...args) {
        if (this.options.showMatching) {
            console.log(message, ...args);
        }
    }

    /**
     * 輸出進度日誌（可控制）
     * @param {string} message - 日誌訊息
     * @param {...any} args - 額外參數
     */
    logProgress(message, ...args) {
        if (this.options.showProgress) {
            console.log(message, ...args);
        }
    }

    /**
     * 輸出時間戳調試日誌（可控制）
     * @param {string} message - 日誌訊息
     * @param {...any} args - 額外參數
     */
    logTimestamp(message, ...args) {
        if (this.options.debugTimestamp) {
            console.log(`🕐 [Timestamp Debug] ${message}`, ...args);
        }
    }

    /**
     * 解析時間戳字串為毫秒
     * @param {string} timeStr - 時間戳字串
     * @returns {number|null} - 毫秒時間戳
     */
    parseTimestamp(timeStr) {
        try {
            this.logTimestamp(`嘗試解析時間戳: "${timeStr}"`);

            // 支援多種時間格式
            const formats = [
                /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})Z/, // ISO格式
                /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\.(\d{3})/, // 一般格式
                /(\d{13})/ // 毫秒時間戳
            ];

            for (const format of formats) {
                const match = timeStr.match(format);
                if (match) {
                    let result;
                    if (match[2]) {
                        const fullTimeStr = match[1] + '.' + match[2] + 'Z';
                        result = new Date(fullTimeStr).getTime();
                        this.logTimestamp(`格式匹配成功，重構時間戳: "${fullTimeStr}" -> ${result}`);
                    } else {
                        result = parseInt(match[1]);
                        this.logTimestamp(`數字時間戳匹配: "${match[1]}" -> ${result}`);
                    }

                    // 記錄調試信息
                    if (this.options.debugTimestamp) {
                        this.debugTimestamps.push({
                            original: timeStr,
                            parsed: result,
                            date: new Date(result).toISOString()
                        });
                    }

                    return result;
                }
            }

            // 嘗試直接解析
            const directResult = new Date(timeStr).getTime();
            this.logTimestamp(`直接解析結果: ${directResult}`);

            if (this.options.debugTimestamp) {
                this.debugTimestamps.push({
                    original: timeStr,
                    parsed: directResult,
                    date: new Date(directResult).toISOString(),
                    method: 'direct'
                });
            }

            return directResult;
        } catch (error) {
            console.warn(`無法解析時間戳: ${timeStr}`, error.message);
            this.logTimestamp(`解析失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 分析資源類型
     * @param {string} url - 資源URL
     * @returns {string} - 資源類型
     */
    getResourceType(url) {
        // 檢查 url 是否為有效字串
        if (!url || typeof url !== 'string') {
            console.warn(`無效的URL類型: ${typeof url}, 值: ${url}`);
            return '其他';
        }

        const urlStr = url.toLowerCase();
        if (urlStr.includes('.js')) return 'JavaScript';
        if (urlStr.includes('.css')) return 'CSS';
        if (urlStr.includes('.woff') || urlStr.includes('.woff2') || urlStr.includes('.ttf')) return '字體';
        if (urlStr.includes('.jpg') || urlStr.includes('.jpeg') || urlStr.includes('.png') || urlStr.includes('.webp') || urlStr.includes('.svg')) return '圖片';
        if (urlStr.includes('/api/') || urlStr.includes('api.') || urlStr.includes('.com/v')) return 'API';
        if (urlStr.includes('polyfill')) return 'Polyfill';
        if (urlStr.includes('.html') || urlStr.includes('localhost') || (urlStr.includes('http') && !urlStr.includes('.'))) return 'HTML頁面';
        return '其他';
    }

    /**
     * 從文字日誌分析請求 - 支援新的日誌格式
     * @param {string} logText - 日誌文字內容
     */
    parseTextLog(logText) {
        const lines = logText.split('\n');

        lines.forEach(line => {
            if (!line.trim()) return; // 跳過空行

            // 跳過 "[SUCCESS] Page is done loading" 和其他狀態訊息相關的日誌行
            if (line.includes('[SUCCESS]') ||
                line.includes('Page is done loading') ||
                line.includes('[SUCCESS] Page is done loading')) {
                this.logVerbose(`跳過狀態訊息: ${line}`);
                return;
            }

            this.logVerbose(`處理日誌行: ${line}`);

            // 新格式：2025-08-19T06:38:11.882Z + 1 http://dev-inception.inception.svc.cluster.local/v1/health [reqId: 1168ac95-74c2-4f1b-9e81-81efdd4e94ec]
            const newFormatMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+([+-])\s+\d+\s+([^\s\[]+)(?:\s+\[reqId:[^\]]+\])?/);

            if (newFormatMatch) {
                const timestamp = this.parseTimestamp(newFormatMatch[1]);
                const action = newFormatMatch[2]; // + 或 -
                const url = newFormatMatch[3]; // URL，已過濾掉 reqId

                this.logVerbose(`✅ 新格式匹配: 時間=${newFormatMatch[1]}, 動作=${action}, URL=${url}`);

                if (timestamp && url) {
                    const normalizedAction = action === '+' ? 'start' : action === '-' ? 'end' : 'unknown';
                    this.addUrlEvent(url, timestamp, normalizedAction);
                }
                return;
            }

            // 原有格式的時間戳匹配
            const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
            if (!timestampMatch) {
                this.logVerbose(`⚠️ 無法匹配時間戳，跳過: ${line}`);
                return;
            }

            const timestamp = this.parseTimestamp(timestampMatch[1]);

            // 檢查請求開始 (+ 符號) - 忽略ID，只關注URL
            const startMatch = line.match(/\+ \d+ (.+)$/);
            if (startMatch) {
                let url = startMatch[1];
                // 過濾掉 reqId 部分
                url = url.replace(/\s+\[reqId:[^\]]+\]/, '');
                this.addUrlEvent(url, timestamp, 'start');
                return;
            }

            // 檢查請求結束 (- 符號) - 忽略ID，只關注URL
            const endMatch = line.match(/- \d+ (.+)$/);
            if (endMatch) {
                let url = endMatch[1];
                // 過濾掉 reqId 部分
                url = url.replace(/\s+\[reqId:[^\]]+\]/, '');
                this.addUrlEvent(url, timestamp, 'end');
                return;
            }

            // 檢查其他格式的請求資訊
            this.parseLineForUrl(line, timestamp);
        });
    }

    /**
     * 解析行中的 URL 資訊
     * @param {string} line - 日誌行
     * @param {number} timestamp - 時間戳
     */
    parseLineForUrl(line, timestamp) {
        // 過濾掉 reqId 部分
        const cleanLine = line.replace(/\s+\[reqId:[^\]]+\]/, '');

        // 嘗試從行中提取 URL
        const urlPatterns = [
            /https?:\/\/[^\s\[]+/g, // 修改：確保不匹配到 [ 字符
            /['"](\/[^'"\[]*)['"]/g  // 修改：確保不匹配到 [ 字符
        ];

        for (const pattern of urlPatterns) {
            const matches = cleanLine.match(pattern);
            if (matches) {
                matches.forEach(url => {
                    // 清理 URL
                    url = url.replace(/['"]/g, '');
                    this.addUrlEvent(url, timestamp, 'unknown');
                });
                break;
            }
        }
    }

    /**
     * 添加 URL 事件
     * @param {string} url - URL
     * @param {number} timestamp - 時間戳
     * @param {string} action - 動作類型 ('start', 'end', 'unknown')
     */
    addUrlEvent(url, timestamp, action) {
        // 檢查 URL 是否為有效字串
        if (!url || typeof url !== 'string') {
            console.warn(`跳過無效URL: ${typeof url}, 值: ${url}`);
            return;
        }

        // 過濾掉狀態訊息類型的URL
        if (url.includes('[SUCCESS]') ||
            url.includes('Page is done loading') ||
            url.includes('[SUCCESS] Page is done loading')) {
            this.logVerbose(`跳過狀態訊息URL: ${url}`);
            return;
        }

        // 檢查時間戳是否有效
        if (!timestamp || typeof timestamp !== 'number') {
            console.warn(`跳過無效時間戳: ${typeof timestamp}, 值: ${timestamp}, URL: ${url}`);
            return;
        }

        if (!this.urlRequests.has(url)) {
            this.urlRequests.set(url, {
                url: url,
                type: this.getResourceType(url),
                startTimes: [],
                endTimes: [],
                unknownTimes: []
            });
        }

        const urlData = this.urlRequests.get(url);

        switch (action) {
            case 'start':
                urlData.startTimes.push(timestamp);
                this.logVerbose(`📥 開始: ${url.split('/').pop()} 在 ${new Date(timestamp).toISOString()}`);
                break;
            case 'end':
                urlData.endTimes.push(timestamp);
                this.logVerbose(`📤 結束: ${url.split('/').pop()} 在 ${new Date(timestamp).toISOString()}`);
                break;
            case 'unknown':
                urlData.unknownTimes.push(timestamp);
                break;
            default:
                console.warn(`未知的動作類型: ${action}, URL: ${url}`);
                urlData.unknownTimes.push(timestamp);
        }
    }

    /**
     * 解析CSV內容為陣列
     * @param {string} csvContent - CSV檔案內容
     * @returns {Array} - 解析後的CSV資料陣列
     */
    parseCsvContent(csvContent) {
        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length === 0) return [];

        // 解析標題行
        const headers = this.parseCsvLine(lines[0]);
        const data = [];

        // 解析資料行
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCsvLine(lines[i]);
            if (values.length > 0) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                data.push(row);
            }
        }

        return data;
    }

    /**
     * 解析單行CSV，處理引號和逗號
     * @param {string} line - CSV行
     * @returns {Array} - 解析後的欄位陣列
     */
    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 雙引號表示一個引號字符
                    current += '"';
                    i += 2;
                } else {
                    // 切換引號狀態
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === ',' && !inQuotes) {
                // 遇到逗號且不在引號內，結束當前欄位
                result.push(current.trim());
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }

        // 添加最後一個欄位
        result.push(current.trim());
        return result;
    }

    /**
     * 從CSV日誌分析請求
     * @param {Array} csvData - CSV格式的日誌數據
     */
    parseCsvLog(csvData) {
        this.logProgress(`處理 ${csvData.length} 個CSV記錄...`);
        
        csvData.forEach((row, index) => {
            if (index % 1000 === 0 && this.options.showProgress) {
                console.log(`已處理 ${index}/${csvData.length} 個記錄`);
            }
            this.processCsvEntry(row);
        });
    }

    /**
     * 處理單一CSV條目
     * @param {Object} row - CSV行物件
     */
    processCsvEntry(row) {
        // 檢查 row 是否為有效物件
        if (!row || typeof row !== 'object') {
            this.logVerbose(`跳過無效的CSV記錄: ${typeof row}`);
            return;
        }

        // 首先檢查是否有 textPayload 欄位 (Google Cloud Logging CSV export)
        if (row.textPayload) {
            this.logTimestamp(`處理CSV中的 textPayload 記錄`);
            const parsed = this.parseTextPayload(row.textPayload);
            if (parsed) {
                // 使用CSV中的時間戳欄位
                if (!parsed.timestamp && row.timestamp) {
                    parsed.timestamp = row.timestamp;
                } else if (!parsed.timestamp && row.receiveTimestamp) {
                    parsed.timestamp = row.receiveTimestamp;
                }
                
                // 遞迴處理解析後的資料
                this.processJsonEntry(parsed);
                return;
            } else {
                this.logTimestamp(`CSV textPayload 解析失敗，繼續正常處理`);
            }
        }

        // 標準CSV處理 - 提取時間戳
        const timestamp = this.extractTimestamp(row);
        if (!timestamp) {
            this.logVerbose(`無法從CSV記錄提取時間戳，跳過:`, Object.keys(row));
            return;
        }

        // 提取URL
        let url = this.extractUrl(row);
        if (!url) {
            this.logVerbose(`無法從CSV記錄提取URL，跳過:`, Object.keys(row));
            return;
        }

        // 過濾掉 reqId 部分
        if (typeof url === 'string') {
            url = url.replace(/\s+\[reqId:[^\]]+\]/, '');
        }

        // 提取請求狀態
        const action = this.extractAction(row);

        // 檢查是否有直接的duration或responseTime
        const duration = row.duration || row.loadTime || row.responseTime || row.response_time;
        if (duration && typeof duration === 'number' && duration > 0) {
            // 直接創建完成的請求
            this.completedRequests.push({
                url: url,
                startTime: timestamp,
                endTime: timestamp + duration,
                duration: duration,
                type: this.getResourceType(url)
            });
            this.logTimestamp(`創建CSV直接完成的請求: ${url}, duration: ${duration}ms`);
            return;
        }

        // 如果duration是字串，嘗試解析
        if (duration && typeof duration === 'string') {
            const parsedDuration = parseFloat(duration);
            if (!isNaN(parsedDuration) && parsedDuration > 0) {
                this.completedRequests.push({
                    url: url,
                    startTime: timestamp,
                    endTime: timestamp + parsedDuration,
                    duration: parsedDuration,
                    type: this.getResourceType(url)
                });
                this.logTimestamp(`創建CSV直接完成的請求(解析字串): ${url}, duration: ${parsedDuration}ms`);
                return;
            }
        }

        // 否則添加為事件
        const normalizedAction = this.normalizeAction(action);
        this.addUrlEvent(url, timestamp, normalizedAction);
    }

    /**
     * 從JSON日誌分析請求
     * @param {Array|Object} jsonData - JSON格式的日誌數據
     */
    parseJsonLog(jsonData) {
        // 如果是陣列格式
        if (Array.isArray(jsonData)) {
            this.logProgress(`處理 ${jsonData.length} 個日誌條目...`);
            jsonData.forEach((entry, index) => {
                if (index % 1000 === 0 && this.options.showProgress) {
                    console.log(`已處理 ${index}/${jsonData.length} 個條目`);
                }
                this.processJsonEntry(entry);
            });
        }
        // 如果是物件格式，尋找日誌陣列
        else if (typeof jsonData === 'object') {
            // 嘗試不同的可能欄位名稱
            const possibleArrays = ['logs', 'entries', 'requests', 'data', 'events'];
            for (const field of possibleArrays) {
                if (jsonData[field] && Array.isArray(jsonData[field])) {
                    this.logProgress(`在 ${field} 欄位發現 ${jsonData[field].length} 個條目`);
                    jsonData[field].forEach(entry => this.processJsonEntry(entry));
                    return;
                }
            }
            // 如果沒有找到陣列，將整個物件當作單一條目處理
            this.processJsonEntry(jsonData);
        }
    }

    /**
     * 解析Google Cloud Logging textPayload格式
     * @param {string} textPayload - textPayload字串
     * @returns {Object|null} - 解析後的資料物件
     */
    parseTextPayload(textPayload) {
        try {
            this.logTimestamp(`解析 textPayload: ${textPayload}`);

            // 嘗試解析為JSON陣列
            const parsed = JSON.parse(textPayload);
            if (Array.isArray(parsed)) {
                // 格式1: ["timestamp", "X-Original-User-Agent:", "user-agent", "url", "[reqId: ...]"] - 5個元素
                if (parsed.length === 5 && typeof parsed[3] === 'string' && (parsed[3].startsWith('http://') || parsed[3].startsWith('https://'))) {
                    let url = parsed[3];
                    // 過濾掉 reqId 部分
                    if (typeof url === 'string') {
                        url = url.replace(/\s+\[reqId:[^\]]+\]/, '');
                    }

                    const result = {
                        timestamp: parsed[0],
                        url: url,
                        // 這種格式沒有明確的action，標記為unknown
                        action: 'unknown'
                    };
                    this.logTimestamp(`textPayload解析成功(5元素格式):`, result);
                    return result;
                }
                // 格式2: ["timestamp", "action", id, "url"] - 忽略ID
                else if (parsed.length >= 4) {
                    let url = parsed[3];
                    // 過濾掉 reqId 部分
                    if (typeof url === 'string') {
                        url = url.replace(/\s+\[reqId:[^\]]+\]/, '');
                    }

                    const result = {
                        timestamp: parsed[0],
                        action: parsed[1],
                        url: url // 忽略 parsed[2] (ID)
                    };
                    this.logTimestamp(`textPayload解析成功(4+元素格式):`, result);
                    return result;
                }
                // 格式: ["timestamp", "url", duration]
                else if (parsed.length === 3) {
                    let url = parsed[1];
                    // 過濾掉 reqId 部分
                    if (typeof url === 'string') {
                        url = url.replace(/\s+\[reqId:[^\]]+\]/, '');
                    }

                    const result = {
                        timestamp: parsed[0],
                        url: url,
                        duration: parsed[2]
                    };
                    this.logTimestamp(`textPayload解析成功(包含duration):`, result);
                    return result;
                }
            }
            return null;
        } catch (error) {
            this.logTimestamp(`textPayload JSON解析失敗: ${error.message}`);
            // 如果不是JSON格式，嘗試其他解析方式
            return this.parseTextPayloadAsString(textPayload);
        }
    }

    /**
     * 解析文字格式的textPayload
     * @param {string} textPayload - textPayload字串
     * @returns {Object|null} - 解析後的資料物件
     */
    parseTextPayloadAsString(textPayload) {
        // 過濾掉 reqId 部分
        const cleanPayload = textPayload.replace(/\s+\[reqId:[^\]]+\]/, '');

        // 嘗試解析類似 "+ 1 https://example.com" 格式，但忽略 ID
        const patterns = [
            /^([+-])\s+\d+\s+(.+)$/, // "+ 1 https://example.com" -> 忽略ID
            /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+([+-])\s+\d+\s+(.+)$/, // 包含時間戳，忽略ID
            /^(.+)\s+(\d+)ms$/ // "https://example.com 1500ms"
        ];

        for (const pattern of patterns) {
            const match = cleanPayload.match(pattern);
            if (match) {
                if (pattern === patterns[0]) {
                    return {
                        action: match[1],
                        url: match[2]
                    };
                } else if (pattern === patterns[1]) {
                    return {
                        timestamp: match[1],
                        action: match[2],
                        url: match[3]
                    };
                } else if (pattern === patterns[2]) {
                    return {
                        url: match[1],
                        duration: parseInt(match[2])
                    };
                }
            }
        }
        return null;
    }

    /**
     * 處理單一JSON條目
     * @param {Object} entry - JSON條目
     */
    processJsonEntry(entry) {
        // 檢查 entry 是否為有效物件
        if (!entry || typeof entry !== 'object') {
            this.logVerbose(`跳過無效的條目: ${typeof entry}`);
            return;
        }

        // 首先檢查是否為Google Cloud Logging格式 (有textPayload欄位)
        if (entry.textPayload) {
            this.logTimestamp(`處理 textPayload 條目`);
            const parsed = this.parseTextPayload(entry.textPayload);
            if (parsed) {
                this.logTimestamp(`textPayload 解析成功，檢查時間戳...`);

                // 修正：優先使用 textPayload 中的時間戳，只有當其無效時才使用外層時間戳
                let finalTimestamp = null;

                if (parsed.timestamp) {
                    finalTimestamp = this.parseTimestamp(parsed.timestamp);
                    this.logTimestamp(`使用 textPayload 中的時間戳: ${parsed.timestamp} -> ${finalTimestamp}`);
                }

                // 只有當 textPayload 中的時間戳無效時，才使用外層時間戳
                if (!finalTimestamp && entry.timestamp) {
                    finalTimestamp = this.parseTimestamp(entry.timestamp);
                    this.logTimestamp(`textPayload 時間戳無效，使用外層時間戳: ${entry.timestamp} -> ${finalTimestamp}`);
                    parsed.timestamp = entry.timestamp; // 更新 parsed 中的時間戳
                }

                // 如果還有 receiveTimestamp，作為最後備選
                if (!finalTimestamp && entry.receiveTimestamp) {
                    finalTimestamp = this.parseTimestamp(entry.receiveTimestamp);
                    this.logTimestamp(`使用 receiveTimestamp 作為備選: ${entry.receiveTimestamp} -> ${finalTimestamp}`);
                    parsed.timestamp = entry.receiveTimestamp;
                }

                // 遞迴處理解析後的資料
                this.processJsonEntry(parsed);
                return;
            } else {
                this.logTimestamp(`textPayload 解析失敗，繼續正常處理`);
            }
        }

        // 提取時間戳
        const timestamp = this.extractTimestamp(entry);
        if (!timestamp) {
            this.logVerbose(`無法提取時間戳，跳過條目:`, Object.keys(entry));
            return;
        }

        // 提取URL
        let url = this.extractUrl(entry);
        if (!url) {
            this.logVerbose(`無法提取URL，跳過條目:`, Object.keys(entry));
            return;
        }

        // 過濾掉 reqId 部分
        if (typeof url === 'string') {
            url = url.replace(/\s+\[reqId:[^\]]+\]/, '');
        }

        // 提取請求狀態
        const action = this.extractAction(entry);

        // 檢查是否有直接的duration
        const duration = entry.duration || entry.loadTime || entry.responseTime;
        if (duration && typeof duration === 'number' && duration > 0) {
            // 直接創建完成的請求
            this.completedRequests.push({
                url: url,
                startTime: timestamp,
                endTime: timestamp + duration,
                duration: duration,
                type: this.getResourceType(url)
            });
            this.logTimestamp(`創建直接完成的請求: ${url}, duration: ${duration}ms`);
            return;
        }

        // 否則添加為事件
        const normalizedAction = this.normalizeAction(action);
        this.addUrlEvent(url, timestamp, normalizedAction);
    }

    /**
     * 標準化動作類型
     * @param {string} action - 原始動作
     * @returns {string} - 標準化後的動作
     */
    normalizeAction(action) {
        if (!action) return 'unknown';

        const actionStr = action.toString().toLowerCase();
        if (actionStr === '+' || actionStr === 'start' || actionStr === 'begin' || actionStr === 'request_start') {
            return 'start';
        }
        if (actionStr === '-' || actionStr === 'end' || actionStr === 'finish' || actionStr === 'request_end') {
            return 'end';
        }
        return 'unknown';
    }

    /**
     * 從JSON條目提取時間戳
     */
    extractTimestamp(entry) {
        const timeFields = ['timestamp', 'time', 'ts', 'datetime', 'startTime', 'date', 'receiveTimestamp'];
        for (const field of timeFields) {
            if (entry[field]) {
                const parsed = this.parseTimestamp(entry[field]);
                this.logTimestamp(`從欄位 ${field} 提取時間戳: ${entry[field]} -> ${parsed}`);
                return parsed;
            }
        }
        return null;
    }

    /**
     * 從JSON條目提取URL
     */
    extractUrl(entry) {
        const urlFields = ['url', 'uri', 'path', 'request', 'resource', 'src'];
        for (const field of urlFields) {
            if (entry[field]) {
                const url = entry[field];
                // 確保返回的是字串類型
                if (typeof url === 'string' && url.trim().length > 0) {
                    const cleanUrl = url.trim();
                    // 過濾掉狀態訊息
                    if (cleanUrl.includes('[SUCCESS]') ||
                        cleanUrl.includes('Page is done loading')) {
                        return null;
                    }
                    return cleanUrl;
                } else if (url && typeof url === 'object') {
                    // 如果是物件，嘗試從中提取URL
                    if (url.href) {
                        const hrefUrl = url.href.toString();
                        if (hrefUrl.includes('[SUCCESS]') || hrefUrl.includes('Page is done loading')) {
                            return null;
                        }
                        return hrefUrl;
                    }
                    if (url.toString && typeof url.toString === 'function') {
                        const urlStr = url.toString();
                        if (urlStr && urlStr !== '[object Object]') {
                            if (urlStr.includes('[SUCCESS]') || urlStr.includes('Page is done loading')) {
                                return null;
                            }
                            return urlStr;
                        }
                    }
                } else if (url) {
                    // 嘗試轉換為字串
                    const urlStr = String(url).trim();
                    if (urlStr && urlStr !== 'null' && urlStr !== 'undefined') {
                        if (urlStr.includes('[SUCCESS]') || urlStr.includes('Page is done loading')) {
                            return null;
                        }
                        return urlStr;
                    }
                }
            }
        }
        return null;
    }

    /**
     * 從JSON條目提取動作類型
     */
    extractAction(entry) {
        const actionFields = ['action', 'type', 'event', 'status', 'method'];
        for (const field of actionFields) {
            if (entry[field]) {
                return entry[field];
            }
        }
        return 'unknown';
    }

    /**
     * 完成分析並準備結果
     */
    finalizeAnalysis() {
        this.logProgress('\n🔄 開始分析 URL 事件配對...');

        // 處理每個 URL 的事件，將開始和結束時間配對
        this.urlRequests.forEach((urlData, url) => {
            this.matchUrlEvents(urlData);
        });

        // 按照 duration 排序
        this.completedRequests.sort((a, b) => b.duration - a.duration);

        console.log(`✅ 分析完成，共找到 ${this.completedRequests.length} 個完整的請求記錄`);

        // 如果開啟了時間戳調試，顯示時間戳統計
        if (this.options.debugTimestamp && this.debugTimestamps.length > 0) {
            console.log('\n🕐 時間戳解析調試信息:');
            console.log(`總共解析了 ${this.debugTimestamps.length} 個時間戳`);

            // 顯示前5個和後5個時間戳
            const showCount = Math.min(5, this.debugTimestamps.length);
            console.log(`\n前 ${showCount} 個時間戳:`);
            this.debugTimestamps.slice(0, showCount).forEach((ts, index) => {
                console.log(`${index + 1}. ${ts.original} -> ${ts.date} (${ts.parsed})`);
            });

            if (this.debugTimestamps.length > 10) {
                console.log(`\n後 ${showCount} 個時間戳:`);
                this.debugTimestamps.slice(-showCount).forEach((ts, index) => {
                    console.log(`${this.debugTimestamps.length - showCount + index + 1}. ${ts.original} -> ${ts.date} (${ts.parsed})`);
                });
            }

            // 檢查時間戳範圍
            const timestamps = this.debugTimestamps.map(ts => ts.parsed).filter(ts => ts);
            if (timestamps.length > 0) {
                const earliest = Math.min(...timestamps);
                const latest = Math.max(...timestamps);
                console.log(`\n時間戳範圍: ${new Date(earliest).toISOString()} ~ ${new Date(latest).toISOString()}`);
                console.log(`總時間跨度: ${((latest - earliest) / 1000).toFixed(2)} 秒`);
            }
        }
    }

    /**
     * 匹配同一 URL 的開始和結束事件
     * @param {Object} urlData - URL 資料
     */
    matchUrlEvents(urlData) {
        const { url, startTimes, endTimes, unknownTimes } = urlData;

        // 對時間陣列進行排序
        startTimes.sort((a, b) => a - b);
        endTimes.sort((a, b) => a - b);
        unknownTimes.sort((a, b) => a - b);

        this.logMatching(`\n🔍 配對 URL: ${url.split('/').pop()}`);
        this.logMatching(`   開始事件: ${startTimes.length} 個`);
        this.logMatching(`   結束事件: ${endTimes.length} 個`);

        // 策略1: 精確配對 - 按時間順序配對 start 和 end
        const usedEndTimes = new Set();
        startTimes.forEach(startTime => {
            // 找到第一個大於 startTime 且未使用的 endTime
            const matchingEndTime = endTimes.find(endTime =>
                endTime > startTime &&
                !usedEndTimes.has(endTime) &&
                (endTime - startTime) < 60000 // 假設請求不會超過60秒
            );

            if (matchingEndTime) {
                usedEndTimes.add(matchingEndTime);
                const duration = matchingEndTime - startTime;
                this.completedRequests.push({
                    url: url,
                    startTime: startTime,
                    endTime: matchingEndTime,
                    duration: duration,
                    type: urlData.type
                });

                this.logMatching(`   ✅ 配對成功: ${new Date(startTime).toISOString().slice(11, 23)} -> ${new Date(matchingEndTime).toISOString().slice(11, 23)} (${duration}ms)`);
            }
        });

        // 策略2: 如果有未配對的時間，嘗試估算
        const unpaired = startTimes.filter(startTime => {
            return !this.completedRequests.some(req =>
                req.url === url && req.startTime === startTime
            );
        });

        // 對於未配對的開始時間，使用平均duration估算
        if (unpaired.length > 0 && this.completedRequests.length > 0) {
            const avgDuration = this.getAverageDurationForType(urlData.type);
            unpaired.forEach(startTime => {
                this.completedRequests.push({
                    url: url,
                    startTime: startTime,
                    endTime: startTime + avgDuration,
                    duration: avgDuration,
                    type: urlData.type,
                    estimated: true
                });
                this.logMatching(`   🔮 估算: ${new Date(startTime).toISOString().slice(11, 23)} -> ${avgDuration}ms (估算)`);
            });
        }
    }

    /**
     * 取得特定資源類型的平均duration
     * @param {string} type - 資源類型
     * @returns {number} - 平均duration (毫秒)
     */
    getAverageDurationForType(type) {
        const sameTypeRequests = this.completedRequests.filter(req =>
            req.type === type && !req.estimated
        );

        if (sameTypeRequests.length === 0) {
            // 沒有同類型的資料，回傳合理的預設值
            const defaults = {
                'JavaScript': 800,
                'CSS': 300,
                'API': 1200,
                '圖片': 500,
                '字體': 400,
                'HTML頁面': 600
            };
            return defaults[type] || 500;
        }

        const totalDuration = sameTypeRequests.reduce((sum, req) => sum + req.duration, 0);
        return Math.round(totalDuration / sameTypeRequests.length);
    }

    /**
     * 生成分析報告
     * @param {number} topN - 顯示前N個最耗時資源，預設20
     * @returns {Object} - 分析結果
     */
    generateReport(topN = 20) {
        this.finalizeAnalysis();

        const report = {
            summary: this.generateSummary(),
            topResources: this.generateTopResources(topN),
            typeStats: this.generateTypeStats(),
            recommendations: this.generateRecommendations()
        };

        return report;
    }

    /**
     * 生成摘要統計
     */
    generateSummary() {
        if (this.completedRequests.length === 0) {
            return {
                totalUrls: this.urlRequests.size,
                completedRequests: 0,
                averageTime: 0,
                maxTime: 0,
                minTime: 0,
                estimatedRequests: 0,
                actualTotalTime: 0,
                actualTotalTimeSeconds: 0,
                loadingStartTime: null,
                loadingEndTime: null
            };
        }

        const durations = this.completedRequests.map(r => r.duration);
        const estimatedCount = this.completedRequests.filter(r => r.estimated).length;

        // 計算實際總時間（從最早開始到最晚結束）
        const startTimes = this.completedRequests.map(r => r.startTime);
        const endTimes = this.completedRequests.map(r => r.endTime);
        const earliestStart = Math.min(...startTimes);
        const latestEnd = Math.max(...endTimes);
        const actualTotalTime = latestEnd - earliestStart;

        // 調試信息：顯示關鍵時間點
        if (this.options.debugTimestamp) {
            console.log('\n🕐 關鍵時間點調試:');
            console.log(`最早開始時間: ${new Date(earliestStart).toISOString()} (${earliestStart})`);
            console.log(`最晚結束時間: ${new Date(latestEnd).toISOString()} (${latestEnd})`);
            console.log(`實際總時間: ${actualTotalTime}ms`);

            // 找出最早開始的請求
            const earliestRequest = this.completedRequests.find(r => r.startTime === earliestStart);
            if (earliestRequest) {
                console.log(`最早開始的請求: ${earliestRequest.url}`);
            }
        }

        return {
            totalUrls: this.urlRequests.size,
            completedRequests: this.completedRequests.length,
            estimatedRequests: estimatedCount,
            averageTime: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
            maxTime: Math.max(...durations),
            minTime: Math.min(...durations),

            // 實際總時間（並行載入）
            actualTotalTime: actualTotalTime,
            actualTotalTimeSeconds: (actualTotalTime / 1000).toFixed(2),
            loadingStartTime: new Date(earliestStart).toISOString(),
            loadingEndTime: new Date(latestEnd).toISOString()
        };
    }

    /**
     * 生成最耗時資源列表
     */
    generateTopResources(topN) {
        // 對相同URL的請求進行去重，保留最耗時的那一次
        const uniqueResources = new Map();
        
        this.completedRequests.forEach(request => {
            const existing = uniqueResources.get(request.url);
            if (!existing || request.duration > existing.duration) {
                uniqueResources.set(request.url, request);
            }
        });
        
        // 將去重後的資源轉為陣列並按耗時排序
        const sortedUniqueResources = Array.from(uniqueResources.values())
            .sort((a, b) => b.duration - a.duration)
            .slice(0, topN);
        
        return sortedUniqueResources.map((request, index) => ({
            rank: index + 1,
            duration: request.duration,
            type: request.type,
            url: request.url,
            shortUrl: request.url.length > 80 ? request.url.substring(0, 77) + '...' : request.url,
            estimated: request.estimated || false
        }));
    }

    /**
     * 生成資源類型統計
     */
    generateTypeStats() {
        const typeStats = {};
        let totalRequests = 0;
        let totalTime = 0;

        this.completedRequests.forEach(request => {
            const type = request.type;
            if (!typeStats[type]) {
                typeStats[type] = {
                    count: 0,
                    totalTime: 0,
                    avgTime: 0,
                    estimatedCount: 0,
                    minTime: Infinity,
                    maxTime: 0
                };
            }
            typeStats[type].count++;
            typeStats[type].totalTime += request.duration;
            typeStats[type].minTime = Math.min(typeStats[type].minTime, request.duration);
            typeStats[type].maxTime = Math.max(typeStats[type].maxTime, request.duration);
            totalRequests++;
            totalTime += request.duration;
            if (request.estimated) {
                typeStats[type].estimatedCount++;
            }
        });

        // 計算平均時間和百分比
        Object.keys(typeStats).forEach(type => {
            const stats = typeStats[type];
            stats.avgTime = Math.round(stats.totalTime / stats.count);
            stats.percentage = ((stats.count / totalRequests) * 100).toFixed(1);
            stats.timePercentage = ((stats.totalTime / totalTime) * 100).toFixed(1);
            // 處理只有一個請求的情況
            if (stats.minTime === Infinity) stats.minTime = stats.maxTime;
        });

        // 添加總計信息
        typeStats._total = {
            count: totalRequests,
            totalTime: totalTime,
            avgTime: totalRequests > 0 ? Math.round(totalTime / totalRequests) : 0
        };

        return typeStats;
    }

    /**
     * 生成優化建議
     */
    generateRecommendations() {
        const recommendations = [];
        const summary = this.generateSummary();
        const typeStats = this.generateTypeStats();

        // 基於最耗時資源的建議
        if (this.completedRequests.length > 0) {
            const slowest = this.completedRequests[0];
            if (slowest.duration > 1000) {
                // 生成 shortUrl
                const shortUrl = slowest.url.length > 60 ? slowest.url.substring(0, 57) + '...' : slowest.url;
                const fileName = slowest.url.split('/').pop() || slowest.url;
                const displayName = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;

                recommendations.push({
                    priority: 'high',
                    issue: `最耗時資源: ${slowest.type}`,
                    detail: `${displayName} 載入時間 ${slowest.duration}ms${slowest.estimated ? ' (估算)' : ''}`,
                    suggestion: this.getSuggestionForType(slowest.type),
                    url: slowest.url
                });
            }
        }

        // 基於資源類型的建議
        Object.entries(typeStats).filter(([type]) => type !== '_total').forEach(([type, stats]) => {
            if (stats.avgTime > 500) {
                const estimatedNote = stats.estimatedCount > 0 ? ` (含${stats.estimatedCount}個估算值)` : '';
                recommendations.push({
                    priority: stats.avgTime > 1000 ? 'high' : 'medium',
                    issue: `${type}載入過慢`,
                    detail: `平均載入時間 ${stats.avgTime}ms，共 ${stats.count} 個資源${estimatedNote}`,
                    suggestion: this.getSuggestionForType(type)
                });
            }
        });

        // 基於整體效能的建議
        if (summary.averageTime > 300) {
            recommendations.push({
                priority: 'medium',
                issue: '整體載入效能需優化',
                detail: `平均載入時間 ${summary.averageTime}ms`,
                suggestion: '考慮實施資源合併、快取策略和CDN加速'
            });
        }

        // 基於實際總載入時間的建議
        if (summary.actualTotalTime > 20000) { // 20秒
            recommendations.push({
                priority: 'high',
                issue: '實際總載入時間過長',
                detail: `實際載入時間 ${summary.actualTotalTime}ms (${summary.actualTotalTimeSeconds}秒)`,
                suggestion: '優化關鍵路徑資源、實施資源預載入、考慮服務端渲染(SSR)或靜態生成'
            });
        } else if (summary.actualTotalTime > 8000) { // 8秒
            recommendations.push({
                priority: 'medium',
                issue: '實際總載入時間較長',
                detail: `實際載入時間 ${summary.actualTotalTime}ms (${summary.actualTotalTimeSeconds}秒)`,
                suggestion: '優化資源載入順序、實施關鍵資源預載入、減少阻塞型資源'
            });
        }

        // 基於資源數量的建議
        if (summary.completedRequests > 50) {
            recommendations.push({
                priority: 'medium',
                issue: '資源數量過多',
                detail: `發現 ${summary.completedRequests} 個資源請求`,
                suggestion: '考慮合併小文件、使用雪碧圖、實施模組打包優化'
            });
        }

        // 如果有很多估算值，給出建議
        if (summary.estimatedRequests > summary.completedRequests * 0.3) {
            recommendations.push({
                priority: 'low',
                issue: '日誌資料不完整',
                detail: `${summary.estimatedRequests} 個請求使用估算時間`,
                suggestion: '優化日誌記錄，確保請求開始和結束時間都有記錄'
            });
        }

        // 檢查是否有超慢的資源 (>5秒)
        const extremelySlow = this.completedRequests.filter(req => req.duration > 5000);
        if (extremelySlow.length > 0) {
            const slowestUrl = extremelySlow[0].url;
            const fileName = slowestUrl.split('/').pop() || slowestUrl;
            const displayName = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;

            recommendations.push({
                priority: 'high',
                issue: '發現極慢資源',
                detail: `${extremelySlow.length} 個資源載入超過5秒，最慢的是 ${displayName} (${extremelySlow[0].duration}ms)`,
                suggestion: '立即檢查這些資源的網路條件、伺服器響應時間或考慮移除非必要資源'
            });
        }

        return recommendations;
    }

    /**
     * 根據資源類型提供建議
     */
    getSuggestionForType(type) {
        const suggestions = {
            'JavaScript': '考慮程式碼分割、樹搖(tree shaking)、使用生產版本',
            'CSS': '合併CSS檔案、移除未使用的樣式、使用CSS壓縮',
            'API': '優化API響應時間、實施快取、合併API請求',
            '圖片': '使用WebP格式、適當壓縮、實施懶載入',
            '字體': '使用字體顯示策略、預載入關鍵字體',
            'HTML頁面': '檢查伺服器響應時間、優化伺服器配置',
            'Polyfill': '只載入必要的polyfill、使用現代瀏覽器特性檢測'
        };
        return suggestions[type] || '檢查資源載入策略和網路條件';
    }

    /**
     * 將報告轉換為文字格式
     * @param {Object} report - 分析報告
     * @param {number} topN - 顯示前N個資源
     * @returns {string} - 文字格式的報告
     */
    generateTextReport(report, topN = 20) {
        let textReport = '';
        
        textReport += '網頁載入效能分析報告\n';
        textReport += '==========================================\n\n';

        // 摘要統計
        textReport += '📊 整體統計摘要:\n';
        textReport += `不重複URL數: ${report.summary.totalUrls}\n`;
        textReport += `完成請求數: ${report.summary.completedRequests}\n`;
        if (report.summary.estimatedRequests > 0) {
            textReport += `估算請求數: ${report.summary.estimatedRequests}\n`;
        }

        // 時間統計
        textReport += '\n⏱️ 時間統計:\n';
        textReport += `🕐 實際總載入時間: ${report.summary.actualTotalTime}ms (${report.summary.actualTotalTimeSeconds}秒)\n`;
        textReport += `📈 平均耗時: ${report.summary.averageTime}ms\n`;
        textReport += `⬆️ 最長耗時: ${report.summary.maxTime}ms\n`;
        textReport += `⬇️ 最短耗時: ${report.summary.minTime}ms\n`;

        // 前N個最耗時資源
        textReport += `\n🔥 前${topN}個最耗時的資源:\n`;
        textReport += '='.repeat(80) + '\n';
        textReport += '排名 | 耗時(ms) | 類型       | 狀態 | 檔案名稱\n';
        textReport += '-----|----------|------------|------|----------\n';

        report.topResources.forEach(resource => {
            const status = resource.estimated ? '估算' : '實際';
            const fileName = resource.url.split('/').pop() || resource.url;
            const displayFileName = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;

            textReport += `${resource.rank.toString().padStart(2)}   | ${resource.duration.toString().padStart(8)} | ${resource.type.padEnd(10)} | ${status.padEnd(4)} | ${displayFileName}\n`;
        });

        // 資源類型統計
        textReport += '\n📊 資源類型統計:\n';
        textReport += '='.repeat(80) + '\n';
        textReport += '資源類型   | 數量 | 總耗時(ms) | 平均(ms) | 數量占比 | 時間占比\n';
        textReport += '-----------|------|------------|----------|----------|----------\n';

        // 按總耗時排序顯示
        const sortedTypes = Object.entries(report.typeStats)
            .filter(([type]) => type !== '_total')
            .sort(([,a], [,b]) => b.totalTime - a.totalTime);

        sortedTypes.forEach(([type, stats]) => {
            const estimatedNote = stats.estimatedCount > 0 ? '*' : ' ';
            textReport += `${(type + estimatedNote).padEnd(10)} | ${stats.count.toString().padStart(4)} | ${stats.totalTime.toString().padStart(10)} | ${stats.avgTime.toString().padStart(8)} | ${(stats.percentage + '%').padStart(8)} | ${(stats.timePercentage + '%').padStart(8)}\n`;
        });

        // 總計行
        if (report.typeStats._total) {
            const total = report.typeStats._total;
            textReport += '-'.repeat(80) + '\n';
            textReport += `${'總計'.padEnd(10)} | ${total.count.toString().padStart(4)} | ${total.totalTime.toString().padStart(10)} | ${total.avgTime.toString().padStart(8)} | ${'100.0%'.padStart(8)} | ${'100.0%'.padStart(8)}\n`;
        }

        textReport += '\n說明: * 表示該類型包含估算值\n';

        // 耗時分布分析
        textReport += '\n📈 耗時分布分析:\n';
        textReport += '='.repeat(80) + '\n';
        const durations = report.topResources.map(r => r.duration);
        const ranges = [
            { label: '極快 (<200ms)', min: 0, max: 200 },
            { label: '快速 (200-500ms)', min: 200, max: 500 },
            { label: '普通 (500-1000ms)', min: 500, max: 1000 },
            { label: '緩慢 (1000-2000ms)', min: 1000, max: 2000 },
            { label: '很慢 (>2000ms)', min: 2000, max: Infinity }
        ];
        ranges.forEach(range => {
            const count = durations.filter(d => d >= range.min && d < range.max).length;
            const percentage = durations.length > 0 ? ((count / durations.length) * 100).toFixed(1) : '0.0';
            textReport += `${range.label.padEnd(20)}: ${count.toString().padStart(2)} 個 (${percentage}%)\n`;
        });
        textReport += '\n';

        // 優化建議
        if (report.recommendations.length > 0) {
            textReport += '\n💡 效能優化建議:\n';
            textReport += '='.repeat(80) + '\n';
            report.recommendations.forEach((rec, index) => {
                const priority = rec.priority === 'high' ? '🔴 高優先級' : rec.priority === 'medium' ? '🟡 中優先級' : '🟢 低優先級';
                textReport += `${index + 1}. ${priority} - ${rec.issue}\n`;
                textReport += `   問題詳情: ${rec.detail}\n`;
                textReport += `   建議措施: ${rec.suggestion}\n\n`;
            });
        }

        // 效能評分
        textReport += '⭐ 整體效能評分:\n';
        const avgTime = report.summary.averageTime;
        const actualTotalTime = report.summary.actualTotalTime;
        const requestCount = report.summary.completedRequests;

        let score = 100;
        let grade = '';
        let details = [];

        // 基於平均載入時間評分 (權重 40%)
        let avgScore = 100;
        if (avgTime > 2000) { avgScore = 30; details.push('平均載入時間過長(>2秒)'); }
        else if (avgTime > 1000) { avgScore = 50; details.push('平均載入時間較長(>1秒)'); }
        else if (avgTime > 600) { avgScore = 70; details.push('平均載入時間中等(>600ms)'); }
        else if (avgTime > 300) { avgScore = 85; details.push('平均載入時間良好(<600ms)'); }
        else { avgScore = 95; details.push('平均載入時間優秀(<300ms)'); }

        // 基於實際總載入時間評分 (權重 40%)
        let actualTotalScore = 100;
        if (actualTotalTime > 30000) { actualTotalScore = 30; details.push('實際總載入時間過長(>30秒)'); }
        else if (actualTotalTime > 15000) { actualTotalScore = 50; details.push('實際總載入時間較長(>15秒)'); }
        else if (actualTotalTime > 8000) { actualTotalScore = 70; details.push('實際總載入時間中等(>8秒)'); }
        else if (actualTotalTime > 3000) { actualTotalScore = 85; details.push('實際總載入時間良好(<8秒)'); }
        else { actualTotalScore = 95; details.push('實際總載入時間優秀(<3秒)'); }

        // 基於資源數量評分 (權重 15%)
        let countScore = 100;
        if (requestCount > 100) { countScore = 60; details.push('資源數量過多(>100個)'); }
        else if (requestCount > 50) { countScore = 75; details.push('資源數量較多(>50個)'); }
        else if (requestCount > 20) { countScore = 90; details.push('資源數量適中(<50個)'); }
        else { countScore = 95; details.push('資源數量良好(<20個)'); }

        // 基於估算比例評分 (權重 5%)
        let estimatedScore = 100;
        const estimatedRatio = report.summary.estimatedRequests / report.summary.completedRequests;
        if (estimatedRatio > 0.5) { estimatedScore = 60; details.push('估算數據過多'); }
        else if (estimatedRatio > 0.3) { estimatedScore = 80; details.push('部分數據為估算'); }
        else if (estimatedRatio > 0) { estimatedScore = 90; details.push('少量估算數據'); }
        else { estimatedScore = 100; details.push('數據完整準確'); }

        // 計算綜合評分
        score = Math.round(avgScore * 0.4 + actualTotalScore * 0.4 + countScore * 0.15 + estimatedScore * 0.05);

        if (score >= 90) { grade = 'A - 優秀'; }
        else if (score >= 80) { grade = 'B - 良好'; }
        else if (score >= 70) { grade = 'C - 需要改善'; }
        else if (score >= 60) { grade = 'D - 需要大幅改善'; }
        else { grade = 'F - 嚴重需要優化'; }

        textReport += `綜合評分: ${score}/100 - ${grade}\n\n`;
        textReport += `評分詳細:\n`;
        textReport += `  • 平均載入時間評分: ${avgScore}/100 (權重40%)\n`;
        textReport += `  • 實際總載入時間評分: ${actualTotalScore}/100 (權重40%)\n`;
        textReport += `  • 資源數量評分: ${countScore}/100 (權重15%)\n`;
        textReport += `  • 數據完整性評分: ${estimatedScore}/100 (權重5%)\n\n`;
        textReport += `效能表現:\n`;
        details.forEach(detail => {
            textReport += `  • ${detail}\n`;
        });

        return textReport;
    }

    /**
     * 輸出報告到 txt 檔案
     * @param {Object} report - 分析報告
     * @param {string} outputPath - 輸出檔案路徑
     */
    saveReportToTxt(report, outputPath) {
        const textReport = this.generateTextReport(report);
        try {
            fs.writeFileSync(outputPath, textReport, 'utf8');
            console.log(`\n✅ 分析結果已儲存至: ${outputPath}`);
        } catch (error) {
            console.error(`❌ 無法寫入檔案 ${outputPath}:`, error.message);
        }
    }

    /**
     * 輸出格式化報告到控制台
     */
    printReport(topN = 20) {
        const report = this.generateReport(topN);

        console.log('\n\n🚀 網頁載入效能分析報告');
        console.log('==========================================');

        // 顯示當前的日誌模式設定
        if (this.options.verbose || this.options.showMatching || this.options.debugTimestamp) {
            console.log('\n🔧 當前日誌模式:');
            if (this.options.verbose) console.log('   ✅ 詳細事件日誌: 已開啟');
            if (this.options.showMatching) console.log('   ✅ 配對過程日誌: 已開啟');
            if (this.options.debugTimestamp) console.log('   ✅ 時間戳調試: 已開啟');
            if (!this.options.showProgress) console.log('   ❌ 進度信息: 已關閉');
        } else {
            console.log('\n💡 提示: 使用 --verbose、--matching 或 --debug-timestamp 參數可查看更多處理細節');
        }

        // 摘要統計
        console.log('\n📊 整體統計摘要:');
        console.log(`不重複URL數: ${report.summary.totalUrls}`);
        console.log(`完成請求數: ${report.summary.completedRequests}`);
        if (report.summary.estimatedRequests > 0) {
            console.log(`估算請求數: ${report.summary.estimatedRequests}`);
        }

        // 時間統計
        console.log('\n⏱️ 時間統計:');
        console.log(`🕐 實際總載入時間: ${report.summary.actualTotalTime}ms (${report.summary.actualTotalTimeSeconds}秒)`);
        console.log(`📈 平均耗時: ${report.summary.averageTime}ms`);
        console.log(`⬆️ 最長耗時: ${report.summary.maxTime}ms`);
        console.log(`⬇️ 最短耗時: ${report.summary.minTime}ms`);

        // 前N個最耗時資源
        console.log(`\n🔥 前${topN}個最耗時的資源:`);
        console.log('='.repeat(100));
        console.log('排名 | 耗時(ms) | 類型       | 狀態 | 檔案名稱                    | 完整URL');
        console.log('-----|---------|------------|------|----------------------------|----------');

        report.topResources.forEach(resource => {
            const status = resource.estimated ? '估算' : '實際';
            const fileName = resource.url.split('/').pop() || resource.url;
            const displayFileName = fileName.length > 28 ? fileName.substring(0, 25) + '...' : fileName;
            const displayUrl = resource.url;

            console.log(`${resource.rank.toString().padStart(2)}   | ${resource.duration.toString().padStart(7)} | ${resource.type.padEnd(10)} | ${status.padEnd(4)} | ${displayFileName.padEnd(28)} | ${displayUrl}`);
        });

        // 耗時分布分析
        console.log(`\n📈 耗時分布分析:`);
        const durations = report.topResources.map(r => r.duration);
        const ranges = [
            { label: '極快 (<200ms)', min: 0, max: 200 },
            { label: '快速 (200-500ms)', min: 200, max: 500 },
            { label: '普通 (500-1000ms)', min: 500, max: 1000 },
            { label: '緩慢 (1000-2000ms)', min: 1000, max: 2000 },
            { label: '很慢 (>2000ms)', min: 2000, max: Infinity }
        ];
        ranges.forEach(range => {
            const count = durations.filter(d => d >= range.min && d < range.max).length;
            const percentage = durations.length > 0 ? ((count / durations.length) * 100).toFixed(1) : '0.0';
            console.log(`${range.label.padEnd(20)}: ${count.toString().padStart(2)} 個 (${percentage}%)`);
        });

        // 資源類型統計
        console.log('\n📊 資源類型詳細統計:');
        console.log('='.repeat(80));
        console.log('資源類型   | 數量 | 總耗時(ms) | 平均(ms) | 最短(ms) | 最長(ms) | 數量占比 | 時間占比');
        console.log('-----------|------|------------|----------|----------|----------|----------|----------');

        // 按總耗時排序顯示
        const sortedTypes = Object.entries(report.typeStats)
            .filter(([type]) => type !== '_total')
            .sort(([,a], [,b]) => b.totalTime - a.totalTime);

        sortedTypes.forEach(([type, stats]) => {
            const estimatedNote = stats.estimatedCount > 0 ? '*' : ' ';
            console.log(
                `${(type + estimatedNote).padEnd(10)} | ${stats.count.toString().padStart(4)} | ${stats.totalTime.toString().padStart(10)} | ${stats.avgTime.toString().padStart(8)} | ${stats.minTime.toString().padStart(8)} | ${stats.maxTime.toString().padStart(8)} | ${(stats.percentage + '%').padStart(7)} | ${(stats.timePercentage + '%').padStart(8)}`
            );
        });

        // 總計行
        if (report.typeStats._total) {
            const total = report.typeStats._total;
            console.log('-'.repeat(80));
            console.log(
                `${'總計'.padEnd(10)} | ${total.count.toString().padStart(4)} | ${total.totalTime.toString().padStart(10)} | ${total.avgTime.toString().padStart(8)} | ${'-'.padStart(8)} | ${'-'.padStart(8)} | ${'100.0%'.padStart(7)} | ${'100.0%'.padStart(8)}`
            );
        }

        console.log('\n說明: * 表示該類型包含估算值');

        // 優化建議
        if (report.recommendations.length > 0) {
            console.log('\n💡 效能優化建議:');
            console.log('='.repeat(80));
            report.recommendations.forEach((rec, index) => {
                const priority = rec.priority === 'high' ? '🔴 高優先級' : rec.priority === 'medium' ? '🟡 中優先級' : '🟢 低優先級';
                console.log(`${index + 1}. ${priority} - ${rec.issue}`);
                console.log(`   問題詳情: ${rec.detail}`);
                console.log(`   建議措施: ${rec.suggestion}`);
                console.log('');
            });
        }

        // 效能評分
        console.log('\n⭐ 整體效能評分:');
        const avgTime = report.summary.averageTime;
        const actualTotalTime = report.summary.actualTotalTime;
        const requestCount = report.summary.completedRequests;

        let score = 100;
        let grade = '';
        let details = [];

        // 基於平均載入時間評分 (權重 40%)
        let avgScore = 100;
        if (avgTime > 2000) { avgScore = 30; details.push('平均載入時間過長(>2秒)'); }
        else if (avgTime > 1000) { avgScore = 50; details.push('平均載入時間較長(>1秒)'); }
        else if (avgTime > 600) { avgScore = 70; details.push('平均載入時間中等(>600ms)'); }
        else if (avgTime > 300) { avgScore = 85; details.push('平均載入時間良好(<600ms)'); }
        else { avgScore = 95; details.push('平均載入時間優秀(<300ms)'); }

        // 基於實際總載入時間評分 (權重 40%)
        let actualTotalScore = 100;
        if (actualTotalTime > 30000) { actualTotalScore = 30; details.push('實際總載入時間過長(>30秒)'); }
        else if (actualTotalTime > 15000) { actualTotalScore = 50; details.push('實際總載入時間較長(>15秒)'); }
        else if (actualTotalTime > 8000) { actualTotalScore = 70; details.push('實際總載入時間中等(>8秒)'); }
        else if (actualTotalTime > 3000) { actualTotalScore = 85; details.push('實際總載入時間良好(<8秒)'); }
        else { actualTotalScore = 95; details.push('實際總載入時間優秀(<3秒)'); }

        // 基於資源數量評分 (權重 15%)
        let countScore = 100;
        if (requestCount > 100) { countScore = 60; details.push('資源數量過多(>100個)'); }
        else if (requestCount > 50) { countScore = 75; details.push('資源數量較多(>50個)'); }
        else if (requestCount > 20) { countScore = 90; details.push('資源數量適中(<50個)'); }
        else { countScore = 95; details.push('資源數量良好(<20個)'); }

        // 基於估算比例評分 (權重 5%)
        let estimatedScore = 100;
        const estimatedRatio = report.summary.estimatedRequests / report.summary.completedRequests;
        if (estimatedRatio > 0.5) { estimatedScore = 60; details.push('估算數據過多'); }
        else if (estimatedRatio > 0.3) { estimatedScore = 80; details.push('部分數據為估算'); }
        else if (estimatedRatio > 0) { estimatedScore = 90; details.push('少量估算數據'); }
        else { estimatedScore = 100; details.push('數據完整準確'); }

        // 計算綜合評分
        score = Math.round(avgScore * 0.4 + actualTotalScore * 0.4 + countScore * 0.15 + estimatedScore * 0.05);

        if (score >= 90) { grade = 'A - 優秀'; }
        else if (score >= 80) { grade = 'B - 良好'; }
        else if (score >= 70) { grade = 'C - 需要改善'; }
        else if (score >= 60) { grade = 'D - 需要大幅改善'; }
        else { grade = 'F - 嚴重需要優化'; }

        console.log(`綜合評分: ${score}/100 - ${grade}`);
        console.log('');
        console.log('評分詳細:');
        console.log(`  • 平均載入時間評分: ${avgScore}/100 (權重40%)`);
        console.log(`  • 實際總載入時間評分: ${actualTotalScore}/100 (權重40%)`);
        console.log(`  • 資源數量評分: ${countScore}/100 (權重15%)`);
        console.log(`  • 數據完整性評分: ${estimatedScore}/100 (權重5%)`);
        console.log('');
        console.log('效能表現:');
        details.forEach(detail => {
            console.log(`  • ${detail}`);
        });
    }

    /**
     * 載入並分析檔案
     * @param {string} filePath - 檔案路徑
     * @param {Object} options - 分析選項
     */
    async analyzeFile(filePath, options = {}) {
        // 合併選項
        this.options = { ...this.options, ...options };

        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const ext = path.extname(filePath).toLowerCase();

            console.log(`🔍 開始分析檔案: ${filePath}`);
            console.log(`📄 檔案格式: ${ext}`);
            console.log(`📏 檔案大小: ${(fileContent.length / 1024).toFixed(1)} KB`);

            if (ext === '.json') {
                try {
                    const jsonData = JSON.parse(fileContent);
                    console.log(`📊 JSON資料類型: ${Array.isArray(jsonData) ? `陣列 (${jsonData.length} 個項目)` : '物件'}`);
                    this.parseJsonLog(jsonData);
                } catch (parseError) {
                    console.error('JSON解析錯誤:', parseError.message);
                    console.log('嘗試當作文字日誌處理...');
                    this.parseTextLog(fileContent);
                }
            } else if (ext === '.csv') {
                // 處理CSV檔案
                const csvData = this.parseCsvContent(fileContent);
                console.log(`📊 CSV資料: ${csvData.length} 行資料`);
                this.parseCsvLog(csvData);
            } else {
                // 當作文字日誌處理
                const lines = fileContent.split('\n').filter(line => line.trim());
                console.log(`📝 文字行數: ${lines.length}`);
                this.parseTextLog(fileContent);
            }

            this.logProgress(`\n🎯 解析結果:`);
            this.logProgress(`- 發現 ${this.urlRequests.size} 個不重複 URL`);
            this.logProgress(`- 預處理完成的請求: ${this.completedRequests.length} 個`);

            this.printReport();
            
            // 產生 txt 輸出
            if (this.options.outputTxt) {
                const resultDir = 'performance-analyze-result';
                const report = this.generateReport();
                const baseName = path.basename(filePath, path.extname(filePath));
                const outputPath = path.join(path.dirname(filePath), `result-${baseName}.txt`);
                this.saveReportToTxt(report, `${resultDir}/result-${baseName}.txt`);
            }
            
            return this.generateReport();
        } catch (error) {
            console.error('分析檔案時發生錯誤:', error.message);
            console.error('錯誤堆疊:', error.stack);
            throw error;
        }
    }

}

// 使用範例
if (require.main === module) {
    // 從命令列參數取得檔案路徑和選項
    const args = process.argv.slice(2);
    const filePaths = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

    if (filePaths.length === 0) {
        console.log('使用方法: node performance-analyzer-new.js <log-file-path> [選項]');
        console.log('支援格式: .json, .csv, .txt, .log');
        console.log('');
        console.log('選項:');
        console.log('  --verbose, -v           顯示詳細處理日誌');
        console.log('  --matching, -m          顯示配對過程詳細信息');
        console.log('  --debug-timestamp, -dt  顯示時間戳解析調試信息');
        console.log('  --quiet, -q             靜默模式，只顯示最終結果');
        console.log('  --no-progress           不顯示進度信息');
        console.log('  --no-txt                不產生txt輸出檔案');
        console.log('');
        console.log('範例:');
        console.log('  node performance-analyzer-new.js log.json');
        console.log('  node performance-analyzer-new.js log.json --verbose');
        console.log('');
        console.log('修改版特性:');
        console.log('- ✅ 自動產生 txt 格式分析報告 (檔名: result-原檔名.txt)');
        console.log('- ✅ 移除累積載入時間分析');
        console.log('- ✅ 移除並行載入效益分析');
        console.log('- ✅ 移除API重複載入分析');
        console.log('- ✅ 保留核心效能分析功能');
        process.exit(1);
    }

    if (filePaths.length > 1) {
        console.error('❌ 此版本不支援多檔案分析，請一次分析一個檔案');
        process.exit(1);
    }

    // 解析命令行選項
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        showMatching: args.includes('--matching') || args.includes('-m'),
        debugTimestamp: args.includes('--debug-timestamp') || args.includes('-dt'),
        showProgress: !args.includes('--no-progress'),
        outputTxt: !args.includes('--no-txt')
    };

    // 靜默模式
    if (args.includes('--quiet') || args.includes('-q')) {
        options.verbose = false;
        options.showMatching = false;
        options.debugTimestamp = false;
        options.showProgress = false;
    }

    const analyzer = new PerformanceAnalyzer(options);

    console.log('🔧 分析選項:');
    console.log(`   詳細日誌: ${options.verbose ? '開啟' : '關閉'}`);
    console.log(`   配對過程: ${options.showMatching ? '顯示' : '隱藏'}`);
    console.log(`   時間戳調試: ${options.debugTimestamp ? '開啟' : '關閉'}`);
    console.log(`   進度信息: ${options.showProgress ? '顯示' : '隱藏'}`);
    console.log(`   txt輸出: ${options.outputTxt ? '開啟' : '關閉'}`);
    console.log('');

    analyzer.analyzeFile(filePaths[0], options).catch(error => {
        console.error('分析失敗:', error.message);
        process.exit(1);
    });
}

module.exports = PerformanceAnalyzer;