# Analysis Log - Prerender Server Performance Analysis Tool

A comprehensive tool for analyzing prerender server logs from Google Cloud Logging, focusing on render performance, user-agent statistics, and request patterns analysis.

## 概述

This project provides tools for analyzing prerender server performance logs, particularly focused on:
- Render time statistics and analysis
- User-Agent distribution and patterns
- Request frequency analysis by time periods
- Performance bottleneck identification
- Slow render period detection

## 主要功能

### 🚀 Core Analysis Features

- **雙檔案分析模式**: Correlates User-Agent logs with render time data
- **效能統計**: Comprehensive render time statistics (P50, P90, P95, P98, P99)
- **用戶代理分析**: Browser and OS distribution analysis
- **時段分析**: Hourly and minute-level request pattern analysis
- **慢渲染檢測**: Identifies rendering issues >8000ms
- **URL 重複分析**: Detects frequently accessed URLs and their performance

### 📊 Statistical Analysis

- **Percentile calculations** (P50-P99) for render times
- **Peak minute analysis** with User-Agent distribution
- **Time-based clustering** of slow render periods
- **Browser/OS usage statistics**
- **Request volume patterns** by hour/minute

## 專案結構

```
analysis-log/
├── analyze-two-file.js          # 主要分析工具 - 雙檔案分析
├── performance-analyzer.js      # 效能分析器
├── pod-group-analyzer.js        # Pod群組分析器
├── slow-render-analyzer.js      # 慢渲染分析器
├── week-report.js              # 週報生成器
├── daily-log-analysis-script.sh # 每日日誌分析腳本
├── query-daily-log.sh          # 日誌查詢腳本
├── slow-render-analysis-script.sh # 慢渲染分析腳本
├── week-report-script.sh       # 週報腳本
├── google-cloud-log-query.js   # Google Cloud 日誌查詢
├── to-analyze-daily-data/       # 待分析每日數據
│   ├── 200-log/L2/            # HTTP 200 回應日誌
│   └── user-agent-log/        # User-Agent 日誌
├── daily-analysis-result/      # 每日分析結果
├── daily-pod-analysis-result/  # Pod分析結果
├── to-analyze-performance-data/ # 待分析效能數據
├── performance-analyze-result/ # 效能分析結果
├── weekly_aggregated_results/  # 週度彙總分析結果
├── to-analyze-weekly-data/      # 待分析週數據
└── slow-render-periods-log/    # 慢渲染時段記錄
```

## 安裝與設置

### 系統需求

- Node.js >= 14.0
- npm

### 安裝依賴套件

```bash
npm install
```

### 主要依賴項

- `@google-cloud/logging`: Google Cloud Logging API
- `csv-parse`, `csv-parser`, `csv-writer`: CSV 檔案處理
- `moment-timezone`: 時區處理
- `lodash`: 工具函數
- `chalk`: 終端彩色輸出
- `commander`: 命令列介面

## 使用流程

### 📊 主要每日使用流程

為了進行每日的日誌分析，請按照以下步驟執行：

#### 1. 取得日誌數據
```bash
# 執行日誌查詢腳本，取得指定日期的日誌數據
./query-daily-log.sh 20250724
```

#### 2. 執行分析
```bash
# 執行每日日誌分析腳本，產生詳細的分析報告
./daily-log-analysis-script.sh "20250724 ~ 20250724"
```

或者分析多天數據：
```bash
# 分析一週的數據
./daily-log-analysis-script.sh "20250724 ~ 20250730"
```

### 🔧 其他工具

除了主要的每日流程外，還有以下特殊的分析工具：

#### 🐌 慢渲染分析器
用於分析特定日期的慢渲染狀況：
```bash
# 使用 shell script 執行慢渲染分析（建議）
./slow-render-analysis-script.sh 20250724 10

# 或者直接執行 JavaScript 檔案
node slow-render-analyzer.js 20250724 10
```

#### 📈 週報分析工具
用於產生週度資料分析報告：
```bash
# 產生週報告
./week-report-script.sh "20250724 ~ 20250730" week1
```

---

## 使用方式

### 1. 雙檔案分析 (主要分析工具)

```bash
node analyze-two-file.js <UserAgent檔案> <RenderTime檔案>
```

範例:
```bash
node analyze-two-file.js to-analyze-daily-data/user-agent-log/user-agent-20250724.csv to-analyze-daily-data/200-log/L2/logs-20250724.csv
```

### 2. 效能分析

```bash
node performance-analyzer.js <日誌檔案.json>
```

### 3. Pod群組分析

```bash
node pod-group-analyzer.js <UserAgent檔案> <RenderTime檔案>
```

### 4. 批次分析 (指定日期範圍)

```bash
./daily-log-analysis-script.sh "20250724 ~ 20250730"
```

### 5. 慢渲染分析

```bash
./slow-render-analysis-script.sh <日期> <分析筆數>
```

範例:
```bash
./slow-render-analysis-script.sh 20250724 10
```

### 6. 週報生成

```bash
./week-report-script.sh <日期範圍> <資料夾名稱>
```

範例:
```bash
./week-report-script.sh "20250724 ~ 20250730" week1
```

## 輸出格式

### JSON 輸出範例

```json
{
  "analysis_time": "2025/7/24 下午3:45:20",
  "render_time_stats": {
    "average_ms": 1250.75,
    "median_p50_ms": 890.5,
    "p90_ms": 2100.25,
    "p95_ms": 3500.8,
    "p98_ms": 5200.3,
    "p99_ms": 8500.1
  },
  "user_agent_analysis": {
    "browser_stats": [...],
    "os_stats": [...]
  },
  "slow_render_periods": [...]
}
```

### 文字報告範例

```
CSV 日誌分析報告 (增強版雙檔案分析模式)
================================================================

Render Time 統計:
• 平均值: 1250.75 ms
• 第90百分位數 (P90): 2100.25 ms
• 第95百分位數 (P95): 3500.8 ms
• 慢渲染 (8-20秒)的總數: 45

User-Agent 分析結果:
• Chrome: 1250 次 (65.5%)
• Safari: 350 次 (18.3%)
• Firefox: 200 次 (10.5%)
```

## 核心分析功能

### 🕐 時間轉換

- 自動轉換 UTC 時間為台灣時區 (UTC+8)
- 支援多種時間格式解析
- 時間戳記驗證與清理

### 📈 統計分析

- **百分位數計算**: P50, P90, P95, P98, P99
- **渲染時間分類**: 
  - 正常渲染 (<8秒)
  - 慢渲染 (8-20秒) 
  - 異常渲染 (20-45秒)
  - 超時 (>45秒)

### 🌐 User-Agent 分析

- 瀏覽器識別與版本解析
- 作業系統統計
- 每小時使用模式分析
- 平均渲染時間關聯

### 📊 請求模式分析

- 每小時/分鐘請求量統計
- 峰值時段識別
- 並行請求分析
- URL 重複率統計

## 設定檔

專案使用 `package.json` 進行依賴管理:

```json
{
  "dependencies": {
    "@google-cloud/logging": "^11.2.0",
    "csv-parse": "^5.6.0",
    "moment-timezone": "^0.6.0",
    "lodash": "^4.17.21"
  }
}
```

## 日誌格式支援

### Google Cloud Logging 格式
- `textPayload` 欄位解析
- 自動識別不同日誌類型:
  - 完成請求: `got 200 in XXXms`
  - 開始請求: `getting!!!`
  - User-Agent: `X-Original-User-Agent`

### CSV 格式支援
- 標準 CSV 檔案讀取
- 自動欄位識別
- 錯誤處理與數據驗證

## 效能最佳化

- **記憶體效率**: 串流處理大檔案
- **並行處理**: 同時處理多個日誌檔案
- **快取機制**: reqId 映射快取
- **批次處理**: 支援日期範圍批次分析

## 錯誤處理

- 檔案存在性檢查
- 日期格式驗證
- 數據完整性驗證
- 詳細錯誤訊息輸出

## 貢獻指南

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 授權條款

此專案採用 ISC 授權條款。

## 支援與聯絡

如有問題或建議，請通過以下方式聯絡：
- 建立 Issue
- 提交 Pull Request

---

**注意**: 此工具專為分析 Prerender 伺服器效能日誌設計，特別針對 Google Cloud Logging 格式最佳化。