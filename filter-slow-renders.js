const fs = require('fs');
const path = require('path');

function filterSlowRenders(sourceFile, targetDir, targetFile, threshold = 20000) {
    try {
        console.log(`🔍 讀取來源檔案: ${sourceFile}`);
        
        // 讀取來源檔案
        const data = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
        
        console.log(`📊 原始資料統計:`);
        console.log(`  • 檔案類型: ${typeof data}`);
        
        // 檢查是否有 slow_render_periods 欄位
        if (!data.slow_render_periods || !Array.isArray(data.slow_render_periods)) {
            throw new Error('找不到 slow_render_periods 欄位或該欄位不是陣列');
        }
        
        console.log(`  • slow_render_periods 總數: ${data.slow_render_periods.length}`);
        
        // 篩選 render_time_ms >= threshold 的記錄
        const allSlowPeriods = data.slow_render_periods.filter(period => {
            return period.render_time_ms && period.render_time_ms >= threshold;
        });
        
        console.log(`  • 總慢渲染週期數: ${allSlowPeriods.length}`);
        
        // 確保目標目錄存在
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`📁 建立目錄: ${targetDir}`);
        }
        
        // 寫入目標檔案
        const targetPath = path.join(targetDir, targetFile);
        fs.writeFileSync(targetPath, JSON.stringify(allSlowPeriods, null, 2), 'utf8');
        
        console.log(`✅ 篩選完成！`);
        console.log(`📄 結果已存放到: ${targetPath}`);
        console.log(`📈 統計摘要:`);
        
        // 統計不同渲染時間範圍的分佈
        const ranges = {
            '20-30秒': allSlowPeriods.filter(p => p.render_time_ms >= 20000 && p.render_time_ms < 30000).length,
            '30-60秒': allSlowPeriods.filter(p => p.render_time_ms >= 30000 && p.render_time_ms < 60000).length,
            '60秒以上': allSlowPeriods.filter(p => p.render_time_ms >= 60000).length
        };
        
        Object.entries(ranges).forEach(([range, count]) => {
            console.log(`  • ${range}: ${count} 筆`);
        });
        
        return {
            success: true,
            totalOriginal: data.slow_render_periods.length,
            slowPeriods: allSlowPeriods.length,
            outputFile: targetPath
        };
        
    } catch (error) {
        console.error(`❌ 處理失敗: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// 解析命令列參數
function parseArguments() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('使用方式: node filter-slow-renders.js <日期> [閾值] [目標類型]');
        console.log('範例: node filter-slow-renders.js 20251015 20000 category');
        console.log('範例: node filter-slow-renders.js 20251125 15000 product');
        console.log('日期格式: YYYYMMDD');
        console.log('閾值: 渲染時間毫秒數 (預設: 20000)');
        console.log('目標類型: category 或 product (預設: category)');
        process.exit(1);
    }
    
    const date = args[0];
    const threshold = args[1] ? parseInt(args[1]) : 20000;
    const target = args[2] || 'category';
    
    // 驗證日期格式 (YYYYMMDD)
    if (!/^\d{8}$/.test(date)) {
        console.error('❌ 日期格式錯誤！請使用 YYYYMMDD 格式，例如: 20251015');
        process.exit(1);
    }
    
    // 驗證目標類型
    if (!['category', 'product'].includes(target)) {
        console.error('❌ 目標類型錯誤！請使用 category 或 product');
        process.exit(1);
    }
    
    return { date, threshold, target };
}

/**
 * 生成檔案路徑
 */
function generatePaths(date, target) {
    let sourceFile, targetDir;
    
    if (target === 'category') {
        sourceFile = `./daily-analysis-result/prerender/category/dual_user-agent-log-${date}-category_log-${date}-category_analysis.json`;
        targetDir = './slow-render-periods-log/category';
    } else if (target === 'product') {
        sourceFile = `./daily-analysis-result/prerender/product/dual_user-agent-log-${date}-product_log-${date}-product_analysis.json`;
        targetDir = './slow-render-periods-log/product';
    }
    
    const targetFile = `slow_render_periods_${date}.json`;
    
    return { sourceFile, targetDir, targetFile };
}

// 執行篩選
const { date, threshold, target } = parseArguments();
const { sourceFile, targetDir, targetFile } = generatePaths(date, target);

console.log(`📅 處理日期: ${date}`);
console.log(`🎯 目標類型: ${target}`);
console.log(`⏱️  渲染時間閾值: ${threshold}ms`);

const result = filterSlowRenders(sourceFile, targetDir, targetFile, threshold);

if (result.success) {
    console.log('\n🎉 任務完成！');
} else {
    console.log('\n❌ 任務失敗！');
    process.exit(1);
}