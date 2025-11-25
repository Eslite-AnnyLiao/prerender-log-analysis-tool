const fs = require('fs');
const path = require('path');

function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function calculateMovingAverage(data, windowSize) {
    const movingAverages = [];
    
    for (let i = 0; i <= data.length - windowSize; i++) {
        const window = data.slice(i, i + windowSize);
        const totalRequests = window.reduce((sum, row) => sum + row.total, 0);
        const avgQPS = totalRequests / windowSize / 60; // 轉換為每秒請求數
        
        movingAverages.push({
            startTime: window[0].time,
            endTime: window[window.length - 1].time,
            startMinute: window[0].minute,
            endMinute: window[window.length - 1].minute,
            totalRequests,
            avgQPS: Math.round(avgQPS * 100) / 100,
            windowSize,
            timeRange: `${window[0].time}-${window[window.length - 1].time}`
        });
    }
    
    return movingAverages;
}

function analyzePeakQPS(csvFile) {
    console.log(`📊 分析文件: ${csvFile}`);
    
    if (!fs.existsSync(csvFile)) {
        console.error(`❌ 文件不存在: ${csvFile}`);
        return null;
    }
    
    try {
        const data = fs.readFileSync(csvFile, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
            console.error(`❌ 文件格式錯誤或數據不足`);
            return null;
        }
        
        const headers = lines[0].split(',');
        const timeIndex = headers.indexOf('Time');
        const totalRequestsIndex = headers.indexOf('Total_Requests');
        
        if (timeIndex === -1 || totalRequestsIndex === -1) {
            console.error(`❌ 找不到必要的欄位: Time, Total_Requests`);
            return null;
        }
        
        // 解析數據
        const timeSeriesData = [];
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            const timeStr = columns[timeIndex];
            const totalRequests = parseInt(columns[totalRequestsIndex]);
            
            if (timeStr && !isNaN(totalRequests)) {
                timeSeriesData.push({
                    time: timeStr,
                    minute: parseTime(timeStr),
                    total: totalRequests
                });
            }
        }
        
        if (timeSeriesData.length < 15) {
            console.error(`❌ 數據不足，需要至少15分鐘的數據，實際只有 ${timeSeriesData.length} 分鐘`);
            return null;
        }
        
        console.log(`📈 成功讀取 ${timeSeriesData.length} 分鐘的數據`);
        
        // 計算5分鐘滑動平均
        const fiveMinAverages = calculateMovingAverage(timeSeriesData, 5);
        const fifteenMinAverages = calculateMovingAverage(timeSeriesData, 15);
        
        // 找出最高值
        const peak5Min = fiveMinAverages.reduce((max, current) => 
            current.avgQPS > max.avgQPS ? current : max
        );
        
        const peak15Min = fifteenMinAverages.reduce((max, current) => 
            current.avgQPS > max.avgQPS ? current : max
        );
        
        // 計算統計資料
        const totalRequests = timeSeriesData.reduce((sum, row) => sum + row.total, 0);
        const avgRequestsPerMinute = totalRequests / timeSeriesData.length;
        const avgQPS = avgRequestsPerMinute / 60;
        const maxRequestsPerMinute = Math.max(...timeSeriesData.map(row => row.total));
        const maxQPS = maxRequestsPerMinute / 60;
        
        const analysis = {
            date: path.basename(csvFile).match(/(\d{8})/)?.[1] || 'unknown',
            fileName: path.basename(csvFile),
            dataPoints: timeSeriesData.length,
            totalRequests,
            avgRequestsPerMinute: Math.round(avgRequestsPerMinute * 100) / 100,
            avgQPS: Math.round(avgQPS * 100) / 100,
            maxRequestsPerMinute,
            maxQPS: Math.round(maxQPS * 100) / 100,
            peak5MinAvg: {
                qps: peak5Min.avgQPS,
                timeRange: peak5Min.timeRange,
                totalRequests: peak5Min.totalRequests,
                startTime: peak5Min.startTime,
                endTime: peak5Min.endTime
            },
            peak15MinAvg: {
                qps: peak15Min.avgQPS,
                timeRange: peak15Min.timeRange,
                totalRequests: peak15Min.totalRequests,
                startTime: peak15Min.startTime,
                endTime: peak15Min.endTime
            },
            stats: {
                fiveMinWindows: fiveMinAverages.length,
                fifteenMinWindows: fifteenMinAverages.length,
                avgFiveMinQPS: Math.round((fiveMinAverages.reduce((sum, avg) => sum + avg.avgQPS, 0) / fiveMinAverages.length) * 100) / 100,
                avgFifteenMinQPS: Math.round((fifteenMinAverages.reduce((sum, avg) => sum + avg.avgQPS, 0) / fifteenMinAverages.length) * 100) / 100
            }
        };
        
        return analysis;
        
    } catch (error) {
        console.error(`❌ 處理文件失敗: ${error.message}`);
        return null;
    }
}

function formatDisplayDate(dateStr) {
    if (dateStr.length === 8) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

function generateReport(analysisResults) {
    const report = [];
    const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    report.push('================================================================================');
    report.push('每日最高 QPS 分析報告');
    report.push(`生成時間: ${currentTime}`);
    report.push('================================================================================');
    report.push('');
    
    if (analysisResults.length === 0) {
        report.push('❌ 沒有找到有效的分析結果');
        return report.join('\n');
    }
    
    // 整體統計
    const validResults = analysisResults.filter(r => r !== null);
    if (validResults.length > 0) {
        const totalDays = validResults.length;
        const totalRequests = validResults.reduce((sum, r) => sum + r.totalRequests, 0);
        const avgDailyRequests = totalRequests / totalDays;
        const avgDailyQPS = validResults.reduce((sum, r) => sum + r.avgQPS, 0) / totalDays;
        
        const peak5MinQPS = validResults.map(r => r.peak5MinAvg.qps);
        const peak15MinQPS = validResults.map(r => r.peak15MinAvg.qps);
        
        const maxPeak5Min = Math.max(...peak5MinQPS);
        const maxPeak15Min = Math.max(...peak15MinQPS);
        const avgPeak5Min = peak5MinQPS.reduce((sum, qps) => sum + qps, 0) / peak5MinQPS.length;
        const avgPeak15Min = peak15MinQPS.reduce((sum, qps) => sum + qps, 0) / peak15MinQPS.length;
        
        const maxPeak5MinDay = validResults.find(r => r.peak5MinAvg.qps === maxPeak5Min);
        const maxPeak15MinDay = validResults.find(r => r.peak15MinAvg.qps === maxPeak15Min);
        
        report.push('📊 整體統計摘要');
        report.push('-'.repeat(50));
        report.push(`分析天數: ${totalDays} 天`);
        report.push(`總請求數: ${totalRequests.toLocaleString()} 次`);
        report.push(`平均每日請求數: ${Math.round(avgDailyRequests).toLocaleString()} 次`);
        report.push(`平均每日 QPS: ${Math.round(avgDailyQPS * 100) / 100}`);
        report.push('');
        
        report.push('🔥 峰值 QPS 統計');
        report.push('-'.repeat(50));
        report.push(`歷史最高 5分鐘平均 QPS: ${maxPeak5Min} (${formatDisplayDate(maxPeak5MinDay.date)} ${maxPeak5MinDay.peak5MinAvg.timeRange})`);
        report.push(`歷史最高 15分鐘平均 QPS: ${maxPeak15Min} (${formatDisplayDate(maxPeak15MinDay.date)} ${maxPeak15MinDay.peak15MinAvg.timeRange})`);
        report.push(`平均 5分鐘峰值 QPS: ${Math.round(avgPeak5Min * 100) / 100}`);
        report.push(`平均 15分鐘峰值 QPS: ${Math.round(avgPeak15Min * 100) / 100}`);
        report.push('');
    }
    
    // 每日詳細分析
    report.push('📅 每日 QPS 詳細分析');
    report.push('-'.repeat(50));
    
    validResults.forEach((analysis, index) => {
        if (index > 0) report.push('');
        
        report.push(`📅 日期: ${formatDisplayDate(analysis.date)}`);
        report.push(`├─ 數據點: ${analysis.dataPoints} 分鐘`);
        report.push(`├─ 總請求數: ${analysis.totalRequests.toLocaleString()} 次`);
        report.push(`├─ 平均 QPS: ${analysis.avgQPS}`);
        report.push(`├─ 單分鐘最高 QPS: ${analysis.maxQPS} (${analysis.maxRequestsPerMinute} 次/分鐘)`);
        report.push(`├─ 🔥 最高 5分鐘平均 QPS: ${analysis.peak5MinAvg.qps} (${analysis.peak5MinAvg.timeRange})`);
        report.push(`│  └─ 該時段總請求: ${analysis.peak5MinAvg.totalRequests} 次`);
        report.push(`└─ 🔥 最高 15分鐘平均 QPS: ${analysis.peak15MinAvg.qps} (${analysis.peak15MinAvg.timeRange})`);
        report.push(`   └─ 該時段總請求: ${analysis.peak15MinAvg.totalRequests} 次`);
    });
    
    return report.join('\n');
}

function generateCSVReport(analysisResults) {
    const headers = [
        'Date',
        'Display_Date',
        'Data_Points_Minutes',
        'Total_Requests',
        'Avg_QPS',
        'Max_Single_Minute_QPS',
        'Peak_5Min_Avg_QPS',
        'Peak_5Min_Time_Range',
        'Peak_5Min_Total_Requests',
        'Peak_15Min_Avg_QPS',
        'Peak_15Min_Time_Range',
        'Peak_15Min_Total_Requests',
        'Avg_5Min_Window_QPS',
        'Avg_15Min_Window_QPS',
        'File_Name'
    ];
    
    const validResults = analysisResults.filter(r => r !== null);
    const rows = validResults.map(analysis => [
        analysis.date,
        formatDisplayDate(analysis.date),
        analysis.dataPoints,
        analysis.totalRequests,
        analysis.avgQPS,
        analysis.maxQPS,
        analysis.peak5MinAvg.qps,
        analysis.peak5MinAvg.timeRange,
        analysis.peak5MinAvg.totalRequests,
        analysis.peak15MinAvg.qps,
        analysis.peak15MinAvg.timeRange,
        analysis.peak15MinAvg.totalRequests,
        analysis.stats.avgFiveMinQPS,
        analysis.stats.avgFifteenMinQPS,
        analysis.fileName
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

async function analyzePeakQPSBatch(inputDir = './pod-minute-request-result/') {
    console.log(`\n=== 批量分析每日最高 QPS ===`);
    console.log(`輸入目錄: ${inputDir}`);
    
    if (!fs.existsSync(inputDir)) {
        console.error(`❌ 目錄不存在: ${inputDir}`);
        return;
    }
    
    const files = fs.readdirSync(inputDir)
        .filter(file => file.startsWith('pod-minute-request-') && file.endsWith('.csv'))
        .sort();
    
    if (files.length === 0) {
        console.error(`❌ 在目錄 ${inputDir} 中沒有找到符合格式的 CSV 文件`);
        console.log('期望的文件格式: pod-minute-request-YYYYMMDD.csv');
        return;
    }
    
    console.log(`找到 ${files.length} 個 CSV 文件`);
    console.log('');
    
    const analysisResults = [];
    
    for (const file of files) {
        const filePath = path.join(inputDir, file);
        console.log(`處理文件: ${file}`);
        
        const analysis = analyzePeakQPS(filePath);
        if (analysis) {
            analysisResults.push(analysis);
            console.log(`✅ 成功分析: 5分鐘峰值 ${analysis.peak5MinAvg.qps} QPS, 15分鐘峰值 ${analysis.peak15MinAvg.qps} QPS`);
        } else {
            console.log(`❌ 分析失敗`);
            analysisResults.push(null);
        }
        console.log('');
    }
    
    // 生成報告
    const outputDir = './daily-peak-qps-analysis/';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 生成文字報告
    const textReport = generateReport(analysisResults);
    const reportPath = path.join(outputDir, 'daily-peak-qps-report.txt');
    fs.writeFileSync(reportPath, textReport, 'utf8');
    
    // 生成 CSV 報告
    const csvReport = generateCSVReport(analysisResults);
    const csvPath = path.join(outputDir, 'daily-peak-qps-summary.csv');
    fs.writeFileSync(csvPath, csvReport, 'utf8');
    
    // 生成詳細 JSON 資料
    const jsonData = {
        generatedAt: new Date().toISOString(),
        analysisResults: analysisResults.filter(r => r !== null),
        summary: {
            totalDays: analysisResults.filter(r => r !== null).length,
            failedDays: analysisResults.filter(r => r === null).length,
            totalFiles: files.length
        }
    };
    const jsonPath = path.join(outputDir, 'daily-peak-qps-data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
    
    console.log('=== 分析完成 ===');
    console.log(`生成的文件:`);
    console.log(`- ${reportPath}`);
    console.log(`- ${csvPath}`);
    console.log(`- ${jsonPath}`);
    console.log('');
    
    const validResults = analysisResults.filter(r => r !== null);
    if (validResults.length > 0) {
        const maxPeak5Min = Math.max(...validResults.map(r => r.peak5MinAvg.qps));
        const maxPeak15Min = Math.max(...validResults.map(r => r.peak15MinAvg.qps));
        
        console.log(`📊 關鍵指標:`);
        console.log(`- 成功分析天數: ${validResults.length} / ${files.length}`);
        console.log(`- 歷史最高 5分鐘平均 QPS: ${maxPeak5Min}`);
        console.log(`- 歷史最高 15分鐘平均 QPS: ${maxPeak15Min}`);
    }
}

// 單一文件分析函數
async function analyzeSingleFile(csvFile) {
    const analysis = analyzePeakQPS(csvFile);
    if (analysis) {
        console.log(`\n=== 分析結果 ===`);
        console.log(`日期: ${formatDisplayDate(analysis.date)}`);
        console.log(`總請求數: ${analysis.totalRequests.toLocaleString()} 次`);
        console.log(`平均 QPS: ${analysis.avgQPS}`);
        console.log(`最高 5分鐘平均 QPS: ${analysis.peak5MinAvg.qps} (${analysis.peak5MinAvg.timeRange})`);
        console.log(`最高 15分鐘平均 QPS: ${analysis.peak15MinAvg.qps} (${analysis.peak15MinAvg.timeRange})`);
    }
    return analysis;
}

// 命令行處理
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('每日最高 QPS 分析工具');
        console.log('');
        console.log('使用方式:');
        console.log('  批量分析: node daily-peak-qps-analyzer.js batch [輸入目錄]');
        console.log('  單一文件: node daily-peak-qps-analyzer.js single <CSV文件路徑>');
        console.log('');
        console.log('範例:');
        console.log('  node daily-peak-qps-analyzer.js batch');
        console.log('  node daily-peak-qps-analyzer.js batch ./pod-minute-request-result/');
        console.log('  node daily-peak-qps-analyzer.js single ./pod-minute-request-result/pod-minute-request-20251027.csv');
        process.exit(1);
    }
    
    const mode = args[0];
    
    if (mode === 'batch') {
        const inputDir = args[1] || './pod-minute-request-result/';
        analyzePeakQPSBatch(inputDir).catch(console.error);
    } else if (mode === 'single') {
        if (args.length < 2) {
            console.error('❌ 請提供 CSV 文件路徑');
            console.log('範例: node daily-peak-qps-analyzer.js single ./pod-minute-request-result/pod-minute-request-20251027.csv');
            process.exit(1);
        }
        const csvFile = args[1];
        analyzeSingleFile(csvFile).catch(console.error);
    } else {
        console.error('❌ 無效的模式，請使用 "batch" 或 "single"');
        process.exit(1);
    }
}

module.exports = {
    analyzePeakQPS,
    analyzePeakQPSBatch,
    analyzeSingleFile,
    calculateMovingAverage
};