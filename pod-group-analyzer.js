const fs = require('fs');
const { parse } = require('csv-parse');

// 轉換為台灣時區並格式化時間
function convertToTaiwanTime(timestamp) {
    if (!timestamp) return null;

    try {
        // 移除引號並解析時間
        const cleanTimestamp = timestamp.replace(/'/g, '');

        // 解析 UTC 時間
        const utcDate = new Date(cleanTimestamp);

        // 檢查日期是否有效
        if (isNaN(utcDate.getTime())) {
            throw new Error('無效的日期格式');
        }

        // 台灣時區是 UTC+8，所以加上 8 小時的毫秒數
        const taiwanTimestamp = utcDate.getTime() + (8 * 60 * 60 * 1000);
        const taiwanDate = new Date(taiwanTimestamp);

        // 格式化為 YYYY-MM-DD HH:mm:ss.SSS
        const year = taiwanDate.getUTCFullYear();
        const month = String(taiwanDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(taiwanDate.getUTCDate()).padStart(2, '0');
        const hours = String(taiwanDate.getUTCHours()).padStart(2, '0');
        const minutes = String(taiwanDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(taiwanDate.getUTCSeconds()).padStart(2, '0');
        const milliseconds = String(taiwanDate.getUTCMilliseconds()).padStart(3, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;

    } catch (error) {
        console.warn('時間轉換錯誤:', timestamp, error.message);
        return null;
    }
}

// 取得小時標籤 (用於統計)
function getHourLabel(timestamp) {
    if (!timestamp) return null;

    try {
        const cleanTimestamp = timestamp.replace(/'/g, '');
        const utcDate = new Date(cleanTimestamp);

        if (isNaN(utcDate.getTime())) {
            return null;
        }

        // 台灣時區是 UTC+8，所以加上 8 小時的毫秒數
        const taiwanTimestamp = utcDate.getTime() + (8 * 60 * 60 * 1000);
        const taiwanDate = new Date(taiwanTimestamp);

        // 格式化為 YYYY-MM-DD HH:00
        const year = taiwanDate.getUTCFullYear();
        const month = String(taiwanDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(taiwanDate.getUTCDate()).padStart(2, '0');
        const hours = String(taiwanDate.getUTCHours()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:00`;
    } catch (error) {
        return null;
    }
}

// 取得分鐘標籤 (用於每分鐘統計)
function getMinuteLabel(timestamp) {
    if (!timestamp) return null;

    try {
        const cleanTimestamp = timestamp.replace(/'/g, '');
        const utcDate = new Date(cleanTimestamp);

        if (isNaN(utcDate.getTime())) {
            return null;
        }

        // 台灣時區是 UTC+8，所以加上 8 小時的毫秒數
        const taiwanTimestamp = utcDate.getTime() + (8 * 60 * 60 * 1000);
        const taiwanDate = new Date(taiwanTimestamp);

        // 格式化為 YYYY-MM-DD HH:mm
        const year = taiwanDate.getUTCFullYear();
        const month = String(taiwanDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(taiwanDate.getUTCDate()).padStart(2, '0');
        const hours = String(taiwanDate.getUTCHours()).padStart(2, '0');
        const minutes = String(taiwanDate.getUTCMinutes()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (error) {
        return null;
    }
}

// 取得秒標籤 (用於每秒統計)
function getSecondLabel(timestamp) {
    if (!timestamp) return null;

    try {
        const cleanTimestamp = timestamp.replace(/'/g, '');
        const utcDate = new Date(cleanTimestamp);

        if (isNaN(utcDate.getTime())) {
            return null;
        }

        // 台灣時區是 UTC+8，所以加上 8 小時的毫秒數
        const taiwanTimestamp = utcDate.getTime() + (8 * 60 * 60 * 1000);
        const taiwanDate = new Date(taiwanTimestamp);

        // 格式化為 YYYY-MM-DD HH:mm:ss
        const year = taiwanDate.getUTCFullYear();
        const month = String(taiwanDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(taiwanDate.getUTCDate()).padStart(2, '0');
        const hours = String(taiwanDate.getUTCHours()).padStart(2, '0');
        const minutes = String(taiwanDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(taiwanDate.getUTCSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        return null;
    }
}

// 清理 pod name (移除引號)
function cleanPodName(podName) {
    if (!podName) return 'unknown';
    return podName.replace(/'/g, '');
}

// 計算百分位數 (Percentile)
function calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;

    const index = (percentile / 100) * (sortedArray.length - 1);

    if (Number.isInteger(index)) {
        return sortedArray[index];
    } else {
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }
}

// 分析 textPayload 格式並提取資料
function analyzeTextPayload(textPayload) {
    if (!textPayload) return { type: 'unknown' };

    // 格式1: 包含 "got 200 in XXXms" 的完成請求
    const type1Match = textPayload.match(/got\s+\d+\s+in\s+(\d+)ms\s+for\s+(.+?)(?:\s+\[|$)/);
    if (type1Match) {
        const reqIdMatch = textPayload.match(/\[reqId:\s*([^\]]+)\]/);
        return {
            type: 'completion',
            renderTime: parseInt(type1Match[1]),
            url: type1Match[2].trim(),
            reqId: reqIdMatch ? reqIdMatch[1].trim() : null
        };
    }

    // 格式2: 包含 "getting!!!" 的開始請求
    const type2Match = textPayload.match(/getting!!!\s+(.+)/);
    if (type2Match) {
        return {
            type: 'getting_request',
            url: type2Match[1].trim()
        };
    }

    // 格式3: 包含 X-Original-User-Agent 的請求
    const type3Match = textPayload.match(/X-Original-User-Agent:\s*(.+?)(?:\s+https|$)/);
    if (type3Match) {
        const reqIdMatch = textPayload.match(/\[reqId:\s*([^\]]+)\]/);
        return {
            type: 'user_agent',
            userAgent: type3Match[1].trim(),
            reqId: reqIdMatch ? reqIdMatch[1].trim() : null
        };
    }

    return { type: 'unknown' };
}

// 分析 User-Agent 字符串，提取瀏覽器和操作系統信息
function parseUserAgent(userAgent) {
    if (!userAgent) return { browser: 'Unknown', os: 'Unknown', full: userAgent };

    // 提取瀏覽器信息
    let browser = 'Unknown';
    if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
        const chromeMatch = userAgent.match(/Chrome\/([0-9.]+)/);
        browser = chromeMatch ? `Chrome ${chromeMatch[1]}` : 'Chrome';
    } else if (userAgent.includes('Firefox/')) {
        const firefoxMatch = userAgent.match(/Firefox\/([0-9.]+)/);
        browser = firefoxMatch ? `Firefox ${firefoxMatch[1]}` : 'Firefox';
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
        const safariMatch = userAgent.match(/Version\/([0-9.]+).*Safari/);
        browser = safariMatch ? `Safari ${safariMatch[1]}` : 'Safari';
    } else if (userAgent.includes('Edg/')) {
        const edgeMatch = userAgent.match(/Edg\/([0-9.]+)/);
        browser = edgeMatch ? `Edge ${edgeMatch[1]}` : 'Edge';
    } else if (userAgent.includes('StatusCake')) {
        browser = 'StatusCake Bot';
    }

    // 提取操作系統信息
    let os = 'Unknown';
    if (userAgent.includes('Windows NT 10.0')) {
        os = 'Windows 10/11';
    } else if (userAgent.includes('Windows NT 6.1')) {
        os = 'Windows 7';
    } else if (userAgent.includes('Windows NT')) {
        os = 'Windows';
    } else if (userAgent.includes('Mac OS X')) {
        const macMatch = userAgent.match(/Mac OS X ([0-9_]+)/);
        os = macMatch ? `macOS ${macMatch[1].replace(/_/g, '.')}` : 'macOS';
    } else if (userAgent.includes('Linux')) {
        os = 'Linux';
    } else if (userAgent.includes('Android')) {
        const androidMatch = userAgent.match(/Android ([0-9.]+)/);
        os = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    } else if (userAgent.includes('iPhone')) {
        os = 'iOS (iPhone)';
    } else if (userAgent.includes('iPad')) {
        os = 'iOS (iPad)';
    }

    return { browser, os, full: userAgent };
}

// 分析 User-Agent 統計 (新增平均render時間)
function analyzeUserAgents(userAgentData, userAgentHourlyData, userAgentRenderTimes) {
    // 1. 整體 User-Agent 統計
    const totalStats = Object.entries(userAgentData)
        .map(([userAgent, count]) => {
            const parsed = parseUserAgent(userAgent);

            // 計算該 User-Agent 的平均 render 時間
            const renderTimes = userAgentRenderTimes[userAgent] || [];
            const avgRenderTime = renderTimes.length > 0
                ? renderTimes.reduce((sum, time) => sum + time, 0) / renderTimes.length
                : 0;
            const maxRenderTime = renderTimes.length > 0 ? Math.max(...renderTimes) : 0;
            const minRenderTime = renderTimes.length > 0 ? Math.min(...renderTimes) : 0;

            return {
                userAgent: userAgent,
                count: count,
                browser: parsed.browser,
                os: parsed.os,
                percentage: 0, // 稍後計算
                avgRenderTime: Math.round(avgRenderTime * 100) / 100,
                maxRenderTime: maxRenderTime,
                minRenderTime: minRenderTime,
                renderTimeCount: renderTimes.length
            };
        })
        .sort((a, b) => b.count - a.count);

    const totalRequests = totalStats.reduce((sum, item) => sum + item.count, 0);
    totalStats.forEach(item => {
        item.percentage = Math.round((item.count / totalRequests) * 10000) / 100;
    });

    // 2. 瀏覽器統計
    const browserStats = {};
    const osStats = {};

    totalStats.forEach(item => {
        // 瀏覽器統計
        if (!browserStats[item.browser]) {
            browserStats[item.browser] = 0;
        }
        browserStats[item.browser] += item.count;

        // 操作系統統計
        if (!osStats[item.os]) {
            osStats[item.os] = 0;
        }
        osStats[item.os] += item.count;
    });

    const sortedBrowserStats = Object.entries(browserStats)
        .map(([browser, count]) => ({
            browser,
            count,
            percentage: Math.round((count / totalRequests) * 10000) / 100
        }))
        .sort((a, b) => b.count - a.count);

    const sortedOsStats = Object.entries(osStats)
        .map(([os, count]) => ({
            os,
            count,
            percentage: Math.round((count / totalRequests) * 10000) / 100
        }))
        .sort((a, b) => b.count - a.count);

    // 3. 每小時最常訪問的 User-Agent
    const hourlyTopUserAgents = {};
    Object.entries(userAgentHourlyData).forEach(([hour, agents]) => {
        const sortedAgents = Object.entries(agents)
            .map(([userAgent, count]) => ({ userAgent, count }))
            .sort((a, b) => b.count - a.count);

        hourlyTopUserAgents[hour] = {
            top: sortedAgents[0] || { userAgent: 'N/A', count: 0 },
            totalRequests: sortedAgents.reduce((sum, item) => sum + item.count, 0),
            uniqueAgents: sortedAgents.length
        };
    });

    return {
        overall_stats: {
            total_requests: totalRequests,
            unique_user_agents: totalStats.length
        },
        user_agent_ranking: totalStats,
        browser_stats: sortedBrowserStats,
        os_stats: sortedOsStats,
        hourly_top_user_agents: hourlyTopUserAgents
    };
}

// 分析慢渲染時段的同時同分統計
function analyzeSlowRenderHourMinute(slowRenderPeriods) {
    // 統計每個時分的慢渲染出現次數
    const timeCount = {};

    slowRenderPeriods.forEach(period => {
        // 優先使用 userAgent 時間，如果沒有則使用 got 200 時間
        let timestampToUse = period.userAgentTimestamp;
        if (!timestampToUse) {
            timestampToUse = period.timestamp;
        }
        
        if (timestampToUse) {
            // 處理時間戳記格式 - 支持兩種格式
            let timePart = null;
            
            if (timestampToUse.includes(' ')) {
                // 格式: "2025-12-16 10:00:00.000"
                timePart = timestampToUse.split(' ')[1]?.substring(0, 5); // 取得 HH:MM
            } else if (timestampToUse.includes('T')) {
                // 格式: "2025-12-15T16:00:04.480Z" (ISO格式)
                const date = new Date(timestampToUse);
                // 轉換為台灣時區
                const taiwanTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
                const hours = taiwanTime.getUTCHours().toString().padStart(2, '0');
                const minutes = taiwanTime.getUTCMinutes().toString().padStart(2, '0');
                timePart = `${hours}:${minutes}`;
            }
            
            if (timePart) {
                timeCount[timePart] = (timeCount[timePart] || 0) + 1;
            }
        }
    });

    // 轉換為陣列並按時間排序
    const sortedTimes = Object.entries(timeCount)
        .map(([time, count]) => ({ time, count }))
        .sort((a, b) => a.time.localeCompare(b.time));

    // 找出出現次數最多的時分
    const maxCount = sortedTimes.length > 0 ? Math.max(...sortedTimes.map(item => item.count)) : 0;
    const mostFrequent = sortedTimes.filter(item => item.count === maxCount);

    // 找出出現次數大於1的時分（重複時分）
    const duplicateTimes = sortedTimes.filter(item => item.count > 1);

    return {
        all_hour_minute_stats: sortedTimes,
        duplicate_hour_minute_stats: duplicateTimes,
        summary: {
            total_unique_hour_minutes: sortedTimes.length,
            total_records: sortedTimes.reduce((sum, item) => sum + item.count, 0),
            most_frequent_times: mostFrequent,
            max_frequency: maxCount,
            duplicate_count: duplicateTimes.length
        }
    };
}

// 計算每分鐘統計資料
function calculatePerMinuteStats(minutelyData) {
    const values = Object.values(minutelyData);

    if (values.length === 0) {
        return {
            max: 0,
            min: 0,
            average: 0,
            total: 0,
            top15: []
        };
    }

    const max = Math.max(...values);
    const min = Math.min(...values);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const average = sum / values.length;

    // 取得前15名分鐘（按request數量排序）
    const sortedMinutes = Object.entries(minutelyData)
        .map(([minute, count]) => ({ minute, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

    return {
        max: max,
        min: min,
        average: Math.round(average * 100) / 100,
        total: values.length,
        top15: sortedMinutes
    };
}

// 計算每秒統計資料
function calculatePerSecondStats(secondlyData) {
    const values = Object.values(secondlyData);

    if (values.length === 0) {
        return {
            max: 0,
            min: 0,
            average: 0,
            total: 0,
            top10: [],
            maxSecond: null
        };
    }

    const max = Math.max(...values);
    const min = Math.min(...values);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const average = sum / values.length;

    // 取得前10名秒數（按request數量排序）
    const sortedSeconds = Object.entries(secondlyData)
        .map(([second, count]) => ({ second, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // 找出最高請求數的秒
    const maxSecond = sortedSeconds.length > 0 ? sortedSeconds[0] : null;

    return {
        max: max,
        min: min,
        average: Math.round(average * 100) / 100,
        total: values.length,
        top10: sortedSeconds,
        maxSecond: maxSecond
    };
}

// 讀取單個 CSV 檔案
async function readCsvFile(filePath) {
    console.log(`📖 開始讀取檔案: ${filePath}`);

    const records = [];

    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            console.error(`❌ 找不到檔案: ${filePath}`);
            reject(new Error(`找不到檔案: ${filePath}`));
            return;
        }

        fs.createReadStream(filePath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true,
                trim: true
            }))
            .on('data', (row) => {
                records.push(row);
            })
            .on('end', () => {
                console.log(`✅ 檔案讀取完成: ${filePath} (共 ${records.length} 筆記錄)`);
                resolve(records);
            })
            .on('error', (error) => {
                console.error(`❌ 讀取檔案錯誤: ${filePath}`, error);
                reject(error);
            });
    });
}

// 根據 pod_name 分群資料
function groupRecordsByPodName(records, recordType) {
    console.log(`🔍 開始依 pod_name 分群 ${recordType} 資料...`);

    const podGroups = {};
    let unknownPodCount = 0;

    records.forEach(record => {
        const podName = cleanPodName(record['resource.labels.pod_name']);

        if (!podName || podName === 'unknown') {
            unknownPodCount++;
            return;
        }

        if (!podGroups[podName]) {
            podGroups[podName] = [];
        }

        podGroups[podName].push(record);
    });

    const podNames = Object.keys(podGroups);
    console.log(`✅ ${recordType} 分群完成: 共找到 ${podNames.length} 個不同的 pod`);
    console.log(`⚠️  ${recordType} 無效 pod name 記錄: ${unknownPodCount} 筆`);

    // 顯示每個 pod 的記錄數量
    podNames.forEach(podName => {
        console.log(`   ${podName}: ${podGroups[podName].length} 筆 ${recordType} 記錄`);
    });

    return podGroups;
}

// 分析單個 pod 的資料
function analyzeSinglePod(userAgentRecords, renderTimeRecords, podName) {
    console.log(`\n📊 開始分析 Pod: ${podName}`);
    console.log(`   User-Agent 記錄: ${userAgentRecords.length} 筆`);
    console.log(`   Render Time 記錄: ${renderTimeRecords.length} 筆`);

    // 初始化資料結構
    const renderTimes = [];
    const slowRenderPeriods = [];

    // User-Agent 相關資料結構
    const userAgentHourlyRequestData = {};
    const userAgentMinutelyRequestData = {};
    const userAgentSecondlyRequestData = {};
    const userAgentData = {};
    const userAgentHourlyData = {};

    // reqId 關聯資料結構
    const reqIdToUserAgent = new Map();
    const reqIdToUserAgentTimestamp = new Map(); // 新增：儲存 userAgent 的時間戳記
    const userAgentRenderTimes = {};

    // URL 分析相關資料結構
    const urlRenderTimes = new Map();
    const allRenderRecords = [];

    // 處理 User-Agent 記錄
    let userAgentProcessedCount = 0;
    userAgentRecords.forEach(row => {
        const textPayload = row.textPayload || '';
        const payloadInfo = analyzeTextPayload(textPayload);

        if (payloadInfo.type === 'user_agent') {
            const userAgent = payloadInfo.userAgent;
            const reqId = payloadInfo.reqId;
            const hourLabel = getHourLabel(row.timestamp);
            const minuteLabel = getMinuteLabel(row.timestamp);
            const secondLabel = getSecondLabel(row.timestamp);

            // 建立 reqId 到 userAgent 的映射
            if (reqId && userAgent) {
                reqIdToUserAgent.set(reqId, userAgent);
                // 同時保存 userAgent 的時間戳記
                const userAgentTimestamp = convertToTaiwanTime(row.timestamp);
                if (userAgentTimestamp) {
                    reqIdToUserAgentTimestamp.set(reqId, userAgentTimestamp);
                }
            }

            // 統計每小時資料筆數
            if (hourLabel) {
                if (!userAgentHourlyRequestData[hourLabel]) {
                    userAgentHourlyRequestData[hourLabel] = 0;
                }
                userAgentHourlyRequestData[hourLabel]++;
            }

            // 統計每分鐘資料筆數
            if (minuteLabel) {
                if (!userAgentMinutelyRequestData[minuteLabel]) {
                    userAgentMinutelyRequestData[minuteLabel] = 0;
                }
                userAgentMinutelyRequestData[minuteLabel]++;
            }

            // 統計每秒資料筆數
            if (secondLabel) {
                if (!userAgentSecondlyRequestData[secondLabel]) {
                    userAgentSecondlyRequestData[secondLabel] = 0;
                }
                userAgentSecondlyRequestData[secondLabel]++;
            }

            // 統計整體 User-Agent 數量
            if (!userAgentData[userAgent]) {
                userAgentData[userAgent] = 0;
            }
            userAgentData[userAgent]++;

            // 統計每小時的 User-Agent 數量
            if (hourLabel) {
                if (!userAgentHourlyData[hourLabel]) {
                    userAgentHourlyData[hourLabel] = {};
                }
                if (!userAgentHourlyData[hourLabel][userAgent]) {
                    userAgentHourlyData[hourLabel][userAgent] = 0;
                }
                userAgentHourlyData[hourLabel][userAgent]++;
            }

            userAgentProcessedCount++;
        }
    });

    // 處理 Render Time 記錄
    let renderTimeProcessedCount = 0;
    let reqIdMatchedCount = 0;
    renderTimeRecords.forEach(row => {
        const textPayload = row.textPayload || '';
        const payloadInfo = analyzeTextPayload(textPayload);
        const taiwanTimestamp = convertToTaiwanTime(row.timestamp);

        if (payloadInfo.type === 'completion') {
            const url = payloadInfo.url;
            const renderTime = payloadInfo.renderTime;
            const reqId = payloadInfo.reqId;

            // 通過 reqId 查找對應的 userAgent 和時間戳記
            let matchedUserAgent = null;
            let userAgentTimestamp = null;
            if (reqId && reqIdToUserAgent.has(reqId)) {
                matchedUserAgent = reqIdToUserAgent.get(reqId);
                userAgentTimestamp = reqIdToUserAgentTimestamp.get(reqId);
                reqIdMatchedCount++;

                // 記錄該 userAgent 的 render 時間
                if (!userAgentRenderTimes[matchedUserAgent]) {
                    userAgentRenderTimes[matchedUserAgent] = [];
                }
                userAgentRenderTimes[matchedUserAgent].push(renderTime);
            }

            renderTimes.push({
                time: renderTime,
                timestamp: taiwanTimestamp,
                url: url,
                reqId: reqId,
                userAgent: matchedUserAgent
            });

            // 記錄大於 8000ms 的時段
            if (renderTime > 8000) {
                slowRenderPeriods.push({
                    renderTime: renderTime,
                    timestamp: taiwanTimestamp, // got 200 時間
                    userAgentTimestamp: userAgentTimestamp, // userAgent 時間
                    url: url,
                    textPayload: textPayload,
                    reqId: reqId,
                    userAgent: matchedUserAgent
                });
            }

            // 記錄 URL 相關資料
            allRenderRecords.push({
                url: url,
                renderTime: renderTime,
                timestamp: taiwanTimestamp,
                textPayload: textPayload,
                reqId: reqId,
                userAgent: matchedUserAgent
            });

            // 記錄到 urlRenderTimes Map
            if (!urlRenderTimes.has(url)) {
                urlRenderTimes.set(url, []);
            }
            urlRenderTimes.get(url).push({
                renderTime: renderTime,
                timestamp: taiwanTimestamp,
                userAgent: matchedUserAgent
            });

            renderTimeProcessedCount++;
        }
    });

    // 計算統計結果
    const renderTimeValues = renderTimes.map(item => item.time);
    const renderTimeStats = calculateRenderTimeStats(renderTimeValues);

    // 計算每小時資料筆數的平均值
    const hourlyValues = Object.values(userAgentHourlyRequestData);
    const avgPerHour = hourlyValues.length > 0 ?
        hourlyValues.reduce((sum, val) => sum + val, 0) / hourlyValues.length : 0;

    // 計算每分鐘統計資料
    const perMinuteStats = calculatePerMinuteStats(userAgentMinutelyRequestData);

    // 計算每秒統計資料
    const perSecondStats = calculatePerSecondStats(userAgentSecondlyRequestData);

    // 慢渲染時段的同時同分統計
    const slowRenderHourMinuteStats = analyzeSlowRenderHourMinute(slowRenderPeriods);

    // 分析 URL 相關統計
    const urlAnalysis = analyzeUrls(urlRenderTimes, allRenderRecords);

    // 分析 User-Agent 統計
    let userAgentAnalysis = null;
    if (Object.keys(userAgentData).length > 0) {
        userAgentAnalysis = analyzeUserAgents(userAgentData, userAgentHourlyData, userAgentRenderTimes);
    }

    console.log(`✅ Pod ${podName} 分析完成`);
    console.log(`   有效 User-Agent 記錄: ${userAgentProcessedCount} 筆`);
    console.log(`   有效 Render Time 記錄: ${renderTimeProcessedCount} 筆`);
    console.log(`   reqId 匹配成功: ${reqIdMatchedCount} 筆`);

    return {
        podName: podName,
        renderTimeStats: renderTimeStats,
        slowRenderPeriods: slowRenderPeriods,
        requestHourlyData: userAgentHourlyRequestData,
        avgRequestPerHour: Math.round(avgPerHour * 100) / 100,
        requestMinutelyData: userAgentMinutelyRequestData,
        requestPerMinuteStats: perMinuteStats,
        requestSecondlyData: userAgentSecondlyRequestData,
        requestPerSecondStats: perSecondStats,
        slowRenderHourMinuteStats: slowRenderHourMinuteStats,
        urlAnalysis: urlAnalysis,
        userAgentAnalysis: userAgentAnalysis,
        reqIdMappingStats: {
            totalReqIds: reqIdToUserAgent.size,
            matchedRenderRecords: reqIdMatchedCount,
            totalRenderRecords: renderTimeProcessedCount,
            matchingRate: renderTimeProcessedCount > 0 ?
                Math.round((reqIdMatchedCount / renderTimeProcessedCount) * 10000) / 100 : 0
        },
        dataSourceStats: {
            originalUserAgentRecords: userAgentRecords.length,
            originalRenderTimeRecords: renderTimeRecords.length,
            processedUserAgentRecords: userAgentProcessedCount,
            processedRenderTimeRecords: renderTimeProcessedCount
        }
    };
}

// 分析 URL 統計 (增強版，包含 User-Agent 資訊)
function analyzeUrls(urlRenderTimes, allRenderRecords) {
    // 1. 分析重複的 URL
    const duplicateUrls = [];
    const urlStats = [];

    urlRenderTimes.forEach((times, url) => {
        const count = times.length;
        const renderTimes = times.map(t => t.renderTime);
        const avgRenderTime = renderTimes.reduce((sum, t) => sum + t, 0) / count;
        const maxRenderTime = Math.max(...renderTimes);
        const minRenderTime = Math.min(...renderTimes);

        const stat = {
            url: url,
            count: count,
            avgRenderTime: Math.round(avgRenderTime * 100) / 100,
            maxRenderTime: maxRenderTime,
            minRenderTime: minRenderTime,
            allRenderTimes: renderTimes.sort((a, b) => b - a) // 降序排列
        };

        urlStats.push(stat);

        if (count > 1) {
            duplicateUrls.push(stat);
        }
    });

    // 按出現次數排序重複的 URL
    duplicateUrls.sort((a, b) => b.count - a.count);

    // 2. 找出 render 時間前 15 名的記錄
    const top15RenderTimes = allRenderRecords
        .sort((a, b) => b.renderTime - a.renderTime)
        .slice(0, 15)
        .map(record => ({
            renderTime: record.renderTime,
            url: record.url,
            timestamp: record.timestamp,
            reqId: record.reqId,
            userAgent: record.userAgent || 'No User-Agent Matched',
            userAgentStatus: record.userAgent ? 'Matched' : 'No Match'
        }));

    // 3. 統計總體資訊
    const totalUrls = urlRenderTimes.size;
    const duplicateUrlCount = duplicateUrls.length;
    const totalRequests = allRenderRecords.length;

    return {
        overall_stats: {
            total_requests: totalRequests,
            unique_urls: totalUrls,
            duplicate_urls: duplicateUrlCount,
            duplicate_rate: totalUrls > 0 ? `${Math.round((duplicateUrlCount / totalUrls) * 10000) / 100}%` : '0%'
        },
        duplicate_url_details: duplicateUrls,
        top_15_render_times: top15RenderTimes,
        all_url_stats: urlStats.sort((a, b) => b.maxRenderTime - a.maxRenderTime)
    };
}

// 計算 render time 統計 (含PR98/PR99)
function calculateRenderTimeStats(inputData) {
    // 1. 自動檢測資料格式並提取數值
    let renderTimes;

    if (inputData.length === 0) {
        return {
            average: 0,
            min: 0,
            max: 0,
            median: 0,
            pr90: 0,
            pr95: 0,
            pr98: 0,
            pr99: 0,
            countAbove8000to20000: 0,
            countAbove20000to45000: 0,
            countAbove45000: 0,
            total: 0
        };
    }

    // 檢查是否為物件陣列
    if (typeof inputData[0] === 'object' && inputData[0] !== null && 'time' in inputData[0]) {
        renderTimes = inputData.map(item => item.time);
    } else {
        renderTimes = inputData;
    }

    // 2. 過濾並驗證有效數值
    const validTimes = renderTimes.filter(time => {
        return typeof time === 'number' &&
            !isNaN(time) &&
            isFinite(time) &&
            time >= 0;
    });

    if (validTimes.length === 0) {
        return {
            average: 0,
            min: 0,
            max: 0,
            median: 0,
            pr90: 0,
            pr95: 0,
            pr98: 0,
            pr99: 0,
            countAbove8000to20000: 0,
            countAbove20000to45000: 0,
            countAbove45000: 0,
            total: 0
        };
    }

    // 3. 排序資料用於計算百分位數
    const sortedTimes = [...validTimes].sort((a, b) => a - b);

    // 4. 基本統計計算
    const sum = validTimes.reduce((acc, time) => acc + time, 0);
    const average = sum / validTimes.length;
    const min = sortedTimes[0];
    const max = sortedTimes[sortedTimes.length - 1];
    const countAbove8000to20000 = validTimes.filter(time => time > 8000 && time <= 20000).length;
    const countAbove20000to45000 = validTimes.filter(time => time > 20000 && time < 45000).length;
    const countAbove45000 = validTimes.filter(time => time > 45000).length;

    // 5. 計算各種百分位數
    const median = calculatePercentile(sortedTimes, 50);
    const pr90 = calculatePercentile(sortedTimes, 90);
    const pr95 = calculatePercentile(sortedTimes, 95);
    const pr98 = calculatePercentile(sortedTimes, 98);
    const pr99 = calculatePercentile(sortedTimes, 99);

    return {
        average: Math.round(average * 100) / 100,
        min: min,
        max: max,
        median: Math.round(median * 100) / 100,
        pr90: Math.round(pr90 * 100) / 100,
        pr95: Math.round(pr95 * 100) / 100,
        pr98: Math.round(pr98 * 100) / 100,
        pr99: Math.round(pr99 * 100) / 100,
        countAbove8000to20000: countAbove8000to20000,
        countAbove20000to45000: countAbove20000to45000,
        countAbove45000: countAbove45000,
        total: validTimes.length,
        originalTotal: renderTimes.length,
        invalidCount: renderTimes.length - validTimes.length
    };
}

// 新增：分析跨 Pod 時間點分布
function analyzeTopMinutesAcrossPods(allPodResults) {
    console.log('\n🕐 分析跨 Pod 時間點分布...');

    // 1. 合併所有 Pod 的 minutely 資料計算整體 top 15
    const overallMinutelyData = {};

    allPodResults.forEach(podResult => {
        Object.entries(podResult.requestMinutelyData).forEach(([minute, count]) => {
            if (!overallMinutelyData[minute]) {
                overallMinutelyData[minute] = 0;
            }
            overallMinutelyData[minute] += count;
        });
    });

    // 2. 計算總請求數超過10次的繁忙分鐘
    const overallTop15Minutes = Object.entries(overallMinutelyData)
        .map(([minute, count]) => ({ minute, count }))
        .filter(item => item.count > 10) // 只選擇總請求數超過10次的時段
        .sort((a, b) => b.count - a.count);

    // 3. 對於每個繁忙分鐘，收集各 Pod 的數據
    const topMinutesBreakdown = overallTop15Minutes.map((topMinute, index) => {
        const podBreakdown = {};
        let totalCount = 0;

        // 收集每個 Pod 在這個時間點的請求數
        allPodResults.forEach(podResult => {
            const countForThisPod = podResult.requestMinutelyData[topMinute.minute] || 0;
            if (countForThisPod > 0) {
                podBreakdown[podResult.podName] = countForThisPod;
            }
            totalCount += countForThisPod;
        });

        // 計算各 Pod 的百分比
        const podBreakdownWithPercentage = Object.entries(podBreakdown)
            .map(([podName, count]) => ({
                podName,
                count,
                percentage: Math.round((count / totalCount) * 10000) / 100
            }))
            .sort((a, b) => b.count - a.count);

        return {
            rank: index + 1,
            minute: topMinute.minute,
            totalCount: totalCount,
            podCount: Object.keys(podBreakdown).length,
            podBreakdown: podBreakdownWithPercentage
        };
    });

    return {
        busyMinutes: overallTop15Minutes, // 改名更準確反映新邏輯
        busyMinutesBreakdown: topMinutesBreakdown
    };
}

// 計算跨 Pod 總體統計
function calculateOverallStats(allPodResults) {
    console.log('\n📊 計算跨 Pod 總體統計...');

    const overallStats = {
        totalPods: allPodResults.length,
        totalOriginalUserAgentRecords: 0,
        totalOriginalRenderTimeRecords: 0,
        totalProcessedUserAgentRecords: 0,
        totalProcessedRenderTimeRecords: 0,
        totalMatchedRecords: 0,
        avgMatchingRate: 0,
        renderTimeStats: {
            byPod: {}
        },
        slowRenderByPod: {},
        topUrlsByPod: {},
        topUserAgentsByPod: {}
    };

    // 收集所有 Pod 的資料
    allPodResults.forEach(podResult => {
        overallStats.totalOriginalUserAgentRecords += podResult.dataSourceStats.originalUserAgentRecords;
        overallStats.totalOriginalRenderTimeRecords += podResult.dataSourceStats.originalRenderTimeRecords;
        overallStats.totalProcessedUserAgentRecords += podResult.dataSourceStats.processedUserAgentRecords;
        overallStats.totalProcessedRenderTimeRecords += podResult.dataSourceStats.processedRenderTimeRecords;
        overallStats.totalMatchedRecords += podResult.reqIdMappingStats.matchedRenderRecords;

        // 收集 render times
        if (podResult.renderTimeStats.total > 0) {
            overallStats.renderTimeStats.byPod[podResult.podName] = podResult.renderTimeStats;
        }

        // 收集慢渲染資料
        if (podResult.slowRenderPeriods.length > 0) {
            overallStats.slowRenderByPod[podResult.podName] = podResult.slowRenderPeriods.length;
        }

        // 收集 URL 統計
        if (podResult.urlAnalysis && podResult.urlAnalysis.top_15_render_times.length > 0) {
            overallStats.topUrlsByPod[podResult.podName] = podResult.urlAnalysis.top_15_render_times.slice(0, 5);
        }

        // 收集 User-Agent 統計
        if (podResult.userAgentAnalysis && podResult.userAgentAnalysis.user_agent_ranking.length > 0) {
            overallStats.topUserAgentsByPod[podResult.podName] = podResult.userAgentAnalysis.user_agent_ranking.slice(0, 3);
        }
    });

    // 計算平均匹配率
    overallStats.avgMatchingRate = overallStats.totalProcessedRenderTimeRecords > 0 ?
        Math.round((overallStats.totalMatchedRecords / overallStats.totalProcessedRenderTimeRecords) * 10000) / 100 : 0;

    // 找出效能最佳和最差的 Pod
    const podPerformance = allPodResults
        .filter(pod => pod.renderTimeStats.total > 0)
        .map(pod => ({
            podName: pod.podName,
            avgRenderTime: pod.renderTimeStats.average,
            p95RenderTime: pod.renderTimeStats.pr95,
            totalRequests: pod.renderTimeStats.total,
            slowRenderCount: pod.slowRenderPeriods.length
        }))
        .sort((a, b) => a.avgRenderTime - b.avgRenderTime);

    overallStats.bestPerformingPod = podPerformance.length > 0 ? podPerformance[0] : null;
    overallStats.worstPerformingPod = podPerformance.length > 0 ? podPerformance[podPerformance.length - 1] : null;
    overallStats.podPerformanceRanking = podPerformance;

    // 新增：計算跨 Pod 時間點分析
    overallStats.topMinutesAnalysis = analyzeTopMinutesAcrossPods(allPodResults);

    return overallStats;
}

// 顯示 Pod 分析摘要
function displayPodSummary(podResult) {
    console.log(`\n📋 Pod: ${podResult.podName} 分析摘要:`);
    console.log(`   原始 User-Agent 記錄: ${podResult.dataSourceStats.originalUserAgentRecords}`);
    console.log(`   原始 Render Time 記錄: ${podResult.dataSourceStats.originalRenderTimeRecords}`);
    console.log(`   有效 User-Agent 記錄: ${podResult.dataSourceStats.processedUserAgentRecords}`);
    console.log(`   有效 Render Time 記錄: ${podResult.dataSourceStats.processedRenderTimeRecords}`);
    console.log(`   reqId 匹配率: ${podResult.reqIdMappingStats.matchingRate}%`);

    if (podResult.renderTimeStats.total > 0) {
        console.log(`   平均 Render Time: ${podResult.renderTimeStats.average}ms`);
        console.log(`   P95 Render Time: ${podResult.renderTimeStats.pr95}ms`);
        console.log(`   慢渲染數量 (>8s): ${podResult.slowRenderPeriods.length}`);
    }

    if (podResult.requestPerSecondStats.maxSecond) {
        console.log(`   一秒內最高請求數: ${podResult.requestPerSecondStats.maxSecond.count} 次 (${podResult.requestPerSecondStats.maxSecond.second})`);
    }

    if (podResult.urlAnalysis && podResult.urlAnalysis.overall_stats.unique_urls > 0) {
        console.log(`   不重複 URL 數: ${podResult.urlAnalysis.overall_stats.unique_urls}`);
        console.log(`   URL 重複率: ${podResult.urlAnalysis.overall_stats.duplicate_rate}`);
    }
}

// 顯示總體統計摘要
function displayOverallSummary(overallStats) {
    console.log('\n\n🌍 跨 Pod 總體統計摘要:');
    console.log('=' .repeat(50));
    console.log(`總 Pod 數量: ${overallStats.totalPods}`);
    console.log(`總原始 User-Agent 記錄: ${overallStats.totalOriginalUserAgentRecords}`);
    console.log(`總原始 Render Time 記錄: ${overallStats.totalOriginalRenderTimeRecords}`);
    console.log(`總有效 User-Agent 記錄: ${overallStats.totalProcessedUserAgentRecords}`);
    console.log(`總有效 Render Time 記錄: ${overallStats.totalProcessedRenderTimeRecords}`);
    console.log(`總 reqId 匹配記錄: ${overallStats.totalMatchedRecords}`);
    console.log(`平均 reqId 匹配率: ${overallStats.avgMatchingRate}%`);

    // 新增：顯示跨 Pod 時間點分析
    console.log('\n\n🕐 系統最繁忙時段 (總請求數 > 10) - 跨 Pod 分布分析:');
    console.log('=' .repeat(60));

    if (overallStats.topMinutesAnalysis && overallStats.topMinutesAnalysis.busyMinutesBreakdown) {
        overallStats.topMinutesAnalysis.busyMinutesBreakdown.slice(0, 10).forEach(minuteData => {
            console.log(`\n${minuteData.rank}. ${minuteData.minute} - 總請求: ${minuteData.totalCount} 次 (涉及 ${minuteData.podCount} 個 Pod)`);

            // 顯示前5個 Pod 的分布
            minuteData.podBreakdown.slice(0, 5).forEach((podData, podIndex) => {
                const indicator = podIndex === 0 ? '🔥' : podIndex === 1 ? '🌡️' : '   ';
                console.log(`   ${indicator} ${podData.podName}: ${podData.count} 次 (${podData.percentage}%)`);
            });

            if (minuteData.podBreakdown.length > 5) {
                const remainingCount = minuteData.podBreakdown.length - 5;
                const remainingTotal = minuteData.podBreakdown.slice(5).reduce((sum, pod) => sum + pod.count, 0);
                console.log(`      ... 其餘 ${remainingCount} 個 Pod: ${remainingTotal} 次`);
            }
        });

        if (overallStats.topMinutesAnalysis.busyMinutesBreakdown.length > 10) {
            console.log(`\n   ... 還有 ${overallStats.topMinutesAnalysis.busyMinutesBreakdown.length - 10} 個繁忙時段 (請查看 JSON 報告)`);
        }
    }

    console.log('\n🏆 Pod 效能排行榜 (按平均 Render Time):');
    overallStats.podPerformanceRanking.slice(0, 5).forEach((pod, index) => {
        const status = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        console.log(`   ${status} ${pod.podName}`);
        console.log(`      平均 Render Time: ${pod.avgRenderTime}ms`);
        console.log(`      P95 Render Time: ${pod.p95RenderTime}ms`);
        console.log(`      總請求數: ${pod.totalRequests}`);
        console.log(`      慢渲染數量: ${pod.slowRenderCount}`);
    });

    if (overallStats.bestPerformingPod) {
        console.log(`\n🌟 效能最佳 Pod: ${overallStats.bestPerformingPod.podName}`);
        console.log(`   平均 Render Time: ${overallStats.bestPerformingPod.avgRenderTime}ms`);
    }

    if (overallStats.worstPerformingPod) {
        console.log(`\n⚠️  效能最差 Pod: ${overallStats.worstPerformingPod.podName}`);
        console.log(`   平均 Render Time: ${overallStats.worstPerformingPod.avgRenderTime}ms`);
    }

    console.log('\n🐌 各 Pod 慢渲染統計:');
    Object.entries(overallStats.slowRenderByPod).forEach(([podName, count]) => {
        console.log(`   ${podName}: ${count} 次慢渲染`);
    });
}

// 主要執行函數 - Pod 分群分析雙檔案版本
async function main() {
    try {
        // 檢查命令列參數
        if (process.argv.length < 4) {
            console.error('❌ 使用方式: node script.js <UserAgent檔案路徑> <RenderTime檔案路徑> [資料夾名稱]');
            console.error('範例: node script.js logs-useragent-2025.csv logs-rendertime-2025.csv');
            console.error('範例: node script.js logs-useragent-2025.csv logs-rendertime-2025.csv L2');
            return;
        }

        const userAgentFile = process.argv[2]; // User-Agent 檔案
        const renderTimeFile = process.argv[3]; // Render Time 檔案
        const folderName = process.argv[4]; // 可選的資料夾名稱

        console.log(`📁 User-Agent 檔案: ${userAgentFile}`);
        console.log(`📁 Render Time 檔案: ${renderTimeFile}`);

        // 檢查檔案是否存在
        if (!fs.existsSync(userAgentFile)) {
            console.error(`❌ 找不到 User-Agent 檔案: ${userAgentFile}`);
            return;
        }

        if (!fs.existsSync(renderTimeFile)) {
            console.error(`❌ 找不到 Render Time 檔案: ${renderTimeFile}`);
            return;
        }

        // 確保 result 資料夾存在
        let resultDir = 'daily-pod-analysis-result';
        if (folderName) {
            resultDir = `daily-pod-analysis-result/${folderName}`;
        }
        if (!fs.existsSync(resultDir)) {
            fs.mkdirSync(resultDir, { recursive: true });
            console.log(`✅ 已建立 ${resultDir} 資料夾`);
        }

        // 同時讀取兩個檔案
        const [userAgentRecords, renderTimeRecords] = await Promise.all([
            readCsvFile(userAgentFile),
            readCsvFile(renderTimeFile)
        ]);

        // 依 pod_name 分群兩個檔案的資料
        const userAgentPodGroups = groupRecordsByPodName(userAgentRecords, 'User-Agent');
        const renderTimePodGroups = groupRecordsByPodName(renderTimeRecords, 'Render Time');

        // 找出兩個檔案中都有的 pod
        const userAgentPods = new Set(Object.keys(userAgentPodGroups));
        const renderTimePods = new Set(Object.keys(renderTimePodGroups));
        const commonPods = [...userAgentPods].filter(pod => renderTimePods.has(pod));
        const userAgentOnlyPods = [...userAgentPods].filter(pod => !renderTimePods.has(pod));
        const renderTimeOnlyPods = [...renderTimePods].filter(pod => !userAgentPods.has(pod));

        console.log(`\n🔍 Pod 分群結果分析:`);
        console.log(`   共同的 Pod (兩個檔案都有): ${commonPods.length} 個`);
        console.log(`   只在 User-Agent 檔案中的 Pod: ${userAgentOnlyPods.length} 個`);
        console.log(`   只在 Render Time 檔案中的 Pod: ${renderTimeOnlyPods.length} 個`);

        if (commonPods.length === 0) {
            console.error('❌ 沒有找到共同的 Pod，無法進行關聯分析');
            return;
        }

        // 分析每個共同的 Pod
        const allPodResults = [];
        commonPods.sort().forEach(podName => {
            const userAgentRecordsForPod = userAgentPodGroups[podName] || [];
            const renderTimeRecordsForPod = renderTimePodGroups[podName] || [];

            const podResult = analyzeSinglePod(
                userAgentRecordsForPod,
                renderTimeRecordsForPod,
                podName
            );
            allPodResults.push(podResult);
            displayPodSummary(podResult);
        });

        // 計算總體統計
        const overallStats = calculateOverallStats(allPodResults);
        displayOverallSummary(overallStats);

        // 生成檔案名稱
        const userAgentBaseName = userAgentFile.split('/').pop().replace('.csv', '');
        const renderTimeBaseName = renderTimeFile.split('/').pop().replace('.csv', '');
        const filePrefix = `pod_dual_${userAgentBaseName}_${renderTimeBaseName}`;

        // 輸出詳細的 JSON 報告
        const detailedJsonOutput = {
            analysis_time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            timezone_info: 'All timestamps have been converted to Taiwan timezone (UTC+8)',
            analysis_mode: 'Pod-based Dual File Analysis',
            file_info: {
                user_agent_file: userAgentFile,
                render_time_file: renderTimeFile,
                total_user_agent_records: userAgentRecords.length,
                total_render_time_records: renderTimeRecords.length
            },
            pod_grouping_summary: {
                common_pods: commonPods.length,
                user_agent_only_pods: userAgentOnlyPods.length,
                render_time_only_pods: renderTimeOnlyPods.length,
                common_pod_names: commonPods,
                user_agent_only_pod_names: userAgentOnlyPods,
                render_time_only_pod_names: renderTimeOnlyPods
            },
            overall_stats: overallStats,
            // 新增：跨 Pod 時間點分析
            top_minutes_cross_pod_analysis: {
                busy_minutes: overallStats.topMinutesAnalysis.busyMinutes,
                detailed_breakdown: overallStats.topMinutesAnalysis.busyMinutesBreakdown
            },
            pod_results: allPodResults.map(pod => ({
                pod_name: pod.podName,
                data_source_stats: pod.dataSourceStats,
                reqId_mapping_stats: pod.reqIdMappingStats,
                render_time_stats: pod.renderTimeStats,
                avg_requests_per_hour: pod.avgRequestPerHour,
                per_minute_stats: pod.requestPerMinuteStats,
                per_second_stats: pod.requestPerSecondStats,
                slow_render_hour_minute_stats: pod.slowRenderHourMinuteStats,
                url_analysis: pod.urlAnalysis,
                user_agent_analysis: pod.userAgentAnalysis,
                hourly_request_data: pod.requestHourlyData,
                minutely_request_data: pod.requestMinutelyData,
                secondly_request_data: pod.requestSecondlyData,
                slow_render_periods: pod.slowRenderPeriods
                    .filter(p => p.timestamp)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                    .map(p => ({
                        timestamp_taiwan: p.userAgentTimestamp ? 
                            (p.userAgentTimestamp.includes('T') ? convertToTaiwanTime(p.userAgentTimestamp) : p.userAgentTimestamp) : 
                            p.timestamp, // 優先使用 userAgent 時間，如果是ISO格式則轉換
                        timestamp_source: p.userAgentTimestamp ? 'user_agent_time' : 'got_200_time', // 時間來源
                        render_time_ms: p.renderTime,
                        url: p.url,
                        req_id: p.reqId,
                        user_agent: p.userAgent,
                        user_agent_status: p.userAgent ? 'Matched' : 'No Match',
                        details: p.textPayload
                    }))
            }))
        };

        const detailedJsonFileName = `${resultDir}/${filePrefix}_detailed.json`;
        fs.writeFileSync(detailedJsonFileName, JSON.stringify(detailedJsonOutput, null, 2), 'utf8');
        console.log(`\n✅ 詳細 JSON 報告已儲存至 ${detailedJsonFileName}`);

        // 輸出摘要 JSON 報告
        const summaryJsonOutput = {
            analysis_time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            analysis_mode: 'Pod-based Dual File Analysis Summary',
            file_info: {
                user_agent_file: userAgentFile,
                render_time_file: renderTimeFile,
                total_user_agent_records: userAgentRecords.length,
                total_render_time_records: renderTimeRecords.length
            },
            pod_grouping_summary: {
                common_pods: commonPods.length,
                user_agent_only_pods: userAgentOnlyPods.length,
                render_time_only_pods: renderTimeOnlyPods.length
            },
            overall_stats: overallStats,
            // 新增：跨 Pod 時間點分析摘要
            top_minutes_cross_pod_summary: {
                total_busy_minutes_analyzed: overallStats.topMinutesAnalysis.busyMinutesBreakdown.length,
                peak_minute: overallStats.topMinutesAnalysis.busyMinutesBreakdown[0] || null,
                most_balanced_minute: overallStats.topMinutesAnalysis.busyMinutesBreakdown.length > 0 
                    ? overallStats.topMinutesAnalysis.busyMinutesBreakdown.reduce((prev, current) =>
                        (prev.podCount > current.podCount) ? prev : current)
                    : null,
                top_5_minutes_breakdown: overallStats.topMinutesAnalysis.busyMinutesBreakdown.slice(0, 5)
            },
            pod_summary: allPodResults.map(pod => ({
                pod_name: pod.podName,
                original_user_agent_records: pod.dataSourceStats.originalUserAgentRecords,
                original_render_time_records: pod.dataSourceStats.originalRenderTimeRecords,
                processed_user_agent_records: pod.dataSourceStats.processedUserAgentRecords,
                processed_render_time_records: pod.dataSourceStats.processedRenderTimeRecords,
                matching_rate: pod.reqIdMappingStats.matchingRate,
                avg_render_time: pod.renderTimeStats.average,
                p95_render_time: pod.renderTimeStats.pr95,
                slow_render_count: pod.slowRenderPeriods.length,
                unique_urls: pod.urlAnalysis ? pod.urlAnalysis.overall_stats.unique_urls : 0,
                unique_user_agents: pod.userAgentAnalysis ? pod.userAgentAnalysis.overall_stats.unique_user_agents : 0,
                max_requests_per_second: pod.requestPerSecondStats.maxSecond ? pod.requestPerSecondStats.maxSecond.count : 0,
                max_second_timestamp: pod.requestPerSecondStats.maxSecond ? pod.requestPerSecondStats.maxSecond.second : null
            }))
        };

        const summaryJsonFileName = `${resultDir}/${filePrefix}_summary.json`;
        fs.writeFileSync(summaryJsonFileName, JSON.stringify(summaryJsonOutput, null, 2), 'utf8');
        console.log(`✅ 摘要 JSON 報告已儲存至 ${summaryJsonFileName}`);

        // 輸出文字報告
        const txtOutput = `
Pod 分群雙檔案 CSV 日誌分析報告
生成時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
時區說明: 所有時間已轉換為台灣時區 (UTC+8)
================================================================

檔案資訊:
• User-Agent 檔案: ${userAgentFile} (${userAgentRecords.length} 筆記錄)
• Render Time 檔案: ${renderTimeFile} (${renderTimeRecords.length} 筆記錄)
• 分析模式: 依 pod_name 分群的雙檔案分析

Pod 分群結果:
• 共同的 Pod (兩個檔案都有): ${commonPods.length} 個
• 只在 User-Agent 檔案中的 Pod: ${userAgentOnlyPods.length} 個
• 只在 Render Time 檔案中的 Pod: ${renderTimeOnlyPods.length} 個

跨 Pod 總體統計:
• 分析的 Pod 數量: ${overallStats.totalPods}
• 總原始 User-Agent 記錄: ${overallStats.totalOriginalUserAgentRecords}
• 總原始 Render Time 記錄: ${overallStats.totalOriginalRenderTimeRecords}
• 總有效 User-Agent 記錄: ${overallStats.totalProcessedUserAgentRecords}
• 總有效 Render Time 記錄: ${overallStats.totalProcessedRenderTimeRecords}
• 總 reqId 匹配記錄: ${overallStats.totalMatchedRecords}
• 平均 reqId 匹配率: ${overallStats.avgMatchingRate}%

Pod 效能排行榜 (按平均 Render Time):
${overallStats.podPerformanceRanking.map((pod, index) => `
${index + 1}. ${pod.podName}
   • 平均 Render Time: ${pod.avgRenderTime}ms
   • P95 Render Time: ${pod.p95RenderTime}ms
   • 總請求數: ${pod.totalRequests}
   • 慢渲染數量: ${pod.slowRenderCount}`).join('\n')}

效能最佳 Pod: ${overallStats.bestPerformingPod ? overallStats.bestPerformingPod.podName : 'N/A'}
${overallStats.bestPerformingPod ? `平均 Render Time: ${overallStats.bestPerformingPod.avgRenderTime}ms` : ''}

效能最差 Pod: ${overallStats.worstPerformingPod ? overallStats.worstPerformingPod.podName : 'N/A'}
${overallStats.worstPerformingPod ? `平均 Render Time: ${overallStats.worstPerformingPod.avgRenderTime}ms` : ''}

各 Pod 慢渲染統計:
${Object.entries(overallStats.slowRenderByPod).map(([podName, count]) =>
            `• ${podName}: ${count} 次慢渲染`).join('\n')}

================================================================

系統最繁忙時段 (總請求數 > 10) - 跨 Pod 分布分析:
${overallStats.topMinutesAnalysis.busyMinutesBreakdown.map(minuteData => `
${minuteData.rank}. ${minuteData.minute} - 總請求: ${minuteData.totalCount} 次 (涉及 ${minuteData.podCount} 個 Pod)
${minuteData.podBreakdown.slice(0, 5).map((podData, podIndex) => {
            const indicator = podIndex === 0 ? '🔥' : podIndex === 1 ? '🌡️' : '   ';
            return `   ${indicator} ${podData.podName}: ${podData.count} 次 (${podData.percentage}%)`;
        }).join('\n')}${minuteData.podBreakdown.length > 5 ? `\n      ... 其餘 ${minuteData.podBreakdown.length - 5} 個 Pod: ${minuteData.podBreakdown.slice(5).reduce((sum, pod) => sum + pod.count, 0)} 次` : ''}`).join('\n')}

================================================================

各 Pod 詳細分析:

${allPodResults.map(pod => `
Pod: ${pod.podName}
----------------------------------------
基本資訊:
• 原始 User-Agent 記錄: ${pod.dataSourceStats.originalUserAgentRecords}
• 原始 Render Time 記錄: ${pod.dataSourceStats.originalRenderTimeRecords}
• 有效 User-Agent 記錄: ${pod.dataSourceStats.processedUserAgentRecords}
• 有效 Render Time 記錄: ${pod.dataSourceStats.processedRenderTimeRecords}
• reqId 匹配率: ${pod.reqIdMappingStats.matchingRate}%

Render Time 統計:
• 平均值: ${pod.renderTimeStats.average} ms
• 最小值: ${pod.renderTimeStats.min} ms
• 最大值: ${pod.renderTimeStats.max} ms
• 中位數 (P50): ${pod.renderTimeStats.median} ms
• 第90百分位數 (P90): ${pod.renderTimeStats.pr90} ms
• 第95百分位數 (P95): ${pod.renderTimeStats.pr95} ms
• 第98百分位數 (P98): ${pod.renderTimeStats.pr98} ms
• 第99百分位數 (P99): ${pod.renderTimeStats.pr99} ms
• 慢渲染 (8-20秒): ${pod.renderTimeStats.countAbove8000to20000}
• 異常渲染 (20-45秒): ${pod.renderTimeStats.countAbove20000to45000}
• 超時 (>45秒): ${pod.renderTimeStats.countAbove45000}
• 總資料筆數: ${pod.renderTimeStats.total}

URL 分析:
${pod.urlAnalysis ? `• 總請求數: ${pod.urlAnalysis.overall_stats.total_requests}
• 不重複 URL 數: ${pod.urlAnalysis.overall_stats.unique_urls}
• 有重複的 URL 數: ${pod.urlAnalysis.overall_stats.duplicate_urls}
• URL 重複率: ${pod.urlAnalysis.overall_stats.duplicate_rate}` : '• 無 URL 分析資料'}

User-Agent 分析:
${pod.userAgentAnalysis ? `• 總請求數: ${pod.userAgentAnalysis.overall_stats.total_requests}
• 不同 User-Agent 數: ${pod.userAgentAnalysis.overall_stats.unique_user_agents}` : '• 無 User-Agent 分析資料'}

每秒請求統計:
• 一秒內最高請求數: ${pod.requestPerSecondStats.maxSecond ? `${pod.requestPerSecondStats.maxSecond.count} 次` : '0 次'}
• 最高請求發生時間: ${pod.requestPerSecondStats.maxSecond ? pod.requestPerSecondStats.maxSecond.second : 'N/A'}
• 平均每秒請求數: ${pod.requestPerSecondStats.average}
• 不同活躍秒數總數: ${pod.requestPerSecondStats.total}

慢渲染統計:
• 慢渲染記錄數: ${pod.slowRenderPeriods.length}
${pod.slowRenderPeriods.length > 0 ?
            `• 慢渲染時段同時同分統計: ${pod.slowRenderHourMinuteStats.summary.total_unique_hour_minutes} 個不同時分點` : ''}

`).join('\n')}

分析完成時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
`;

        const txtFileName = `${resultDir}/${filePrefix}_report.txt`;
        fs.writeFileSync(txtFileName, txtOutput, 'utf8');
        console.log(`✅ 文字報告已儲存至 ${txtFileName}`);

        console.log('\n🎯 Pod 分群雙檔案分析完成！');
        console.log(`📊 共分析了 ${allPodResults.length} 個共同的 Pod`);
        console.log(`📁 所有報告檔案已儲存至 ${resultDir}/ 資料夾`);
        console.log('\n📋 輸出檔案說明:');
        console.log(`   • ${filePrefix}_detailed.json - 詳細分析結果 (包含每個 Pod 的完整資料)`);
        console.log(`   • ${filePrefix}_summary.json - 摘要分析結果 (總體統計和 Pod 摘要)`);
        console.log(`   • ${filePrefix}_report.txt - 人類易讀的文字報告`);

        console.log('\n🔄 Pod 分群雙檔案分析特點:');
        console.log('  • 保留原有的雙檔案輸入方式 (User-Agent + Render Time)');
        console.log('  • 自動依 pod_name 分群兩個檔案的資料');
        console.log('  • 只分析在兩個檔案中都存在的 Pod');
        console.log('  • 每個 Pod 都有完整的效能分析');
        console.log('  • 提供跨 Pod 效能比較和排行榜');
        console.log('  • 包含 reqId 關聯分析和匹配率統計');
        console.log('  • 新增：系統最繁忙時段的跨 Pod 負載分布分析');
        console.log('  • 新增：可識別高峰時期哪個 Pod 負載最重');
        console.log('  • 🆕 每個 Pod 一秒內最高請求數統計和詳細分析');
        console.log('  • 🆕 精確到秒級的請求統計，提供更細粒度的負載分析');

    } catch (error) {
        console.error('❌ 分析過程中發生錯誤:', error.message);
        console.error('錯誤詳情:', error);
    }
}

// 執行程式
main();
