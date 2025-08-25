#!/bin/bash

# 檢查參數數量
if [ $# -lt 1 ]; then
    echo "使用方法: $0 '開始日期 ~ 結束日期' [檔名模式] [資料夾名稱]"
    echo "範例: $0 '20250724 ~ 20250730'"
    echo "範例: $0 '20250724 ~ 20250730' 'log-20250724-category-2'"
    echo "範例: $0 '20250724 ~ 20250730' '' 'L2'"
    echo "說明: 資料夾名稱用於指定要分析的子資料夾 (如 L1, L2, products 等)"
    exit 1
fi

# 解析參數
date_range="$1"
filename_pattern="$2"  # 可選的檔名模式參數
folder_name="$3"       # 可選的資料夾名稱參數

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

# 如果提供了檔名模式或資料夾名稱，顯示相關資訊
if [ -n "$filename_pattern" ]; then
    echo "檔名模式: $filename_pattern"
fi
if [ -n "$folder_name" ]; then
    echo "指定資料夾: $folder_name"
fi

echo "處理日期範圍: ${dates[0]} 到 ${dates[-1]} (共 ${#dates[@]} 天)"
if [ -n "$filename_pattern" ]; then
    echo "使用自訂檔名格式"
elif [ -n "$folder_name" ]; then
    echo "使用指定資料夾格式"
else
    echo "使用傳統檔名格式"
fi

# 步驟 2: 執行 analyze-two-file.js
echo ""
echo "=== 步驟 1: 執行 analyze-two-file.js ==="
for date in "${dates[@]}"; do
    echo "處理日期: $date"
    
    # 決定檔案路徑
    if [ -n "$filename_pattern" ]; then
        # 使用自訂檔名模式 (將日期替換為當前處理的日期)
        current_pattern=$(echo "$filename_pattern" | sed "s/[0-9]\{8\}/$date/g")
        if [ -n "$folder_name" ]; then
            user_agent_file="./to-analyze-daily-data/user-agent-log/${folder_name}/user-agent-${current_pattern}.csv"
            logs_file="./to-analyze-daily-data/200-log/${folder_name}/${current_pattern}.csv"
        else
            user_agent_file="./to-analyze-daily-data/user-agent-log/user-agent-${current_pattern}.csv"
            logs_file="./to-analyze-daily-data/200-log/${current_pattern}.csv"
        fi
    elif [ -n "$folder_name" ]; then
        # 使用指定資料夾，嘗試多種檔名格式
        # 先嘗試傳統檔名格式
        user_agent_file="./to-analyze-daily-data/user-agent-log/${folder_name}/user-agent-${date}.csv"
        logs_file="./to-analyze-daily-data/200-log/${folder_name}/logs-${date}.csv"
        
        # 如果傳統格式檔案不存在，嘗試 URL 檔名格式
        if [ ! -f "$user_agent_file" ] || [ ! -f "$logs_file" ]; then
            # 尋找符合日期的任何檔案
            if [ -d "./to-analyze-daily-data/user-agent-log/${folder_name}" ]; then
                potential_ua_file=$(find "./to-analyze-daily-data/user-agent-log/${folder_name}" -name "*${date}*.csv" | head -1)
                if [ -n "$potential_ua_file" ]; then
                    user_agent_file="$potential_ua_file"
                fi
            fi
            if [ -d "./to-analyze-daily-data/200-log/${folder_name}" ]; then
                potential_logs_file=$(find "./to-analyze-daily-data/200-log/${folder_name}" -name "*${date}*.csv" | head -1)
                if [ -n "$potential_logs_file" ]; then
                    logs_file="$potential_logs_file"
                fi
            fi
        fi
    else
        # 使用傳統檔名格式
        user_agent_file="./to-analyze-daily-data/user-agent-log/user-agent-${date}.csv"
        logs_file="./to-analyze-daily-data/200-log/logs-${date}.csv"
    fi

    if [ -f "$user_agent_file" ] && [ -f "$logs_file" ]; then
        if [ -n "$folder_name" ]; then
            node analyze-two-file.js "$user_agent_file" "$logs_file" "$folder_name"
        else
            node analyze-two-file.js "$user_agent_file" "$logs_file"
        fi
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
    
    # 決定檔案路徑 (與步驟1相同的邏輯)
    if [ -n "$filename_pattern" ]; then
        # 使用自訂檔名模式 (將日期替換為當前處理的日期)
        current_pattern=$(echo "$filename_pattern" | sed "s/[0-9]\{8\}/$date/g")
        if [ -n "$folder_name" ]; then
            user_agent_file="./to-analyze-daily-data/user-agent-log/${folder_name}/user-agent-${current_pattern}.csv"
            logs_file="./to-analyze-daily-data/200-log/${folder_name}/${current_pattern}.csv"
        else
            user_agent_file="./to-analyze-daily-data/user-agent-log/user-agent-${current_pattern}.csv"
            logs_file="./to-analyze-daily-data/200-log/${current_pattern}.csv"
        fi
    elif [ -n "$folder_name" ]; then
        # 使用指定資料夾，嘗試多種檔名格式
        # 先嘗試傳統檔名格式
        user_agent_file="./to-analyze-daily-data/user-agent-log/${folder_name}/user-agent-${date}.csv"
        logs_file="./to-analyze-daily-data/200-log/${folder_name}/logs-${date}.csv"
        
        # 如果傳統格式檔案不存在，嘗試 URL 檔名格式
        if [ ! -f "$user_agent_file" ] || [ ! -f "$logs_file" ]; then
            # 尋找符合日期的任何檔案
            if [ -d "./to-analyze-daily-data/user-agent-log/${folder_name}" ]; then
                potential_ua_file=$(find "./to-analyze-daily-data/user-agent-log/${folder_name}" -name "*${date}*.csv" | head -1)
                if [ -n "$potential_ua_file" ]; then
                    user_agent_file="$potential_ua_file"
                fi
            fi
            if [ -d "./to-analyze-daily-data/200-log/${folder_name}" ]; then
                potential_logs_file=$(find "./to-analyze-daily-data/200-log/${folder_name}" -name "*${date}*.csv" | head -1)
                if [ -n "$potential_logs_file" ]; then
                    logs_file="$potential_logs_file"
                fi
            fi
        fi
    else
        # 使用傳統檔名格式
        user_agent_file="./to-analyze-daily-data/user-agent-log/user-agent-${date}.csv"
        logs_file="./to-analyze-daily-data/200-log/logs-${date}.csv"
    fi

    if [ -f "$user_agent_file" ] && [ -f "$logs_file" ]; then
        if [ -n "$folder_name" ]; then
            node pod-group-analyzer.js "$user_agent_file" "$logs_file" "$folder_name"
        else
            node pod-group-analyzer.js "$user_agent_file" "$logs_file"
        fi
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
