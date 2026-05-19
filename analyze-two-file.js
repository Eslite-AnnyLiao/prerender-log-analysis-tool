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

// 轉換為 Google Cloud Trace 日誌可查詢的格式 (ISO 8601)
function convertToGoogleCloudFormat(timestamp) {
    if (!timestamp) return null;

    try {
        // 如果已經是 ISO 8601 格式，直接返回
        if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
            return timestamp;
        }

        // 移除引號並解析時間
        const cleanTimestamp = timestamp.replace(/'/g, '');
        
        // 解析 UTC 時間
        const utcDate = new Date(cleanTimestamp);
        
        // 檢查日期是否有效
        if (isNaN(utcDate.getTime())) {
            throw new Error('無效的日期格式');
        }

        // 返回 ISO 8601 格式，保持 UTC 時間和毫秒精度
        return utcDate.toISOString();

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

// 新增：取得時分標籤 (用於同時同分統計)
function getHourMinuteLabel(timestamp) {
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

        // 只返回 HH:MM 格式
        const hours = String(taiwanDate.getUTCHours()).padStart(2, '0');
        const minutes = String(taiwanDate.getUTCMinutes()).padStart(2, '0');

        return `${hours}:${minutes}`;
    } catch (error) {
        return null;
    }
}

// 新增：取得秒級別時間標籤 (用於秒級別統計)
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

// 新增：分析高頻訪問模式
function analyzeHighFrequencyAccess(userAgentMinutelyData, userAgentSecondlyData) {
    console.log('\n📈 分析高頻訪問模式...');
    
    const highFrequencyAnalysis = {
        minutely_violations: [], // 一分鐘內超過2次的 UserAgent
        secondly_violations: [], // 一秒內超過2次的 UserAgent
        summary: {
            total_minute_violations: 0,
            total_second_violations: 0,
            unique_violating_user_agents: new Set(),
            max_per_minute: 0,
            max_per_second: 0
        }
    };

    // 分析分鐘級別違規
    Object.keys(userAgentMinutelyData).forEach(minuteLabel => {
        const userAgentsInMinute = userAgentMinutelyData[minuteLabel];
        
        Object.keys(userAgentsInMinute).forEach(userAgent => {
            const count = userAgentsInMinute[userAgent];
            
            if (count > 2) {
                highFrequencyAnalysis.minutely_violations.push({
                    timestamp: minuteLabel,
                    user_agent: userAgent,
                    access_count: count
                });
                
                highFrequencyAnalysis.summary.total_minute_violations++;
                highFrequencyAnalysis.summary.unique_violating_user_agents.add(userAgent);
                
                if (count > highFrequencyAnalysis.summary.max_per_minute) {
                    highFrequencyAnalysis.summary.max_per_minute = count;
                }
            }
        });
    });

    // 分析秒級別違規
    Object.keys(userAgentSecondlyData).forEach(secondLabel => {
        const userAgentsInSecond = userAgentSecondlyData[secondLabel];
        
        Object.keys(userAgentsInSecond).forEach(userAgent => {
            const count = userAgentsInSecond[userAgent];
            
            if (count > 2) {
                highFrequencyAnalysis.secondly_violations.push({
                    timestamp: secondLabel,
                    user_agent: userAgent,
                    access_count: count
                });
                
                highFrequencyAnalysis.summary.total_second_violations++;
                highFrequencyAnalysis.summary.unique_violating_user_agents.add(userAgent);
                
                if (count > highFrequencyAnalysis.summary.max_per_second) {
                    highFrequencyAnalysis.summary.max_per_second = count;
                }
            }
        });
    });

    // 轉換 Set 為數字
    highFrequencyAnalysis.summary.unique_violating_user_agents = 
        highFrequencyAnalysis.summary.unique_violating_user_agents.size;

    // 排序違規記錄（按訴訪問數量降序）
    highFrequencyAnalysis.minutely_violations.sort((a, b) => b.access_count - a.access_count);
    highFrequencyAnalysis.secondly_violations.sort((a, b) => b.access_count - a.access_count);

    console.log(`✅ 發現 ${highFrequencyAnalysis.summary.total_minute_violations} 筆分鐘級別違規`);
    console.log(`✅ 發現 ${highFrequencyAnalysis.summary.total_second_violations} 筆秒級別違規`);
    
    return highFrequencyAnalysis;
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

// 提取 textPayload 中的精確時間戳記
function extractPreciseTimestamp(textPayload) {
    if (!textPayload) return null;
    
    // 匹配 ISO 8601 格式的時間戳記 (例如: 2025-10-19T15:59:58.224Z)
    const timestampMatch = textPayload.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
    return timestampMatch ? timestampMatch[1] : null;
}

// 分析 textPayload 格式並提取資料
function analyzeTextPayload(textPayload) {
    if (!textPayload) return { type: 'unknown' };

    // 提取精確時間戳記
    const preciseTimestamp = extractPreciseTimestamp(textPayload);

    // 格式1: 包含 "got 200 in XXXms" 的完成請求
    const type1Match = textPayload.match(/got\s+\d+\s+in\s+(\d+)ms\s+for\s+(.+?)(?:\s+\[|$)/);
    if (type1Match) {
        const reqIdMatch = textPayload.match(/\[reqId:\s*([^\]]+)\]/);
        return {
            type: 'completion',
            renderTime: parseInt(type1Match[1]),
            url: type1Match[2].trim(),
            reqId: reqIdMatch ? reqIdMatch[1].trim() : null,
            preciseTimestamp: preciseTimestamp
        };
    }

    // 格式2: 包含 "getting!!!" 的開始請求
    const type2Match = textPayload.match(/getting!!!\s+(.+)/);
    if (type2Match) {
        return {
            type: 'getting_request',
            url: type2Match[1].trim(),
            preciseTimestamp: preciseTimestamp
        };
    }

    // 格式3: 包含 X-Original-User-Agent 的請求
    const type3Match = textPayload.match(/X-Original-User-Agent:\s*([^\n\r]+)/);
    if (type3Match) {
        const reqIdMatch = textPayload.match(/\[reqId:\s*([^\]]+)\]/);
        
        let fullLine = type3Match[1].trim();
        
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
        const finalUserAgent = yahooSlurpMatch ? yahooSlurpMatch[1] : userAgent;
        
        return {
            type: 'user_agent',
            userAgent: finalUserAgent,
            reqId: reqIdMatch ? reqIdMatch[1].trim() : null,
            preciseTimestamp: preciseTimestamp
        };
    }

    return { type: 'unknown' };
}

// 清理 pod name (移除引號)
function cleanPodName(podName) {
    if (!podName) return 'unknown';
    return podName.replace(/'/g, '');
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

// 新增：分析慢渲染時段的同時同分統計
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

// 新增：分析每分鐘Request數量最高值的分鐘中User-Agent分布
function analyzePeakMinuteUserAgents(userAgentMinutelyRequestData, userAgentMinutelyData) {
    // 找出請求數量最高的分鐘
    const values = Object.values(userAgentMinutelyRequestData);
    if (values.length === 0) {
        return {
            peakMinute: null,
            peakRequestCount: 0,
            userAgentDistribution: [],
            totalUserAgents: 0,
            analysis: '無可用資料'
        };
    }

    const maxRequestCount = Math.max(...values);
    const peakMinutes = Object.entries(userAgentMinutelyRequestData)
        .filter(([minute, count]) => count === maxRequestCount)
        .map(([minute]) => minute);

    // 如果有多個分鐘並列最高，取第一個進行分析
    const peakMinute = peakMinutes[0];

    // 取得該分鐘的User-Agent分布
    const userAgentDistribution = userAgentMinutelyData[peakMinute] || {};

    // 轉換為排序後的陣列
    const sortedUserAgents = Object.entries(userAgentDistribution)
        .map(([userAgent, count]) => {
            const parsed = parseUserAgent(userAgent);
            return {
                userAgent: userAgent,
                count: count,
                percentage: Math.round((count / maxRequestCount) * 10000) / 100,
                browser: parsed.browser,
                os: parsed.os
            };
        })
        .sort((a, b) => b.count - a.count);

    // 統計瀏覽器和操作系統分布
    const browserDistribution = {};
    const osDistribution = {};

    sortedUserAgents.forEach(item => {
        browserDistribution[item.browser] = (browserDistribution[item.browser] || 0) + item.count;
        osDistribution[item.os] = (osDistribution[item.os] || 0) + item.count;
    });

    const sortedBrowsers = Object.entries(browserDistribution)
        .map(([browser, count]) => ({
            browser,
            count,
            percentage: Math.round((count / maxRequestCount) * 10000) / 100
        }))
        .sort((a, b) => b.count - a.count);

    const sortedOs = Object.entries(osDistribution)
        .map(([os, count]) => ({
            os,
            count,
            percentage: Math.round((count / maxRequestCount) * 10000) / 100
        }))
        .sort((a, b) => b.count - a.count);

    return {
        peakMinute: peakMinute,
        peakRequestCount: maxRequestCount,
        totalPeakMinutes: peakMinutes.length,
        allPeakMinutes: peakMinutes,
        userAgentDistribution: sortedUserAgents,
        browserDistribution: sortedBrowsers,
        osDistribution: sortedOs,
        totalUserAgents: sortedUserAgents.length,
        analysis: `在 ${peakMinute} 這一分鐘達到最高請求數 ${maxRequestCount} 筆，共有 ${sortedUserAgents.length} 種不同的 User-Agent`
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

// 分析兩個 CSV 檔案的資料 (增強版)
async function analyzeTwoCsvFiles(userAgentFile, renderTimeFile) {
    console.log('🔄 開始分析兩個 CSV 檔案...');

    try {
        // 同時讀取兩個檔案
        const [userAgentRecords, renderTimeRecords] = await Promise.all([
            readCsvFile(userAgentFile),
            readCsvFile(renderTimeFile)
        ]);

        // 初始化資料結構
        const renderTimes = [];
        const slowRenderPeriods = [];

        // User-Agent 相關資料結構
        const userAgentHourlyRequestData = {};
        const userAgentMinutelyRequestData = {};
        const userAgentSecondlyRequestData = {}; // 新增：記錄每秒資料筆數
        const userAgentData = {}; // 記錄每個 User-Agent 的總次數
        const userAgentHourlyData = {}; // 記錄每小時每個 User-Agent 的次數
        const userAgentMinutelyData = {}; // 記錄每分鐘每個 User-Agent 的次數
        const userAgentSecondlyData = {}; // 新增：記錄每秒每個 User-Agent 的次數

        // 新增：reqId 關聯資料結構
        const reqIdToUserAgent = new Map(); // reqId -> userAgent 映射
        const reqIdToUserAgentTimestamp = new Map(); // reqId -> user agent timestamp 映射
        const userAgentRenderTimes = {}; // userAgent -> [renderTime1, renderTime2, ...] 映射

        // URL 分析相關資料結構
        const urlRenderTimes = new Map(); // Map<url, Array<{renderTime, timestamp}>>
        const allRenderRecords = []; // 所有的 render 記錄

        console.log('\n📊 處理 User-Agent 檔案資料...');
        // 處理 User-Agent 檔案
        let userAgentProcessedCount = 0;
        userAgentRecords.forEach(row => {
            const textPayload = row.textPayload || '';
            const payloadInfo = analyzeTextPayload(textPayload);

            if (payloadInfo.type === 'user_agent') {
                const userAgent = payloadInfo.userAgent;
                const reqId = payloadInfo.reqId;
                const hourLabel = getHourLabel(row.timestamp);
                const minuteLabel = getMinuteLabel(row.timestamp);
                const secondLabel = getSecondLabel(row.timestamp); // 新增：秒級別時間標籤

                // 建立 reqId 到 userAgent 的映射
                if (reqId && userAgent) {
                    reqIdToUserAgent.set(reqId, userAgent);
                    // 同時記錄 user_agent 的時間戳記 (優先使用精確時間戳記)
                    const timestampToStore = payloadInfo.preciseTimestamp || row.timestamp;
                    reqIdToUserAgentTimestamp.set(reqId, timestampToStore);
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

                    // 新增：統計每分鐘每個 User-Agent 的次數
                    if (!userAgentMinutelyData[minuteLabel]) {
                        userAgentMinutelyData[minuteLabel] = {};
                    }
                    if (!userAgentMinutelyData[minuteLabel][userAgent]) {
                        userAgentMinutelyData[minuteLabel][userAgent] = 0;
                    }
                    userAgentMinutelyData[minuteLabel][userAgent]++;
                }

                // 新增：統計每秒資料筆數和每秒每個 User-Agent 的次數
                if (secondLabel) {
                    if (!userAgentSecondlyRequestData[secondLabel]) {
                        userAgentSecondlyRequestData[secondLabel] = 0;
                    }
                    userAgentSecondlyRequestData[secondLabel]++;

                    // 統計每秒每個 User-Agent 的次數
                    if (!userAgentSecondlyData[secondLabel]) {
                        userAgentSecondlyData[secondLabel] = {};
                    }
                    if (!userAgentSecondlyData[secondLabel][userAgent]) {
                        userAgentSecondlyData[secondLabel][userAgent] = 0;
                    }
                    userAgentSecondlyData[secondLabel][userAgent]++;
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

        console.log(`✅ User-Agent 檔案處理完成，有效記錄: ${userAgentProcessedCount} 筆`);
        console.log(`📊 reqId 映射建立完成，共 ${reqIdToUserAgent.size} 個 reqId`);
        console.log(`📊 每分鐘 User-Agent 資料建立完成，共 ${Object.keys(userAgentMinutelyData).length} 個分鐘`);

        console.log('\n📊 處理 Render Time 檔案資料...');
        // 處理 Render Time 檔案
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

                // 通過 reqId 查找對應的 userAgent
                let matchedUserAgent = null;
                if (reqId && reqIdToUserAgent.has(reqId)) {
                    matchedUserAgent = reqIdToUserAgent.get(reqId);
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
                    const podName = cleanPodName(row['resource.labels.pod_name']);
                    
                    // 獲取 user_agent 時間戳記
                    let userAgentTimestamp = null;
                    if (reqId && reqIdToUserAgentTimestamp.has(reqId)) {
                        userAgentTimestamp = reqIdToUserAgentTimestamp.get(reqId);
                    }
                    
                    slowRenderPeriods.push({
                        renderTime: renderTime,
                        timestamp: taiwanTimestamp,
                        url: url,
                        textPayload: textPayload,
                        reqId: reqId,
                        userAgent: matchedUserAgent,
                        podName: podName,
                        // 新增的時間戳記欄位
                        userAgentTimestamp: userAgentTimestamp, // 原始 user_agent 記錄時間
                        got200Timestamp: payloadInfo.preciseTimestamp || row.timestamp // 原始 got 200 記錄時間 (優先使用精確時間戳記)
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

        console.log(`✅ Render Time 檔案處理完成，有效記錄: ${renderTimeProcessedCount} 筆`);
        console.log(`📊 reqId 匹配成功: ${reqIdMatchedCount} 筆 (${Math.round((reqIdMatchedCount / reqIdToUserAgent.size) * 100)}%)`);

        // 計算統計結果
        console.log('\n🧮 計算統計結果...');

        // 計算 render time 統計
        const renderTimeValues = renderTimes.map(item => item.time);
        const renderTimeStats = calculateRenderTimeStats(renderTimeValues);

        // 計算每小時資料筆數的平均值
        const hourlyValues = Object.values(userAgentHourlyRequestData);
        const avgPerHour = hourlyValues.length > 0 ?
            hourlyValues.reduce((sum, val) => sum + val, 0) / hourlyValues.length : 0;

        // 計算每分鐘統計資料
        const perMinuteStats = calculatePerMinuteStats(userAgentMinutelyRequestData);

        // 新增：分析每分鐘Request數量最高值的分鐘中User-Agent分布
        const peakMinuteUserAgentAnalysis = analyzePeakMinuteUserAgents(userAgentMinutelyRequestData, userAgentMinutelyData);

        // 新增：計算慢渲染時段的同時同分統計
        const slowRenderHourMinuteStats = analyzeSlowRenderHourMinute(slowRenderPeriods);

        // 分析 URL 相關統計 (增強版)
        const urlAnalysis = analyzeUrls(urlRenderTimes, allRenderRecords);

        // 分析 User-Agent 統計 (增強版，包含平均render時間)
        let userAgentAnalysis = null;
        if (Object.keys(userAgentData).length > 0) {
            userAgentAnalysis = analyzeUserAgents(userAgentData, userAgentHourlyData, userAgentRenderTimes);
        }

        // 新增：高頻訪問模式分析
        console.log('\n🚨 執行高頻訪問檢測...');
        const highFrequencyAnalysis = analyzeHighFrequencyAccess(userAgentMinutelyData, userAgentSecondlyData);

        // 準備輸出資料
        const analysisResult = {
            // 原有的分析結果
            renderTimeStats: renderTimeStats,
            slowRenderPeriods: slowRenderPeriods,
            requestHourlyData: userAgentHourlyRequestData,
            avgRequestPerHour: Math.round(avgPerHour * 100) / 100,
            requestMinutelyData: userAgentMinutelyRequestData,
            requestPerMinuteStats: perMinuteStats,

            // 新增：每分鐘Request數量最高值的分鐘中User-Agent分布分析
            peakMinuteUserAgentAnalysis: peakMinuteUserAgentAnalysis,

            // 新增：慢渲染時段的同時同分統計
            slowRenderHourMinuteStats: slowRenderHourMinuteStats,

            // URL 分析結果 (增強版)
            urlAnalysis: urlAnalysis,

            // 新增：高頻訪問模式分析結果
            highFrequencyAnalysis: highFrequencyAnalysis,

            // User-Agent 分析結果 (增強版)
            userAgentAnalysis: userAgentAnalysis,

            // 新增：reqId 關聯統計
            reqIdMappingStats: {
                totalReqIds: reqIdToUserAgent.size,
                matchedRenderRecords: reqIdMatchedCount,
                totalRenderRecords: renderTimeProcessedCount,
                matchingRate: Math.round((reqIdMatchedCount / reqIdToUserAgent.size) * 10000) / 100
            },

            // 資料來源資訊
            frequencyDataSource: 'X-Original-User-Agent Records (Dual File Enhanced)',
            dataSourceStats: {
                userAgentRecords: userAgentProcessedCount,
                renderTimeRecords: renderTimeProcessedCount,
                totalUserAgentFileRecords: userAgentRecords.length,
                totalRenderTimeFileRecords: renderTimeRecords.length
            },

            // 統計資訊
            totalRecords: userAgentRecords.length + renderTimeRecords.length,
            completionRecords: renderTimes.length,
            requestRecords: Object.values(userAgentHourlyRequestData).reduce((sum, val) => sum + val, 0),
            chartData: prepareChartData(userAgentHourlyRequestData)
        };

        console.log('✅ 資料分析完成！');
        return analysisResult;

    } catch (error) {
        console.error('❌ 分析過程中發生錯誤:', error);
        throw error;
    }
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

    // 2. 找出 render 時間前 15 名的記錄 (增強版，包含 User-Agent)
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
            duplicate_rate: `${Math.round((duplicateUrlCount / totalUrls) * 10000) / 100}%`
        },
        duplicate_url_details: duplicateUrls,
        top_15_render_times: top15RenderTimes,
        all_url_stats: urlStats.sort((a, b) => b.maxRenderTime - a.maxRenderTime)
    };
}

// 計算 render time 統計 (含PR98/PR99)
function calculateRenderTimeStats(inputData) {
    console.log('🔍 開始計算 Render Time 統計...');

    // 1. 自動檢測資料格式並提取數值
    let renderTimes;

    if (inputData.length === 0) {
        console.log('⚠️  輸入資料為空陣列');
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
            countAbove100000: 0,
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
            time >= 0; // render time 不應該是負數
    });

    if (validTimes.length === 0) {
        console.error('❌ 所有資料都無效！');
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
            countAbove100000: 0,
            total: 0
        };
    }

    if (validTimes.length !== renderTimes.length) {
        const invalidCount = renderTimes.length - validTimes.length;
        console.warn(`⚠️  過濾掉 ${invalidCount} 個無效值`);
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
    const countAbove100000 = validTimes.filter(time => time >= 100000).length;

    // 5. 計算各種百分位數
    const median = calculatePercentile(sortedTimes, 50);    // P50 (中位數)
    const pr90 = calculatePercentile(sortedTimes, 90);      // P90
    const pr95 = calculatePercentile(sortedTimes, 95);      // P95
    const pr98 = calculatePercentile(sortedTimes, 98);      // P98
    const pr99 = calculatePercentile(sortedTimes, 99);      // P99

    // 7. 回傳結果
    const result = {
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
        countAbove100000: countAbove100000,
        total: validTimes.length,
        // 額外資訊
        originalTotal: renderTimes.length,
        invalidCount: renderTimes.length - validTimes.length
    };

    return result;
}

// 準備圖表資料
function prepareChartData(hourlyData) {
    const sortedHours = Object.keys(hourlyData).sort();
    return sortedHours.map(hour => ({
        hour: hour,
        count: hourlyData[hour]
    }));
}

// 生成簡單的文字圖表
function generateTextChart(chartData, dataSource) {
    if (chartData.length === 0) {
        console.log('\n📊 沒有可用的圖表資料');
        return;
    }

    console.log(`\n📊 每小時請求數量折線圖 (台灣時區，基於 ${dataSource}):`);
    console.log('=' .repeat(80));

    const maxCount = Math.max(...chartData.map(item => item.count));
    const scale = 50; // 圖表寬度

    chartData.forEach(item => {
        const barLength = Math.round((item.count / maxCount) * scale);
        const bar = '█'.repeat(barLength);
        console.log(`${item.hour} | ${bar} ${item.count}`);
    });
    console.log('=' .repeat(80));
}

// 測試時間轉換 (用於驗證)
function testTimeConversion() {
    const testTime = "'2025-07-16T15:59:41.198Z";
    const converted = convertToTaiwanTime(testTime);
    console.log(`🕐 時間轉換測試:`);
    console.log(`   原始時間 (UTC): ${testTime}`);
    console.log(`   台灣時間 (UTC+8): ${converted}`);
    console.log(`   期望結果: 2025-07-16 23:59:41.198`);
    console.log(`   轉換${converted && converted.startsWith('2025-07-16 23:59:41') ? '✅ 正確' : '❌ 錯誤'}`);
    console.log('');
}

// 主要執行函數
async function main() {
    try {
        // 測試時間轉換功能
        testTimeConversion();

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
        let resultDir = 'daily-analysis-result';
        if (folderName) {
            resultDir = `daily-analysis-result/prerender/${folderName}`;
        }
        if (!fs.existsSync(resultDir)) {
            fs.mkdirSync(resultDir, { recursive: true });
            console.log(`✅ 已建立 ${resultDir} 資料夾`);
        }

        // 分析兩個檔案
        const result = await analyzeTwoCsvFiles(userAgentFile, renderTimeFile);

        // 顯示分析結果
        console.log(`\n📈 資料分析結果 (台灣時區，增強版雙檔案分析):`);
        console.log('=' .repeat(70));

        console.log('\n📊 資料來源統計:');
        console.log(`  • 分析模式: 增強版雙檔案模式`);
        console.log(`  • User-Agent 檔案記錄: ${result.dataSourceStats.totalUserAgentFileRecords} 筆`);
        console.log(`  • Render Time 檔案記錄: ${result.dataSourceStats.totalRenderTimeFileRecords} 筆`);
        console.log(`  • 有效 User-Agent 記錄: ${result.dataSourceStats.userAgentRecords} 筆`);
        console.log(`  • 有效 Render Time 記錄: ${result.dataSourceStats.renderTimeRecords} 筆`);

        console.log('\n🔗 reqId 關聯統計:');
        console.log(`  • 總 reqId 數量: ${result.reqIdMappingStats.totalReqIds}`);
        console.log(`  • 成功匹配的 render 記錄: ${result.reqIdMappingStats.matchedRenderRecords} 筆`);
        console.log(`  • 匹配成功率: ${result.reqIdMappingStats.matchingRate}%`);

        console.log('\n🚀 Render Time 統計:');
        console.log(`  • 平均值: ${result.renderTimeStats.average} ms`);
        console.log(`  • 最小值: ${result.renderTimeStats.min} ms`);
        console.log(`  • 最大值: ${result.renderTimeStats.max} ms`);
        console.log(`  • 中位數 (P50): ${result.renderTimeStats.median} ms`);
        console.log(`  • 第90百分位數 (P90): ${result.renderTimeStats.pr90} ms`);
        console.log(`  • 第95百分位數 (P95): ${result.renderTimeStats.pr95} ms`);
        console.log(`  • 第98百分位數 (P98): ${result.renderTimeStats.pr98} ms`);
        console.log(`  • 第99百分位數 (P99): ${result.renderTimeStats.pr99} ms`);
        console.log(`  • 慢渲染 (8-20秒)的總數: ${result.renderTimeStats.countAbove8000to20000}`);
        console.log(`  • 異常渲染 (20-45秒)的總數: ${result.renderTimeStats.countAbove20000to45000}`);
        console.log(`  • 超時 (>45秒)的總數: ${result.renderTimeStats.countAbove45000}`);
        console.log(`  • 嚴重超時 (>100秒)的總數: ${result.renderTimeStats.countAbove100000}`);
        console.log(`  • 總資料筆數: ${result.renderTimeStats.total}`);

        console.log(`\n⏰ 每小時資料筆數平均值 (基於 User-Agent 檔案): ${result.avgRequestPerHour}`);

        console.log(`\n📊 每分鐘 Request 數量統計 (台灣時區，基於 User-Agent 檔案):`);
        console.log(`  • 最高值: ${result.requestPerMinuteStats.max} requests/分鐘`);
        console.log(`  • 最低值: ${result.requestPerMinuteStats.min} requests/分鐘`);
        console.log(`  • 平均值: ${result.requestPerMinuteStats.average} requests/分鐘`);
        console.log(`  • 統計分鐘數: ${result.requestPerMinuteStats.total} 分鐘`);

        console.log(`\n🏆 每分鐘 Request 數量 TOP 15 (基於 User-Agent 檔案):`);
        result.requestPerMinuteStats.top15.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.minute} - ${item.count} requests`);
        });

        // 新增：顯示每分鐘Request數量最高值的分鐘中User-Agent分布分析結果
        console.log('\n\n🎯 每分鐘Request數量最高值的分鐘中User-Agent分析 (台灣時區):');
        console.log('=' .repeat(70));

        const peakAnalysis = result.peakMinuteUserAgentAnalysis;
        console.log('\n📊 峰值分鐘總體資訊:');
        console.log(`  • 峰值分鐘: ${peakAnalysis.peakMinute}`);
        console.log(`  • 峰值請求數: ${peakAnalysis.peakRequestCount} 筆`);
        console.log(`  • 並列峰值分鐘數: ${peakAnalysis.totalPeakMinutes} 個`);
        console.log(`  • 該分鐘不同User-Agent數量: ${peakAnalysis.totalUserAgents} 種`);
        console.log(`  • 分析結果: ${peakAnalysis.analysis}`);

        if (peakAnalysis.totalPeakMinutes > 1) {
            console.log(`\n📅 所有並列峰值分鐘:`);
            peakAnalysis.allPeakMinutes.forEach((minute, index) => {
                console.log(`  ${index + 1}. ${minute}`);
            });
        }

        console.log(`\n🌐 峰值分鐘User-Agent排行榜 (前20名):`);
        const top20UserAgents = peakAnalysis.userAgentDistribution.slice(0, 20);
        top20UserAgents.forEach((item, index) => {
            console.log(`\n  ${index + 1}. User-Agent: ${item.userAgent.substring(0, 80)}${item.userAgent.length > 80 ? '...' : ''}`);
            console.log(`     • 請求數: ${item.count} 筆`);
            console.log(`     • 佔比: ${item.percentage}%`);
            console.log(`     • 瀏覽器: ${item.browser}`);
            console.log(`     • 操作系統: ${item.os}`);
        });

        console.log(`\n🌐 峰值分鐘瀏覽器分布:`);
        peakAnalysis.browserDistribution.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.browser}: ${item.count} 筆 (${item.percentage}%)`);
        });

        console.log(`\n💻 峰值分鐘操作系統分布:`);
        peakAnalysis.osDistribution.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.os}: ${item.count} 筆 (${item.percentage}%)`);
        });

        // 新增：顯示慢渲染時段的同時同分統計結果
        console.log('\n\n🕐 慢渲染時段同時同分統計 (>8000ms, 台灣時區):');
        console.log('=' .repeat(50));

        console.log('\n📊 慢渲染時段同時同分總體統計:');
        console.log(`  • 不同時分點總數: ${result.slowRenderHourMinuteStats.summary.total_unique_hour_minutes}`);
        console.log(`  • 慢渲染總記錄數: ${result.slowRenderHourMinuteStats.summary.total_records}`);
        console.log(`  • 有重複的時分點數: ${result.slowRenderHourMinuteStats.summary.duplicate_count}`);
        console.log(`  • 最高出現頻率: ${result.slowRenderHourMinuteStats.summary.max_frequency} 次`);

        if (result.slowRenderHourMinuteStats.summary.most_frequent_times.length > 0) {
            console.log(`\n🏆 慢渲染出現次數最多的時分:`);
            result.slowRenderHourMinuteStats.summary.most_frequent_times.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.time} - ${item.count} 次`);
            });
        }

        console.log(`\n🔄 慢渲染重複出現的時分點 (出現次數 > 1):`);
        const duplicateTimes = result.slowRenderHourMinuteStats.duplicate_hour_minute_stats
            .sort((a, b) => b.count - a.count) // 按出現次數排序
            .slice(0, 20); // 取前20名

        if (duplicateTimes.length > 0) {
            duplicateTimes.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.time} - ${item.count} 次`);
            });
        } else {
            console.log('  沒有重複的慢渲染時分點');
        }

        // 顯示高頻訪問分析結果
        console.log('\n\n🚨 高頻訪問模式分析結果:');
        console.log('=' .repeat(50));
        
        console.log('\n📊 整體違規統計:');
        console.log(`  • 分鐘級別違規總數: ${result.highFrequencyAnalysis.summary.total_minute_violations}`);
        console.log(`  • 秒級別違規總數: ${result.highFrequencyAnalysis.summary.total_second_violations}`);
        console.log(`  • 涉及的不同 UserAgent 數量: ${result.highFrequencyAnalysis.summary.unique_violating_user_agents}`);
        console.log(`  • 單分鐘內最大訪問次數: ${result.highFrequencyAnalysis.summary.max_per_minute}`);
        console.log(`  • 單秒內最大訪問次數: ${result.highFrequencyAnalysis.summary.max_per_second}`);

        if (result.highFrequencyAnalysis.minutely_violations.length > 0) {
            console.log('\n🚨 一分鐘內訪問大於2次的 UserAgent (前5名):');
            result.highFrequencyAnalysis.minutely_violations.slice(0, 5).forEach((item, index) => {
                const shortUA = item.user_agent.length > 60 ? item.user_agent.substring(0, 60) + '...' : item.user_agent;
                console.log(`  ${index + 1}. ${item.timestamp} - ${item.access_count}次`);
                console.log(`     ${shortUA}`);
            });
        } else {
            console.log('\n✅ 未發現一分鐘內訪問大於2次的情況');
        }

        if (result.highFrequencyAnalysis.secondly_violations.length > 0) {
            console.log('\n⚡ 一秒內訪問大於2次的 UserAgent (前5名):');
            result.highFrequencyAnalysis.secondly_violations.slice(0, 5).forEach((item, index) => {
                const shortUA = item.user_agent.length > 60 ? item.user_agent.substring(0, 60) + '...' : item.user_agent;
                console.log(`  ${index + 1}. ${item.timestamp} - ${item.access_count}次`);
                console.log(`     ${shortUA}`);
            });
        } else {
            console.log('\n✅ 未發現一秒內訪問大於2次的情況');
        }

        // 顯示 URL 分析結果
        console.log('\n\n🔗 URL 分析結果:');
        console.log('=' .repeat(50));

        console.log('\n📊 URL 總體統計:');
        console.log(`  • 總請求數: ${result.urlAnalysis.overall_stats.total_requests}`);
        console.log(`  • 不重複 URL 數: ${result.urlAnalysis.overall_stats.unique_urls}`);
        console.log(`  • 有重複的 URL 數: ${result.urlAnalysis.overall_stats.duplicate_urls}`);
        console.log(`  • URL 重複率: ${result.urlAnalysis.overall_stats.duplicate_rate}`);

        console.log('\n🔄 重複次數最多的 URL (前10名):');
        const top10DuplicateUrls = result.urlAnalysis.duplicate_url_details.slice(0, 10);
        top10DuplicateUrls.forEach((item, index) => {
            console.log(`\n  ${index + 1}. ${item.url}`);
            console.log(`     • 出現次數: ${item.count} 次`);
            console.log(`     • 平均 render 時間: ${item.avgRenderTime} ms`);
            console.log(`     • 最大 render 時間: ${item.maxRenderTime} ms`);
        });

        console.log('\n\n⏱️  Render 時間前 15 名 (最慢的請求，包含 User-Agent):');
        result.urlAnalysis.top_15_render_times.forEach((item, index) => {
            console.log(`\n  ${index + 1}. Render 時間: ${item.renderTime} ms`);
            console.log(`     URL: ${item.url}`);
            console.log(`     時間: ${item.timestamp || '無時間記錄'}`);
            console.log(`     reqId: ${item.reqId || 'N/A'}`);
            console.log(`     User-Agent: ${item.userAgent}`);
            console.log(`     匹配狀態: ${item.userAgentStatus}`);
        });

        // 顯示 User-Agent 分析結果 (增強版)
        if (result.userAgentAnalysis) {
            console.log('\n\n🌐 User-Agent 分析結果 (增強版，包含平均 Render 時間):');
            console.log('=' .repeat(50));

            console.log('\n📊 User-Agent 總體統計:');
            console.log(`  • 總請求數: ${result.userAgentAnalysis.overall_stats.total_requests}`);
            console.log(`  • 不同 User-Agent 數: ${result.userAgentAnalysis.overall_stats.unique_user_agents}`);

            console.log('\n🥇 User-Agent 排行榜 (前10名，包含平均 Render 時間):');
            const top10UserAgents = result.userAgentAnalysis.user_agent_ranking.slice(0, 10);
            top10UserAgents.forEach((item, index) => {
                console.log(`\n  ${index + 1}. ${item.userAgent}`);
                console.log(`     • 訪問次數: ${item.count} 次`);
                console.log(`     • 佔比: ${item.percentage}%`);
                console.log(`     • 瀏覽器: ${item.browser}`);
                console.log(`     • 操作系統: ${item.os}`);
                console.log(`     • 平均 Render 時間: ${item.avgRenderTime} ms`);
                console.log(`     • 最大 Render 時間: ${item.maxRenderTime} ms`);
                console.log(`     • 最小 Render 時間: ${item.minRenderTime} ms`);
                console.log(`     • Render 記錄數: ${item.renderTimeCount} 筆`);
            });

            console.log('\n🌐 瀏覽器統計:');
            result.userAgentAnalysis.browser_stats.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.browser}: ${item.count} 次 (${item.percentage}%)`);
            });

            console.log('\n💻 操作系統統計:');
            result.userAgentAnalysis.os_stats.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.os}: ${item.count} 次 (${item.percentage}%)`);
            });

            console.log('\n⏰ 每小時最常訪問的 User-Agent (前24小時):');
            const hourlyUserAgentEntries = Object.entries(result.userAgentAnalysis.hourly_top_user_agents)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 24);

            hourlyUserAgentEntries.forEach(([hour, data]) => {
                console.log(`\n  ${hour}:`);
                console.log(`     • 最常訪問: ${data.top.userAgent.substring(0, 80)}${data.top.userAgent.length > 80 ? '...' : ''}`);
                console.log(`     • 訪問次數: ${data.top.count} 次`);
                console.log(`     • 該小時總請求: ${data.totalRequests} 次`);
                console.log(`     • 不同 User-Agent 數: ${data.uniqueAgents} 個`);
            });
        } else {
            console.log('\n\n🌐 User-Agent 分析結果: 無可用資料');
        }

        console.log(`\n📈 每小時資料筆數詳細 (台灣時區，基於 User-Agent 檔案):`);
        const sortedHourlyData = Object.entries(result.requestHourlyData)
            .sort(([a], [b]) => a.localeCompare(b));

        sortedHourlyData.forEach(([hour, count]) => {
            console.log(`  ${hour}: ${count} 筆`);
        });

        // 顯示文字圖表
        generateTextChart(result.chartData, result.frequencyDataSource);

        console.log('\n🐌 大於 8000ms 的時段 (台灣時區，按時間排序，包含 User-Agent 和 Pod):');
        if (result.slowRenderPeriods.length > 0) {
            // 按時間排序
            const sortedSlowPeriods = result.slowRenderPeriods
                .filter(p => p.timestamp) // 過濾掉沒有時間戳記的
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            sortedSlowPeriods.slice(0, 10).forEach((period, index) => {
                console.log(`\n  ${index + 1}. ${period.timestamp} - ${period.renderTime}ms`);
                console.log(`     URL: ${period.url}`);
                console.log(`     reqId: ${period.reqId || 'N/A'}`);
                console.log(`     User-Agent: ${period.userAgent || 'No Match'}`);
                console.log(`     Pod Name: ${period.podName || 'unknown'}`);
            });

            if (sortedSlowPeriods.length > 10) {
                console.log(`  ... 還有 ${sortedSlowPeriods.length - 10} 筆記錄 (請查看 JSON 輸出檔案)`);
            }

            if (sortedSlowPeriods.length < result.slowRenderPeriods.length) {
                console.log(`  注意: 有 ${result.slowRenderPeriods.length - sortedSlowPeriods.length} 筆資料因時間格式問題未顯示`);
            }
        } else {
            console.log('  沒有發現大於 8000ms 的 render time');
        }

        // 生成檔案名稱
        const userAgentBaseName = userAgentFile.split('/').pop().replace('.csv', '');
        const renderTimeBaseName = renderTimeFile.split('/').pop().replace('.csv', '');
        const filePrefix = `dual_${userAgentBaseName}_${renderTimeBaseName}`;

        // 輸出 JSON 檔案
        const jsonOutput = {
            analysis_time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            timezone_info: 'All timestamps have been converted to Taiwan timezone (UTC+8)',
            analysis_mode: 'Enhanced Dual File Analysis with reqId Mapping and Peak Minute User-Agent Analysis',
            file_info: {
                user_agent_file: userAgentFile,
                render_time_file: renderTimeFile
            },
            data_source_stats: result.dataSourceStats,
            reqId_mapping_stats: result.reqIdMappingStats,
            render_time_stats: {
                average_ms: result.renderTimeStats.average,
                min_ms: result.renderTimeStats.min,
                max_ms: result.renderTimeStats.max,
                median_p50_ms: result.renderTimeStats.median,
                p90_ms: result.renderTimeStats.pr90,
                p95_ms: result.renderTimeStats.pr95,
                p98_ms: result.renderTimeStats.pr98,
                p99_ms: result.renderTimeStats.pr99,
                count_above_8000to20000ms: result.renderTimeStats.countAbove8000to20000,
                count_above_20000to45000ms: result.renderTimeStats.countAbove20000to45000,
                count_above_45000ms: result.renderTimeStats.countAbove45000,
                count_above_100000ms: result.renderTimeStats.countAbove100000,
                total_records: result.renderTimeStats.total
            },
            avg_requests_per_hour: result.avgRequestPerHour,
            per_minute_stats: {
                max_value: result.requestPerMinuteStats.max,
                min_value: result.requestPerMinuteStats.min,
                average_value: result.requestPerMinuteStats.average,
                total_minutes: result.requestPerMinuteStats.total,
                top_15: result.requestPerMinuteStats.top15
            },
            // 新增：每分鐘Request數量最高值的分鐘中User-Agent分布分析
            peak_minute_user_agent_analysis: {
                peak_minute: peakAnalysis.peakMinute,
                peak_request_count: peakAnalysis.peakRequestCount,
                total_peak_minutes: peakAnalysis.totalPeakMinutes,
                all_peak_minutes: peakAnalysis.allPeakMinutes,
                total_user_agents: peakAnalysis.totalUserAgents,
                user_agent_distribution: peakAnalysis.userAgentDistribution,
                browser_distribution: peakAnalysis.browserDistribution,
                os_distribution: peakAnalysis.osDistribution,
                analysis: peakAnalysis.analysis
            },
            // 新增：慢渲染時段的同時同分統計
            slow_render_hour_minute_stats: {
                summary: result.slowRenderHourMinuteStats.summary,
                all_hour_minute_stats: result.slowRenderHourMinuteStats.all_hour_minute_stats,
                duplicate_hour_minute_stats: result.slowRenderHourMinuteStats.duplicate_hour_minute_stats
            },
            url_analysis: {
                overall_stats: result.urlAnalysis.overall_stats,
                duplicate_url_details_top_20: result.urlAnalysis.duplicate_url_details.slice(0, 20),
                top_15_render_times: result.urlAnalysis.top_15_render_times,
                all_url_stats: result.urlAnalysis.all_url_stats
            },
            user_agent_analysis: result.userAgentAnalysis ? {
                overall_stats: result.userAgentAnalysis.overall_stats,
                user_agent_ranking: result.userAgentAnalysis.user_agent_ranking,
                browser_stats: result.userAgentAnalysis.browser_stats,
                os_stats: result.userAgentAnalysis.os_stats,
                hourly_top_user_agents: result.userAgentAnalysis.hourly_top_user_agents
            } : null,
            hourly_request_data: result.requestHourlyData,
            minutely_request_data: result.requestMinutelyData,
            slow_render_periods: result.slowRenderPeriods
                .filter(p => p.timestamp) // 過濾掉沒有時間戳記的
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) // 按時間排序
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
                    pod_name: p.podName,
                    details: p.textPayload,
                    // 新增的時間戳記欄位 (Google Cloud Trace 日誌可查詢格式)
                    user_agent_record_time: convertToGoogleCloudFormat(p.userAgentTimestamp),
                    got_200_record_time: convertToGoogleCloudFormat(p.got200Timestamp)
                })),
            chart_data: result.chartData
        };

        const jsonFileName = `${resultDir}/${filePrefix}_analysis.json`;
        fs.writeFileSync(jsonFileName, JSON.stringify(jsonOutput, null, 2), 'utf8');
        console.log(`\n✅ 分析完成! JSON 結果已儲存至 ${jsonFileName}`);

        // 輸出 TXT 檔案
        const userAgentSection = result.userAgentAnalysis ? `
User-Agent 分析結果 (增強版，包含平均 Render 時間):
================================================
User-Agent 總體統計:
• 總請求數: ${result.userAgentAnalysis.overall_stats.total_requests}
• 不同 User-Agent 數: ${result.userAgentAnalysis.overall_stats.unique_user_agents}

User-Agent 排行榜 (前10名，包含平均 Render 時間):
${result.userAgentAnalysis.user_agent_ranking.slice(0, 10).map((item, index) => `
${index + 1}. ${item.userAgent}
   • 訪問次數: ${item.count} 次
   • 佔比: ${item.percentage}%
   • 瀏覽器: ${item.browser}
   • 操作系統: ${item.os}
   • 平均 Render 時間: ${item.avgRenderTime} ms
   • 最大 Render 時間: ${item.maxRenderTime} ms
   • 最小 Render 時間: ${item.minRenderTime} ms
   • Render 記錄數: ${item.renderTimeCount} 筆`).join('\n')}

瀏覽器統計:
${result.userAgentAnalysis.browser_stats.map((item, index) =>
            `${index + 1}. ${item.browser}: ${item.count} 次 (${item.percentage}%)`).join('\n')}

操作系統統計:
${result.userAgentAnalysis.os_stats.map((item, index) =>
            `${index + 1}. ${item.os}: ${item.count} 次 (${item.percentage}%)`).join('\n')}

每小時最常訪問的 User-Agent (前24小時):
${Object.entries(result.userAgentAnalysis.hourly_top_user_agents)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 24)
            .map(([hour, data]) => `
${hour}:
   • 最常訪問: ${data.top.userAgent.substring(0, 80)}${data.top.userAgent.length > 80 ? '...' : ''}
   • 訪問次數: ${data.top.count} 次  
   • 該小時總請求: ${data.totalRequests} 次
   • 不同 User-Agent 數: ${data.uniqueAgents} 個`).join('\n')}
` : 'User-Agent 分析結果: 無可用資料';

        // 新增：峰值分鐘User-Agent分析部分
        const peakMinuteSection = `
每分鐘Request數量最高值的分鐘中User-Agent分析 (台灣時區):
================================================
峰值分鐘總體資訊:
• 峰值分鐘: ${peakAnalysis.peakMinute}
• 峰值請求數: ${peakAnalysis.peakRequestCount} 筆
• 並列峰值分鐘數: ${peakAnalysis.totalPeakMinutes} 個
• 該分鐘不同User-Agent數量: ${peakAnalysis.totalUserAgents} 種
• 分析結果: ${peakAnalysis.analysis}

${peakAnalysis.totalPeakMinutes > 1 ? `所有並列峰值分鐘:
${peakAnalysis.allPeakMinutes.map((minute, index) => `${index + 1}. ${minute}`).join('\n')}` : ''}

峰值分鐘User-Agent排行榜 (前20名):
${top20UserAgents.map((item, index) => `
${index + 1}. User-Agent: ${item.userAgent.substring(0, 80)}${item.userAgent.length > 80 ? '...' : ''}
   • 請求數: ${item.count} 筆
   • 佔比: ${item.percentage}%
   • 瀏覽器: ${item.browser}
   • 操作系統: ${item.os}`).join('\n')}

峰值分鐘瀏覽器分布:
${peakAnalysis.browserDistribution.map((item, index) =>
            `${index + 1}. ${item.browser}: ${item.count} 筆 (${item.percentage}%)`).join('\n')}

峰值分鐘操作系統分布:
${peakAnalysis.osDistribution.map((item, index) =>
            `${index + 1}. ${item.os}: ${item.count} 筆 (${item.percentage}%)`).join('\n')}
`;

        // 新增：慢渲染時段同時同分統計部分
        const slowRenderHourMinuteSection = `
慢渲染時段同時同分統計 (>8000ms, 台灣時區):
================================================
慢渲染時段同時同分總體統計:
• 不同時分點總數: ${result.slowRenderHourMinuteStats.summary.total_unique_hour_minutes}
• 慢渲染總記錄數: ${result.slowRenderHourMinuteStats.summary.total_records}
• 有重複的時分點數: ${result.slowRenderHourMinuteStats.summary.duplicate_count}
• 最高出現頻率: ${result.slowRenderHourMinuteStats.summary.max_frequency} 次

慢渲染出現次數最多的時分:
${result.slowRenderHourMinuteStats.summary.most_frequent_times.length > 0 ?
            result.slowRenderHourMinuteStats.summary.most_frequent_times.map((item, index) =>
                `${index + 1}. ${item.time} - ${item.count} 次`).join('\n') : '無慢渲染記錄'}

慢渲染重複出現的時分點 (出現次數 > 1):
${result.slowRenderHourMinuteStats.duplicate_hour_minute_stats.length > 0 ?
            result.slowRenderHourMinuteStats.duplicate_hour_minute_stats
                .sort((a, b) => b.count - a.count)
                .slice(0, 20)
                .map((item, index) => `${index + 1}. ${item.time} - ${item.count} 次`).join('\n') : '沒有重複的慢渲染時分點'}

所有慢渲染時分點統計 (按時間排序):
${result.slowRenderHourMinuteStats.all_hour_minute_stats.length > 0 ?
            result.slowRenderHourMinuteStats.all_hour_minute_stats
                .map(item => `${item.time} - ${item.count} 次`).join('\n') : '沒有慢渲染記錄'}
`;

        const txtOutput = `
CSV 日誌分析報告 (增強版雙檔案分析模式 + 峰值分鐘User-Agent分析)
生成時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
時區說明: 所有時間已轉換為台灣時區 (UTC+8)
================================================================

檔案資訊:
• User-Agent 檔案: ${userAgentFile}
• Render Time 檔案: ${renderTimeFile}

資料來源統計:
• 分析模式: 增強版雙檔案模式 (包含 reqId 關聯)
• User-Agent 檔案記錄: ${result.dataSourceStats.totalUserAgentFileRecords} 筆
• Render Time 檔案記錄: ${result.dataSourceStats.totalRenderTimeFileRecords} 筆
• 有效 User-Agent 記錄: ${result.dataSourceStats.userAgentRecords} 筆
• 有效 Render Time 記錄: ${result.dataSourceStats.renderTimeRecords} 筆

reqId 關聯統計:
• 總 reqId 數量: ${result.reqIdMappingStats.totalReqIds}
• 成功匹配的 render 記錄: ${result.reqIdMappingStats.matchedRenderRecords} 筆
• 匹配成功率: ${result.reqIdMappingStats.matchingRate}%

Render Time 統計:
• 平均值: ${result.renderTimeStats.average} ms
• 最小值: ${result.renderTimeStats.min} ms  
• 最大值: ${result.renderTimeStats.max} ms
• 中位數 (P50): ${result.renderTimeStats.median} ms
• 第90百分位數 (P90): ${result.renderTimeStats.pr90} ms
• 第95百分位數 (P95): ${result.renderTimeStats.pr95} ms
• 第98百分位數 (P98): ${result.renderTimeStats.pr98} ms
• 第99百分位數 (P99): ${result.renderTimeStats.pr99} ms
• 慢渲染 (8-20秒)的總數: ${result.renderTimeStats.countAbove8000to20000}
• 異常渲染 (20-45秒)的總數: ${result.renderTimeStats.countAbove20000to45000}
• 超時 (>45秒)的總數: ${result.renderTimeStats.countAbove45000}
• 嚴重超時 (>100秒)的總數: ${result.renderTimeStats.countAbove100000}
• 總資料筆數: ${result.renderTimeStats.total}

每小時資料筆數平均值 (基於 User-Agent 檔案): ${result.avgRequestPerHour}

每分鐘 Request 數量統計 (基於 User-Agent 檔案):
• 最高值: ${result.requestPerMinuteStats.max} requests/分鐘
• 最低值: ${result.requestPerMinuteStats.min} requests/分鐘
• 平均值: ${result.requestPerMinuteStats.average} requests/分鐘
• 統計分鐘數: ${result.requestPerMinuteStats.total} 分鐘

每分鐘 Request 數量 TOP 15 (基於 User-Agent 檔案):
${result.requestPerMinuteStats.top15.map((item, index) =>
            `${index + 1}. ${item.minute} - ${item.count} requests`).join('\n')}

${peakMinuteSection}

${slowRenderHourMinuteSection}

高頻訪問模式分析:
================================================
📊 整體違規統計:
• 分鐘級別違規總數: ${result.highFrequencyAnalysis.summary.total_minute_violations}
• 秒級別違規總數: ${result.highFrequencyAnalysis.summary.total_second_violations}
• 涉及的不同 UserAgent 數量: ${result.highFrequencyAnalysis.summary.unique_violating_user_agents}
• 單分鐘內最大訪問次數: ${result.highFrequencyAnalysis.summary.max_per_minute}
• 單秒內最大訪問次數: ${result.highFrequencyAnalysis.summary.max_per_second}

🚨 一分鐘內訪問大於2次的 UserAgent (前10名):
${result.highFrequencyAnalysis.minutely_violations.length > 0 
    ? result.highFrequencyAnalysis.minutely_violations.slice(0, 10).map((item, index) => `
${index + 1}. 時間: ${item.timestamp}
   User-Agent: ${item.user_agent.length > 80 ? item.user_agent.substring(0, 80) + '...' : item.user_agent}
   訪問次數: ${item.access_count} 次`).join('\n')
    : '未發現違規情況'}

⚡ 一秒內訪問大於2次的 UserAgent (前10名):
${result.highFrequencyAnalysis.secondly_violations.length > 0 
    ? result.highFrequencyAnalysis.secondly_violations.slice(0, 10).map((item, index) => `
${index + 1}. 時間: ${item.timestamp}
   User-Agent: ${item.user_agent.length > 80 ? item.user_agent.substring(0, 80) + '...' : item.user_agent}
   訪問次數: ${item.access_count} 次`).join('\n')
    : '未發現違規情況'}

URL 分析結果:
================================================
URL 總體統計:
• 總請求數: ${result.urlAnalysis.overall_stats.total_requests}
• 不重複 URL 數: ${result.urlAnalysis.overall_stats.unique_urls}
• 有重複的 URL 數: ${result.urlAnalysis.overall_stats.duplicate_urls}
• URL 重複率: ${result.urlAnalysis.overall_stats.duplicate_rate}

重複次數最多的 URL (前10名):
${top10DuplicateUrls.map((item, index) => `
${index + 1}. ${item.url}
   • 出現次數: ${item.count} 次
   • 平均 render 時間: ${item.avgRenderTime} ms
   • 最大 render 時間: ${item.maxRenderTime} ms`).join('\n')}

Render 時間前 15 名 (最慢的請求，包含 User-Agent):
${result.urlAnalysis.top_15_render_times.map((item, index) => `
${index + 1}. Render 時間: ${item.renderTime} ms
   URL: ${item.url}
   時間: ${item.timestamp || '無時間記錄'}
   reqId: ${item.reqId || 'N/A'}
   User-Agent: ${item.userAgent}
   匹配狀態: ${item.userAgentStatus}`).join('\n')}

${userAgentSection}

每小時資料筆數詳細 (台灣時區，基於 User-Agent 檔案):
${Object.entries(result.requestHourlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([hour, count]) => `${hour}: ${count} 筆`)
            .join('\n')}

大於 8000ms 的時段 (台灣時區，按時間排序，包含 User-Agent 和 Pod，前10筆):
${result.slowRenderPeriods.length > 0
            ? result.slowRenderPeriods
                .filter(p => p.timestamp)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                .slice(0, 10)
                .map((p, i) => `
${i + 1}. ${p.timestamp} - ${p.renderTime}ms
   URL: ${p.url}
   reqId: ${p.reqId || 'N/A'}
   User-Agent: ${p.userAgent || 'No Match'}
   Pod Name: ${p.podName || 'unknown'}`).join('\n')
            : '沒有發現大於 8000ms 的 render time'}
${result.slowRenderPeriods.length > 10 ? `\n... 還有 ${result.slowRenderPeriods.length - 10} 筆記錄 (請查看 JSON 輸出檔案)` : ''}
`;

        const txtFileName = `${resultDir}/${filePrefix}_analysis.txt`;
        fs.writeFileSync(txtFileName, txtOutput, 'utf8');
        console.log(`✅ 文字報告已儲存至 ${txtFileName}`);

        console.log('\n🔄 增強版雙檔案分析模式特點 (新版):');
        console.log('  • 分別讀取 User-Agent 和 Render Time 兩個檔案');
        console.log('  • 新增 reqId 關聯分析功能');
        console.log('  • User-Agent 排行榜包含平均 render 時間統計');
        console.log('  • Render 時間前 15 名包含對應的 User-Agent 資訊');
        console.log('  • 慢渲染記錄包含 User-Agent 資訊');
        console.log('  • 提供 reqId 匹配成功率統計');
        console.log('  • 🆕 新增每分鐘Request數量最高值的分鐘中User-Agent分布分析');
        console.log('  • 輸出檔案儲存至 resultV4/ 資料夾');
        console.log('  • 完整的 JSON 和 TXT 報告輸出');

    } catch (error) {
        console.error('❌ 分析過程中發生錯誤:', error.message);
        console.error('錯誤詳情:', error);
    }
}

// 執行程式
main();
