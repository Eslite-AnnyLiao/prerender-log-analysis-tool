const fs = require('fs');
const path = require('path');

function parseTimestamp(timestampStr) {
    // 輸入格式: "Wed Sep 24 2025 23:59:59 GMT+0800 (台北標準時間)"
    const date = new Date(timestampStr);
    
    if (isNaN(date.getTime())) {
        return null;
    }
    
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${hours}:${minutes}`;
}

function processCSVFile(filePath, targetDate) {
    console.log(`開始處理文件: ${filePath}`);
    
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        
        console.log(`文件總行數: ${lines.length}`);
        
        // 跳過標題行
        const dataLines = lines.slice(1);
        
        const podMinuteRequests = {};
        let lineCount = 0;
        let validLineCount = 0;
        
        dataLines.forEach(line => {
            lineCount++;
            if (lineCount % 50000 === 0) {
                console.log(`  處理了 ${lineCount} 行... (有效行數: ${validLineCount})`);
            }
            
            // 解析 CSV 行: timestamp,textPayload,resource.labels.pod_name
            const firstComma = line.indexOf(',');
            const lastComma = line.lastIndexOf(',');
            
            if (firstComma === -1 || lastComma === -1 || firstComma === lastComma) return;
            
            const timestamp = line.substring(0, firstComma);
            const podName = line.substring(lastComma + 1).trim();
            
            if (!timestamp || !podName) return;
            
            const minuteTime = parseTimestamp(timestamp);
            if (!minuteTime) return;
            
            validLineCount++;
            
            // 初始化 pod 數據結構
            if (!podMinuteRequests[podName]) {
                podMinuteRequests[podName] = {};
            }
            
            // 計算該分鐘的請求數
            if (!podMinuteRequests[podName][minuteTime]) {
                podMinuteRequests[podName][minuteTime] = 0;
            }
            podMinuteRequests[podName][minuteTime]++;
        });
        
        console.log(`完成處理 ${lineCount} 行，有效行數: ${validLineCount}`);
        console.log(`發現 ${Object.keys(podMinuteRequests).length} 個不同的 Pod`);
        
        return podMinuteRequests;
        
    } catch (error) {
        console.error(`處理檔案失敗 ${filePath}:`, error.message);
        return {};
    }
}

function generateTimeSlots() {
    const timeSlots = [];
    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute++) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeSlots.push(timeStr);
        }
    }
    return timeSlots;
}

function formatDateString(dateInput) {
    // 支援多種日期格式: 20250924, 2025-09-24, 2025/09/24
    let cleanDate = dateInput.replace(/[-\/]/g, '');
    
    // 確保是8位數字格式
    if (cleanDate.length === 8 && /^\d{8}$/.test(cleanDate)) {
        return cleanDate;
    }
    
    throw new Error(`無效的日期格式: ${dateInput}。請使用格式如: 20250924, 2025-09-24, 或 2025/09/24`);
}

function formatDisplayDate(dateStr) {
    // 將 20250924 格式轉為 2025-09-24 顯示格式
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
}

async function analyzePodMinuteRequestsForDate(inputDate) {
    try {
        const targetDate = formatDateString(inputDate);
        const displayDate = formatDisplayDate(targetDate);
        
        const inputFile = `./to-analyze-daily-data/user-agent-log/category/user-agent-log-${targetDate}-category.csv`;
        const outputFile = `pod-minute-request-result/pod-minute-request-${targetDate}.csv`;
        
        console.log(`\n=== Pod 每分鐘請求數分析 ===`);
        console.log(`目標日期: ${displayDate}`);
        console.log(`輸入文件: ${inputFile}`);
        console.log(`輸出文件: ${outputFile}`);
        
        // 檢查輸入文件是否存在
        if (!fs.existsSync(inputFile)) {
            console.error(`錯誤: 找不到文件 ${inputFile}`);
            console.log('\n可用的文件列表:');
            const categoryDir = './to-analyze-daily-data/user-agent-log/category/';
            if (fs.existsSync(categoryDir)) {
                const files = fs.readdirSync(categoryDir)
                    .filter(file => file.includes('user-agent-log') && file.endsWith('.csv'))
                    .sort();
                files.slice(0, 10).forEach(file => console.log(`  - ${file}`));
                if (files.length > 10) {
                    console.log(`  ... 還有 ${files.length - 10} 個文件`);
                }
            }
            return;
        }
        
        // 處理該日期的 CSV 文件
        const podMinuteRequests = processCSVFile(inputFile, targetDate);
        
        if (Object.keys(podMinuteRequests).length === 0) {
            console.error('沒有找到有效的 pod 數據');
            return;
        }
        
        // 生成所有時間槽 (00:00-23:59)
        const allTimeSlots = generateTimeSlots();
        const allPods = Object.keys(podMinuteRequests).sort();
        
        console.log(`開始生成 CSV...`);
        console.log(`- 時間槽數: ${allTimeSlots.length} 個`);
        console.log(`- Pod 數: ${allPods.length} 個`);
        
        // 生成 CSV 內容
        const csvHeaders = ['Time', 'Total_Requests', ...allPods];
        const csvRows = [];
        
        let totalRequestsForDay = 0;
        let activeTimeSlots = 0;
        
        allTimeSlots.forEach(timeSlot => {
            let totalRequestsForTimeSlot = 0;
            const podRequestsForTimeSlot = [];
            
            allPods.forEach(pod => {
                const requestCount = podMinuteRequests[pod][timeSlot] || 0;
                podRequestsForTimeSlot.push(requestCount);
                totalRequestsForTimeSlot += requestCount;
            });
            
            if (totalRequestsForTimeSlot > 0) {
                activeTimeSlots++;
            }
            
            totalRequestsForDay += totalRequestsForTimeSlot;
            
            const row = [timeSlot, totalRequestsForTimeSlot, ...podRequestsForTimeSlot];
            csvRows.push(row);
        });
        
        // 寫入 CSV 文件
        const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
        fs.writeFileSync(outputFile, csvContent, 'utf8');
        
        console.log(`\n=== 分析完成 ===`);
        console.log(`輸出文件: ${outputFile}`);
        console.log(`文件大小: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`\n統計資訊:`);
        console.log(`- 日期: ${displayDate}`);
        console.log(`- 總請求數: ${totalRequestsForDay.toLocaleString()}`);
        console.log(`- 活躍時間槽: ${activeTimeSlots} / ${allTimeSlots.length}`);
        console.log(`- Pod 數量: ${allPods.length}`);
        console.log(`- CSV 行數: ${csvRows.length + 1} (含標題)`);
        console.log(`- CSV 列數: ${csvHeaders.length}`);
        
        // 顯示前幾個 Pod 名稱作為樣本
        if (allPods.length > 0) {
            console.log(`\nPod 列表樣本 (前 5 個):`);
            allPods.slice(0, 5).forEach(pod => console.log(`  - ${pod}`));
            if (allPods.length > 5) {
                console.log(`  ... 還有 ${allPods.length - 5} 個 Pod`);
            }
        }
        
        // 顯示最忙碌的時間槽
        const busyTimeSlots = csvRows
            .filter(row => row[1] > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
            
        if (busyTimeSlots.length > 0) {
            console.log(`\n最忙碌的時間槽 (前 5 個):`);
            busyTimeSlots.forEach(row => {
                console.log(`  - ${row[0]}: ${row[1]} 請求`);
            });
        }
        
    } catch (error) {
        console.error('分析過程中發生錯誤:', error.message);
    }
}

// 檢查命令行參數
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('使用方式:');
        console.log('  node pod-minute-request-single-date.js <日期>');
        console.log('');
        console.log('日期格式範例:');
        console.log('  20250924');
        console.log('  2025-09-24');
        console.log('  2025/09/24');
        console.log('');
        console.log('範例:');
        console.log('  node pod-minute-request-single-date.js 20250924');
        process.exit(1);
    }
    
    const inputDate = args[0];
    analyzePodMinuteRequestsForDate(inputDate).catch(console.error);
}

module.exports = {
    analyzePodMinuteRequestsForDate
};