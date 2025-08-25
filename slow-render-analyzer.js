#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SlowRenderAnalyzer {
  constructor() {
    this.args = process.argv.slice(2);
  }

  parseArguments() {
    if (this.args.length < 2) {
      this.showUsage();
      process.exit(1);
    }

    const dateStr = this.args[0];
    const count = parseInt(this.args[1]);
    const folder = this.args[2]; // Optional folder parameter

    // Validate date format (YYYYMMDD)
    if (!/^\d{8}$/.test(dateStr)) {
      console.error('❌ 日期格式錯誤，請使用 YYYYMMDD 格式');
      process.exit(1);
    }

    if (isNaN(count) || count <= 0) {
      console.error('❌ 分析筆數必須是大於 0 的數字');
      process.exit(1);
    }

    return { dateStr, count, folder };
  }

  formatDateForQuery(dateStr) {
    // Convert YYYYMMDD to YYYY-MM-DD
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  extractSlowRenderPeriods(dateStr, count, folder) {
    let inputFile;
    if (folder) {
      const categoryNumber = folder.slice(-1); // Extract number from L1, L2, etc.
      inputFile = `./daily-analysis-result/${folder}/dual_user-agent-log-${dateStr}-category-${categoryNumber}_log-${dateStr}-category-${categoryNumber}_analysis.json`;
    } else {
      inputFile = `./daily-analysis-result/dual_user-agent-${dateStr}_logs-${dateStr}_analysis.json`;
    }
    
    // Check if input file exists
    if (!fs.existsSync(inputFile)) {
      console.error(`❌ 找不到檔案: ${inputFile}`);
      process.exit(1);
    }

    console.log(`📖 讀取檔案: ${inputFile}`);
    
    try {
      const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
      
      if (!data.slow_render_periods || !Array.isArray(data.slow_render_periods)) {
        console.error('❌ 檔案中找不到 slow_render_periods 或格式錯誤');
        process.exit(1);
      }

      const slowRenderPeriods = data.slow_render_periods;
      console.log(`📊 總共找到 ${slowRenderPeriods.length} 筆慢渲染記錄`);

      // Randomly select the specified number of records
      const shuffledRecords = [...slowRenderPeriods].sort(() => 0.5 - Math.random());
      const selectedRecords = shuffledRecords.slice(0, count);
      console.log(`🎯 隨機選取 ${selectedRecords.length} 筆記錄進行分析`);

      // Add ID to each record
      const recordsWithId = selectedRecords.map((record, index) => ({
        id: `${dateStr}-${(index + 1).toString().padStart(4, '0')}`,
        ...record
      }));

      return recordsWithId;
    } catch (error) {
      console.error(`❌ 讀取檔案時發生錯誤: ${error.message}`);
      process.exit(1);
    }
  }

  saveProcessedData(dateStr, processedData, folder) {
    let outputDir, outputFile;
    
    if (folder) {
      outputDir = `./slow-render-periods-log/${folder}`;
      outputFile = `${outputDir}/slow_render_periods_${dateStr}.json`;
    } else {
      outputDir = './slow-render-periods-log';
      outputFile = `${outputDir}/slow_render_periods_${dateStr}.json`;
    }
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      console.log(`📁 建立輸出目錄: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    try {
      fs.writeFileSync(outputFile, JSON.stringify(processedData, null, 2), 'utf8');
      console.log(`💾 已儲存處理後的資料到: ${outputFile}`);
    } catch (error) {
      console.error(`❌ 儲存檔案時發生錯誤: ${error.message}`);
      process.exit(1);
    }

    return outputFile;
  }

  ensureOutputDirectory(dateStr, folder) {
    let outputDir;
    
    if (folder) {
      outputDir = `./to-analyze-performance-data/${dateStr}/${folder}`;
    } else {
      outputDir = `./to-analyze-performance-data/${dateStr}`;
    }
    
    if (!fs.existsSync(outputDir)) {
      console.log(`📁 建立輸出目錄: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return outputDir;
  }

  executeLogQuery(record, dateStr, outputDir) {
    const queryDate = this.formatDateForQuery(dateStr);
    const outputFilename = `logs-${record.id}.csv`;
    const query = `resource.labels.pod_name="${record.pod_name}" AND SEARCH("${record.req_id}")`;

    const command = [
      'node',
      'google-cloud-log-query.js',
      '--output-dir',
      outputDir,
      '--filename',
      outputFilename,
      queryDate,
      `'${query}'`
    ].join(' ');

    console.log(`🔍 執行查詢 [ID: ${record.id}]: ${record.pod_name} / ${record.req_id}`);
    console.log(`📝 指令: ${command}`);

    try {
      execSync(command, { stdio: 'inherit' });
      console.log(`✅ 完成查詢 [ID: ${record.id}]`);
    } catch (error) {
      console.error(`❌ 查詢失敗 [ID: ${record.id}]: ${error.message}`);
    }
  }

  executePerformanceAnalyzer(outputDir, folder) {
    try {
      // Get all CSV files in the output directory
      const files = fs.readdirSync(outputDir);
      const csvFiles = files.filter(file => file.endsWith('.csv'));
      
      if (csvFiles.length === 0) {
        console.log(`⚠️  在 ${outputDir} 中找不到 CSV 檔案`);
        return;
      }

      console.log(`📊 找到 ${csvFiles.length} 個 CSV 檔案，開始執行效能分析`);

      // Process each CSV file
      const pathParts = outputDir.split('/');
      const dateStr = pathParts[pathParts.indexOf('to-analyze-performance-data') + 1];
      
      let resultDir;
      if (folder) {
        resultDir = `./performance-analyze-result/${dateStr}/${folder}`;
      } else {
        resultDir = `./performance-analyze-result/${dateStr}`;
      }
      
      // Ensure result directory exists
      if (!fs.existsSync(resultDir)) {
        fs.mkdirSync(resultDir, { recursive: true });
        console.log(`📁 建立效能分析結果目錄: ${resultDir}`);
      }
      
      for (let i = 0; i < csvFiles.length; i++) {
        const csvFile = csvFiles[i];
        const filePath = path.join(outputDir, csvFile);
        const command = `node performance-analyzer.js "${filePath}"`;
        
        console.log(`\n[${i + 1}/${csvFiles.length}] 分析檔案: ${csvFile}`);
        console.log(`📝 指令: ${command}`);

        try {
          execSync(command, { stdio: 'inherit' });
          
          // Move the result file to the date-specific directory
          const resultFilename = `result-${csvFile.replace('.csv', '.txt')}`;
          const defaultResultPath = `./performance-analyze-result/${resultFilename}`;
          const targetResultPath = path.join(resultDir, resultFilename);
          
          if (fs.existsSync(defaultResultPath)) {
            fs.renameSync(defaultResultPath, targetResultPath);
            console.log(`✅ 完成分析: ${csvFile}`);
            console.log(`📄 結果檔案已移動至: ${targetResultPath}`);
          } else {
            console.log(`⚠️  找不到預期的結果檔案: ${defaultResultPath}`);
          }
        } catch (error) {
          console.error(`❌ 分析失敗 [${csvFile}]: ${error.message}`);
        }
      }

      console.log(`\n🎉 所有效能分析已完成！`);
    } catch (error) {
      console.error(`❌ 讀取目錄失敗: ${error.message}`);
    }
  }

  checkAndRefreshGCloudAuth() {
    const os = require('os');
    const credentialsPath = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
    
    // Refresh Google Cloud credentials (once per day)
    if (!fs.existsSync(credentialsPath) || this.isFileOlderThanOneDay(credentialsPath)) {
      console.log('🔄 Google Cloud 認證已過期或不存在，正在重新認證...');
      try {
        execSync('gcloud auth application-default login', { stdio: 'inherit' });
        console.log('✅ Google Cloud 認證完成');
      } catch (error) {
        console.error('❌ Google Cloud 認證失敗');
        process.exit(1);
      }
    } else {
      console.log('✅ Google Cloud 認證有效 (不到 24 小時)');
    }
  }

  isFileOlderThanOneDay(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const now = new Date();
      const fileTime = new Date(stats.mtime);
      const hoursDiff = (now - fileTime) / (1000 * 60 * 60);
      return hoursDiff > 24;
    } catch (error) {
      return true; // If we can't read the file, consider it as needing refresh
    }
  }

  async run() {
    console.log('🚀 慢渲染日誌分析工具啟動');
    console.log('=' .repeat(50));

    const { dateStr, count, folder } = this.parseArguments();
    
    // Check Google Cloud authentication before proceeding
    console.log('\n🔐 檢查 Google Cloud 認證...');
    this.checkAndRefreshGCloudAuth();
    
    console.log(`\n📅 分析日期: ${dateStr}`);
    console.log(`📊 分析筆數: ${count}`);
    if (folder) {
      console.log(`📁 資料夾: ${folder}`);
    }
    console.log('-'.repeat(30));

    // Step 1: Extract slow render periods and add IDs
    const processedData = this.extractSlowRenderPeriods(dateStr, count, folder);

    // Step 2: Save processed data
    const jsonFile = this.saveProcessedData(dateStr, processedData, folder);

    // Step 3: Ensure output directory exists
    const outputDir = this.ensureOutputDirectory(dateStr, folder);

    // Step 4: Execute google-cloud-log-query for each record
    console.log('\n🔄 開始執行 Google Cloud 日誌查詢...');
    console.log('-'.repeat(50));

    for (let i = 0; i < processedData.length; i++) {
      const record = processedData[i];
      console.log(`\n[${i + 1}/${processedData.length}]`);
      this.executeLogQuery(record, dateStr, outputDir);
      
      // Add a small delay between queries to avoid overwhelming the API
      if (i < processedData.length - 1) {
        console.log('⏳ 等待 2 秒...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n✨ 所有查詢已完成！');
    console.log(`📁 CSV 結果檔案存放於: ${outputDir}`);
    console.log(`📄 處理後的 JSON 檔案: ${jsonFile}`);
    if (folder) {
      console.log(`📂 資料夾分類: ${folder}`);
    }

    // Step 5: Execute performance-analyzer.js automatically
    console.log('\n🔬 開始執行效能分析...');
    console.log('-'.repeat(50));
    this.executePerformanceAnalyzer(outputDir, folder);
  }

  showUsage() {
    console.log('\n📖 慢渲染日誌分析工具');
    console.log('=' .repeat(30));
    console.log('\n使用方法:');
    console.log('  node slow-render-analyzer.js <日期> <分析筆數> [資料夾]');
    console.log('\n參數說明:');
    console.log('  日期        YYYYMMDD 格式 (例如: 20250819)');
    console.log('  分析筆數    要分析的記錄數量 (正整數)');
    console.log('  資料夾      可選，指定要分析的資料夾 (L1, L2, 等)');
    console.log('\n範例:');
    console.log('  node slow-render-analyzer.js 20250819 10');
    console.log('  node slow-render-analyzer.js 20250818 5 L2');
    console.log('  node slow-render-analyzer.js 20250820 15 L1');
    console.log('\n功能說明:');
    console.log('  1. 從 daily-analysis-result/[資料夾/]分析檔讀取慢渲染資料');
    console.log('  2. 取出指定筆數的記錄並加上 ID');
    console.log('  3. 儲存為 slow-render-periods-log/[資料夾/]slow_render_periods_{日期}.json');
    console.log('  4. 對每筆記錄執行 Google Cloud 日誌查詢');
    console.log('  5. 結果存放在 ./to-analyze-performance-data/{日期}/[資料夾/] 目錄');
    console.log('  6. 效能分析結果存放在 ./performance-analyze-result/{日期}/[資料夾/] 目錄');
  }
}

// Main execution
if (require.main === module) {
  const analyzer = new SlowRenderAnalyzer();
  analyzer.run().catch(console.error);
}

module.exports = SlowRenderAnalyzer;