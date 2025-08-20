#!/bin/bash

# Check if date argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <date>"
    echo "Example: $0 20240115"
    exit 1
fi

DATE=$1
# Convert YYYYMMDD to YYYY-MM-DD format for query
FORMATTED_DATE="${DATE:0:4}-${DATE:4:2}-${DATE:6:2}"

echo "Starting daily analysis for date: $DATE"

# First execution: 200-log analysis
echo "Running 200-log analysis..."
node google-cloud-log-query.js --output-dir ./to-analyze-daily-data/200-log/L2 --filename logs-${DATE}.csv ${FORMATTED_DATE} 'SEARCH("got 200 in https://www.eslite.com/category/2/")'

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
node google-cloud-log-query.js --output-dir ./to-analyze-daily-data/user-agent-log --filename user-agent-${DATE}.csv ${FORMATTED_DATE} 'SEARCH("X-Original-User-Agent: https://www.eslite.com/category/2")'

if [ $? -eq 0 ]; then
    echo "✓ User-agent-log analysis completed successfully"
else
    echo "✗ User-agent-log analysis failed"
    exit 1
fi

echo "Daily analysis completed for date: $DATE"