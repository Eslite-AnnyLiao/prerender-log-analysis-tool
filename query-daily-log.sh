#!/bin/bash

# Check if arguments are provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <date> <url> [folder]"
    echo "Example: $0 20240115 https://www.eslite.com/category/2/"
    echo "Example: $0 20240115 https://www.eslite.com/category/2/ L2"
    exit 1
fi

if [ $# -lt 2 ]; then
    echo "Error: Missing URL parameter"
    echo "Usage: $0 <date> <url> [folder]"
    echo "Example: $0 20240115 https://www.eslite.com/category/2/"
    echo "Example: $0 20240115 https://www.eslite.com/category/2/ L2"
    exit 1
fi

DATE=$1
URL=$2
FOLDER=$3  # Optional folder parameter

# Generate folder name from URL path
generate_folder_from_url() {
    local url=$1
    
    # Remove protocol (http:// or https://)
    local path=$(echo "$url" | sed 's|^https*://||')
    
    # Remove domain name, keep only path
    path=$(echo "$path" | sed 's|^[^/]*||')
    
    # Remove leading and trailing slashes
    path=$(echo "$path" | sed 's|^/||' | sed 's|/$||')
    
    # Replace slashes with hyphens for folder name
    path=$(echo "$path" | sed 's|/|-|g')
    
    # Special mapping for common paths
    case "$path" in
        "category-1") echo "L1" ;;
        "category-2") echo "L2" ;;
        "category-3") echo "L3" ;;
        "category-4") echo "L4" ;;
        "category-5") echo "L5" ;;
        "") echo "root" ;;
        *) echo "$path" ;;
    esac
}

# Generate filename from URL
generate_filename_from_url() {
    local url=$1
    local date=$2
    
    # Remove protocol (http:// or https://)
    local path=$(echo "$url" | sed 's|^https*://||')
    
    # Remove domain name, keep only path
    path=$(echo "$path" | sed 's|^[^/]*||')
    
    # Remove leading and trailing slashes
    path=$(echo "$path" | sed 's|^/||' | sed 's|/$||')
    
    # Replace slashes with hyphens
    path=$(echo "$path" | sed 's|/|-|g')
    
    # If path is empty, use 'root'
    if [ -z "$path" ]; then
        path="root"
    fi
    
    echo "log-${date}-${path}"
}

# Determine folder name (use provided or auto-generate)
if [ -n "$FOLDER" ]; then
    FOLDER_NAME="$FOLDER"
    echo "Using specified folder: $FOLDER_NAME"
else
    FOLDER_NAME=$(generate_folder_from_url "$URL")
    echo "Auto-generated folder: $FOLDER_NAME"
fi

# Generate filename based on URL
FILENAME_BASE=$(generate_filename_from_url "$URL" "$DATE")
# Convert YYYYMMDD to YYYY-MM-DD format for query
FORMATTED_DATE="${DATE:0:4}-${DATE:4:2}-${DATE:6:2}"

echo "Starting daily analysis for date: $DATE"
echo "Query URL: $URL"
echo "Folder: $FOLDER_NAME"
echo "Filename base: $FILENAME_BASE"

# Refresh Google Cloud credentials (every 12 hours)
GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/application_default_credentials.json"
if [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ] || [ $(find "$GOOGLE_APPLICATION_CREDENTIALS" -mmin +720 2>/dev/null | wc -l) -gt 0 ]; then
    echo "Refreshing Google Cloud credentials..."
    gcloud auth application-default login
else
    echo "Google Cloud credentials are still valid (less than 12 hours old)"
fi

# First execution: 200-log analysis
echo "Running 200-log analysis..."
# Create directory if it doesn't exist
mkdir -p "./to-analyze-daily-data/200-log/${FOLDER_NAME}"

node google-cloud-log-query.js --output-dir "./to-analyze-daily-data/200-log/${FOLDER_NAME}" --filename ${FILENAME_BASE}.csv ${FORMATTED_DATE} "SEARCH(\"\`got 200 in\` \`${URL}\` \")"

if [ $? -eq 0 ]; then
    echo "✓ 200-log analysis completed successfully"
else
    echo "✗ 200-log analysis failed"
    exit 1
fi

echo "Waiting 30 sec before next execution..."
sleep 30

# Second execution: user-agent-log analysis
echo "Running user-agent-log analysis..."
# Create directory if it doesn't exist
mkdir -p "./to-analyze-daily-data/user-agent-log/${FOLDER_NAME}"

node google-cloud-log-query.js --output-dir "./to-analyze-daily-data/user-agent-log/${FOLDER_NAME}" --filename user-agent-${FILENAME_BASE}.csv ${FORMATTED_DATE} "SEARCH(\"\`X-Original-User-Agent:\` \`${URL}\` \")"

if [ $? -eq 0 ]; then
    echo "✓ User-agent-log analysis completed successfully"
else
    echo "✗ User-agent-log analysis failed"
    exit 1
fi

echo "Waiting 30 sec before next execution..."
sleep 30

# Third execution: in-flight requests log analysis
echo "Running in-flight requests log analysis..."
# Create directory if it doesn't exist
mkdir -p "./to-analyze-daily-data/in-flight-log/${FOLDER_NAME}"

node google-cloud-log-query.js --output-dir "./to-analyze-daily-data/in-flight-log/${FOLDER_NAME}" --filename in-flight-${FILENAME_BASE}.csv ${FORMATTED_DATE} "textPayload: \"Adding request to in-flight\" AND textPayload!=\"Adding request to in-flight: 1 requests in flight\" AND textPayload!=\"Adding request to in-flight: 2 requests in flight\""

if [ $? -eq 0 ]; then
    echo "✓ In-flight requests log analysis completed successfully"
else
    echo "✗ In-flight requests log analysis failed"
    exit 1
fi

echo "Daily analysis completed for date: $DATE"