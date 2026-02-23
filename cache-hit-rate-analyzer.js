const fs = require('fs');
const path = require('path');

class CacheHitRateAnalyzer {
    constructor() {
        this.cacheThreshold = 200; // 200ms 以下視為 cache hit
        this.results = [];
    }

    // 讀取並分析單個 JSON 檔案
    analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            
            if (!data.render_time_stats) {
                console.log(`⚠️  檔案 ${path.basename(filePath)} 沒有 render_time_stats`);
                return null;
            }

            const stats = data.render_time_stats;
            const totalRecords = stats.total_records || 0;
            const minTime = stats.min_ms || 0;
            
            // 估算 cache hit：通常 200ms 以下的請求
            // 由於沒有直接的 cache hit 統計，我們用最小時間和分佈來估算
            let estimatedCacheHits = 0;
            
            // 如果有詳細的時間分佈數據，用更精確的方法
            if (data.render_time_distribution) {
                // 檢查是否有詳細分佈
                for (const [timeRange, count] of Object.entries(data.render_time_distribution)) {
                    const upperBound = parseInt(timeRange.split('-')[1]) || 0;
                    if (upperBound <= this.cacheThreshold) {
                        estimatedCacheHits += count;
                    }
                }
            } else {
                // 使用統計方法估算
                // 如果最小時間很低（< 50ms），可能有相當比例的 cache hits
                if (minTime < 50) {
                    // 估算方法：假設 200ms 以下的請求佔一定比例
                    // 基於經驗值，如果最小時間很低，cache hit rate 通常在 20-60% 之間
                    const medianTime = stats.median_p50_ms || 0;
                    if (medianTime <= 200) {
                        // 如果中位數都在 200ms 以下，cache hit rate 很高
                        estimatedCacheHits = Math.floor(totalRecords * 0.6); // 估算 60%
                    } else if (medianTime <= 1000) {
                        estimatedCacheHits = Math.floor(totalRecords * 0.3); // 估算 30%
                    } else {
                        estimatedCacheHits = Math.floor(totalRecords * 0.15); // 估算 15%
                    }
                }
            }

            const cacheHitRate = totalRecords > 0 ? (estimatedCacheHits / totalRecords * 100) : 0;
            
            const result = {
                filename: path.basename(filePath),
                date: this.extractDateFromFilename(path.basename(filePath)),
                totalRecords: totalRecords,
                estimatedCacheHits: estimatedCacheHits,
                cacheHitRate: Math.round(cacheHitRate * 100) / 100,
                minTime: minTime,
                medianTime: stats.median_p50_ms || 0,
                avgTime: stats.average_ms || 0,
                p95Time: stats.p95_ms || 0
            };

            console.log(`✅ 分析完成: ${result.filename} - Cache Hit Rate: ${result.cacheHitRate}%`);
            return result;

        } catch (error) {
            console.error(`❌ 讀取檔案錯誤 ${filePath}:`, error.message);
            return null;
        }
    }

    // 從檔名提取日期
    extractDateFromFilename(filename) {
        const match = filename.match(/(\d{8})/);
        if (match) {
            const dateStr = match[1];
            return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
        }
        return 'unknown';
    }

    // 掃描目錄中的所有 JSON 檔案
    scanDirectory(dirPath) {
        try {
            const files = fs.readdirSync(dirPath, { recursive: true });
            return files
                .filter(file => file.endsWith('_analysis.json'))
                .map(file => path.join(dirPath, file))
                .sort();
        } catch (error) {
            console.error(`❌ 掃描目錄錯誤 ${dirPath}:`, error.message);
            return [];
        }
    }

    // 分析指定時間範圍的資料
    analyzeTimeRange(dirPath, startDate = '20251125', endDate = '20251228') {
        console.log(`🔍 開始分析 ${dirPath} 目錄中 ${startDate} - ${endDate} 的 cache 狀況...`);
        
        // 掃描主目錄和子目錄
        let allFiles = [];
        
        // 掃描主目錄
        try {
            const mainFiles = fs.readdirSync(dirPath);
            allFiles = allFiles.concat(
                mainFiles
                    .filter(file => file.endsWith('_analysis.json'))
                    .map(file => path.join(dirPath, file))
            );
        } catch (error) {
            console.log(`⚠️  無法讀取主目錄 ${dirPath}`);
        }
        
        // 掃描子目錄 (如 1125-1223)
        try {
            const subDirs = fs.readdirSync(dirPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            subDirs.forEach(subDir => {
                const subDirPath = path.join(dirPath, subDir);
                try {
                    const subFiles = fs.readdirSync(subDirPath);
                    allFiles = allFiles.concat(
                        subFiles
                            .filter(file => file.endsWith('_analysis.json'))
                            .map(file => path.join(subDirPath, file))
                    );
                } catch (error) {
                    console.log(`⚠️  無法讀取子目錄 ${subDirPath}`);
                }
            });
        } catch (error) {
            console.log(`⚠️  掃描子目錄時發生錯誤`);
        }
        
        const targetFiles = allFiles.filter(file => {
            const filename = path.basename(file);
            const match = filename.match(/(\d{8})/);
            if (match) {
                const fileDate = match[1];
                return fileDate >= startDate && fileDate <= endDate;
            }
            return false;
        });

        console.log(`📁 找到 ${targetFiles.length} 個符合時間範圍的檔案`);

        this.results = [];
        targetFiles.forEach(file => {
            const result = this.analyzeFile(file);
            if (result) {
                this.results.push(result);
            }
        });

        return this.generateReport();
    }

    // 生成報告
    generateReport() {
        if (this.results.length === 0) {
            return "沒有找到可分析的資料";
        }

        const totalRecords = this.results.reduce((sum, r) => sum + r.totalRecords, 0);
        const totalCacheHits = this.results.reduce((sum, r) => sum + r.estimatedCacheHits, 0);
        const overallCacheHitRate = totalRecords > 0 ? (totalCacheHits / totalRecords * 100) : 0;

        const avgCacheHitRate = this.results.reduce((sum, r) => sum + r.cacheHitRate, 0) / this.results.length;
        const minCacheHitRate = Math.min(...this.results.map(r => r.cacheHitRate));
        const maxCacheHitRate = Math.max(...this.results.map(r => r.cacheHitRate));

        // 按日期排序結果
        this.results.sort((a, b) => a.date.localeCompare(b.date));

        const report = `
Prerender Cache Hit Rate 分析報告 (全站 Root)
========================================
分析時間範圍: ${this.results[0].date} ~ ${this.results[this.results.length - 1].date}
分析檔案數: ${this.results.length} 個
Cache Hit 判定標準: 渲染時間 < ${this.cacheThreshold}ms

📊 整體統計
========================================
總請求數: ${totalRecords.toLocaleString()} 筆
估算 Cache Hits: ${totalCacheHits.toLocaleString()} 筆
整體 Cache Hit Rate: ${Math.round(overallCacheHitRate * 100) / 100}%

平均每日 Cache Hit Rate: ${Math.round(avgCacheHitRate * 100) / 100}%
最低 Cache Hit Rate: ${minCacheHitRate}%
最高 Cache Hit Rate: ${maxCacheHitRate}%

📅 每日詳細統計
========================================
日期           總請求數    估算Cache Hits   Cache Hit Rate   最小時間   中位數    平均時間   P95時間
${this.results.map(r => 
    `${r.date}     ${r.totalRecords.toString().padStart(8)}     ${r.estimatedCacheHits.toString().padStart(10)}     ${r.cacheHitRate.toString().padStart(10)}%     ${r.minTime.toString().padStart(6)}ms   ${r.medianTime.toString().padStart(6)}ms   ${r.avgTime.toString().padStart(7)}ms   ${r.p95Time.toString().padStart(6)}ms`
).join('\n')}

🔍 趨勢分析
========================================
• Cache Hit Rate 趨勢: ${this.analyzeTrend()}
• 性能表現: ${this.analyzePerformance()}

⚠️  注意事項
========================================
• 此分析基於渲染時間估算，實際 Cache Hit Rate 可能有所不同
• 200ms 以下的請求通常代表 cache hit 或非常快速的動態渲染
• 建議結合實際的 cache 日誌進行更精確的分析
`;

        return report;
    }

    // 分析趨勢
    analyzeTrend() {
        if (this.results.length < 2) return "資料不足以分析趨勢";
        
        const firstHalf = this.results.slice(0, Math.floor(this.results.length / 2));
        const secondHalf = this.results.slice(Math.floor(this.results.length / 2));
        
        const firstHalfAvg = firstHalf.reduce((sum, r) => sum + r.cacheHitRate, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, r) => sum + r.cacheHitRate, 0) / secondHalf.length;
        
        const diff = secondHalfAvg - firstHalfAvg;
        if (Math.abs(diff) < 1) {
            return "相對穩定";
        } else if (diff > 0) {
            return `上升趨勢 (+${Math.round(diff * 100) / 100}%)`;
        } else {
            return `下降趨勢 (${Math.round(diff * 100) / 100}%)`;
        }
    }

    // 分析性能表現
    analyzePerformance() {
        const avgOverallRate = this.results.reduce((sum, r) => sum + r.cacheHitRate, 0) / this.results.length;
        
        if (avgOverallRate >= 50) {
            return "優秀 - Cache 效果良好";
        } else if (avgOverallRate >= 30) {
            return "良好 - Cache 有一定效果";
        } else if (avgOverallRate >= 15) {
            return "一般 - Cache 效果有限";
        } else {
            return "需要優化 - Cache 效果不佳";
        }
    }

    // 儲存報告
    saveReport(report, outputPath = './cache-hit-rate-analysis.txt') {
        try {
            fs.writeFileSync(outputPath, report, 'utf8');
            console.log(`✅ 報告已儲存至: ${outputPath}`);
        } catch (error) {
            console.error(`❌ 儲存報告失敗:`, error.message);
        }
    }
}

// 顯示使用說明
function showUsage() {
    console.log(`
📊 Cache Hit Rate 分析工具
========================================

使用方法:
  node cache-hit-rate-analyzer.js <開始日期> <結束日期> [資料夾]

參數說明:
  開始日期    YYYYMMDD 格式 (必需)
  結束日期    YYYYMMDD 格式 (必需)
  資料夾      子資料夾名稱 (可選，預設: root)
              可選值: root, category, product, L1, L2, ...

範例:
  # 分析 root 資料夾中 2026/01/24 到 2026/02/10 的資料
  node cache-hit-rate-analyzer.js 20260124 20260210

  # 分析 category 資料夾
  node cache-hit-rate-analyzer.js 20260124 20260210 category

  # 分析 product 資料夾
  node cache-hit-rate-analyzer.js 20251125 20251228 product

  # 分析 L1 資料夾
  node cache-hit-rate-analyzer.js 20260124 20260210 L1

注意:
  所有資料都從 ./daily-analysis-result 目錄讀取
`);
}

// 解析命令行參數
function parseArgs() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        showUsage();
        process.exit(0);
    }

    if (args.length < 2) {
        console.error('❌ 錯誤: 請提供開始日期和結束日期');
        showUsage();
        process.exit(1);
    }

    const startDate = args[0];
    const endDate = args[1];
    const folder = args[2] || 'root';

    // 驗證日期格式
    if (!/^\d{8}$/.test(startDate) || !/^\d{8}$/.test(endDate)) {
        console.error('❌ 錯誤: 日期格式必須是 YYYYMMDD');
        process.exit(1);
    }

    // 驗證日期範圍
    if (startDate > endDate) {
        console.error('❌ 錯誤: 開始日期不能晚於結束日期');
        process.exit(1);
    }

    // 組合完整路徑
    const baseDir = './daily-analysis-result';
    const dir = path.join(baseDir, folder);

    // 自動生成輸出檔名
    const dateRange = `${startDate.substring(4)}-${endDate.substring(4)}`;
    const outputFile = `cache-hit-rate-analysis-${folder}-${dateRange}.txt`;

    return { startDate, endDate, folder, dir, outputFile };
}

// 主函數
async function main() {
    const { startDate, endDate, folder, dir, outputFile } = parseArgs();

    console.log('🚀 Cache Hit Rate 分析工具啟動');
    console.log('========================================');
    console.log(`📅 分析日期範圍: ${startDate} ~ ${endDate}`);
    console.log(`📂 分析資料夾: ${folder}`);
    console.log(`📁 完整路徑: ${dir}`);
    console.log(`📄 輸出檔案: ${outputFile}`);
    console.log('');

    const analyzer = new CacheHitRateAnalyzer();

    try {
        // 檢查目錄是否存在
        if (!fs.existsSync(dir)) {
            console.error(`❌ 錯誤: 目錄不存在 ${dir}`);
            console.log(`💡 提示: 請確認 ./daily-analysis-result/${folder} 目錄是否存在`);
            process.exit(1);
        }

        // 分析資料
        const report = analyzer.analyzeTimeRange(dir, startDate, endDate);

        console.log(report);

        // 儲存報告
        analyzer.saveReport(report, `./${outputFile}`);

        // 同時儲存詳細的 JSON 資料
        const jsonOutputFile = outputFile.replace('.txt', '.json');
        const detailedResults = {
            analysis_time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            analysis_folder: folder,
            analysis_directory: dir,
            date_range: {
                start: startDate,
                end: endDate
            },
            cache_threshold_ms: analyzer.cacheThreshold,
            results: analyzer.results,
            summary: {
                total_records: analyzer.results.reduce((sum, r) => sum + r.totalRecords, 0),
                total_cache_hits: analyzer.results.reduce((sum, r) => sum + r.estimatedCacheHits, 0),
                overall_cache_hit_rate: analyzer.results.reduce((sum, r) => sum + r.totalRecords, 0) > 0 ?
                    (analyzer.results.reduce((sum, r) => sum + r.estimatedCacheHits, 0) / analyzer.results.reduce((sum, r) => sum + r.totalRecords, 0) * 100) : 0,
                average_daily_cache_hit_rate: analyzer.results.reduce((sum, r) => sum + r.cacheHitRate, 0) / analyzer.results.length
            }
        };

        fs.writeFileSync(`./${jsonOutputFile}`, JSON.stringify(detailedResults, null, 2));
        console.log(`✅ 詳細 JSON 資料已儲存至: ./${jsonOutputFile}`);

    } catch (error) {
        console.error('❌ 分析過程中發生錯誤:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { CacheHitRateAnalyzer };