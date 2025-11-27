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

function mergeDataSources(data1, data2) {
    const merged = {};
    
    // 合併第一個數據源
    Object.keys(data1).forEach(pod => {
        if (!merged[pod]) {
            merged[pod] = {};
        }
        Object.keys(data1[pod]).forEach(time => {
            merged[pod][time] = (merged[pod][time] || 0) + data1[pod][time];
        });
    });
    
    // 合併第二個數據源
    Object.keys(data2).forEach(pod => {
        if (!merged[pod]) {
            merged[pod] = {};
        }
        Object.keys(data2[pod]).forEach(time => {
            merged[pod][time] = (merged[pod][time] || 0) + data2[pod][time];
        });
    });
    
    return merged;
}

function generateOutput(podMinuteRequests, outputFile, sourceType, displayDate) {
    // 生成所有時間槽 (00:00-23:59)
    const allTimeSlots = generateTimeSlots();
    const allPods = Object.keys(podMinuteRequests).sort();
    
    console.log(`開始生成 ${sourceType} 輸出...`);
    console.log(`- 時間槽數: ${allTimeSlots.length} 個`);
    console.log(`- Pod 數: ${allPods.length} 個`);
    
    // 生成 CSV 內容
    const csvHeaders = ['Time', 'Total_Requests', ...allPods];
    const csvRows = [];
    
    // 生成 JSON 內容
    const jsonData = {
        metadata: {
            date: displayDate,
            sourceType: sourceType,
            totalPods: allPods.length,
            timeSlots: allTimeSlots.length
        },
        pods: allPods,
        timeSlots: [],
        summary: {
            totalRequestsForDay: 0,
            activeTimeSlots: 0,
            busyTimeSlots: []
        }
    };
    
    let totalRequestsForDay = 0;
    let activeTimeSlots = 0;
    
    allTimeSlots.forEach(timeSlot => {
        let totalRequestsForTimeSlot = 0;
        const podRequestsForTimeSlot = [];
        const podData = {};
        
        allPods.forEach(pod => {
            const requestCount = podMinuteRequests[pod][timeSlot] || 0;
            podRequestsForTimeSlot.push(requestCount);
            podData[pod] = requestCount;
            totalRequestsForTimeSlot += requestCount;
        });
        
        if (totalRequestsForTimeSlot > 0) {
            activeTimeSlots++;
        }
        
        totalRequestsForDay += totalRequestsForTimeSlot;
        
        // CSV row
        const row = [timeSlot, totalRequestsForTimeSlot, ...podRequestsForTimeSlot];
        csvRows.push(row);
        
        // JSON timeSlot data
        jsonData.timeSlots.push({
            time: timeSlot,
            totalRequests: totalRequestsForTimeSlot,
            podRequests: podData
        });
    });
    
    // 完善 JSON summary 資料
    jsonData.summary.totalRequestsForDay = totalRequestsForDay;
    jsonData.summary.activeTimeSlots = activeTimeSlots;
    
    // 找出最忙碌的時間槽
    const busyTimeSlots = jsonData.timeSlots
        .filter(slot => slot.totalRequests > 0)
        .sort((a, b) => b.totalRequests - a.totalRequests)
        .slice(0, 10)
        .map(slot => ({
            time: slot.time,
            totalRequests: slot.totalRequests
        }));
    
    jsonData.summary.busyTimeSlots = busyTimeSlots;
    
    // 寫入 CSV 文件
    const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
    fs.writeFileSync(outputFile, csvContent, 'utf8');
    
    // 寫入 JSON 文件
    const jsonFile = outputFile.replace('.csv', '.json');
    fs.writeFileSync(jsonFile, JSON.stringify(jsonData, null, 2), 'utf8');
    
    console.log(`\n=== ${sourceType} 分析完成 ===`);
    console.log(`輸出文件:`);
    console.log(`  - CSV: ${outputFile}`);
    console.log(`  - JSON: ${jsonFile}`);
    console.log(`文件大小:`);
    console.log(`  - CSV: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - JSON: ${(fs.statSync(jsonFile).size / 1024 / 1024).toFixed(2)} MB`);
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
    if (busyTimeSlots.length > 0) {
        console.log(`\n最忙碌的時間槽 (前 5 個):`);
        busyTimeSlots.slice(0, 5).forEach(slot => {
            console.log(`  - ${slot.time}: ${slot.totalRequests} 請求`);
        });
    }
    
    return {
        totalRequestsForDay,
        activeTimeSlots,
        podsCount: allPods.length,
        csvRowsCount: csvRows.length + 1
    };
}

async function analyzePodMinuteRequestsForDate(inputDate) {
    try {
        const targetDate = formatDateString(inputDate);
        const displayDate = formatDisplayDate(targetDate);
        
        const categoryInputFile = `./to-analyze-daily-data/user-agent-log/category/user-agent-log-${targetDate}-category.csv`;
        const productInputFile = `./to-analyze-daily-data/user-agent-log/product/user-agent-log-${targetDate}-product.csv`;
        
        // 建立以日期命名的輸出資料夾
        const outputDir = `pod-minute-request-result/${displayDate}`;
        
        const categoryOutputFile = `${outputDir}/pod-minute-request-${targetDate}-category.csv`;
        const productOutputFile = `${outputDir}/pod-minute-request-${targetDate}-product.csv`;
        const combinedOutputFile = `${outputDir}/pod-minute-request-${targetDate}-combined.csv`;
        
        console.log(`\n=== Pod 每分鐘請求數分析 ===`);
        console.log(`目標日期: ${displayDate}`);
        console.log(`Category 輸入文件: ${categoryInputFile}`);
        console.log(`Product 輸入文件: ${productInputFile}`);
        console.log(`輸出文件:`);
        console.log(`  - Category: ${categoryOutputFile}`);
        console.log(`  - Product: ${productOutputFile}`);
        console.log(`  - Combined: ${combinedOutputFile}`);
        
        // 檢查 Category 文件
        if (!fs.existsSync(categoryInputFile)) {
            console.error(`錯誤: 找不到 Category 文件 ${categoryInputFile}`);
            return;
        }
        
        // 檢查 Product 文件
        if (!fs.existsSync(productInputFile)) {
            console.error(`錯誤: 找不到 Product 文件 ${productInputFile}`);
            return;
        }
        
        // 確保輸出目錄存在
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // 處理 Category 數據
        console.log('\n處理 Category 數據...');
        const categoryData = processCSVFile(categoryInputFile, targetDate);
        
        // 處理 Product 數據
        console.log('\n處理 Product 數據...');
        const productData = processCSVFile(productInputFile, targetDate);
        
        if (Object.keys(categoryData).length === 0 && Object.keys(productData).length === 0) {
            console.error('沒有找到有效的 pod 數據');
            return;
        }
        
        // 生成 Category 輸出 (CSV + JSON)
        if (Object.keys(categoryData).length > 0) {
            generateOutput(categoryData, categoryOutputFile, 'Category', displayDate);
        } else {
            console.log('Category 數據為空，跳過生成');
        }
        
        // 生成 Product 輸出 (CSV + JSON)
        if (Object.keys(productData).length > 0) {
            generateOutput(productData, productOutputFile, 'Product', displayDate);
        } else {
            console.log('Product 數據為空，跳過生成');
        }
        
        // 合併數據並生成 Combined 輸出 (CSV + JSON)
        const combinedData = mergeDataSources(categoryData, productData);
        if (Object.keys(combinedData).length > 0) {
            generateOutput(combinedData, combinedOutputFile, 'Combined', displayDate);
        } else {
            console.log('Combined 數據為空，跳過生成');
        }
        
        console.log(`\n=== 所有分析完成 ===`);
        
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