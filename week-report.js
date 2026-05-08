const fs = require('fs');
const path = require('path');

// 統計工具主類
class JsonAggregator {
    constructor() {
        this.allData = [];
        this.summary = {
            total_render_records: 0,
            total_user_agent_records: 0,
            total_files_processed: 0,
            date_range: {
                start: null,
                end: null
            },
            // 新增：分類統計
            page_type_stats: {
                category: {
                    files_count: 0,
                    render_records: 0,
                    user_agent_records: 0,
                    render_time_sum: 0,
                    timeout_count: 0
                },
                product: {
                    files_count: 0,
                    render_records: 0,
                    user_agent_records: 0,
                    render_time_sum: 0,
                    timeout_count: 0
                },
                root: {
                    files_count: 0,
                    render_records: 0,
                    user_agent_records: 0,
                    render_time_sum: 0,
                    timeout_count: 0
                },
                other: {
                    files_count: 0,
                    render_records: 0,
                    user_agent_records: 0,
                    render_time_sum: 0,
                    timeout_count: 0
                }
            },
            render_time_aggregated: {
                total_sum: 0,
                total_count: 0,
                p50_sum: 0,
                p90_sum: 0,
                p95_sum: 0,
                p99_sum: 0,
                timeout_count_total: 0,
                min_value: Infinity,
                max_value: -Infinity,
                // 新增：收集所有檔案的統計資料用於加權計算
                weighted_stats: []
            },
            user_agent_aggregated: {
                unique_user_agents: new Set(),
                browser_stats: {},
                os_stats: {},
                total_requests: 0
            },
            crawler_aggregated: {
                traditional_search_engines: {
                    googlebot: 0,
                    googlebot_mobile: 0,
                    googlebot_desktop: 0,
                    bingbot: 0,
                    amazonbot: 0,
                    other_search_engines: 0
                },
                ai_crawlers: {
                    openai_searchbot: 0,
                    claudebot: 0,
                    chatgpt_user: 0
                },
                seo_tools: {
                    blexbot: 0,
                    dotbot: 0
                },
                total_crawler_requests: 0,
                google_other_tool_bot: {
                    googleotherbot: 0
                },
                other_crawlers: {},
                unknown_crawlers: {}
            },
            url_aggregated: {
                total_unique_urls: 0,
                total_duplicate_urls: 0,
                total_url_requests: 0
            },
            // 新增：時段性能分析
            hourly_analysis: {
                '00:00-06:00': {
                    visit_count: 0,
                    render_time_sum: 0,
                    render_count: 0,
                    slow_count: 0,
                    timeout_count: 0,
                    error_count: 0,
                    files_data: []
                },
                '06:00-12:00': {
                    visit_count: 0,
                    render_time_sum: 0,
                    render_count: 0,
                    slow_count: 0,
                    timeout_count: 0,
                    error_count: 0,
                    files_data: []
                },
                '12:00-18:00': {
                    visit_count: 0,
                    render_time_sum: 0,
                    render_count: 0,
                    slow_count: 0,
                    timeout_count: 0,
                    error_count: 0,
                    files_data: []
                },
                '18:00-24:00': {
                    visit_count: 0,
                    render_time_sum: 0,
                    render_count: 0,
                    slow_count: 0,
                    timeout_count: 0,
                    error_count: 0,
                    files_data: []
                }
            },
            files_info: []
        };
    }

    // 根據時間戳判斷時段
    getTimeSlot(timestamp) {
        if (!timestamp) return null;

        let date;

        // 嘗試解析不同的時間格式
        if (typeof timestamp === 'string') {
            date = new Date(timestamp);
        } else if (typeof timestamp === 'number') {
            // 如果是數字，嘗試作為 Unix 時間戳
            date = new Date(timestamp * 1000);
        } else {
            return null;
        }

        if (isNaN(date.getTime())) {
            return null;
        }

        const hour = date.getHours();

        if (hour >= 0 && hour < 6) {
            return '00:00-06:00';
        } else if (hour >= 6 && hour < 12) {
            return '06:00-12:00';
        } else if (hour >= 12 && hour < 18) {
            return '12:00-18:00';
        } else {
            return '18:00-24:00';
        }
    }

    // 從檔案內容中提取時間資訊
    extractTimeFromData(data, filename) {
        // 優先順序：
        // 1. 資料中的時間戳欄位
        // 2. 檔案分析時間
        // 3. 檔名中的時間

        if (data.timestamp) {
            return data.timestamp;
        }

        if (data.analysis_time) {
            return data.analysis_time;
        }

        if (data.created_at) {
            return data.created_at;
        }

        if (data.date) {
            return data.date;
        }

        // 從檔名提取時間
        const dateFromFilename = this.extractDateFromFilename(filename);
        if (dateFromFilename) {
            return dateFromFilename.toISOString();
        }

        return null;
    }

    // 爬蟲分類器
    classifyCrawler(userAgent) {
        if (!userAgent) return null;

        const ua = userAgent.toLowerCase();

        // 傳統搜索引擎
        if (ua.includes('googlebot')) {
            // 檢查是否為 mobile 版本
            if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
                return { category: 'traditional_search_engines', type: 'googlebot_mobile', name: 'Googlebot Mobile' };
            } else {
                return { category: 'traditional_search_engines', type: 'googlebot_desktop', name: 'Googlebot Desktop' };
            }
        }
        if (ua.includes('bingbot')) {
            return { category: 'traditional_search_engines', type: 'bingbot', name: 'Bingbot' };
        }
        if (ua.includes('amazonbot')) {
            return { category: 'traditional_search_engines', type: 'amazonbot', name: 'Amazonbot' };
        }
        if (ua.includes('slurp') || ua.includes('yahoobot') || ua.includes('duckduckbot') ||
            ua.includes('baiduspider') || ua.includes('yandexbot') || ua.includes('sogou') ||
            ua.includes('facebookbot') || ua.includes('twitterbot') || ua.includes('linkedinbot')|| ua.includes('facebookexternalhit') || ua.includes('naver')) {
            return { category: 'traditional_search_engines', type: 'other_search_engines', name: 'Other Search Engines' };
        }

        // AI 智能爬蟲
        if (ua.includes('oai-searchbot') || ua.includes('openai searchbot')) {
            return { category: 'ai_crawlers', type: 'openai_searchbot', name: 'OpenAI-SearchBot' };
        }
        if (ua.includes('claudebot') || ua.includes('claude-bot')) {
            return { category: 'ai_crawlers', type: 'claudebot', name: 'ClaudeBot' };
        }
        if (ua.includes('chatgpt-user')) {
            return { category: 'ai_crawlers', type: 'chatgpt_user', name: 'ChatGPT-User' };
        }

        // SEO 分析工具
        if (ua.includes('blexbot')) {
            return { category: 'seo_tools', type: 'blexbot', name: 'BLEXBot' };
        }
        if (ua.includes('dotbot')) {
            return { category: 'seo_tools', type: 'dotbot', name: 'DotBot' };
        }

        // 其他已知爬蟲
        if (ua.includes('google-pagerenderer') || ua.includes('google-read-aloud') || ua.includes('chrome-lighthouse') || ua.includes('googleother')) {
            return { category: 'google_other_tool_bot', type: 'googleotherbot', name: 'GoogleOtherbot' };
        }
        if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') ||
            ua.includes('scraper') || ua.includes('crawl')) {
            // 提取爬蟲名稱
            const crawlerName = this.extractCrawlerName(userAgent);
            return { category: 'other_crawlers', type: 'other', name: crawlerName };
        }

        return { category: 'unknown_crawlers', type: 'unknown', name: userAgent };
    }

    // 提取爬蟲名稱
    extractCrawlerName(userAgent) {
        // 嘗試提取爬蟲名稱的常見模式
        const patterns = [
            /([A-Za-z0-9._-]*[Bb]ot[A-Za-z0-9._-]*)/,
            /([A-Za-z0-9._-]*[Ss]pider[A-Za-z0-9._-]*)/,
            /([A-Za-z0-9._-]*[Cc]rawl[A-Za-z0-9._-]*)/,  // 匹配包含 "crawl" 的
            /([A-Za-z0-9._-]*[Ss]crape[A-Za-z0-9._-]*)/,
        ];

        for (const pattern of patterns) {
            const match = userAgent.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return 'Unknown Bot';
    }

    // 讀取單個 JSON 檔案
    readJsonFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️  檔案不存在: ${filePath}`);
                return null;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);

            console.log(`✅ 成功讀取: ${path.basename(filePath)}`);
            return data;
        } catch (error) {
            console.error(`❌ 讀取檔案錯誤 ${filePath}:`, error.message);
            return null;
        }
    }

    // 從檔名提取日期 (假設檔名包含日期格式)
    extractDateFromFilename(filename) {
        // 嘗試匹配多種日期格式
        const datePatterns = [
            /(\d{4})(\d{2})(\d{2})/,  // YYYYMMDD
            /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
            /(\d{2})(\d{2})/,         // MMDD (假設當年)
        ];

        for (const pattern of datePatterns) {
            const match = filename.match(pattern);
            if (match) {
                if (match.length === 4) {
                    // YYYYMMDD or YYYY-MM-DD
                    return new Date(`${match[1]}-${match[2]}-${match[3]}`);
                } else if (match.length === 3) {
                    // MMDD
                    const currentYear = new Date().getFullYear();
                    return new Date(`${currentYear}-${match[1]}-${match[2]}`);
                }
            }
        }
        return null;
    }

    // 處理時段性能分析
    processHourlyAnalysis(data, filename) {
        // 新格式：處理 hourly_request_data
        if (data.hourly_request_data) {
            this.processHourlyRequestData(data.hourly_request_data, filename);
        }

        // 新格式：處理 slow_render_periods
        if (data.slow_render_periods) {
            this.processSlowRenderPeriods(data.slow_render_periods, filename);
        }

        // 兼容舊格式的處理方式
        const timestamp = this.extractTimeFromData(data, filename);
        const timeSlot = this.getTimeSlot(timestamp);

        if (timeSlot) {
            const hourlyData = this.summary.hourly_analysis[timeSlot];

            // 統計訪問量 (User-Agent 請求數) - 舊格式兼容
            if (data.user_agent_analysis && data.user_agent_analysis.overall_stats) {
                const visitCount = data.user_agent_analysis.overall_stats.total_requests || 0;
                hourlyData.visit_count += visitCount;
            }

            // 統計 Render 時間 - 舊格式兼容
            if (data.render_time_stats) {
                const renderStats = data.render_time_stats;
                const recordCount = renderStats.total_records || 0;

                if (recordCount > 0 && renderStats.average_ms) {
                    hourlyData.render_time_sum += renderStats.average_ms * recordCount;
                    hourlyData.render_count += recordCount;
                }

                // 統計異常次數 (超時)
                if (renderStats.count_above_45000ms) {
                    hourlyData.timeout_count += renderStats.count_above_45000ms;
                }

                // 統計錯誤次數 (如果有 error 相關統計)
                if (renderStats.error_count) {
                    hourlyData.error_count += renderStats.error_count;
                }
            }

            // 記錄檔案資料供詳細分析
            hourlyData.files_data.push({
                filename: filename,
                timestamp: timestamp,
                visit_count: data.user_agent_analysis?.overall_stats?.total_requests || 0,
                render_records: data.render_time_stats?.total_records || 0,
                average_render_time: data.render_time_stats?.average_ms || 0,
                timeout_count: data.render_time_stats?.count_above_45000ms || 0
            });
        }
    }

    // 處理 hourly_request_data
    processHourlyRequestData(hourlyRequestData, filename) {
        for (const [timeStr, count] of Object.entries(hourlyRequestData)) {
            const timeSlot = this.getTimeSlotFromHourlyString(timeStr);
            if (timeSlot) {
                const hourlyData = this.summary.hourly_analysis[timeSlot];
                hourlyData.visit_count += count;


                // 記錄檔案資料
                const existingFile = hourlyData.files_data.find(f => f.filename === filename);
                if (existingFile) {
                    existingFile.visit_count += count;
                } else {
                    hourlyData.files_data.push({
                        filename: filename,
                        timestamp: timeStr,
                        visit_count: count,
                        render_records: 0,
                        average_render_time: 0,
                        timeout_count: 0
                    });
                }
            }
        }
    }

    // 處理 slow_render_periods
    processSlowRenderPeriods(slowRenderPeriods, filename) {
        for (const period of slowRenderPeriods) {
            const timeSlot = this.getTimeSlotFromTimestamp(period.timestamp_taiwan);
            if (timeSlot) {
                const hourlyData = this.summary.hourly_analysis[timeSlot];

                // 統計慢渲染次數作為異常
                if (period.render_time_ms > 8000 && period.render_time_ms <= 20000) {
                    hourlyData.slow_count += 1;           // 慢渲染 (8-20秒)
                } else if (period.render_time_ms > 20000 && period.render_time_ms <= 45000) {
                    hourlyData.error_count += 1;          // 異常渲染 (20-45秒)
                } else if (period.render_time_ms > 45000) {
                    hourlyData.timeout_count += 1;        // 超時 (>45秒)
                }

                // 統計渲染時間
                hourlyData.render_time_sum += period.render_time_ms;
                hourlyData.render_count += 1;
            }
        }
    }

    // 從小時字串獲取時段 (格式: "2025-07-28 HH:MM")
    getTimeSlotFromHourlyString(timeStr) {
        try {
            const date = new Date(timeStr);
            if (isNaN(date.getTime())) return null;

            const hour = date.getHours();
            return this.getTimeSlotFromHour(hour);
        } catch (error) {
            return null;
        }
    }

    // 從時間戳獲取時段 (格式: "2025-07-28 HH:MM:SS.SSS")
    getTimeSlotFromTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return null;

            const hour = date.getHours();
            return this.getTimeSlotFromHour(hour);
        } catch (error) {
            return null;
        }
    }

    // 根據小時數獲取時段
    getTimeSlotFromHour(hour) {
        if (hour >= 0 && hour < 6) {
            return '00:00-06:00';
        } else if (hour >= 6 && hour < 12) {
            return '06:00-12:00';
        } else if (hour >= 12 && hour < 18) {
            return '12:00-18:00';
        } else {
            return '18:00-24:00';
        }
    }

    // 從檔名判斷頁面類型
    getPageTypeFromFilename(filename) {
        const lowerFilename = filename.toLowerCase();
        
        if (lowerFilename.includes('category') || lowerFilename.includes('category-1') || lowerFilename.includes('category-2')) {
            return 'category';
        } else if (lowerFilename.includes('product') || lowerFilename.includes('product-1') || lowerFilename.includes('product-2')) {
            return 'product';
        } else if (lowerFilename.includes('root') || lowerFilename.includes('全站') || lowerFilename.includes('sitewide')) {
            return 'root';
        } else {
            return 'other';
        }
    }

    // 處理單個 JSON 資料
    processJsonData(data, filename) {
        if (!data) return;

        this.allData.push({ filename, data });
        this.summary.total_files_processed++;

        // 判斷頁面類型
        const pageType = this.getPageTypeFromFilename(filename);
        const pageStats = this.summary.page_type_stats[pageType];
        pageStats.files_count++;

        // 記錄檔案資訊 (新增頁面類型)
        this.summary.files_info.push({
            filename: filename,
            page_type: pageType,
            analysis_time: data.analysis_time || 'Unknown',
            analysis_mode: data.analysis_mode || data.frequency_analysis_info || 'Unknown'
        });

        // 處理時段性能分析
        this.processHourlyAnalysis(data, filename);

        // 更新日期範圍
        const fileDate = this.extractDateFromFilename(filename);
        if (fileDate) {
            if (!this.summary.date_range.start || fileDate < this.summary.date_range.start) {
                this.summary.date_range.start = fileDate;
            }
            if (!this.summary.date_range.end || fileDate > this.summary.date_range.end) {
                this.summary.date_range.end = fileDate;
            }
        }

        // 彙總 Render Time 統計
        if (data.render_time_stats) {
            const renderStats = data.render_time_stats;
            const recordCount = renderStats.total_records || 0;

            this.summary.total_render_records += recordCount;
            pageStats.render_records += recordCount;

            // 統計頁面類型的渲染時間
            if (renderStats.average_ms && recordCount > 0) {
                pageStats.render_time_sum += renderStats.average_ms * recordCount;
            }

            // 統計頁面類型的超時數
            if (renderStats.count_above_45000ms) {
                pageStats.timeout_count += renderStats.count_above_45000ms;
            }

            // 收集詳細統計資料用於加權計算
            if (recordCount > 0) {
                this.summary.render_time_aggregated.weighted_stats.push({
                    filename: filename,
                    count: recordCount,
                    average: renderStats.average_ms || 0,
                    median: renderStats.median_p50_ms || 0,
                    p90: renderStats.p90_ms || 0,
                    p95: renderStats.p95_ms || 0,
                    p99: renderStats.p99_ms || 0,
                    min: renderStats.min_ms || 0,
                    max: renderStats.max_ms || 0
                });

                // 加權總和計算
                if (renderStats.average_ms) {
                    this.summary.render_time_aggregated.total_sum += renderStats.average_ms * recordCount;
                    this.summary.render_time_aggregated.total_count += recordCount;
                }

                // 收集各百分位數 (用記錄數量加權)
                if (renderStats.median_p50_ms) {
                    this.summary.render_time_aggregated.p50_sum += renderStats.median_p50_ms * recordCount;
                }
                if (renderStats.p90_ms) {
                    this.summary.render_time_aggregated.p90_sum += renderStats.p90_ms * recordCount;
                }
                if (renderStats.p95_ms) {
                    this.summary.render_time_aggregated.p95_sum += renderStats.p95_ms * recordCount;
                }
                if (renderStats.p99_ms) {
                    this.summary.render_time_aggregated.p99_sum += renderStats.p99_ms * recordCount;
                }
            }

            if (renderStats.count_above_45000ms) {
                this.summary.render_time_aggregated.timeout_count_total += renderStats.count_above_45000ms;
            }

            // 更新最小最大值
            if (renderStats.min_ms !== undefined && renderStats.min_ms < this.summary.render_time_aggregated.min_value) {
                this.summary.render_time_aggregated.min_value = renderStats.min_ms;
            }
            if (renderStats.max_ms !== undefined && renderStats.max_ms > this.summary.render_time_aggregated.max_value) {
                this.summary.render_time_aggregated.max_value = renderStats.max_ms;
            }
        }

        // 彙總 User-Agent 統計
        if (data.user_agent_analysis) {
            const userAgentStats = data.user_agent_analysis;

            if (userAgentStats.overall_stats) {
                const userAgentRequests = userAgentStats.overall_stats.total_requests || 0;
                this.summary.total_user_agent_records += userAgentRequests;
                this.summary.user_agent_aggregated.total_requests += userAgentRequests;
                pageStats.user_agent_records += userAgentRequests;
            }

            // 收集獨特的 User-Agent 並分析爬蟲
            if (userAgentStats.user_agent_ranking) {
                userAgentStats.user_agent_ranking.forEach(item => {
                    this.summary.user_agent_aggregated.unique_user_agents.add(item.userAgent);

                    // 分析爬蟲
                    const crawlerInfo = this.classifyCrawler(item.userAgent);

                    if (crawlerInfo) {
                        const count = item.count || 0;
                        this.summary.crawler_aggregated.total_crawler_requests += count;
                        if (crawlerInfo.category === 'other_crawlers') {
                            if (!this.summary.crawler_aggregated.other_crawlers[crawlerInfo.name]) {
                                this.summary.crawler_aggregated.other_crawlers[crawlerInfo.name] = 0;
                            }
                            this.summary.crawler_aggregated.other_crawlers[crawlerInfo.name] += count;
                        } else if (crawlerInfo.category === 'unknown_crawlers') {
                            if (!this.summary.crawler_aggregated.unknown_crawlers[crawlerInfo.name]) {
                                this.summary.crawler_aggregated.unknown_crawlers[crawlerInfo.name] = 0;
                            }
                            this.summary.crawler_aggregated.unknown_crawlers[crawlerInfo.name] += count;
                        } else {
                            this.summary.crawler_aggregated[crawlerInfo.category][crawlerInfo.type] += count;
                        }
                    }
                });
            }
        }

        // 彙總 URL 統計
        if (data.url_analysis && data.url_analysis.overall_stats) {
            const urlStats = data.url_analysis.overall_stats;
            this.summary.url_aggregated.total_unique_urls += urlStats.unique_urls || 0;
            this.summary.url_aggregated.total_duplicate_urls += urlStats.duplicate_urls || 0;
            this.summary.url_aggregated.total_url_requests += urlStats.total_requests || 0;
        }
    }

    // 計算時段統計
    calculateHourlyStats() {
        const timeSlots = ['00:00-06:00', '06:00-12:00', '12:00-18:00', '18:00-24:00'];
        const hourlyStats = {};

        timeSlots.forEach(slot => {
            const slotData = this.summary.hourly_analysis[slot];

            hourlyStats[slot] = {
                // 平均訪問量
                total_visits: slotData.visit_count,
                average_visits_per_file: slotData.files_data.length > 0
                    ? Math.round((slotData.visit_count / slotData.files_data.length) * 100) / 100
                    : 0,

                // 平均Render時間
                average_render_time_ms: slotData.render_count > 0
                    ? Math.round((slotData.render_time_sum / slotData.render_count / 6) * 100) / 100
                    : 0,

                // 異常次數
                slow_count: slotData.slow_count,
                timeout_count: slotData.timeout_count,
                error_count: slotData.error_count,
                total_anomalies: slotData.timeout_count + slotData.error_count,

                // 異常率
                anomaly_rate: slotData.render_count > 0
                    ? Math.round(((slotData.timeout_count + slotData.error_count) / slotData.render_count) * 10000) / 100
                    : 0,

                // 檔案數量
                files_count: slotData.files_data.length,

                // 總 Render 記錄數
                total_render_records: slotData.render_count,

                // 詳細檔案資料
                files_detail: slotData.files_data.sort((a, b) => b.visit_count - a.visit_count)
            };
        });

        return hourlyStats;
    }

    // 找到最繁忙的時段
    getMostBusyTimeSlot(hourlyStats) {
        let maxVisits = 0;
        let busySlot = '';

        for (const [slot, data] of Object.entries(hourlyStats)) {
            if (data.total_visits > maxVisits) {
                maxVisits = data.total_visits;
                busySlot = slot;
            }
        }

        return busySlot ? `${busySlot} (${maxVisits.toLocaleString()} 次訪問)` : '無資料';
    }

    // 找到最慢的時段
    getSlowestTimeSlot(hourlyStats) {
        let maxTime = 0;
        let slowSlot = '';

        for (const [slot, data] of Object.entries(hourlyStats)) {
            if (data.average_render_time_ms > maxTime) {
                maxTime = data.average_render_time_ms;
                slowSlot = slot;
            }
        }

        return slowSlot ? `${slowSlot} (平均 ${maxTime} ms)` : '無資料';
    }

    // 找到最異常的時段
    getMostAnomalyTimeSlot(hourlyStats) {
        let maxAnomalies = 0;
        let anomalySlot = '';

        for (const [slot, data] of Object.entries(hourlyStats)) {
            if (data.total_anomalies > maxAnomalies) {
                maxAnomalies = data.total_anomalies;
                anomalySlot = slot;
            }
        }

        return anomalySlot ? `${anomalySlot} (${maxAnomalies} 次異常, ${hourlyStats[anomalySlot].anomaly_rate}%)` : '無資料';
    }

    // 掃描目錄中的 JSON 檔案
    scanDirectory(dirPath) {
        try {
            const files = fs.readdirSync(dirPath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            console.log(`📁 在目錄 ${dirPath} 中找到 ${jsonFiles.length} 個 JSON 檔案`);

            return jsonFiles.map(file => path.join(dirPath, file));
        } catch (error) {
            console.error(`❌ 讀取目錄錯誤 ${dirPath}:`, error.message);
            return [];
        }
    }

    // 處理多個檔案
    async processFiles(filePaths) {
        console.log(`🔄 開始處理 ${filePaths.length} 個檔案...`);

        for (const filePath of filePaths) {
            const data = this.readJsonFile(filePath);
            this.processJsonData(data, path.basename(filePath));
        }

        console.log(`✅ 檔案處理完成！`);
    }

    // 計算頁面類型統計
    calculatePageTypeStats() {
        const pageTypeStats = {};
        
        // 確保所有頁面類型都被處理，包括 root
        ['category', 'product', 'root', 'other'].forEach(pageType => {
            const stats = this.summary.page_type_stats[pageType];
            
            pageTypeStats[pageType] = {
                files_count: stats.files_count,
                render_records: stats.render_records,
                user_agent_records: stats.user_agent_records,
                average_render_time_ms: stats.render_records > 0 
                    ? Math.round((stats.render_time_sum / stats.render_records) * 100) / 100 
                    : 0,
                timeout_count: stats.timeout_count,
                timeout_rate: stats.render_records > 0 
                    ? Math.round((stats.timeout_count / stats.render_records) * 10000) / 100 
                    : 0,
                percentage_of_total_files: this.summary.total_files_processed > 0 
                    ? Math.round((stats.files_count / this.summary.total_files_processed) * 10000) / 100 
                    : 0,
                percentage_of_total_renders: this.summary.total_render_records > 0 
                    ? Math.round((stats.render_records / this.summary.total_render_records) * 10000) / 100 
                    : 0,
                percentage_of_total_requests: this.summary.total_user_agent_records > 0 
                    ? Math.round((stats.user_agent_records / this.summary.total_user_agent_records) * 10000) / 100 
                    : 0
            };
        });
        
        return pageTypeStats;
    }

    // 計算最終統計結果
    calculateFinalStats() {
        // 計算爬蟲統計
        const crawlerStats = this.calculateCrawlerStats();

        // 計算 Prerender 性能分析
        const prerenderStats = this.calculatePrerenderStats();

        // 計算時段統計
        const hourlyStats = this.calculateHourlyStats();

        // 計算頁面類型統計
        const pageTypeStats = this.calculatePageTypeStats();

        const finalStats = {
            // 整體概覽指標
            overview: {
                total_render_records: this.summary.total_render_records,
                total_user_agent_records: this.summary.total_user_agent_records,
                average_render_time_ms: this.summary.render_time_aggregated.total_count > 0
                    ? Math.round((this.summary.render_time_aggregated.total_sum / this.summary.render_time_aggregated.total_count) * 100) / 100
                    : 0,
                average_p95_render_time_ms: this.summary.render_time_aggregated.total_count > 0
                    ? Math.round((this.summary.render_time_aggregated.p95_sum / this.summary.render_time_aggregated.total_count) * 100) / 100
                    : 0,
                average_p99_render_time_ms: this.summary.render_time_aggregated.total_count > 0
                    ? Math.round((this.summary.render_time_aggregated.p99_sum / this.summary.render_time_aggregated.total_count) * 100) / 100
                    : 0,
                average_slow_render_rate: (() => {
                    const totalSlow = Object.values(this.summary.hourly_analysis).reduce((sum, slot) => sum + slot.slow_count, 0);
                    return this.summary.total_render_records > 0
                        ? Math.round((totalSlow / this.summary.total_render_records) * 10000) / 100
                        : 0;
                })(),
                average_abnormal_render_rate: (() => {
                    const totalAbnormal = Object.values(this.summary.hourly_analysis).reduce((sum, slot) => sum + slot.error_count, 0);
                    return this.summary.total_render_records > 0
                        ? Math.round((totalAbnormal / this.summary.total_render_records) * 10000) / 100
                        : 0;
                })()
            },

            // 頁面類型分析
            page_type_analysis: pageTypeStats,

            // Prerender 性能分析
            prerender_performance: prerenderStats,

            // SEO 爬蟲統計
            seo_crawler_stats: crawlerStats,

            // 時段性能分析
            hourly_performance_analysis: hourlyStats,

            // 詳細統計
            detailed_stats: {
                render_time_stats: {
                    min_render_time_ms: this.summary.render_time_aggregated.min_value === Infinity ? 0 : this.summary.render_time_aggregated.min_value,
                    max_render_time_ms: this.summary.render_time_aggregated.max_value === -Infinity ? 0 : this.summary.render_time_aggregated.max_value,
                    total_timeout_rate: this.summary.total_render_records > 0
                        ? Math.round((this.summary.render_time_aggregated.timeout_count_total / this.summary.total_render_records) * 10000) / 100
                        : 0
                },

                user_agent_stats: {
                    unique_user_agents_count: this.summary.user_agent_aggregated.unique_user_agents.size,
                },

                url_stats: {
                    total_unique_urls: this.summary.url_aggregated.total_unique_urls,
                    total_duplicate_urls: this.summary.url_aggregated.total_duplicate_urls,
                    total_url_requests: this.summary.url_aggregated.total_url_requests,
                    duplicate_rate: this.summary.url_aggregated.total_unique_urls > 0
                        ? Math.round((this.summary.url_aggregated.total_duplicate_urls / this.summary.url_aggregated.total_unique_urls) * 10000) / 100
                        : 0
                }
            },

            // 元數據
            metadata: {
                analysis_period: {
                    start_date: this.summary.date_range.start ? this.summary.date_range.start.toISOString().split('T')[0] : 'Unknown',
                    end_date: this.summary.date_range.end ? this.summary.date_range.end.toISOString().split('T')[0] : 'Unknown',
                    duration_days: this.summary.date_range.start && this.summary.date_range.end
                        ? Math.ceil((this.summary.date_range.end - this.summary.date_range.start) / (24 * 60 * 60 * 1000)) + 1
                        : 0
                },
                files_processed: this.summary.total_files_processed,
                files_info: this.summary.files_info,
                aggregation_time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
            }
        };

        return finalStats;
    }

    // 計算 Prerender 性能統計
    calculatePrerenderStats() {
        const totalCount = this.summary.render_time_aggregated.total_count;

        if (totalCount === 0) {
            return {
                average_time_ms: 0,
                median_p50_ms: 0,
                p90_ms: 0,
                p95_ms: 0,
                p99_ms: 0,
                max_time_ms: 0,
                min_time_ms: 0,
                total_requests: 0,
                performance_summary: {
                    excellent: { threshold: "< 1000ms", count: 0, percentage: 0 },
                    good: { threshold: "1000-2500ms", count: 0, percentage: 0 },
                    acceptable: { threshold: "2500-5000ms", count: 0, percentage: 0 },
                    slow_approaching: { threshold: "5000-8000ms", count: 0, percentage: 0 },
                    slow: { threshold: "8000-20000ms", count: 0, percentage: 0 },
                    abnormal: { threshold: "> 20000ms", count: 0, percentage: 0 }
                },
                detailed_breakdown: []
            };
        }

        // 使用加權平均計算各項指標
        const averageTime = Math.round((this.summary.render_time_aggregated.total_sum / totalCount) * 100) / 100;
        const medianP50 = Math.round((this.summary.render_time_aggregated.p50_sum / totalCount) * 100) / 100;
        const p90 = Math.round((this.summary.render_time_aggregated.p90_sum / totalCount) * 100) / 100;
        const p95 = Math.round((this.summary.render_time_aggregated.p95_sum / totalCount) * 100) / 100;
        const p99 = Math.round((this.summary.render_time_aggregated.p99_sum / totalCount) * 100) / 100;
        const maxTime = this.summary.render_time_aggregated.max_value === -Infinity ? 0 : this.summary.render_time_aggregated.max_value;
        const minTime = this.summary.render_time_aggregated.min_value === Infinity ? 0 : this.summary.render_time_aggregated.min_value;

        // 根據 P95 時間評估性能等級
        let performanceGrade = 'Unknown';
        let performanceColor = '⚪';
        if (p95 < 1000) {
            performanceGrade = 'Excellent';
            performanceColor = '🟢';
        } else if (p95 < 2500) {
            performanceGrade = 'Good';
            performanceColor = '🟡';
        } else if (p95 < 5000) {
            performanceGrade = 'Acceptable';
            performanceColor = '🟠';
        } else if (p95 < 8000) {
            performanceGrade = 'Slow Approaching';
            performanceColor = '🟧';
        } else if (p95 < 20000) {
            performanceGrade = 'Slow';
            performanceColor = '🔴';
        } else {
            performanceGrade = 'Abnormal';
            performanceColor = '⛔';
        }

        // 計算各檔案的詳細分解
        const detailedBreakdown = this.summary.render_time_aggregated.weighted_stats.map(stat => ({
            filename: stat.filename,
            requests: stat.count,
            average_ms: stat.average,
            median_p50_ms: stat.median,
            p90_ms: stat.p90,
            p95_ms: stat.p95,
            p99_ms: stat.p99,
            max_ms: stat.max,
            performance_grade: stat.p95 < 1000 ? 'Excellent' :
                stat.p95 < 2500 ? 'Good' :
                stat.p95 < 5000 ? 'Acceptable' :
                stat.p95 < 8000 ? 'Slow Approaching' :
                stat.p95 < 20000 ? 'Slow' : 'Abnormal'
        }));

        return {
            average_time_ms: averageTime,
            median_p50_ms: medianP50,
            p90_ms: p90,
            p95_ms: p95,
            p99_ms: p99,
            max_time_ms: maxTime,
            min_time_ms: minTime,
            total_requests: this.summary.total_render_records,
            timeout_requests: this.summary.render_time_aggregated.timeout_count_total,
            timeout_rate: Math.round((this.summary.render_time_aggregated.timeout_count_total / this.summary.total_render_records) * 10000) / 100,
            performance_grade: {
                grade: performanceGrade,
                color: performanceColor,
                description: `Based on P95: ${p95}ms`
            },
            performance_summary: {
                excellent: { threshold: "< 1000ms", description: "Excellent performance" },
                good: { threshold: "1000-2500ms", description: "Good performance" },
                acceptable: { threshold: "2500-5000ms", description: "Acceptable performance" },
                slow_approaching: { threshold: "5000-8000ms", description: "Approaching slow rendering threshold" },
                slow: { threshold: "8000-20000ms", description: "Slow rendering, needs optimization" },
                abnormal: { threshold: "> 20000ms", description: "Abnormal rendering, urgent attention required" }
            },
            detailed_breakdown: detailedBreakdown.sort((a, b) => b.requests - a.requests)
        };
    }

    // 計算爬蟲統計
    calculateCrawlerStats() {
        const totalRequests = this.summary.user_agent_aggregated.total_requests;
        const crawlerData = this.summary.crawler_aggregated;

        // 計算百分比的輔助函數
        const calculatePercentage = (count) => {
            return totalRequests > 0 ? Math.round((count / totalRequests) * 10000) / 100 : 0;
        };

        // 傳統搜索引擎統計
        const traditionalSearchEngines = {
            googlebot: {
                visits: crawlerData.traditional_search_engines.googlebot_mobile + crawlerData.traditional_search_engines.googlebot_desktop,
                percentage: calculatePercentage(crawlerData.traditional_search_engines.googlebot_mobile + crawlerData.traditional_search_engines.googlebot_desktop)
            },
            googlebot_mobile: {
                visits: crawlerData.traditional_search_engines.googlebot_mobile,
                percentage: calculatePercentage(crawlerData.traditional_search_engines.googlebot_mobile)
            },
            googlebot_desktop: {
                visits: crawlerData.traditional_search_engines.googlebot_desktop,
                percentage: calculatePercentage(crawlerData.traditional_search_engines.googlebot_desktop)
            },
            bingbot: {
                visits: crawlerData.traditional_search_engines.bingbot,
                percentage: calculatePercentage(crawlerData.traditional_search_engines.bingbot)
            },
            amazonbot: {
                visits: crawlerData.traditional_search_engines.amazonbot,
                percentage: calculatePercentage(crawlerData.traditional_search_engines.amazonbot)
            },
            other_search_engines: {
                visits: crawlerData.traditional_search_engines.other_search_engines,
                percentage: calculatePercentage(crawlerData.traditional_search_engines.other_search_engines)
            }
        };

        const traditionalTotal = Object.values(crawlerData.traditional_search_engines).reduce((sum, count) => sum + count, 0);

        // AI 智能爬蟲統計
        const aiCrawlers = {
            openai_searchbot: {
                visits: crawlerData.ai_crawlers.openai_searchbot,
                percentage: calculatePercentage(crawlerData.ai_crawlers.openai_searchbot)
            },
            claudebot: {
                visits: crawlerData.ai_crawlers.claudebot,
                percentage: calculatePercentage(crawlerData.ai_crawlers.claudebot)
            },
            chatgpt_user: {
                visits: crawlerData.ai_crawlers.chatgpt_user,
                percentage: calculatePercentage(crawlerData.ai_crawlers.chatgpt_user)
            }
        };

        const aiTotal = Object.values(crawlerData.ai_crawlers).reduce((sum, count) => sum + count, 0);

        // SEO 分析工具統計
        const seoTools = {
            blexbot: {
                visits: crawlerData.seo_tools.blexbot,
                percentage: calculatePercentage(crawlerData.seo_tools.blexbot)
            },
            dotbot: {
                visits: crawlerData.seo_tools.dotbot,
                percentage: calculatePercentage(crawlerData.seo_tools.dotbot)
            }
        };

        const seoTotal = Object.values(crawlerData.seo_tools).reduce((sum, count) => sum + count, 0);
        const googleOtherBotTotal = Object.values(crawlerData.google_other_tool_bot).reduce((sum, count) => sum + count, 0);

        // 其他爬蟲統計 (前10名)
        const otherCrawlers = Object.entries(crawlerData.other_crawlers)
            .map(([name, count]) => ({
                name,
                visits: count,
                percentage: calculatePercentage(count)
            }))
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 10);

        const otherTotal = Object.values(crawlerData.other_crawlers).reduce((sum, count) => sum + count, 0);
        const unknownTotal = Object.values(crawlerData.unknown_crawlers).reduce((sum, count) => sum + count, 0);

        // 總爬蟲統計
        const totalCrawlerRequests = traditionalTotal + aiTotal + seoTotal + googleOtherBotTotal + otherTotal + unknownTotal;
        return {
            traditional_search_engines: {
                ...traditionalSearchEngines,
                total: {
                    visits: traditionalTotal,
                    percentage: calculatePercentage(traditionalTotal)
                }
            },
            ai_crawlers: {
                ...aiCrawlers,
                total: {
                    visits: aiTotal,
                    percentage: calculatePercentage(aiTotal)
                }
            },
            seo_tools: {
                ...seoTools,
                total: {
                    visits: seoTotal,
                    percentage: calculatePercentage(seoTotal)
                }
            },
            other_crawlers: {
                top_10: otherCrawlers,
                total: {
                    visits: otherTotal,
                    percentage: calculatePercentage(otherTotal)
                }
            },
            overall_crawler_stats: {
                total_crawler_visits: totalCrawlerRequests,
                total_user_requests: totalRequests,
            }
        };
    }

    // 生成文字報告
    generateTextReport(stats) {
        const crawlerStats = stats.seo_crawler_stats;
        const prerenderStats = stats.prerender_performance;
        const hourlyStats = stats.hourly_performance_analysis;
        const pageTypeStats = stats.page_type_analysis;

        return `
多檔案統計分析報告
========================================
生成時間: ${stats.metadata.aggregation_time}
分析期間: ${stats.metadata.analysis_period.start_date} ~ ${stats.metadata.analysis_period.end_date} (${stats.metadata.analysis_period.duration_days} 天)
處理檔案數: ${stats.metadata.files_processed} 個

🎯 整體概覽指標
========================================
1. 總 Render 數據:           ${stats.overview.total_render_records.toLocaleString()} 筆
2. 總 User-Agent 數據:       ${stats.overview.total_user_agent_records.toLocaleString()} 筆
3. 平均 Render 時間:         ${stats.overview.average_render_time_ms} ms
4. 平均 P95 Render 時間:     ${stats.overview.average_p95_render_time_ms} ms
5. 平均 P99 Render 時間:     ${stats.overview.average_p99_render_time_ms} ms
6. 平均慢渲染率 (8-20s):     ${stats.overview.average_slow_render_rate}%
7. 平均異常渲染率 (>20s):    ${stats.overview.average_abnormal_render_rate}%

📄 頁面類型分析
========================================
📊 Category 頁面:
• 檔案數:                   ${pageTypeStats.category.files_count} 個 (${pageTypeStats.category.percentage_of_total_files}%)
• Render 記錄:              ${pageTypeStats.category.render_records.toLocaleString()} 筆 (${pageTypeStats.category.percentage_of_total_renders}%)
• User-Agent 記錄:          ${pageTypeStats.category.user_agent_records.toLocaleString()} 筆 (${pageTypeStats.category.percentage_of_total_requests}%)
• 平均 Render 時間:         ${pageTypeStats.category.average_render_time_ms} ms
• 超時數:                   ${pageTypeStats.category.timeout_count.toLocaleString()} 筆
• 超時率:                   ${pageTypeStats.category.timeout_rate}%

🛍️ Product 頁面:
• 檔案數:                   ${pageTypeStats.product.files_count} 個 (${pageTypeStats.product.percentage_of_total_files}%)
• Render 記錄:              ${pageTypeStats.product.render_records.toLocaleString()} 筆 (${pageTypeStats.product.percentage_of_total_renders}%)
• User-Agent 記錄:          ${pageTypeStats.product.user_agent_records.toLocaleString()} 筆 (${pageTypeStats.product.percentage_of_total_requests}%)
• 平均 Render 時間:         ${pageTypeStats.product.average_render_time_ms} ms
• 超時數:                   ${pageTypeStats.product.timeout_count.toLocaleString()} 筆
• 超時率:                   ${pageTypeStats.product.timeout_rate}%

🌐 Root 頁面 (全站):
• 檔案數:                   ${pageTypeStats.root.files_count} 個 (${pageTypeStats.root.percentage_of_total_files}%)
• Render 記錄:              ${pageTypeStats.root.render_records.toLocaleString()} 筆 (${pageTypeStats.root.percentage_of_total_renders}%)
• User-Agent 記錄:          ${pageTypeStats.root.user_agent_records.toLocaleString()} 筆 (${pageTypeStats.root.percentage_of_total_requests}%)
• 平均 Render 時間:         ${pageTypeStats.root.average_render_time_ms} ms
• 超時數:                   ${pageTypeStats.root.timeout_count.toLocaleString()} 筆
• 超時率:                   ${pageTypeStats.root.timeout_rate}%

🔍 Other 頁面:
• 檔案數:                   ${pageTypeStats.other.files_count} 個 (${pageTypeStats.other.percentage_of_total_files}%)
• Render 記錄:              ${pageTypeStats.other.render_records.toLocaleString()} 筆 (${pageTypeStats.other.percentage_of_total_renders}%)
• User-Agent 記錄:          ${pageTypeStats.other.user_agent_records.toLocaleString()} 筆 (${pageTypeStats.other.percentage_of_total_requests}%)
• 平均 Render 時間:         ${pageTypeStats.other.average_render_time_ms} ms
• 超時數:                   ${pageTypeStats.other.timeout_count.toLocaleString()} 筆
• 超時率:                   ${pageTypeStats.other.timeout_rate}%

⚡ Prerender 性能分析
========================================
${prerenderStats.performance_grade.color} 整體性能評級: ${prerenderStats.performance_grade.grade}
   ${prerenderStats.performance_grade.description}

核心性能指標:
• 平均時間:                 ${prerenderStats.average_time_ms} ms
• 平均 P50:               ${prerenderStats.median_p50_ms} ms
• 平均 P90:        ${prerenderStats.p90_ms} ms
• 平均 P95:        ${prerenderStats.p95_ms} ms
• 平均 P99:        ${prerenderStats.p99_ms} ms
• 最大時間:                 ${prerenderStats.max_time_ms} ms
• 最小時間:                 ${prerenderStats.min_time_ms} ms

性能分布參考:
🟢 優秀 (< 1000ms):         ${prerenderStats.performance_summary.excellent.description}
🟡 良好 (1000-2500ms):      ${prerenderStats.performance_summary.good.description}
🟠 可接受 (2500-5000ms):    ${prerenderStats.performance_summary.acceptable.description}
🟧 偏慢 (5000-8000ms):      ${prerenderStats.performance_summary.slow_approaching.description}
🔴 慢渲染 (8000-20000ms):   ${prerenderStats.performance_summary.slow.description}
⛔ 異常渲染 (> 20000ms):    ${prerenderStats.performance_summary.abnormal.description}

超時統計:
• 超時請求數 (>10s):        ${prerenderStats.timeout_requests.toLocaleString()} 筆
• 超時率:                   ${prerenderStats.timeout_rate}%

🕐 時段性能分析
========================================
                   訪問量    平均每小時Render時間    慢渲染 (8-20秒)    異常渲染 (20-45秒)    超時 (>45秒)    檔案數
00:00-06:00        ${hourlyStats['00:00-06:00'].total_visits.toLocaleString().padStart(4)}    ${hourlyStats['00:00-06:00'].average_render_time_ms.toString().padStart(14)} ms    ${hourlyStats['00:00-06:00'].slow_count.toString().padStart(13)}      ${hourlyStats['00:00-06:00'].error_count.toString().padStart(14)}      ${hourlyStats['00:00-06:00'].timeout_count.toString().padStart(10)}      ${hourlyStats['00:00-06:00'].files_count.toString().padStart(3)}
06:00-12:00        ${hourlyStats['06:00-12:00'].total_visits.toLocaleString().padStart(4)}    ${hourlyStats['06:00-12:00'].average_render_time_ms.toString().padStart(14)} ms    ${hourlyStats['06:00-12:00'].slow_count.toString().padStart(13)}      ${hourlyStats['06:00-12:00'].error_count.toString().padStart(14)}      ${hourlyStats['06:00-12:00'].timeout_count.toString().padStart(10)}      ${hourlyStats['06:00-12:00'].files_count.toString().padStart(3)}
12:00-18:00        ${hourlyStats['12:00-18:00'].total_visits.toLocaleString().padStart(4)}    ${hourlyStats['12:00-18:00'].average_render_time_ms.toString().padStart(14)} ms    ${hourlyStats['12:00-18:00'].slow_count.toString().padStart(13)}      ${hourlyStats['12:00-18:00'].error_count.toString().padStart(14)}      ${hourlyStats['12:00-18:00'].timeout_count.toString().padStart(10)}      ${hourlyStats['12:00-18:00'].files_count.toString().padStart(3)}
18:00-24:00        ${hourlyStats['18:00-24:00'].total_visits.toLocaleString().padStart(4)}    ${hourlyStats['18:00-24:00'].average_render_time_ms.toString().padStart(14)} ms    ${hourlyStats['18:00-24:00'].slow_count.toString().padStart(13)}      ${hourlyStats['18:00-24:00'].error_count.toString().padStart(14)}      ${hourlyStats['18:00-24:00'].timeout_count.toString().padStart(10)}      ${hourlyStats['18:00-24:00'].files_count.toString().padStart(3)}

時段詳細分析:
🌙 深夜時段 (00:00-06:00):
   • 平均訪問量/檔案:       ${hourlyStats['00:00-06:00'].average_visits_per_file} 次
   • 異常率:               ${hourlyStats['00:00-06:00'].anomaly_rate}%
   • 總 Render 記錄:       ${hourlyStats['00:00-06:00'].total_render_records.toLocaleString()} 筆
   • 慢渲染次數:            ${hourlyStats['00:00-06:00'].slow_count} 次
   • 異常渲染次數:          ${hourlyStats['00:00-06:00'].timeout_count} 次
   • 超時次數:              ${hourlyStats['00:00-06:00'].error_count} 次

🌅 早晨時段 (06:00-12:00):
   • 平均訪問量/檔案:       ${hourlyStats['06:00-12:00'].average_visits_per_file} 次
   • 異常率:               ${hourlyStats['06:00-12:00'].anomaly_rate}%
   • 總 Render 記錄:       ${hourlyStats['06:00-12:00'].total_render_records.toLocaleString()} 筆
   • 慢渲染次數:            ${hourlyStats['06:00-12:00'].slow_count} 次
   • 異常渲染次數:          ${hourlyStats['06:00-12:00'].timeout_count} 次
   • 超時次數:              ${hourlyStats['06:00-12:00'].error_count} 次

🌞 下午時段 (12:00-18:00):
   • 平均訪問量/檔案:       ${hourlyStats['12:00-18:00'].average_visits_per_file} 次
   • 異常率:               ${hourlyStats['12:00-18:00'].anomaly_rate}%
   • 總 Render 記錄:       ${hourlyStats['12:00-18:00'].total_render_records.toLocaleString()} 筆
   • 慢渲染次數:            ${hourlyStats['12:00-18:00'].slow_count} 次
   • 異常渲染次數:          ${hourlyStats['12:00-18:00'].timeout_count} 次
   • 超時次數:              ${hourlyStats['12:00-18:00'].error_count} 次

🌆 晚間時段 (18:00-24:00):
   • 平均訪問量/檔案:       ${hourlyStats['18:00-24:00'].average_visits_per_file} 次
   • 異常率:               ${hourlyStats['18:00-24:00'].anomaly_rate}%
   • 總 Render 記錄:       ${hourlyStats['18:00-24:00'].total_render_records.toLocaleString()} 筆
   • 慢渲染次數:            ${hourlyStats['18:00-24:00'].slow_count} 次
   • 異常渲染次數:          ${hourlyStats['18:00-24:00'].timeout_count} 次
   • 超時次數:              ${hourlyStats['18:00-24:00'].error_count} 次

時段性能趨勢分析:
• 最繁忙時段: ${this.getMostBusyTimeSlot(hourlyStats)}
• 最慢時段: ${this.getSlowestTimeSlot(hourlyStats)}
• 最異常時段: ${this.getMostAnomalyTimeSlot(hourlyStats)}

各檔案性能表現 (按請求數排序):
${prerenderStats.detailed_breakdown.slice(0, 10).map((file, index) => {
            const gradeEmoji = file.performance_grade === 'Excellent' ? '🟢' :
                file.performance_grade === 'Good' ? '🟡' :
                    file.performance_grade === 'Acceptable' ? '🟠' : '🔴';
            return `${index + 1}. ${file.filename.substring(0, 50)}${file.filename.length > 50 ? '...' : ''}
   • 請求數: ${file.requests.toLocaleString()} | P95: ${file.p95_ms}ms | 評級: ${gradeEmoji} ${file.performance_grade}`;
        }).join('\n')}

🔍 SEO 爬蟲統計
========================================

📊 總爬蟲佔比: ${crawlerStats.overall_crawler_stats.total_crawler_visits.toLocaleString()} 次訪問
🔍 傳統搜索引擎 - 總計: ${crawlerStats.traditional_search_engines.total.percentage}% (${crawlerStats.traditional_search_engines.total.visits.toLocaleString()} 次)
├─ Googlebot:           ${crawlerStats.traditional_search_engines.googlebot.percentage}% (${crawlerStats.traditional_search_engines.googlebot.visits.toLocaleString()} 次)
│  ├─ Mobile:           ${crawlerStats.traditional_search_engines.googlebot_mobile.percentage}% (${crawlerStats.traditional_search_engines.googlebot_mobile.visits.toLocaleString()} 次)
│  └─ Desktop:          ${crawlerStats.traditional_search_engines.googlebot_desktop.percentage}% (${crawlerStats.traditional_search_engines.googlebot_desktop.visits.toLocaleString()} 次)
├─ Bingbot:             ${crawlerStats.traditional_search_engines.bingbot.percentage}% (${crawlerStats.traditional_search_engines.bingbot.visits.toLocaleString()} 次)
├─ Amazonbot:           ${crawlerStats.traditional_search_engines.amazonbot.percentage}% (${crawlerStats.traditional_search_engines.amazonbot.visits.toLocaleString()} 次)
└─ 其他搜索引擎:         ${crawlerStats.traditional_search_engines.other_search_engines.percentage}% (${crawlerStats.traditional_search_engines.other_search_engines.visits.toLocaleString()} 次)

🤖 AI 智能爬蟲 - 總計: ${crawlerStats.ai_crawlers.total.percentage}% (${crawlerStats.ai_crawlers.total.visits.toLocaleString()} 次)
├─ OpenAI-SearchBot:    ${crawlerStats.ai_crawlers.openai_searchbot.percentage}% (${crawlerStats.ai_crawlers.openai_searchbot.visits.toLocaleString()} 次)
├─ ClaudeBot:           ${crawlerStats.ai_crawlers.claudebot.percentage}% (${crawlerStats.ai_crawlers.claudebot.visits.toLocaleString()} 次)
└─ ChatGPT-User:        ${crawlerStats.ai_crawlers.chatgpt_user.percentage}% (${crawlerStats.ai_crawlers.chatgpt_user.visits.toLocaleString()} 次)

🔧 SEO 分析工具 - 總計: ${crawlerStats.seo_tools.total.percentage}% (${crawlerStats.seo_tools.total.visits.toLocaleString()} 次)
├─ BLEXBot:             ${crawlerStats.seo_tools.blexbot.percentage}% (${crawlerStats.seo_tools.blexbot.visits.toLocaleString()} 次)
└─ DotBot:              ${crawlerStats.seo_tools.dotbot.percentage}% (${crawlerStats.seo_tools.dotbot.visits.toLocaleString()} 次)

🕷️ 其他爬蟲 - 總計: ${crawlerStats.other_crawlers.total.percentage}% (${crawlerStats.other_crawlers.total.visits.toLocaleString()} 次)
前 5 名其他爬蟲:
${crawlerStats.other_crawlers.top_10.slice(0, 5).map((crawler, index) =>
            `${index + 1}. ${crawler.name}: ${crawler.percentage}% (${crawler.visits.toLocaleString()} 次)`
        ).join('\n')}

📊 詳細統計資訊
========================================

Render Time 詳細統計:
• 最快 Render 時間:          ${stats.detailed_stats.render_time_stats.min_render_time_ms} ms
• 最慢 Render 時間:          ${stats.detailed_stats.render_time_stats.max_render_time_ms} ms
• 超時率:                   ${stats.detailed_stats.render_time_stats.total_timeout_rate}%

User-Agent 詳細統計:
• 獨特 User-Agent 數量:      ${stats.detailed_stats.user_agent_stats.unique_user_agents_count.toLocaleString()} 個

URL 統計:
• 總獨特 URL 數:             ${stats.detailed_stats.url_stats.total_unique_urls.toLocaleString()} 個
• 重複 URL 數:              ${stats.detailed_stats.url_stats.total_duplicate_urls.toLocaleString()} 個
• 總 URL 請求數:            ${stats.detailed_stats.url_stats.total_url_requests.toLocaleString()} 筆
• URL 重複率:               ${stats.detailed_stats.url_stats.duplicate_rate}%

📁 處理檔案清單
========================================
${stats.metadata.files_info.map((file, index) => {
            const pageTypeEmoji = file.page_type === 'category' ? '📊' : 
                                 file.page_type === 'product' ? '🛍️' : 
                                 file.page_type === 'root' ? '🌐' : '🔍';
            return `${index + 1}. ${file.filename} (${pageTypeEmoji} ${file.page_type}) (${file.analysis_mode})`;
        }).join('\n')}
`;
    }
}

// 主函數
async function main() {
    const aggregator = new JsonAggregator();

    try {
        // 解析命令列參數
        const args = process.argv.slice(2);

        if (args.length === 0) {
            console.error('❌ 使用方式:');
            console.error('  方式1: node aggregator.js <JSON檔案1> <JSON檔案2> ...');
            console.error('  方式2: node aggregator.js --dir <目錄路徑>');
            console.error('  方式3: node aggregator.js --pattern <檔案模式>');
            console.error('');
            console.error('範例:');
            console.error('  node aggregator.js file1.json file2.json file3.json');
            console.error('  node aggregator.js --dir ./daily-analysis-result');
            console.error('  node aggregator.js --dir ./daily-analysis-result/L2');
            console.error('  node aggregator.js --pattern "daily-analysis-result/*_0724_*.json"');
            console.error('  node aggregator.js --pattern "daily-analysis-result/L2/*_analysis.json"');
            return;
        }

        let filePaths = [];

        // 處理不同的輸入方式
        if (args[0] === '--dir') {
            // 目錄模式
            if (args.length < 2) {
                console.error('❌ 請指定目錄路徑');
                return;
            }
            filePaths = aggregator.scanDirectory(args[1]);
        } else if (args[0] === '--pattern') {
            // 模式匹配模式
            console.error('❌ 檔案模式匹配功能尚未實現，請使用目錄模式或直接指定檔案');
            return;
        } else {
            // 直接指定檔案模式
            filePaths = args;
        }

        if (filePaths.length === 0) {
            console.error('❌ 沒有找到要處理的檔案');
            return;
        }

        // 處理檔案
        await aggregator.processFiles(filePaths);

        // 計算統計結果
        const finalStats = aggregator.calculateFinalStats();

        // 生成輸出
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const dateRange = finalStats.metadata.analysis_period.start_date !== 'Unknown' && finalStats.metadata.analysis_period.end_date !== 'Unknown'
            ? `${finalStats.metadata.analysis_period.start_date}_to_${finalStats.metadata.analysis_period.end_date}`
            : 'unknown_period';

        // 確保輸出目錄存在，支援 L1/L2 子資料夾
        let outputDir = 'weekly_aggregated_results';
        
        // 檢查輸入目錄是否包含頁面類型子資料夾
        if (args[0] === '--dir' && args[1]) {
            const inputDir = args[1];
            // 從輸入路徑中提取頁面類型資料夾（category/product等）
            const pathParts = inputDir.split('/');
            const lastPart = pathParts[pathParts.length - 1];
            
            // 如果最後一部分是頁面類型，則在輸出目錄中創建相同結構
            if (lastPart === 'category' || lastPart === 'product' || lastPart === 'root' || lastPart === 'other') {
                outputDir = `weekly_aggregated_results/${lastPart}`;
                console.log(`📂 檢測到頁面類型資料夾: ${lastPart}，將建立對應的輸出結構`);
            }
        }
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`✅ 已建立 ${outputDir} 資料夾`);
        }

        // 輸出 JSON 檔案
        const jsonFileName = `${outputDir}/aggregated_stats_${dateRange}.json`;
        fs.writeFileSync(jsonFileName, JSON.stringify(finalStats, null, 2), 'utf8');
        console.log(`\n✅ JSON 統計結果已儲存至: ${jsonFileName}`);

        // 輸出文字報告
        const textReport = aggregator.generateTextReport(finalStats);
        const txtFileName = `${outputDir}/aggregated_report_${dateRange}.txt`;
        fs.writeFileSync(txtFileName, textReport, 'utf8');
        console.log(`✅ 文字報告已儲存至: ${txtFileName}`);
        
        // 顯示資料夾結構資訊
        const pageTypeFolder = outputDir.includes('/') ? outputDir.split('/')[1] : null;
        if (pageTypeFolder) {
            console.log(`📊 已為 ${pageTypeFolder} 頁面類型生成專屬週報`);
        }

    } catch (error) {
        console.error('❌ 處理過程中發生錯誤:', error.message);
        console.error('錯誤詳情:', error);
    }
}

// 執行程式
if (require.main === module) {
    main();
}

module.exports = { JsonAggregator };
