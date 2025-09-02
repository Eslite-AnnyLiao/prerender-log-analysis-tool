# Analysis Log - Prerender Server Performance Analysis Tool

A comprehensive tool for analyzing prerender server logs from Google Cloud Logging, focusing on render performance, user-agent statistics, and request patterns analysis. Features automatic Google Cloud authentication management for seamless operation.

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
├── analysis-cli.js             # 統一 CLI 介面
├── daily-log-analysis-script.sh # 每日日誌分析腳本
├── query-daily-log.sh          # 日誌查詢腳本
├── slow-render-analysis-script.sh # 慢渲染分析腳本
├── week-report-script.sh       # 週報腳本
├── google-cloud-log-query.js   # Google Cloud 日誌查詢
├── to-analyze-daily-data/       # 待分析每日數據
│   ├── 200-log/                # HTTP 200 回應日誌
│   │   ├── L1/                 # category/1 數據
│   │   ├── L2/                 # category/2 數據
│   │   ├── products/           # products 數據
│   │   └── [other-folders]/    # 其他URL路徑數據
│   └── user-agent-log/         # User-Agent 日誌
│       ├── L1/                 # category/1 User-Agent
│       ├── L2/                 # category/2 User-Agent
│       ├── products/           # products User-Agent
│       └── [other-folders]/    # 其他URL路徑User-Agent
├── daily-analysis-result/      # 每日分析結果
│   ├── L1/                     # L1 URL類別分析結果
│   ├── L2/                     # L2 URL類別分析結果
│   └── [other-folders]/        # 其他URL類別結果
├── daily-pod-analysis-result/  # Pod分析結果
│   ├── L1/                     # L1 URL類別Pod結果
│   ├── L2/                     # L2 URL類別Pod結果
│   └── [other-folders]/        # 其他URL類別Pod結果
├── to-analyze-performance-data/ # 待分析效能數據
│   └── YYYYMMDD/               # 日期資料夾
│       ├── L1/                 # L1 URL類別效能數據
│       ├── L2/                 # L2 URL類別效能數據
│       └── [other-folders]/    # 其他URL類別效能數據
├── performance-analyze-result/ # 效能分析結果
│   └── YYYYMMDD/               # 日期資料夾
│       ├── L1/                 # L1 URL類別效能結果
│       ├── L2/                 # L2 URL類別效能結果
│       └── [other-folders]/    # 其他URL類別效能結果
├── weekly_aggregated_results/  # 週度彙總分析結果
│   ├── L1/                     # L1 URL類別週報
│   ├── L2/                     # L2 URL類別週報
│   └── [other-folders]/        # 其他URL類別週報
├── to-analyze-weekly-data/      # 待分析週數據
│   └── week_YYYYMMDD_YYYYMMDD/ # 週資料夾 (例: week_20250821_20250827)
│       ├── L1/                 # L1 URL類別週數據
│       ├── L2/                 # L2 URL類別週數據
│       └── [other-folders]/    # 其他URL類別週數據
└── slow-render-periods-log/    # 慢渲染時段記錄
    ├── L1/                     # L1 URL類別慢渲染記錄
    ├── L2/                     # L2 URL類別慢渲染記錄
    └── [other-folders]/        # 其他URL類別慢渲染記錄
```

## 快速開始 (新手推薦)

### 🚀 超簡單 3 步驟

我們提供了最簡化的使用流程，讓您 3 步驟即可開始：

```bash
# 1. 環境自動設置
npm run setup

# 2. 互動式指南（推薦新手）
npm run guide

# 或者：一鍵完整分析（自動資料夾映射）
npm run cli run 20250821 https://www.eslite.com/category/2/
# 或者：手動指定資料夾
npm run cli run 20250821 https://www.eslite.com/category/2/ L2
```

### 🎯 統一命令介面 (進階用戶)

我們提供了統一的 CLI 介面，讓所有操作更加簡潔：

```bash
# 環境相關
npm run cli setup              # 環境設置
npm run cli check              # 環境檢查

# 數據分析流程
npm run cli query 20250821 https://example.com/         # 查詢日誌（自動資料夾映射）
npm run cli query 20250821 https://example.com/ L2      # 查詢到指定資料夾
npm run cli -- analyze -d 20250821                     # 分析數據 (需要 -- 分隔符)  
npm run cli run 20250821 https://example.com/           # 完整工作流程（查詢+分析）
npm run cli run 20250821 https://example.com/ custom    # 指定資料夾的完整工作流程

# 狀態和結果管理
npm run cli status 20250821    # 檢查分析狀態
npm run cli results            # 查看所有結果
npm run cli results 20250821   # 查看特定日期結果
```

自動設置工具會：
- ✅ 檢查 Node.js 版本相容性
- ✅ 自動安裝所有依賴套件
- ✅ 驗證 Google Cloud CLI 安裝
- ✅ 引導完成 Google Cloud 認證
- ✅ 測試專案存取權限
- ✅ 建立必要的目錄結構
- ✅ 設置腳本執行權限

### 🔧 手動安裝與設置

#### 系統需求

- Node.js >= 14.0 (推薦 >= 16.0)
- npm
- Google Cloud CLI
- 適當的 Google Cloud 專案存取權限

#### 安裝步驟

1. **安裝 Node.js 依賴**
   ```bash
   npm install
   ```

2. **安裝 Google Cloud CLI**
   - macOS: `brew install google-cloud-sdk`
   - Linux: [安裝指南](https://cloud.google.com/sdk/docs/install-sdk#linux)
   - Windows: [安裝指南](https://cloud.google.com/sdk/docs/install-sdk#windows)

3. **設置 Google Cloud 認證**
   ```bash
   gcloud auth application-default login
   ```

4. **驗證設置**
   ```bash
   npm run check-env
   ```

### 主要依賴項

- `@google-cloud/logging`: Google Cloud Logging API
- `csv-parse`, `csv-parser`, `csv-writer`: CSV 檔案處理
- `moment-timezone`: 時區處理
- `lodash`: 工具函數
- `chalk`: 終端彩色輸出
- `commander`: 命令列介面

### 🆘 環境問題故障排除

如果遇到環境設置問題：

1. **執行環境檢查**
   ```bash
   npm run check-env
   ```

2. **常見問題解決**
   - Node.js 版本過舊：更新到 14.0 以上
   - Google Cloud CLI 未安裝：按照上方安裝指南
   - 認證問題：所有查詢工具都有自動認證檢查，會在需要時提示重新登入
   - 專案存取被拒：確認您有適當的 Google Cloud 專案權限

3. **重新執行自動設置**
   ```bash
   npm run setup
   ```

## 使用流程

### 🎯 推薦的使用方式

#### 方式一：互動式指南（新手推薦）
```bash
npm run guide
```
跟隨互動式指南，一步步完成所有操作，適合第一次使用或不熟悉命令的用戶。

#### 方式二：一鍵完整流程（效率最高）
```bash
npm run cli run 20250821 https://www.eslite.com/category/2/
```
自動完成查詢和分析的完整流程，適合日常使用。現在支援**自訂URL查詢**，可以分析任何目標URL的性能數據。

#### 方式三：分步驟執行（精確控制）
```bash
# 步驟 1: 查詢日誌（現在需要指定URL）
npm run cli query 20250821 https://example.com/products/

# 步驟 2: 分析數據 (需要使用 -- 分隔符)
npm run cli -- analyze -d 20250821

# 步驟 3: 檢查結果
npm run cli status 20250821
npm run cli results 20250821
```

### 📋 完整工作流程範例

#### 第一次使用
```bash
# 1. 環境設置
npm run setup

# 2. 驗證環境
npm run cli check

# 3. 開始使用（選擇其中一種方式）
npm run guide                # 互動式指南
# 或
npm run cli run 20250821 https://example.com/     # 一鍵完成
```

#### 日常使用
```bash
# 快速分析今天的數據（指定要分析的URL）
npm run cli run 20250821 https://www.eslite.com/category/2/

# 分析不同URL的數據
npm run cli run 20250821 https://example.com/api/v1/products/

# 分析一週數據 (需要使用 -- 分隔符)
npm run cli -- analyze -r "20250821 ~ 20250827"

# 檢查狀態和結果
npm run cli status 20250821
npm run cli results
```

#### 進階分析
```bash
# 慢渲染分析 - 所有URL類別
npm run cli performance 20250821 10

# 慢渲染分析 - 特定URL類別
npm run cli performance 20250821 10 L1
npm run cli performance 20250821 5 L2

# 週報生成 - 所有URL類別
npm run cli weekly 20250821 20250827

# 週報生成 - 特定URL類別
npm run cli weekly 20250821 20250827 L1
npm run cli weekly 20250821 20250827 L2

# 查看特定日期的所有結果
npm run cli results 20250821
```

### 🔧 其他工具

除了主要的每日流程外，還有以下特殊的分析工具：

#### 🐌 慢渲染分析器
用於分析特定日期的慢渲染狀況（具備自動認證檢查）：
```bash
# 使用 CLI 命令（推薦） - 分析所有URL類別
npm run cli performance 20250724 10

# 分析特定URL類別
npm run cli performance 20250724 10 L1
npm run cli performance 20250724 5 L2

# 使用 shell script 執行慢渲染分析
./slow-render-analysis-script.sh 20250724 10
./slow-render-analysis-script.sh 20250724 10 L1

# 或者直接執行 JavaScript 檔案
node slow-render-analyzer.js 20250724 10
node slow-render-analyzer.js 20250724 10 L1
```

#### 📈 週報分析工具
用於產生週度資料分析報告：
```bash
# 使用 CLI 命令（推薦） - 生成所有URL類別的週報
npm run cli weekly 20250821 20250827

# 生成特定URL類別的週報
npm run cli weekly 20250821 20250827 L1
npm run cli weekly 20250821 20250827 L2

# 直接使用 shell script
./week-report-script.sh "20250821 ~ 20250827" week_20250821_20250827
./week-report-script.sh "20250821 ~ 20250827" week_20250821_20250827 L1
```

---

## 詳細使用方式

### 📋 可用的 npm scripts

#### 🔧 環境管理
```bash
npm run setup         # 自動環境設置
npm run check-env     # 檢查環境狀態
npm run cli check     # 環境檢查（CLI版）
```

#### 🎯 工作流程（推薦）
```bash
npm run guide         # 互動式指南（新手推薦）
npm run cli           # 統一CLI介面
npm run start         # 同 npm run cli
```

#### 📊 數據分析
```bash
npm run cli run <date> <url>              # 完整工作流程（一鍵完成）
npm run cli query <date> <url>            # 查詢日誌
npm run cli -- analyze -d <date>           # 分析單日數據 (需要 -- 分隔符)
npm run cli -- analyze -r "<range>"       # 分析日期範圍 (需要 -- 分隔符)
```

#### 📈 進階功能
```bash
npm run cli performance <date>      # 慢渲染分析
npm run cli weekly <start> <end>    # 週報生成
npm run cli status <date>           # 檢查狀態
npm run cli results [date]          # 查看結果
```

#### 🛠️ 傳統命令（保持相容性）
```bash
npm run query-logs    # 查詢日誌數據（傳統版）
npm run analyze-daily # 執行每日分析（傳統版）
```

### 🔧 進階使用方式

#### 1. 雙檔案分析 (主要分析工具)

```bash
node analyze-two-file.js <UserAgent檔案> <RenderTime檔案>
```

範例:
```bash
# 傳統檔名格式
node analyze-two-file.js to-analyze-daily-data/user-agent-log/user-agent-20250821.csv to-analyze-daily-data/200-log/logs-20250821.csv

# 新的動態檔名格式（根據URL生成）
node analyze-two-file.js to-analyze-daily-data/user-agent-log/user-agent-log-20250821-category-2.csv to-analyze-daily-data/200-log/log-20250821-category-2.csv
```

#### 2. 效能分析

```bash
node performance-analyzer.js <日誌檔案.json>
```

#### 3. Pod群組分析

```bash
node pod-group-analyzer.js <UserAgent檔案> <RenderTime檔案>
```

#### 4. 批次分析 (指定日期範圍)

```bash
# 使用 npm script (推薦)
npm run analyze-daily "20250821 ~ 20250827"

# 或直接執行腳本
./daily-log-analysis-script.sh "20250821 ~ 20250827"

# 支援新的檔名格式（可選參數）
./daily-log-analysis-script.sh "20250821 ~ 20250827" "log-20250821-category-2"
```

#### 5. 慢渲染分析

```bash
./slow-render-analysis-script.sh <日期> <分析筆數> [URL資料夾]
```

範例:
```bash
# 分析所有URL類別的慢渲染數據
./slow-render-analysis-script.sh 20250821 10

# 分析特定URL類別的慢渲染數據
./slow-render-analysis-script.sh 20250821 10 L1
./slow-render-analysis-script.sh 20250821 5 L2
```

#### 6. 週報生成

```bash
./week-report-script.sh <日期範圍> <資料夾名稱> [URL資料夾]
```

範例:
```bash
# 生成所有URL類別的週報
./week-report-script.sh "20250821 ~ 20250827" week_20250821_20250827

# 生成特定URL類別的週報
./week-report-script.sh "20250821 ~ 20250827" week_20250821_20250827 L1
./week-report-script.sh "20250821 ~ 20250827" week_20250821_20250827 L2
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

## 🆘 常見問題 FAQ

### Q: 第一次使用該怎麼開始？
A: **推薦方式**：`npm run setup` → `npm run guide`
   **快速方式**：`npm run setup` → `npm run cli run 20250821 https://example.com/`
   
### Q: 新的URL參數是必需的嗎？
A: 是的，從現在開始查詢命令需要同時提供日期和URL參數：
   - `npm run cli query <date> <url>`
   - `npm run cli run <date> <url>`
   - URL必須以 `http://` 或 `https://` 開頭

### Q: 出現認證錯誤怎麼辦？
A: 所有查詢工具都具備**自動認證檢查**功能：
- 執行查詢前會自動檢查 Google Cloud 認證狀態
- 認證過期（超過 12 小時）會自動提示重新登入
- 手動重新認證：`gcloud auth application-default login`
- 環境診斷：`npm run cli check`

### Q: 新的 CLI 工具和傳統腳本有什麼差別？
A: 
- **CLI工具** (`npm run cli`): 統一介面、參數驗證、狀態管理、更好的錯誤處理
- **傳統腳本**: 保持向後相容，提供更多低階控制選項

### Q: 如何檢查分析狀態？
A: 使用 `npm run cli status <date>` 檢查特定日期的完整狀態，包括數據檔案和分析結果。

### Q: 如何查看分析結果？
A: 
- `npm run cli results` - 查看所有結果
- `npm run cli results 20250821` - 查看特定日期結果
- 或直接查看目錄：`daily-analysis-result/`, `daily-pod-analysis-result/`

### Q: 支援哪些作業系統？
A: 支援 macOS、Linux 和 Windows（需要 WSL 或 Git Bash）。

### Q: 為什麼 analyze 命令需要使用 `--`？
A: 因為 `analyze` 命令使用帶值的選項參數（如 `-d` 和 `-r`），npm 需要 `--` 分隔符來正確傳遞這些參數。
   - **正確**: `npm run cli -- analyze -r "20250821 ~ 20250827"`
   - **錯誤**: `npm run cli analyze -r "20250821 ~ 20250827"` ❌ 會出現 "too many arguments" 錯誤
   - 其他命令（如 `query`, `run`, `status`）使用位置參數，不需要 `--`

### Q: 如何分析日期範圍？
A: 使用 `npm run cli -- analyze -r "20250821 ~ 20250827"` 分析指定日期範圍。也可以結合URL資料夾：`./daily-log-analysis-script.sh "20250821 ~ 20250827" "" "L1"`

### Q: 互動式指南和自動化命令哪個比較好？
A: 
- **新手或不確定操作**: 使用 `npm run guide` 互動式指南
- **熟悉流程或自動化**: 使用 `npm run cli run <date>` 一鍵完成
- **需要精確控制**: 使用分步驟命令（query → analyze → status）

### Q: 如何使用新的URL分類資料夾系統？
A: 新系統支援按URL類別組織數據：
- **查詢特定URL類別**: `npm run cli query 20250825 https://example.com/category/1/ L1`
- **分析特定URL類別**: `./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L1"`
- **慢渲染分析**: `npm run cli performance 20250825 10 L1`
- **週報生成**: `npm run cli weekly 20250821 20250827 L1`
- **結果位置**: L1類別結果在 `daily-analysis-result/L1/`

### Q: L1、L2等資料夾是怎麼決定的？
A: 
- **L1**: 對應 `category/1` URL路徑
- **L2**: 對應 `category/2` URL路徑
- **L3**: 對應 `category/3` URL路徑
- **自訂資料夾**: 也可以手動指定任意資料夾名稱
- **徑向相容**: 舊版本不指定資料夾的方式仍然支援

## 📚 相關文件

- [Google Cloud Logging API 文檔](https://cloud.google.com/logging/docs)
- [Node.js CSV 處理指南](https://nodejs.org/api/fs.html)
- [Moment.js 時區處理](https://momentjs.com/timezone/)

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
- 使用 `npm run check-env` 診斷環境問題

---

## 🆕 最新功能更新

### 📂 URL分類資料夾系統

新版本引入了全新的URL分類資料夾系統，能够更好地組織和管理不同類別的分析數據：

#### 🎯 主要特色
- **URL類別分離**: 每個URL類別都有獨立的資料夾 (L1、L2、L3...)
- **分層儲存結構**: 所有分析結果都按URL類別組織
- **独立分析**: 可以單獨分析特定URL類別的數據
- **徑向相容**: 完全相容舊版本的資料夾結構

#### 📁 新的資料夾結構示意
```
輸入數據：
to-analyze-daily-data/
├── 200-log/L1/           # category/1 的日誌數據
├── 200-log/L2/           # category/2 的日誌數據
├── user-agent-log/L1/    # category/1 的User-Agent
└── user-agent-log/L2/    # category/2 的User-Agent

分析結果：
daily-analysis-result/
├── L1/                  # L1 URL類別分析結果
└── L2/                  # L2 URL類別分析結果

慢渲染分析：
slow-render-periods-log/
├── L1/                  # L1 URL類別慢渲染記錄
└── L2/                  # L2 URL類別慢渲染記錄

performance-analyze-result/
└── YYYYMMDD/
    ├── L1/              # L1 URL類別效能結果
    └── L2/              # L2 URL類別效能結果

週報結果：
weekly_aggregated_results/
├── L1/                  # L1 URL類別週報
└── L2/                  # L2 URL類別週報
```

#### 🚀 新功能使用範例
```bash
# 1. 查詢特定URL類別的數據
npm run cli query 20250825 https://example.com/category/1/ L1
npm run cli query 20250825 https://example.com/category/2/ L2

# 2. 分析特定URL類別
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L1"
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L2"

# 3. 慢渲染分析 - 按URL類別
npm run cli performance 20250825 10 L1
npm run cli performance 20250825 10 L2

# 4. 週報生成 - 按URL類別
npm run cli weekly 20250821 20250827 L1
npm run cli weekly 20250821 20250827 L2

# 5. 查看結果檔案
# L1 的分析結果在: daily-analysis-result/L1/
# L2 的分析結果在: daily-analysis-result/L2/
# L1 的週報在: weekly_aggregated_results/L1/
# L2 的週報在: weekly_aggregated_results/L2/
```

#### 📊 分析效益
- **更清晰的數據分離**: 不同 URL 類別的數據不會混在一起
- **更精確的效能分析**: 可以單獨分析某個 URL 類別的效能狀況
- **更有效的問題診斷**: 迅速定位特定 URL 類別的效能問題
- **更好的資料管理**: 整齊的資料夾結構，更容易維護

### 📁 智能資料夾管理系統
- **自動資料夾映射**: 根據URL路徑自動創建和管理資料夾
- **手動資料夾指定**: 支援自訂資料夾名稱，靈活管理不同數據
- **分層儲存結構**: 每個URL都有獨立的資料夾，避免數據混淆

#### 🗂️ 資料夾結構
```
to-analyze-daily-data/
├── 200-log/
│   ├── L1/              # category/1 的數據
│   ├── L2/              # category/2 的數據
│   ├── products/        # products 的數據
│   └── api-v1-users/    # api/v1/users 的數據
└── user-agent-log/
    ├── L1/
    ├── L2/
    ├── products/
    └── api-v1-users/
```

#### 🎯 自動映射規則
- `category/1` → `L1`
- `category/2` → `L2`
- `category/3` → `L3`
- `products/` → `products`
- `api/v1/users` → `api-v1-users`
- 根路徑 `/` → `root`

### 🌐 自訂URL查詢支援
- **動態URL查詢**: 現在可以查詢任意URL的日誌數據，不再限制於固定URL
- **智能檔名生成**: 根據URL路徑自動生成有意義的檔名
  - 例如: `https://www.eslite.com/category/2/` → `log-20250825-category-2`
  - 例如: `https://example.com/api/v1/data` → `log-20250825-api-v1-data`
- **向後相容性**: 完全支援舊有檔案格式，無需擔心歷史數據

#### 🔄 更新的命令格式
```bash
# 自動資料夾映射
npm run cli query 20250825 https://www.eslite.com/category/2/     # → 存入 L2/
npm run cli run 20250825 https://example.com/products/            # → 存入 products/

# 手動指定資料夾
npm run cli query 20250825 https://www.eslite.com/category/2/ L2  # → 存入 L2/
npm run cli run 20250825 https://example.com/api/ custom-folder   # → 存入 custom-folder/

# 直接使用腳本
./enhanced-query-daily-log.sh 20250825 https://api.example.com/v1/        # 自動映射
./enhanced-query-daily-log.sh 20250825 https://site.com/path/ my-folder   # 指定資料夾
```

#### 📁 新的檔案命名模式
- **L2日誌**: `to-analyze-daily-data/200-log/[folder]/log-{date}-{path}.csv`
- **User-Agent日誌**: `to-analyze-daily-data/user-agent-log/[folder]/user-agent-log-{date}-{path}.csv`
- **自動適應**: 分析腳本會自動偵測新舊檔名格式

#### 資料夾管理範例
```bash
# 自動資料夾映射
npm run cli run 20250825 https://www.eslite.com/category/2/    # → L2/log-20250825-category-2.csv
npm run cli run 20250825 https://example.com/products/         # → products/log-20250825-products.csv
npm run cli run 20250825 https://api.site.com/v1/users/        # → api-v1-users/log-20250825-api-v1-users.csv

# 手動指定資料夾
npm run cli run 20250825 https://www.eslite.com/category/3/ L3        # → L3/
npm run cli run 20250825 https://custom.com/path/ my-data             # → my-data/

# 分析特定資料夾
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L2"       # 只分析 L2 資料夾
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "products"  # 只分析 products 資料夾
```

### ✨ 使用流程優化
- **互動式工作流程指南** (`npm run guide`) - 新手友善的步驟式引導
- **統一CLI介面** (`npm run cli`) - 一個命令搞定所有操作
- **一鍵完整分析** (`npm run cli run <date>`) - 從查詢到分析一次完成
- **智能狀態檢查** (`npm run cli status <date>`) - 隨時了解分析進度

### 🔧 增強功能
- **自動認證檢查** - 查詢前自動檢查 Google Cloud 認證狀態
- **彩色輸出和進度條** - 更好的視覺反饋
- **智能參數驗證** - 防止常見輸入錯誤
- **自動環境檢查** - 自動診斷和修復環境問題
- **結果統一管理** - 輕鬆查看和管理所有分析結果

### 🚀 最佳實踐建議

#### 新手用戶
1. `npm run setup` - 環境設置
2. `npm run guide` - 跟隨互動式指南學習

#### 日常用戶  
1. `npm run cli run <date> <url>` - 一鍵完成分析（現在需要指定URL）
2. `npm run cli results` - 查看結果

#### URL查詢範例
```bash
# 分析不同網站的效能
npm run cli run 20250825 https://www.eslite.com/category/2/
npm run cli run 20250825 https://example.com/products/
npm run cli run 20250825 https://api.site.com/v1/users/

# 查看對應的結果檔案
# log-20250825-category-2.csv
# log-20250825-products.csv  
# log-20250825-api-v1-users.csv
```

#### 進階用戶
1. 使用 CLI 的各種子命令進行精確控制
2. 結合傳統腳本進行客製化操作

---

**注意**: 此工具專為分析 Prerender 伺服器效能日誌設計，特別針對 Google Cloud Logging 格式最佳化。

**新用戶建議**: 第一次使用時執行 `npm run setup` → `npm run guide` 獲得最佳體驗。

**資料夾管理提醒**: 建議為不同的URL使用不同的資料夾，這樣可以更好地組織和分析數據。

**重要更新**: 現在所有查詢操作都支援自訂URL和智能資料夾管理，讓您可以分析任何目標網站的效能數據並有序地管理！

**最新功能**: 引入URL分類資料夾系統，支援L1、L2等不同URL類別的独立分析，包括慢渲染分析和週報生成！

## 🎯 最佳實踐建議

### 📂 資料夾管理策略
1. **使用自動映射**: 對於常見的URL路徑（如category/1, category/2），讓系統自動映射到L1, L2
2. **手動指定資料夾**: 對於特殊用途或測試數據，使用自訂資料夾名稱
3. **分類分析**: 使用資料夾參數分別分析不同URL的數據，避免混淆

### 🔄 工作流程建議
```bash
# 1. 查詢不同URL的數據
npm run cli query 20250825 https://www.eslite.com/category/1/    # → L1/
npm run cli query 20250825 https://www.eslite.com/category/2/    # → L2/
npm run cli query 20250825 https://example.com/products/         # → products/

# 2. 分別分析各資料夾
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L1"
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L2"
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "products"

# 3. 或者一次性分析所有資料夾（包括L1、L2等）
./daily-log-analysis-script.sh "20250825 ~ 20250825"

# 4. 也可以結合URL分類資料夾系統：
# 先查詢不同URL類別的數據，再分別分析
npm run cli query 20250825 https://example.com/category/1/ L1
npm run cli query 20250825 https://example.com/category/2/ L2
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L1"
./daily-log-analysis-script.sh "20250825 ~ 20250825" "" "L2"
```