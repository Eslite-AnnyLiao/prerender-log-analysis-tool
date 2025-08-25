#!/bin/bash

# 檢查參數數量
if [ $# -lt 2 ] || [ $# -gt 3 ]; then
    echo "使用方法: $0 '開始日期 ~ 結束日期' 資料夾名稱 [URL資料夾]"
    echo "範例: $0 '20250724 ~ 20250730' week1"
    echo "範例: $0 '20250724 ~ 20250730' week1 L1"
    echo "範例: $0 '20250724 ~ 20250730' week1 L2"
    exit 1
fi

# 解析參數
date_range="$1"
folder_name="$2"
url_folder="$3"

# 提取開始和結束日期
start_date=$(echo "$date_range" | awk '{print $1}')
end_date=$(echo "$date_range" | awk '{print $3}')

echo "開始日期: $start_date"
echo "結束日期: $end_date"
echo "資料夾名稱: $folder_name"
if [ -n "$url_folder" ]; then
    echo "URL資料夾: $url_folder"
fi

# 驗證日期格式
if [[ ! $start_date =~ ^[0-9]{8}$ ]] || [[ ! $end_date =~ ^[0-9]{8}$ ]]; then
    echo "錯誤: 日期格式應為 YYYYMMDD"
    exit 1
fi

# 將日期轉換為可比較的格式和 Unix 時間戳
start_year=${start_date:0:4}
start_month=${start_date:4:2}
start_day=${start_date:6:2}
end_year=${end_date:0:4}
end_month=${end_date:4:2}
end_day=${end_date:6:2}

echo "解析後 - 開始: $start_year-$start_month-$start_day, 結束: $end_year-$end_month-$end_day"

# 檢查系統類型並相應處理日期
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    start_timestamp=$(date -j -f "%Y%m%d" "$start_date" "+%s" 2>/dev/null)
    end_timestamp=$(date -j -f "%Y%m%d" "$end_date" "+%s" 2>/dev/null)
else
    # Linux
    start_timestamp=$(date -d "$start_year-$start_month-$start_day" +%s 2>/dev/null)
    end_timestamp=$(date -d "$end_year-$end_month-$end_day" +%s 2>/dev/null)
fi

# 檢查日期轉換是否成功
if [ -z "$start_timestamp" ] || [ -z "$end_timestamp" ]; then
    echo "錯誤: 日期轉換失敗，請檢查日期格式是否正確"
    exit 1
fi

# 比較日期
if [ $start_timestamp -gt $end_timestamp ]; then
    echo "錯誤: 開始日期不能晚於結束日期"
    exit 1
fi

# 生成日期列表
dates=()
current_timestamp=$start_timestamp

while [ $current_timestamp -le $end_timestamp ]; do
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        current_date=$(date -j -f "%s" "$current_timestamp" "+%Y%m%d")
    else
        # Linux
        current_date=$(date -d "@$current_timestamp" +%Y%m%d)
    fi
    dates+=("$current_date")
    current_timestamp=$((current_timestamp + 86400)) # 加一天 (86400 秒)
done

echo "處理日期範圍: ${dates[0]} 到 ${dates[-1]} (共 ${#dates[@]} 天)"

# 步驟 1: 複製 JSON 檔案
echo ""
echo "=== 步驟 1: 複製分析結果 ==="

# 建立目標資料夾
# 結構應為: to-analyze-weekly-data/week_${start_date}_${end_date}/${url_folder}
base_folder_name="week_${start_date}_${end_date}"

if [ -n "$url_folder" ]; then
    target_dir="./to-analyze-weekly-data/$base_folder_name/$url_folder"
else
    target_dir="./to-analyze-weekly-data/$base_folder_name"
fi

if [ ! -d "$target_dir" ]; then
    mkdir -p "$target_dir"
    echo "建立資料夾: $target_dir"
fi

copied_files=0
for date in "${dates[@]}"; do
    if [ -n "$url_folder" ]; then
        # 新格式：L1/L2 資料夾結構
        category_number="${url_folder: -1}" # 從 L1/L2 提取數字
        json_file="./daily-analysis-result/$url_folder/dual_user-agent-log-${date}-category-${category_number}_log-${date}-category-${category_number}_analysis.json"
    else
        # 舊格式：根目錄檔案
        json_file="./daily-analysis-result/dual_user-agent-${date}_logs-${date}_analysis.json"
    fi
    
    if [ -f "$json_file" ]; then
        cp "$json_file" "$target_dir/"
        if [ $? -eq 0 ]; then
            echo "✓ 複製檔案: $(basename "$json_file")"
            ((copied_files++))
        else
            echo "✗ 複製失敗: $json_file"
        fi
    else
        echo "⚠ 檔案不存在: $json_file"
    fi
done

echo "共複製了 $copied_files 個檔案到 $target_dir"

# 步驟 2: 執行週報告生成
echo ""
echo "=== 步驟 2: 生成週報告 ==="
if [ $copied_files -gt 0 ]; then
    echo "執行: node week-report.js --dir $target_dir"
    node week-report.js --dir "$target_dir"
    if [ $? -eq 0 ]; then
        echo "✓ 週報告生成完成"
        if [ -n "$url_folder" ]; then
            echo "ℹ️  週報結果已儲存在: ./weekly_aggregated_results/$url_folder/"
        else
            echo "ℹ️  週報結果已儲存在: ./weekly_aggregated_results/"
        fi
    else
        echo "✗ 週報告生成失敗"
    fi
else
    echo "⚠ 沒有找到任何分析檔案，跳過週報告生成"
fi

echo ""
echo "=== 處理完成 ==="
echo "處理了 ${#dates[@]} 天的資料"
echo "複製了 $copied_files 個分析檔案"
echo "輸出資料夾: $target_dir"
