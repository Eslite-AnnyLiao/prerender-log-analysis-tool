#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class PodUtilizationAnalyzer {
    constructor() {
        this.baseDir = './pod-minute-request-result';
    }

    /**
     * 分析指定日期的 pod 使用率數據
     * @param {string} dateStr - 日期字符串，格式 YYYYMMDD 或 YYYY-MM-DD
     * @param {string} target - 目標類型：'product', 'category', 或 'combined'
     */
    async analyzePodUtilization(dateStr, target = 'product') {
        const formattedDate = this.formatDate(dateStr);
        const dateFolder = this.getDateFolder(formattedDate);
        const csvFile = path.join(this.baseDir, dateFolder, `pod-minute-request-${formattedDate}-${target}.csv`);

        if (!fs.existsSync(csvFile)) {
            throw new Error(`找不到檔案: ${csvFile}`);
        }

        console.log(`📖 讀取檔案: ${csvFile}`);

        const rows = [];
        const podColumns = [];

        return new Promise((resolve, reject) => {
            let isFirstRow = true;

            fs.createReadStream(csvFile)
                .pipe(csv())
                .on('headers', (headers) => {
                    // 提取所有 pod 欄位名稱（跳過 Time, Total_Requests, Slow_Render_Count）
                    podColumns.push(...headers.slice(3));
                    console.log(`📊 發現 ${podColumns.length} 個 pods`);
                })
                .on('data', (row) => {
                    // 支援中英文欄位名
                    const time = row['時間'] || row['Time'];
                    const totalRequests = parseInt(row['總請求數'] || row['Total_Requests']) || 0;
                    const slowRenderCount = parseInt(row['慢渲染數量'] || row['Slow_Render_Count']) || 0;

                    // 計算每個 pod 的請求數
                    const podRequests = podColumns.map(pod => parseInt(row[pod]) || 0);

                    // 計算統計數據
                    const activePodsCount = podRequests.filter(count => count > 0).length;
                    const maxPodRequests = Math.max(...podRequests, 0);
                    const totalPods = podColumns.length;

                    // 活躍 Pods 比例：有多少比例的 Pods 在工作
                    const activePodsRatio = totalPods > 0 ? (activePodsCount / totalPods * 100).toFixed(2) + '%' : '0.00%';

                    // Pods 利用率（方案 1）：基於請求負載的利用率
                    // 公式：總請求數 / (總 Pods 數 × 最大 Pod 請求數) × 100
                    const podsUtilization = (totalPods > 0 && maxPodRequests > 0)
                        ? (totalRequests / (totalPods * maxPodRequests) * 100).toFixed(2) + '%'
                        : '0.00%';

                    const slowRenderRatio = totalRequests > 0 ? (slowRenderCount / totalRequests * 100).toFixed(2) + '%' : '0.00%';
                    const avgRequestsPerActivePod = activePodsCount > 0 ? (totalRequests / activePodsCount).toFixed(2) : '0.00';

                    // 負載解讀
                    const loadInterpretation = this.getLoadInterpretation(podsUtilization, activePodsRatio);

                    rows.push({
                        '時間': time,
                        '總請求數': totalRequests,
                        '慢渲染數量': slowRenderCount,
                        '活躍 Pods 數量': activePodsCount,
                        '最大 Pod 請求數': maxPodRequests,
                        '活躍 Pods 比例': activePodsRatio,
                        'Pods 利用率': podsUtilization,
                        '負載解讀': loadInterpretation,
                        '慢渲染佔比': slowRenderRatio,
                        '平均請求量': avgRequestsPerActivePod,
                        // 保留所有原始 pod 數據
                        ...Object.fromEntries(podColumns.map(pod => [pod, row[pod]]))
                    });
                })
                .on('end', () => {
                    console.log(`✅ 成功讀取 ${rows.length} 筆資料`);
                    resolve({ rows, podColumns, formattedDate, target });
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    /**
     * 將分析結果寫回 CSV 檔案
     */
    async writeEnhancedCSV(data) {
        const { rows, podColumns, formattedDate, target } = data;
        const dateFolder = this.getDateFolder(formattedDate);
        const outputFile = path.join(this.baseDir, dateFolder, `pod-minute-request-${formattedDate}-${target}.csv`);

        // 備份原檔案
        const backupFile = path.join(this.baseDir, dateFolder, `pod-minute-request-${formattedDate}-${target}.backup.csv`);
        if (fs.existsSync(outputFile)) {
            fs.copyFileSync(outputFile, backupFile);
            console.log(`💾 原檔案已備份至: ${backupFile}`);
        }

        // 建立新的 CSV 內容
        const headers = [
            '時間',
            '總請求數',
            '慢渲染數量',
            '活躍 Pods 數量',
            '最大 Pod 請求數',
            '活躍 Pods 比例',
            'Pods 利用率',
            '負載解讀',
            '慢渲染佔比',
            '平均請求量',
            ...podColumns
        ];

        const csvContent = [
            headers.join(','),
            ...rows.map(row => headers.map(h => row[h] || 0).join(','))
        ].join('\n');

        fs.writeFileSync(outputFile, csvContent, 'utf8');
        console.log(`✅ 已更新檔案: ${outputFile}`);
        console.log(`\n新增欄位:`);
        console.log(`  • 活躍 Pods 數量: Request 數大於 0 的 pods 數量`);
        console.log(`  • 最大 Pod 請求數: Pod 接收到的最大 request 數`);
        console.log(`  • 活躍 Pods 比例: 活躍 Pods 占總 Pods 的比例 (%)`);
        console.log(`  • Pods 利用率: 基於請求負載的利用率 (總請求數 / (總Pods × 最大請求數)) (%)`);
        console.log(`  • 負載解讀: 根據利用率和活躍比例自動分析負載狀況`);
        console.log(`  • 慢渲染佔比: 慢渲染數量 / 總請求數 (%)`);
        console.log(`  • 平均請求量: 總請求數 / 活躍 Pods 數量`);

        return outputFile;
    }

    /**
     * 生成統計摘要
     */
    generateSummary(data) {
        const { rows, podColumns } = data;

        const summary = {
            totalMinutes: rows.length,
            totalPods: podColumns.length,
            avgActivePodsCount: 0,
            avgActivePodsRatio: 0,
            avgPodsUtilization: 0,
            avgSlowRenderRatio: 0,
            avgRequestsPerActivePod: 0,
            maxActivePodsCount: 0,
            minActivePodsCount: Infinity,
            maxActivePodsRatio: 0,
            minActivePodsRatio: 100,
            maxPodsUtilization: 0,
            minPodsUtilization: 100,
            peakRequestTime: null,
            peakRequestCount: 0,
            totalRequests: 0,
            totalSlowRenders: 0
        };

        rows.forEach(row => {
            const activePodsCount = row['活躍 Pods 數量'];
            const activePodsRatio = parseFloat(String(row['活躍 Pods 比例']).replace('%', ''));
            const podsUtilization = parseFloat(String(row['Pods 利用率']).replace('%', ''));
            const slowRenderRatio = parseFloat(String(row['慢渲染佔比']).replace('%', ''));
            const avgRequests = parseFloat(row['平均請求量']);
            const totalRequests = row['總請求數'];

            summary.avgActivePodsCount += activePodsCount;
            summary.avgActivePodsRatio += activePodsRatio;
            summary.avgPodsUtilization += podsUtilization;
            summary.avgSlowRenderRatio += slowRenderRatio;
            summary.avgRequestsPerActivePod += avgRequests;
            summary.totalRequests += totalRequests;
            summary.totalSlowRenders += row['慢渲染數量'];

            if (activePodsCount > summary.maxActivePodsCount) {
                summary.maxActivePodsCount = activePodsCount;
            }
            if (activePodsCount < summary.minActivePodsCount) {
                summary.minActivePodsCount = activePodsCount;
            }
            if (activePodsRatio > summary.maxActivePodsRatio) {
                summary.maxActivePodsRatio = activePodsRatio;
            }
            if (activePodsRatio < summary.minActivePodsRatio) {
                summary.minActivePodsRatio = activePodsRatio;
            }
            if (podsUtilization > summary.maxPodsUtilization) {
                summary.maxPodsUtilization = podsUtilization;
            }
            if (podsUtilization < summary.minPodsUtilization) {
                summary.minPodsUtilization = podsUtilization;
            }
            if (totalRequests > summary.peakRequestCount) {
                summary.peakRequestCount = totalRequests;
                summary.peakRequestTime = row['時間'];
            }
        });

        summary.avgActivePodsCount = (summary.avgActivePodsCount / rows.length).toFixed(2);
        summary.avgActivePodsRatio = (summary.avgActivePodsRatio / rows.length).toFixed(2);
        summary.avgPodsUtilization = (summary.avgPodsUtilization / rows.length).toFixed(2);
        summary.avgSlowRenderRatio = (summary.avgSlowRenderRatio / rows.length).toFixed(2);
        summary.avgRequestsPerActivePod = (summary.avgRequestsPerActivePod / rows.length).toFixed(2);
        summary.overallSlowRenderRatio = summary.totalRequests > 0
            ? (summary.totalSlowRenders / summary.totalRequests * 100).toFixed(2)
            : '0.00';

        return summary;
    }

    /**
     * 顯示統計摘要
     */
    displaySummary(summary) {
        console.log('\n📊 統計摘要');
        console.log('='.repeat(60));
        console.log(`總分析時間:           ${summary.totalMinutes} 分鐘`);
        console.log(`總 Pods 數:           ${summary.totalPods}`);
        console.log(`總請求數:             ${summary.totalRequests.toLocaleString()}`);
        console.log(`總慢渲染數:           ${summary.totalSlowRenders.toLocaleString()}`);
        console.log(`整體慢渲染佔比:       ${summary.overallSlowRenderRatio}%`);
        console.log('');
        console.log(`平均活躍 Pods 數:     ${summary.avgActivePodsCount}`);
        console.log(`活躍 Pods 數範圍:     ${summary.minActivePodsCount} - ${summary.maxActivePodsCount}`);
        console.log(`平均活躍 Pods 比例:   ${summary.avgActivePodsRatio}%`);
        console.log(`活躍比例範圍:         ${summary.minActivePodsRatio.toFixed(2)}% - ${summary.maxActivePodsRatio.toFixed(2)}%`);
        console.log(`平均 Pods 利用率:     ${summary.avgPodsUtilization}% (基於負載)`);
        console.log(`Pods 利用率範圍:      ${summary.minPodsUtilization.toFixed(2)}% - ${summary.maxPodsUtilization.toFixed(2)}%`);
        console.log(`平均慢渲染佔比:       ${summary.avgSlowRenderRatio}%`);
        console.log(`平均請求量/活躍Pod:   ${summary.avgRequestsPerActivePod}`);
        console.log(`請求峰值時間:         ${summary.peakRequestTime} (${summary.peakRequestCount} requests)`);
        console.log('='.repeat(60));
    }

    formatDate(dateStr) {
        // 移除所有非數字字符
        const cleaned = dateStr.replace(/[^0-9]/g, '');

        if (cleaned.length === 8) {
            return cleaned; // YYYYMMDD
        } else {
            throw new Error(`無效的日期格式: ${dateStr}，請使用 YYYYMMDD 或 YYYY-MM-DD 格式`);
        }
    }

    getDateFolder(formattedDate) {
        // Convert YYYYMMDD to YYYY-MM-DD for folder name
        const year = formattedDate.substring(0, 4);
        const month = formattedDate.substring(4, 6);
        const day = formattedDate.substring(6, 8);
        return `${year}-${month}-${day}`;
    }

    /**
     * 根據利用率和活躍比例生成負載解讀
     */
    getLoadInterpretation(podsUtilization, activePodsRatio) {
        const utilizationNum = parseFloat(String(podsUtilization).replace('%', ''));
        const activeRatioNum = parseFloat(String(activePodsRatio).replace('%', ''));
        const diff = Math.abs(utilizationNum - activeRatioNum);

        // 相對檢查
        if (diff < 2) {
            return '負載均勻 ✅';
        } else if (utilizationNum < activeRatioNum) {
            return '負載不均 ⚠️';
        }

        return '正常';
    }

    showUsage() {
        console.log('\n📖 Pod 利用率分析工具');
        console.log('='.repeat(60));
        console.log('\n使用方法:');
        console.log('  node pod-utilization-analyzer.js <日期> [target]');
        console.log('\n參數說明:');
        console.log('  日期        YYYYMMDD 格式 (例如: 20260212)');
        console.log('  target      可選，指定分析目標 (product/category/combined)');
        console.log('              預設值: product');
        console.log('\n範例:');
        console.log('  node pod-utilization-analyzer.js 20260212');
        console.log('  node pod-utilization-analyzer.js 20260212 category');
        console.log('  node pod-utilization-analyzer.js 2026-02-12 combined');
        console.log('\n功能說明:');
        console.log('  在原 CSV 檔案中新增以下欄位：');
        console.log('  • 活躍 Pods 數量: Request 數大於 0 的 pods 數量');
        console.log('  • 最大 Pod 請求數: Pod 接收到的最大 request 數');
        console.log('  • 活躍 Pods 比例: 活躍 Pods 占總 Pods 的比例 (%)');
        console.log('  • Pods 利用率: 基於請求負載的利用率 (%)');
        console.log('    計算公式: 總請求數 / (總 Pods 數 × 最大 Pod 請求數) × 100');
        console.log('  • 負載解讀: 根據利用率自動分析負載狀況');
        console.log('    - 利用率 < 10%: Pods 過多');
        console.log('    - 利用率 > 80%: 接近滿載');
        console.log('    - 利用率 ≈ 活躍比例: 負載均勻');
        console.log('    - 利用率 < 活躍比例: 負載不均');
        console.log('  • 慢渲染佔比: 慢渲染佔比 (%)');
        console.log('  • 平均請求量: 平均請求量（每個活躍 pod）');
        console.log('\n注意:');
        console.log('  • 原檔案會被備份為 .backup.csv');
        console.log('  • 新增欄位會插入在「時間/總請求數/慢渲染數量」之後');
    }

    async run() {
        const args = process.argv.slice(2);

        if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
            this.showUsage();
            return;
        }

        const dateStr = args[0];
        const target = args[1] || 'product';

        console.log('🚀 Pod 利用率分析工具啟動');
        console.log('='.repeat(60));
        console.log(`📅 分析日期: ${dateStr}`);
        console.log(`🎯 分析目標: ${target}`);
        console.log('');

        try {
            // 分析數據
            const data = await this.analyzePodUtilization(dateStr, target);

            // 生成統計摘要
            const summary = this.generateSummary(data);
            this.displaySummary(summary);

            // 寫回 CSV
            console.log('\n📝 更新 CSV 檔案...');
            const outputFile = await this.writeEnhancedCSV(data);

            console.log('\n✨ 分析完成！');
            console.log(`📄 輸出檔案: ${outputFile}`);
        } catch (error) {
            console.error('\n❌ 錯誤:', error.message);
            process.exit(1);
        }
    }
}

// Main execution
if (require.main === module) {
    const analyzer = new PodUtilizationAnalyzer();
    analyzer.run();
}

module.exports = PodUtilizationAnalyzer;
