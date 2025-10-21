#!/usr/bin/env node
/**
 * 性能數據提取工具
 * 
 * 功能：
 * 1. 從每日分析結果的 .txt 和 .json 檔案中提取性能數據
 * 2. 計算各種性能指標（QPS、吞吐量等）
 * 3. 生成匯總報告和 CSV 檔案
 * 
 * 使用方式：node performance-data-extractor.js
 */
const fs = require('fs');
const path = require('path');

/**
 * 從 .txt 分析檔案中提取性能數據
 * @param {string} filePath - .txt 檔案路徑
 * @returns {Object|null} 包含各項性能指標的物件，錯誤時返回 null
 */
function extractTxtData(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        // 初始化各項指標變數
        let totalRequests = null;        // 總請求數
        let avgRenderTime = null;        // 平均渲染時間 (ms)
        let peakRequestsPerMin = null;   // 峰值每分鐘請求數
        let avgRequestsPerMin = null;    // 平均每分鐘請求數
        let p99RenderTime = null;        // P99 渲染時間 (ms)
        
        // 逐行解析檔案內容，提取各項指標
        for (const line of lines) {
            // 提取總請求數
            if (line.includes('總 reqId 數量:')) {
                const match = line.match(/總 reqId 數量:\s*(\d+)/);
                if (match) totalRequests = parseInt(match[1]);
            }
            
            // 提取平均渲染時間
            if (line.includes('平均值:') && line.includes('ms')) {
                const match = line.match(/平均值:\s*([\d.]+)\s*ms/);
                if (match) avgRenderTime = parseFloat(match[1]);
            }
            
            // 提取峰值每分鐘請求數
            if (line.includes('最高值:') && line.includes('requests/分鐘')) {
                const match = line.match(/最高值:\s*(\d+)\s*requests\/分鐘/);
                if (match) peakRequestsPerMin = parseInt(match[1]);
            }
            
            // 提取平均每分鐘請求數
            if (line.includes('平均值:') && line.includes('requests/分鐘')) {
                const match = line.match(/平均值:\s*([\d.]+)\s*requests\/分鐘/);
                if (match) avgRequestsPerMin = parseFloat(match[1]);
            }
            
            // 提取 P99 渲染時間
            if (line.includes('第99百分位數 (P99):')) {
                const match = line.match(/第99百分位數 \(P99\):\s*([\d.]+)\s*ms/);
                if (match) p99RenderTime = parseFloat(match[1]);
            }
        }
        
        return {
            totalRequests,
            avgRenderTime,
            peakRequestsPerMin,
            avgRequestsPerMin,
            p99RenderTime
        };
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error.message);
        return null;
    }
}

/**
 * 從 .json 分析檔案中提取 Pod 相關數據
 * @param {string} filePath - .json 檔案路徑
 * @returns {Object|null} 包含 Pod 數量和處理記錄數的物件，錯誤時返回 null
 */
function extractJsonData(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        // 選項1: 使用當天出現過的 Pod 總數 (可能包含重啟的 Pod)
        let sampledPods = 0;
        if (data.overall_stats?.renderTimeStats?.byPod) {
            const podEntries = Object.entries(data.overall_stats.renderTimeStats.byPod);
            sampledPods = podEntries.length; // 當天出現過的 Pod 總數
        }
        
        // 選項2: 使用實際運行的固定 Pod 數量
        const actualRunningPods = 30;
        
        // 提取總處理記錄數
        const totalProcessedRecords = data.overall_stats?.totalProcessedUserAgentRecords || null;
        
        return {
            // totalPods: sampledPods, // 當天出現過的 Pod 總數 (包含可能的重啟)
            totalPods: actualRunningPods, // 取消註解此行並註解上一行來使用固定值
            totalProcessedRecords
        };
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error.message);
        return null;
    }
}

/**
 * 生成指定日期範圍的日期字串陣列
 * @returns {string[]} 格式為 YYYYMMDD 的日期字串陣列
 */
function generateDateRange() {
    const dates = [];
    const startDate = new Date('2025-09-24');  // 分析開始日期
    const endDate = new Date('2025-10-20');    // 分析結束日期
    
    // 逐日生成日期字串
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        dates.push(`${year}${month}${day}`);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
}

/**
 * 主要處理函數 - 批量分析多日性能數據
 * 
 * 流程：
 * 1. 生成日期範圍
 * 2. 逐日讀取並分析 .txt 和 .json 檔案
 * 3. 計算各種性能指標
 * 4. 輸出表格化結果和統計摘要
 * 5. 生成 CSV 檔案
 * 
 * @returns {Array} 包含所有日期分析結果的陣列
 */
function processPerformanceData() {
    const dates = generateDateRange();
    const results = [];
    
    // 定義檔案路徑
    const baseDir1 = '/Users/liaoliting/Webserver/analysis-log/daily-analysis-result/category/';      // .txt 檔案目錄
    const baseDir2 = '/Users/liaoliting/Webserver/analysis-log/daily-pod-analysis-result/category/';  // .json 檔案目錄
    
    // 輸出表頭
    console.log('Extracting performance data from August 21 to September 16, 2025...\n');
    console.log('Date\t\tTotal Req\tPeak Req/Min\tAvg Req/Min\tAvg RT(ms)\tP99 RT(ms)\tPods(見過)\tEst Peak QPS\tEst Avg QPS\tEst Pod Throughput');
    console.log('-'.repeat(150));
    
    // 逐日處理性能數據
    for (const date of dates) {
        // 格式化日期供顯示用 (YYYY-MM-DD)
        const displayDate = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
        
        // 建構檔案路徑
        const txtFile = path.join(baseDir1, `dual_user-agent-log-${date}-category_log-${date}-category_analysis.txt`);
        const jsonFile = path.join(baseDir2, `pod_dual_user-agent-log-${date}-category_log-${date}-category_summary.json`);
        
        // 提取數據
        const txtData = extractTxtData(txtFile);
        const jsonData = extractJsonData(jsonFile);
        
        if (txtData && jsonData) {
            // 提取基本指標
            const totalRequests = txtData.totalRequests || 0;
            const avgRenderTime = txtData.avgRenderTime || 0;
            const peakRequestsPerMin = txtData.peakRequestsPerMin || 0;
            const avgRequestsPerMin = txtData.avgRequestsPerMin || 0;
            const p99RenderTime = txtData.p99RenderTime || 0;
            const totalPods = jsonData.totalPods || 0;
            
            // 計算估算指標
            const estPeakQPS = (peakRequestsPerMin / 60).toFixed(2);           // 估算峰值 QPS (每秒查詢數)
            const estAvgQPS = (totalRequests / 86400).toFixed(2);              // 估算平均 QPS (一天 86400 秒)
            const estPodConcurrency = totalPods > 0 ? (peakRequestsPerMin / totalPods).toFixed(2) : '0.00';  // 估算單 Pod 吞吐量
            
            // 格式化數字供顯示
            const formattedTotalReq = totalRequests.toLocaleString();
            const formattedAvgRT = avgRenderTime.toFixed(2);
            const formattedP99RT = p99RenderTime.toFixed(2);
            const formattedAvgReqMin = avgRequestsPerMin.toFixed(2);
            
            // 輸出該日數據
            console.log(`${displayDate}\t${formattedTotalReq}\t\t${peakRequestsPerMin}\t\t${formattedAvgReqMin}\t\t${formattedAvgRT}\t\t${formattedP99RT}\t\t${totalPods}\t${estPeakQPS}\t\t${estAvgQPS}\t\t${estPodConcurrency}`);
            
            // 儲存結果供 CSV 輸出使用
            results.push({
                date: displayDate,
                totalRequests,
                peakRequestsPerMin,
                avgRequestsPerMin,
                avgRenderTime,
                p99RenderTime,
                totalPods,
                estPeakQPS: parseFloat(estPeakQPS),
                estAvgQPS: parseFloat(estAvgQPS),
                estPodConcurrency: parseFloat(estPodConcurrency)
            });
        } else {
            console.log(`${displayDate}\tDATA MISSING OR ERROR`);
        }
    }
    
    // 生成 CSV 檔案
    const csvPath = '/Users/liaoliting/Webserver/analysis-log/performance-summary.csv';
    const csvHeaders = 'Date,Total Requests,Peak Requests/Min,Avg Requests/Min,Avg Render Time (ms),P99 Render Time (ms),Pods Seen,Est Peak QPS,Est Avg QPS,Est Pod Throughput\n';
    const csvRows = results.map(row => 
        `${row.date},${row.totalRequests},${row.peakRequestsPerMin},${row.avgRequestsPerMin.toFixed(2)},${row.avgRenderTime.toFixed(2)},${row.p99RenderTime.toFixed(2)},${row.totalPods},${row.estPeakQPS},${row.estAvgQPS},${row.estPodConcurrency}`
    ).join('\n');
    
    fs.writeFileSync(csvPath, csvHeaders + csvRows);
    
    // 計算並顯示整體統計
    console.log('\n' + '='.repeat(140));
    console.log('OVERALL STATISTICS (August 21 - September 16, 2025)');
    console.log('='.repeat(140));
    
    if (results.length > 0) {
        // 計算各項整體指標
        const totalRequestsSum = results.reduce((sum, row) => sum + row.totalRequests, 0);
        const avgRenderTimeWeighted = results.reduce((sum, row) => sum + (row.avgRenderTime * row.totalRequests), 0) / totalRequestsSum;  // 加權平均渲染時間
        const maxPeakRequestsPerMin = Math.max(...results.map(row => row.peakRequestsPerMin));  // 最高峰值請求/分鐘
        const avgPods = results.reduce((sum, row) => sum + row.totalPods, 0) / results.length;  // 平均 Pod 數量
        const maxEstPeakQPS = Math.max(...results.map(row => row.estPeakQPS));  // 最高估算峰值 QPS
        const avgEstAvgQPS = results.reduce((sum, row) => sum + row.estAvgQPS, 0) / results.length;  // 平均估算 QPS
        
        // 顯示統計結果
        console.log(`Total Days Analyzed: ${results.length}`);
        console.log(`Total Requests: ${totalRequestsSum.toLocaleString()}`);
        console.log(`Average Daily Requests: ${(totalRequestsSum / results.length).toLocaleString()}`);
        console.log(`Weighted Average Render Time: ${avgRenderTimeWeighted.toFixed(2)} ms`);
        console.log(`Maximum Peak Requests/Min: ${maxPeakRequestsPerMin}`);
        const maxPods = Math.max(...results.map(row => row.totalPods));
        console.log(`Maximum Number of Pods (Daily Peak): ${maxPods}`);
        console.log(`Maximum Estimated Peak QPS: ${maxEstPeakQPS}`);
        console.log(`Average Estimated Daily QPS: ${avgEstAvgQPS.toFixed(2)}`);
        console.log(`\nCSV file generated: ${csvPath}`);
    }
    
    return results;
}

// 當直接執行此檔案時，啟動分析流程
if (require.main === module) {
    processPerformanceData();
}

// 匯出函數供其他模組使用
module.exports = { processPerformanceData, extractTxtData, extractJsonData };