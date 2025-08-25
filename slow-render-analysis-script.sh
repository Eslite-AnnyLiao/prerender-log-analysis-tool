#!/bin/bash

# 慢渲染日誌分析腳本
# 執行 slow-render-analyzer.js 的包裝腳本

# 檢查參數數量
if [ $# -lt 2 ] || [ $# -gt 3 ]; then
    echo "❌ 使用方法: $0 <日期> <分析筆數> [資料夾]"
    echo ""
    echo "參數說明:"
    echo "  日期        YYYYMMDD 格式 (例如: 20250724)"
    echo "  分析筆數    要分析的記錄數量 (正整數)"
    echo "  資料夾      可選，指定要分析的資料夾 (L1, L2, 等)"
    echo ""
    echo "範例:"
    echo "  $0 20250724 10"
    echo "  $0 20250725 5 L1"
    echo "  $0 20250726 8 L2"
    exit 1
fi

# 解析參數
date_str="$1"
count="$2"
folder="$3"

echo "📊 慢渲染日誌分析"
echo "=================="
echo "日期: $date_str"
echo "分析筆數: $count"
if [ -n "$folder" ]; then
    echo "資料夾: $folder"
fi
echo ""

# 驗證日期格式
if [[ ! $date_str =~ ^[0-9]{8}$ ]]; then
    echo "❌ 錯誤: 日期格式應為 YYYYMMDD"
    exit 1
fi

# 驗證分析筆數
if ! [[ "$count" =~ ^[0-9]+$ ]] || [ "$count" -le 0 ]; then
    echo "❌ 錯誤: 分析筆數必須是大於 0 的正整數"
    exit 1
fi

# 檢查必要的分析結果檔案是否存在
if [ -n "$folder" ]; then
    analysis_file="./daily-analysis-result/$folder/dual_user-agent-log-${date_str}-category-${folder: -1}_log-${date_str}-category-${folder: -1}_analysis.json"
else
    analysis_file="./daily-analysis-result/dual_user-agent-${date_str}_logs-${date_str}_analysis.json"
fi

if [ ! -f "$analysis_file" ]; then
    echo "❌ 錯誤: 找不到分析結果檔案 $analysis_file"
    echo ""
    echo "請先執行每日日誌分析:"
    echo "  ./daily-log-analysis-script.sh \"$date_str ~ $date_str\""
    exit 1
fi

echo "✅ 找到分析結果檔案: $analysis_file"
echo ""

# 執行慢渲染分析器
echo "🔍 執行慢渲染分析..."
if [ -n "$folder" ]; then
    node slow-render-analyzer.js "$date_str" "$count" "$folder"
else
    node slow-render-analyzer.js "$date_str" "$count"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 慢渲染分析完成!"
    echo ""
    echo "📁 結果檔案位置:"
    if [ -n "$folder" ]; then
        echo "  - JSON 結果: ./to-analyze-performance-data/${date_str}/${folder}/"
        echo "  - TXT 報告: ./performance-analyze-result/${date_str}/${folder}/"
        echo "  - 慢渲染記錄: ./slow-render-periods-log/${folder}/"
    else
        echo "  - JSON 結果: ./to-analyze-performance-data/${date_str}/"
        echo "  - TXT 報告: ./performance-analyze-result/${date_str}/"
        echo "  - 慢渲染記錄: ./slow-render-periods-log/"
    fi
else
    echo ""
    echo "❌ 慢渲染分析失敗"
    exit 1
fi

echo ""
echo "🎯 提示:"
echo "  - 如需分析其他日期，請重新執行此腳本"
echo "  - 如需更詳細的分析，可以增加分析筆數參數"