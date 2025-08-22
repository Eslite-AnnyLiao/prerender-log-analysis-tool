#!/bin/bash

# Enhanced Daily Log Query Script with better UX
# Improved version with progress indicators and validation

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${CYAN}[STEP $1]${NC} $2"
}

# Progress bar function
show_progress() {
    local duration=$1
    local sleep_interval=1
    local progress=0
    local bar_length=50
    
    while [ $progress -le $duration ]; do
        local percentage=$((progress * 100 / duration))
        local filled_length=$((progress * bar_length / duration))
        local bar=$(printf "%${filled_length}s" | tr ' ' '█')
        local empty=$(printf "%$((bar_length - filled_length))s" | tr ' ' '░')
        
        printf "\r${CYAN}進度:${NC} [%s%s] %d%% (%d/%d 秒)" "$bar" "$empty" "$percentage" "$progress" "$duration"
        
        sleep $sleep_interval
        progress=$((progress + sleep_interval))
    done
    echo
}

# Validate date format
validate_date() {
    local date=$1
    
    # Check if date matches YYYYMMDD format
    if [[ ! $date =~ ^[0-9]{8}$ ]]; then
        print_error "日期格式錯誤！應為 YYYYMMDD 格式 (例如: 20250821)"
        return 1
    fi
    
    # Extract year, month, day
    local year=${date:0:4}
    local month=${date:4:2}
    local day=${date:6:2}
    
    # Basic validation
    if [ $year -lt 2020 ] || [ $year -gt 2030 ]; then
        print_error "年份應在 2020-2030 之間"
        return 1
    fi
    
    if [ $month -lt 1 ] || [ $month -gt 12 ]; then
        print_error "月份應在 01-12 之間"
        return 1
    fi
    
    if [ $day -lt 1 ] || [ $day -gt 31 ]; then
        print_error "日期應在 01-31 之間"
        return 1
    fi
    
    return 0
}

# Show usage
show_usage() {
    echo "使用方法: $0 <date>"
    echo ""
    echo "參數:"
    echo "  date    要查詢的日期 (格式: YYYYMMDD)"
    echo ""
    echo "範例:"
    echo "  $0 20250821     # 查詢 2025年8月21日 的日誌"
    echo "  $0 20250820     # 查詢 2025年8月20日 的日誌"
    echo ""
    echo "說明:"
    echo "  此腳本會查詢指定日期的兩種日誌:"
    echo "  1. HTTP 200 回應日誌 (渲染時間數據)"
    echo "  2. User-Agent 日誌 (用戶代理數據)"
    echo ""
    echo "輸出檔案位置:"
    echo "  - ./to-analyze-daily-data/200-log/L2/logs-<date>.csv"
    echo "  - ./to-analyze-daily-data/user-agent-log/user-agent-<date>.csv"
}

# Check prerequisites
check_prerequisites() {
    print_step 1 "檢查環境先決條件"
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        print_error "Google Cloud CLI 未安裝！"
        print_info "請安裝 Google Cloud CLI: https://cloud.google.com/sdk/docs/install"
        return 1
    fi
    
    # Check if node is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安裝！"
        print_info "請安裝 Node.js: https://nodejs.org/"
        return 1
    fi
    
    # Check if google-cloud-log-query.js exists
    if [ ! -f "google-cloud-log-query.js" ]; then
        print_error "找不到 google-cloud-log-query.js 檔案！"
        print_info "請確認您在正確的專案目錄中執行此腳本"
        return 1
    fi
    
    print_success "環境檢查通過"
    return 0
}

# Check and refresh credentials
check_credentials() {
    print_step 2 "檢查 Google Cloud 認證"
    
    local credentials_file="$HOME/.config/gcloud/application_default_credentials.json"
    
    # Refresh Google Cloud credentials (once per day)
    if [ ! -f "$credentials_file" ] || [ $(find "$credentials_file" -mtime +1 2>/dev/null | wc -l) -gt 0 ]; then
        print_warning "Google Cloud 認證已過期或不存在，正在重新認證..."
        if gcloud auth application-default login; then
            print_success "Google Cloud 認證完成"
        else
            print_error "Google Cloud 認證失敗"
            return 1
        fi
    else
        print_success "Google Cloud 認證有效 (不到 24 小時)"
    fi
    
    return 0
}

# Create output directories
create_directories() {
    print_step 3 "準備輸出目錄"
    
    local dirs=(
        "./to-analyze-daily-data/200-log/L2"
        "./to-analyze-daily-data/user-agent-log"
    )
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_info "已建立目錄: $dir"
        fi
    done
    
    print_success "輸出目錄準備完成"
    return 0
}

# Execute log query with progress
execute_query() {
    local query_type=$1
    local output_dir=$2
    local filename=$3
    local formatted_date=$4
    local search_condition=$5
    
    print_info "執行 $query_type 查詢..."
    print_info "輸出目錄: $output_dir"
    print_info "檔案名稱: $filename"
    print_info "查詢條件: $search_condition"
    
    echo
    
    # Execute the query
    if node google-cloud-log-query.js --output-dir "$output_dir" --filename "$filename" "$formatted_date" "$search_condition"; then
        print_success "$query_type 查詢完成"
        
        # Show file info if it exists
        local output_file="$output_dir/$filename"
        if [ -f "$output_file" ]; then
            local file_size=$(du -h "$output_file" | cut -f1)
            local line_count=$(wc -l < "$output_file")
            print_info "輸出檔案: $output_file"
            print_info "檔案大小: $file_size"
            print_info "記錄筆數: $((line_count - 1)) 筆 (不含標題列)"
        fi
        
        return 0
    else
        print_error "$query_type 查詢失敗"
        return 1
    fi
}

# Main function
main() {
    echo
    print_info "📊 Enhanced Daily Log Query Tool"
    echo "=================================="
    echo
    
    # Check arguments
    if [ $# -eq 0 ]; then
        print_error "缺少日期參數"
        echo
        show_usage
        exit 1
    fi
    
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
        exit 0
    fi
    
    local date=$1
    
    # Validate date
    if ! validate_date "$date"; then
        echo
        show_usage
        exit 1
    fi
    
    # Convert YYYYMMDD to YYYY-MM-DD format for query
    local formatted_date="${date:0:4}-${date:4:2}-${date:6:2}"
    
    print_info "查詢日期: $formatted_date ($date)"
    echo
    
    # Check prerequisites
    if ! check_prerequisites; then
        exit 1
    fi
    
    echo
    
    # Check credentials
    if ! check_credentials; then
        exit 1
    fi
    
    echo
    
    # Create directories
    if ! create_directories; then
        exit 1
    fi
    
    echo
    print_step 4 "開始日誌查詢"
    print_info "此過程將分兩個步驟執行，每步驟之間會等待 30 秒"
    echo
    
    # First execution: 200-log analysis
    print_step "4.1" "查詢 HTTP 200 回應日誌"
    if ! execute_query \
        "HTTP 200 回應" \
        "./to-analyze-daily-data/200-log/L2" \
        "logs-${date}.csv" \
        "$formatted_date" \
        'SEARCH("got 200 in https://www.eslite.com/category/2/")'; then
        exit 1
    fi
    
    echo
    print_info "等待 30 秒後執行下一個查詢 (避免 API 限制)..."
    show_progress 30
    echo
    
    # Second execution: user-agent-log analysis
    print_step "4.2" "查詢 User-Agent 日誌"
    if ! execute_query \
        "User-Agent" \
        "./to-analyze-daily-data/user-agent-log" \
        "user-agent-${date}.csv" \
        "$formatted_date" \
        'SEARCH("X-Original-User-Agent: https://www.eslite.com/category/2")'; then
        exit 1
    fi
    
    echo
    print_success "🎉 所有日誌查詢完成！"
    echo
    print_info "下一步: 執行數據分析"
    echo "  npm run analyze-daily \"$date ~ $date\""
    echo "  或: ./daily-log-analysis-script.sh \"$date ~ $date\""
    echo
    print_info "💡 提示: 使用 workflow-guide.js 獲得完整的互動式指導"
    echo "  node workflow-guide.js"
}

# Run main function
main "$@"