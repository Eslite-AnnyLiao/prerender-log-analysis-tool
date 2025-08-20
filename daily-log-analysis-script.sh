#!/bin/bash

# 檢查參數數量
if [ $# -ne 1 ]; then
    echo "使用方法: $0 '開始日期 ~ 結束日期'"
    echo "範例: $0 '20250724 ~ 20250730'"
    exit 1
fi

# 解析參數
date_range="$1"

# 提取開始和結束日期
start_date=$(echo "$date_range" | awk '{print $1}')
end_date=$(echo "$date_range" | awk '{print $3}')

echo "開始日期: $start_date"
echo "結束日期: $end_date"

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

# 步驟 2: 執行 analyze-two-file.js
echo ""
echo "=== 步驟 1: 執行 analyze-two-file.js ==="
for date in "${dates[@]}"; do
    echo "處理日期: $date"
    user_agent_file="./to-analyze-daily-data/user-agent-log/user-agent-${date}.csv"
    logs_file="./to-analyze-daily-data/200-log/L2/logs-${date}.csv"

    if [ -f "$user_agent_file" ] && [ -f "$logs_file" ]; then
        node analyze-two-file.js "$user_agent_file" "$logs_file"
        if [ $? -eq 0 ]; then
            echo "✓ analyze-two-file.js 完成: $date"
        else
            echo "✗ analyze-two-file.js 失敗: $date"
        fi
    else
        echo "⚠ 檔案缺失:"
        [ ! -f "$user_agent_file" ] && echo "  - $user_agent_file"
        [ ! -f "$logs_file" ] && echo "  - $logs_file"
    fi
done

echo ""
echo "=== 步驟 2: 執行 pod-group-analyzer.js ==="
for date in "${dates[@]}"; do
    echo "處理日期: $date"
    user_agent_file="./to-analyze-daily-data/user-agent-log/user-agent-${date}.csv"
    logs_file="./to-analyze-daily-data/200-log/L2/logs-${date}.csv"

    if [ -f "$user_agent_file" ] && [ -f "$logs_file" ]; then
        node pod-group-analyzer.js "$user_agent_file" "$logs_file"
        if [ $? -eq 0 ]; then
            echo "✓ pod-group-analyzer.js 完成: $date"
        else
            echo "✗ pod-group-analyzer.js 失敗: $date"
        fi
    else
        echo "⚠ 檔案缺失:"
        [ ! -f "$user_agent_file" ] && echo "  - $user_agent_file"
        [ ! -f "$logs_file" ] && echo "  - $logs_file"
    fi
done

echo ""
echo "=== 處理完成 ==="
echo "處理了 ${#dates[@]} 天的資料"
