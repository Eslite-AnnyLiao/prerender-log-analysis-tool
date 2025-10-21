const fs = require('fs');
const path = require('path');

function formatDate(dateStr) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
}

function parseDateFromFilename(filename) {
    const match = filename.match(/(\d{8})/);
    return match ? match[1] : null;
}

function calculateStats(values) {
    if (values.length === 0) return { mean: 0, median: 0, std: 0, min: 0, max: 0 };
    
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const median = sorted.length % 2 === 0 
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    return {
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        std: Math.round(std * 100) / 100,
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

function extractPodGeneration(podName) {
    // 提取 pod 的 ReplicaSet hash (deployment generation)
    // 格式: prod-prerender-75bbddb587-xxxxx 或 prod-prerender-7b7786677d-xxxxx
    const match = podName.match(/^(.+)-(\w{10})-\w+$/);
    if (match) {
        return {
            appName: match[1],
            replicaSetHash: match[2],
            generation: match[2]
        };
    }
    return { appName: podName, replicaSetHash: 'unknown', generation: 'unknown' };
}

function groupPodsByGeneration(podLoads) {
    const generations = {};
    const activePods = {};
    
    Object.entries(podLoads).forEach(([podName, load]) => {
        const { replicaSetHash } = extractPodGeneration(podName);
        
        if (!generations[replicaSetHash]) {
            generations[replicaSetHash] = {
                pods: {},
                totalLoad: 0,
                podCount: 0
            };
        }
        
        // 只統計有負載的 pod (活躍的 pod)
        if (load > 0) {
            generations[replicaSetHash].pods[podName] = load;
            generations[replicaSetHash].totalLoad += load;
            generations[replicaSetHash].podCount++;
            activePods[podName] = load;
        }
    });
    
    return { generations, activePods };
}

function detectRollingUpdate(generations, podLoads, previousDayPods = null) {
    const activeGenerations = Object.keys(generations).filter(gen => 
        generations[gen].podCount > 0
    );
    
    // 檢測大版號 Rolling Update（多個 ReplicaSet）
    const isMajorRollingUpdate = activeGenerations.length > 1;
    
    // 檢測小版號 Rolling Update（同一 ReplicaSet 內的變化）
    let isMinorRollingUpdate = false;
    let minorUpdateDetails = null;
    
    if (activeGenerations.length === 1 && previousDayPods) {
        const currentGeneration = activeGenerations[0];
        const currentPods = Object.keys(generations[currentGeneration].pods);
        const previousPods = Object.keys(previousDayPods).filter(pod => 
            extractPodGeneration(pod).replicaSetHash === currentGeneration
        );
        
        // 計算 pod 變化
        const newPods = currentPods.filter(pod => !previousPods.includes(pod));
        const removedPods = previousPods.filter(pod => !currentPods.includes(pod));
        const stablePods = currentPods.filter(pod => previousPods.includes(pod));
        
        // 檢測標準：
        // 1. 有新 pod 出現或舊 pod 消失
        // 2. pod 總數暫時超過預期（30個）
        // 3. 新 pod 負載明顯低於平均（剛啟動）
        const expectedPodCount = 30;
        const hasNewOrRemovedPods = newPods.length > 0 || removedPods.length > 0;
        const exceedsExpectedCount = currentPods.length > expectedPodCount;
        
        // 檢查新 pod 是否有典型的啟動特徵（低負載）
        let hasLowLoadNewPods = false;
        if (newPods.length > 0) {
            const avgLoad = Object.values(generations[currentGeneration].pods).reduce((sum, load) => sum + load, 0) / currentPods.length;
            const newPodsAvgLoad = newPods.reduce((sum, pod) => sum + (generations[currentGeneration].pods[pod] || 0), 0) / newPods.length;
            hasLowLoadNewPods = newPodsAvgLoad < avgLoad * 0.5; // 新 pod 負載低於平均 50%
        }
        
        isMinorRollingUpdate = hasNewOrRemovedPods && (exceedsExpectedCount || hasLowLoadNewPods || newPods.length >= 2);
        
        if (isMinorRollingUpdate) {
            minorUpdateDetails = {
                generation: currentGeneration,
                currentPodCount: currentPods.length,
                expectedPodCount,
                newPods: newPods.length,
                removedPods: removedPods.length,
                stablePods: stablePods.length,
                exceedsExpectedCount,
                hasLowLoadNewPods,
                newPodsList: newPods.slice(0, 3), // 顯示前3個新 pod
                removedPodsList: removedPods.slice(0, 3) // 顯示前3個移除的 pod
            };
        }
    }
    
    const isRollingUpdate = isMajorRollingUpdate || isMinorRollingUpdate;
    const totalActivePods = Object.values(generations).reduce((sum, gen) => sum + gen.podCount, 0);
    
    return {
        isRollingUpdate,
        isMajorRollingUpdate,
        isMinorRollingUpdate,
        activeGenerations: activeGenerations.length,
        totalActivePods,
        generationDetails: activeGenerations.map(gen => ({
            generation: gen,
            podCount: generations[gen].podCount,
            totalLoad: generations[gen].totalLoad,
            avgLoad: generations[gen].totalLoad / generations[gen].podCount
        })),
        minorUpdateDetails
    };
}

function analyzeLoadBalance(podLoads, previousDayPods = null) {
    const { generations, activePods } = groupPodsByGeneration(podLoads);
    const rollingUpdateInfo = detectRollingUpdate(generations, podLoads, previousDayPods);
    
    // 使用活躍 pod 進行分析 (排除零負載的 pod)
    const activeLoads = Object.values(activePods);
    const stats = calculateStats(activeLoads);
    const coefficientOfVariation = stats.mean > 0 ? (stats.std / stats.mean) : 0;
    
    // 調整均衡度評估邏輯，考慮 Rolling Update 情況
    let balanceLevel = 'excellent';
    let adjustedCV = coefficientOfVariation;
    
    if (rollingUpdateInfo.isRollingUpdate) {
        // Rolling Update 期間，放寬評估標準
        if (rollingUpdateInfo.isMajorRollingUpdate) {
            // 大版號更新：更寬鬆的標準
            if (coefficientOfVariation > 0.8) balanceLevel = 'poor';
            else if (coefficientOfVariation > 0.5) balanceLevel = 'moderate';
        } else {
            // 小版號更新：適度放寬
            if (coefficientOfVariation > 0.7) balanceLevel = 'poor';
            else if (coefficientOfVariation > 0.4) balanceLevel = 'moderate';
        }
        
        // 計算每個 generation 內部的均衡度
        const generationCVs = rollingUpdateInfo.generationDetails.map(gen => {
            const genLoads = Object.values(generations[gen.generation].pods);
            const genStats = calculateStats(genLoads);
            return genStats.mean > 0 ? (genStats.std / genStats.mean) : 0;
        });
        adjustedCV = Math.min(...generationCVs.filter(cv => cv > 0));
    } else {
        // 正常情況下的評估標準
        if (coefficientOfVariation > 0.6) balanceLevel = 'poor';
        else if (coefficientOfVariation > 0.3) balanceLevel = 'moderate';
    }
    
    return {
        stats,
        coefficientOfVariation: Math.round(coefficientOfVariation * 10000) / 10000,
        adjustedCV: Math.round(adjustedCV * 10000) / 10000,
        balanceLevel,
        totalRequests: activeLoads.reduce((sum, load) => sum + load, 0),
        podCount: activeLoads.length,
        totalPodsInCluster: Object.keys(podLoads).length,
        rollingUpdateInfo,
        generations: Object.keys(generations).map(gen => ({
            generation: gen,
            podCount: generations[gen].podCount,
            totalLoad: generations[gen].totalLoad,
            avgLoad: Math.round((generations[gen].totalLoad / generations[gen].podCount) * 100) / 100
        }))
    };
}

function identifyLoadIssues(podLoads, analysis) {
    const issues = [];
    const { stats, rollingUpdateInfo } = analysis;
    const { generations } = groupPodsByGeneration(podLoads);
    
    // 動態調整閾值，考慮 Rolling Update 情況
    let overloadMultiplier = 2.0;
    let underloadMultiplier = 0.3;
    
    if (rollingUpdateInfo.isRollingUpdate) {
        // Rolling Update 期間放寬標準
        overloadMultiplier = 2.5;
        underloadMultiplier = 0.1;
        
        // 檢查 Rolling Update 相關問題
        if (rollingUpdateInfo.isMajorRollingUpdate && rollingUpdateInfo.activeGenerations > 2) {
            issues.push({
                type: 'rolling_update_stuck',
                description: `檢測到 ${rollingUpdateInfo.activeGenerations} 個活躍版本，大版號 Rolling Update 可能卡住`,
                generations: rollingUpdateInfo.generationDetails
            });
        }
        
        // 檢查小版號 Rolling Update 相關問題
        if (rollingUpdateInfo.isMinorRollingUpdate) {
            const details = rollingUpdateInfo.minorUpdateDetails;
            if (details.currentPodCount > details.expectedPodCount + 5) {
                issues.push({
                    type: 'minor_rolling_update_excess_pods',
                    description: `小版號 Rolling Update 期間 pod 數量過多 (${details.currentPodCount}/${details.expectedPodCount})`,
                    details
                });
            }
        }
        
        // 檢查新舊版本負載不均（僅適用於大版號更新）
        if (rollingUpdateInfo.isMajorRollingUpdate) {
            const generationLoads = rollingUpdateInfo.generationDetails;
            if (generationLoads.length === 2) {
                const [gen1, gen2] = generationLoads.sort((a, b) => b.avgLoad - a.avgLoad);
                const loadRatio = gen1.avgLoad / gen2.avgLoad;
                
                if (loadRatio > 2.0) {
                    issues.push({
                        type: 'major_rolling_update_imbalance',
                        description: `大版號 Rolling Update 期間新舊版本負載差異過大 (${loadRatio.toFixed(2)}x)`,
                        details: {
                            higherLoadGeneration: gen1,
                            lowerLoadGeneration: gen2,
                            ratio: Math.round(loadRatio * 100) / 100
                        }
                    });
                }
            }
        }
    }
    
    const threshold = stats.mean * overloadMultiplier;
    const lowThreshold = stats.mean * underloadMultiplier;
    
    const overloadedPods = [];
    const underloadedPods = [];
    const inactivePods = [];
    
    Object.entries(podLoads).forEach(([podName, load]) => {
        if (load === 0) {
            inactivePods.push({ pod: podName, load, generation: extractPodGeneration(podName).replicaSetHash });
        } else if (load > threshold) {
            overloadedPods.push({ 
                pod: podName, 
                load, 
                ratio: (load / stats.mean).toFixed(2),
                generation: extractPodGeneration(podName).replicaSetHash
            });
        } else if (load < lowThreshold && load > 0) {
            underloadedPods.push({ 
                pod: podName, 
                load, 
                ratio: (load / stats.mean).toFixed(2),
                generation: extractPodGeneration(podName).replicaSetHash
            });
        }
    });
    
    if (overloadedPods.length > 0) {
        issues.push({
            type: 'overload',
            description: `${overloadedPods.length} 個 Pod 負載過高`,
            pods: overloadedPods.sort((a, b) => b.load - a.load)
        });
    }
    
    if (underloadedPods.length > 0 && !rollingUpdateInfo.isRollingUpdate) {
        // 非 Rolling Update 期間才報告負載過低問題
        issues.push({
            type: 'underload',
            description: `${underloadedPods.length} 個 Pod 負載過低`,
            pods: underloadedPods.sort((a, b) => a.load - b.load)
        });
    }
    
    // 報告不活躍的 pod 數量
    if (inactivePods.length > 0) {
        const inactiveByGeneration = {};
        inactivePods.forEach(pod => {
            if (!inactiveByGeneration[pod.generation]) {
                inactiveByGeneration[pod.generation] = 0;
            }
            inactiveByGeneration[pod.generation]++;
        });
        
        issues.push({
            type: 'inactive_pods',
            description: `${inactivePods.length} 個 Pod 無負載 (可能正在啟動或停止中)`,
            byGeneration: inactiveByGeneration,
            isRollingUpdate: rollingUpdateInfo.isRollingUpdate
        });
    }
    
    // 使用調整後的 CV 進行均衡度判斷
    let cvThreshold = 0.6;
    let imbalanceDescription = '負載分佈嚴重不均衡';
    
    if (rollingUpdateInfo.isRollingUpdate) {
        if (rollingUpdateInfo.isMajorRollingUpdate) {
            cvThreshold = 0.8;
            imbalanceDescription = '大版號 Rolling Update 期間負載分佈不均衡';
        } else {
            cvThreshold = 0.7;
            imbalanceDescription = '小版號 Rolling Update 期間負載分佈不均衡';
        }
    }
    
    if (analysis.coefficientOfVariation > cvThreshold) {
        issues.push({
            type: 'imbalance',
            description: imbalanceDescription,
            cv: analysis.coefficientOfVariation,
            adjustedCV: analysis.adjustedCV,
            isRollingUpdate: rollingUpdateInfo.isRollingUpdate,
            isMajorRollingUpdate: rollingUpdateInfo.isMajorRollingUpdate,
            isMinorRollingUpdate: rollingUpdateInfo.isMinorRollingUpdate
        });
    }
    
    return issues;
}

async function analyzePodLoadDistribution() {
    const categoryDir = './daily-pod-analysis-result/category/';
    
    if (!fs.existsSync(categoryDir)) {
        console.error('目錄不存在:', categoryDir);
        return;
    }

    const files = fs.readdirSync(categoryDir)
        .filter(file => file.endsWith('_summary.json'))
        .sort();

    console.log(`找到 ${files.length} 個分析檔案`);

    const dailyLoadAnalysis = [];
    let previousDayPods = null;
    
    for (const file of files) {
        const filePath = path.join(categoryDir, file);
        const dateStr = parseDateFromFilename(file);
        
        if (!dateStr) {
            console.warn(`無法從檔名解析日期: ${file}`);
            continue;
        }

        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const analysis = JSON.parse(data);
            
            const date = formatDate(dateStr);
            const renderTimeStats = analysis.overall_stats?.renderTimeStats?.byPod || {};
            
            // 提取每個 pod 的負載 (total 請求數)
            const podLoads = {};
            Object.entries(renderTimeStats).forEach(([podName, stats]) => {
                if (stats.total && stats.total > 0) {
                    podLoads[podName] = stats.total;
                }
            });
            
            if (Object.keys(podLoads).length === 0) {
                console.warn(`${date}: 沒有找到有效的 pod 負載資料`);
                continue;
            }
            
            // 分析負載分佈（傳入前一天的 pod 資料用於檢測小版號 Rolling Update）
            const loadAnalysis = analyzeLoadBalance(podLoads, previousDayPods);
            const issues = identifyLoadIssues(podLoads, loadAnalysis);
            
            // 找出負載最高和最低的 pod
            const sortedPods = Object.entries(podLoads)
                .map(([pod, load]) => ({ pod, load }))
                .sort((a, b) => b.load - a.load);
            
            const dailyReport = {
                date,
                totalRequests: loadAnalysis.totalRequests,
                podCount: loadAnalysis.podCount,
                totalPodsInCluster: loadAnalysis.totalPodsInCluster,
                loadStats: loadAnalysis.stats,
                coefficientOfVariation: loadAnalysis.coefficientOfVariation,
                adjustedCV: loadAnalysis.adjustedCV,
                balanceLevel: loadAnalysis.balanceLevel,
                topLoadedPods: sortedPods.slice(0, 5),
                leastLoadedPods: sortedPods.slice(-5).reverse(),
                issues,
                podLoads,
                rollingUpdateInfo: loadAnalysis.rollingUpdateInfo,
                generations: loadAnalysis.generations,
                analysisFile: file
            };
            
            dailyLoadAnalysis.push(dailyReport);
            
            // 保存當天的 pod 資料供下一天使用
            previousDayPods = podLoads;
            
        } catch (error) {
            console.error(`處理檔案失敗 ${file}:`, error.message);
        }
    }
    
    // 生成摘要分析
    const summaryAnalysis = generateSummaryAnalysis(dailyLoadAnalysis);
    
    // 輸出結果
    const outputDir = './pod-load-distribution-analysis/';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 儲存詳細的 JSON 資料
    fs.writeFileSync(
        path.join(outputDir, 'pod-load-distribution-analysis.json'),
        JSON.stringify({ dailyAnalysis: dailyLoadAnalysis, summary: summaryAnalysis }, null, 2),
        'utf8'
    );

    // 生成可讀的文字報告
    const textReport = generateLoadDistributionReport(dailyLoadAnalysis, summaryAnalysis);
    fs.writeFileSync(
        path.join(outputDir, 'pod-load-distribution-report.txt'),
        textReport,
        'utf8'
    );

    // 生成 CSV 格式的負載資料
    const csvReport = generateLoadDistributionCSV(dailyLoadAnalysis);
    fs.writeFileSync(
        path.join(outputDir, 'pod-load-distribution-summary.csv'),
        csvReport,
        'utf8'
    );
    
    // 生成詳細的每日負載分佈 CSV
    const detailedCSV = generateDetailedLoadCSV(dailyLoadAnalysis);
    fs.writeFileSync(
        path.join(outputDir, 'daily-pod-loads-detailed.csv'),
        detailedCSV,
        'utf8'
    );

    console.log('\\n=== Pod 負載分佈分析完成 ===');
    console.log(`生成檔案:`);
    console.log(`- ${outputDir}pod-load-distribution-analysis.json`);
    console.log(`- ${outputDir}pod-load-distribution-report.txt`);
    console.log(`- ${outputDir}pod-load-distribution-summary.csv`);
    console.log(`- ${outputDir}daily-pod-loads-detailed.csv`);
    console.log(`\\n分析期間: ${dailyLoadAnalysis[0]?.date} 到 ${dailyLoadAnalysis[dailyLoadAnalysis.length - 1]?.date}`);
    console.log(`總天數: ${dailyLoadAnalysis.length} 天`);
}

function generateSummaryAnalysis(dailyAnalysis) {
    if (dailyAnalysis.length === 0) return {};
    
    const cvValues = dailyAnalysis.map(day => day.coefficientOfVariation);
    const totalRequestsValues = dailyAnalysis.map(day => day.totalRequests);
    const podCountValues = dailyAnalysis.map(day => day.podCount);
    
    const avgCV = cvValues.reduce((sum, cv) => sum + cv, 0) / cvValues.length;
    const avgDailyRequests = totalRequestsValues.reduce((sum, req) => sum + req, 0) / totalRequestsValues.length;
    const avgPodCount = podCountValues.reduce((sum, count) => sum + count, 0) / podCountValues.length;
    
    // 找出負載分佈最均衡和最不均衡的日期
    const bestBalanceDay = dailyAnalysis.reduce((best, current) => 
        current.coefficientOfVariation < best.coefficientOfVariation ? current : best
    );
    const worstBalanceDay = dailyAnalysis.reduce((worst, current) => 
        current.coefficientOfVariation > worst.coefficientOfVariation ? current : worst
    );
    
    // 統計各平衡等級的天數
    const balanceLevels = { excellent: 0, moderate: 0, poor: 0 };
    dailyAnalysis.forEach(day => {
        balanceLevels[day.balanceLevel]++;
    });
    
    // 找出問題最多的日期
    const problemDays = dailyAnalysis
        .filter(day => day.issues.length > 0)
        .sort((a, b) => b.issues.length - a.issues.length);
    
    return {
        timespan: {
            start: dailyAnalysis[0].date,
            end: dailyAnalysis[dailyAnalysis.length - 1].date,
            totalDays: dailyAnalysis.length
        },
        overallStats: {
            avgCoefficientOfVariation: Math.round(avgCV * 10000) / 10000,
            avgDailyRequests: Math.round(avgDailyRequests),
            avgPodCount: Math.round(avgPodCount * 100) / 100,
            totalRequests: totalRequestsValues.reduce((sum, req) => sum + req, 0)
        },
        balanceDistribution: balanceLevels,
        bestBalanceDay: {
            date: bestBalanceDay.date,
            cv: bestBalanceDay.coefficientOfVariation,
            level: bestBalanceDay.balanceLevel
        },
        worstBalanceDay: {
            date: worstBalanceDay.date,
            cv: worstBalanceDay.coefficientOfVariation,
            level: worstBalanceDay.balanceLevel
        },
        problemDaysCount: problemDays.length,
        topProblemDays: problemDays.slice(0, 3).map(day => ({
            date: day.date,
            issueCount: day.issues.length,
            cv: day.coefficientOfVariation
        }))
    };
}

function generateLoadDistributionReport(dailyAnalysis, summary) {
    const report = [];
    const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    report.push('================================================================================');
    report.push('每日 Pod 負載分佈分析報告');
    report.push(`生成時間: ${currentTime}`);
    report.push('================================================================================');
    report.push('');

    // 摘要統計
    if (summary.timespan) {
        report.push('📊 整體負載分佈摘要');
        report.push('-'.repeat(40));
        report.push(`分析時間範圍: ${summary.timespan.start} 到 ${summary.timespan.end}`);
        report.push(`總分析天數: ${summary.timespan.totalDays} 天`);
        report.push(`總請求數: ${summary.overallStats.totalRequests.toLocaleString()} 次`);
        report.push(`平均每日請求數: ${summary.overallStats.avgDailyRequests.toLocaleString()} 次`);
        report.push(`平均 Pod 數: ${summary.overallStats.avgPodCount} 個`);
        report.push(`平均變異係數: ${summary.overallStats.avgCoefficientOfVariation} (數值越小負載越均衡)`);
        report.push('');

        report.push('⚖️ 負載均衡程度分佈');
        report.push('-'.repeat(40));
        report.push(`優秀 (CV < 0.3): ${summary.balanceDistribution.excellent} 天`);
        report.push(`中等 (CV 0.3-0.6): ${summary.balanceDistribution.moderate} 天`);
        report.push(`不佳 (CV > 0.6): ${summary.balanceDistribution.poor} 天`);
        report.push('');

        report.push('🏆 負載均衡表現');
        report.push('-'.repeat(40));
        report.push(`最均衡日期: ${summary.bestBalanceDay.date} (CV: ${summary.bestBalanceDay.cv}, ${summary.bestBalanceDay.level})`);
        report.push(`最不均衡日期: ${summary.worstBalanceDay.date} (CV: ${summary.worstBalanceDay.cv}, ${summary.worstBalanceDay.level})`);
        report.push(`有問題的天數: ${summary.problemDaysCount} 天`);
        
        if (summary.topProblemDays.length > 0) {
            report.push('');
            report.push('🚨 問題最多的日期:');
            summary.topProblemDays.forEach((day, index) => {
                report.push(`${index + 1}. ${day.date}: ${day.issueCount} 個問題 (CV: ${day.cv})`);
            });
        }
        report.push('');
    }

    // 每日詳細分析
    report.push('📅 每日負載分佈詳細分析');
    report.push('-'.repeat(40));
    
    dailyAnalysis.forEach((day, dayIndex) => {
        const balanceEmoji = day.balanceLevel === 'excellent' ? '✅' : 
                           day.balanceLevel === 'moderate' ? '⚠️' : '❌';
        const rollingUpdateEmoji = day.rollingUpdateInfo?.isRollingUpdate ? '🔄' : '';
        
        if (dayIndex > 0) report.push(''); // 在日期之間加空行
        report.push(`${balanceEmoji}${rollingUpdateEmoji} 日期: ${day.date}`);
        
        if (day.rollingUpdateInfo?.isRollingUpdate) {
            if (day.rollingUpdateInfo.isMajorRollingUpdate) {
                report.push(`├─ 狀態: 大版號 Rolling Update 中 (檢測到 ${day.rollingUpdateInfo.activeGenerations} 個活躍版本)`);
                day.generations.forEach((gen, genIndex) => {
                    const genSymbol = genIndex === day.generations.length - 1 ? '│  └─' : '│  ├─';
                    report.push(`${genSymbol} 版本 ${gen.generation}: ${gen.podCount} 個 Pod, 平均負載 ${gen.avgLoad}`);
                });
            } else if (day.rollingUpdateInfo.isMinorRollingUpdate) {
                const details = day.rollingUpdateInfo.minorUpdateDetails;
                report.push(`├─ 狀態: 小版號 Rolling Update 中 (版本 ${details.generation})`);
                report.push(`│  ├─ 當前 Pod 數: ${details.currentPodCount} (預期: ${details.expectedPodCount})`);
                if (details.newPods > 0) {
                    report.push(`│  ├─ 新增 Pod: ${details.newPods} 個`);
                }
                if (details.removedPods > 0) {
                    report.push(`│  └─ 移除 Pod: ${details.removedPods} 個`);
                }
            }
        } else {
            report.push(`├─ 狀態: 穩定運行`);
        }
        
        report.push(`├─ 活躍Pod: ${day.podCount} / ${day.totalPodsInCluster} 個`);
        report.push(`├─ 總請求數: ${day.totalRequests.toLocaleString()} 次`);
        report.push(`├─ 平均負載: ${day.loadStats.mean} 次/Pod`);
        report.push(`├─ 負載範圍: ${day.loadStats.min} - ${day.loadStats.max} 次`);
        
        if (day.rollingUpdateInfo?.isRollingUpdate && day.adjustedCV !== day.coefficientOfVariation) {
            const updateType = day.rollingUpdateInfo.isMajorRollingUpdate ? '大版號' : '小版號';
            report.push(`├─ 變異係數: ${day.coefficientOfVariation} (調整後: ${day.adjustedCV}) (${day.balanceLevel}, ${updateType})`);
        } else {
            report.push(`├─ 變異係數: ${day.coefficientOfVariation} (${day.balanceLevel})`);
        }
        
        // 負載最高的 Pod
        if (day.topLoadedPods.length > 0) {
            report.push(`├─ 負載最高 Pod:`);
            day.topLoadedPods.slice(0, 3).forEach((pod, index) => {
                const symbol = index === Math.min(2, day.topLoadedPods.length - 1) ? '│  └─' : '│  ├─';
                report.push(`${symbol} ${pod.pod}: ${pod.load.toLocaleString()} 次`);
            });
        }
        
        // 負載最低的 Pod  
        if (day.leastLoadedPods.length > 0) {
            report.push(`├─ 負載最低 Pod:`);
            day.leastLoadedPods.slice(0, 2).forEach((pod, index) => {
                const symbol = index === Math.min(1, day.leastLoadedPods.length - 1) ? '│  └─' : '│  ├─';
                report.push(`${symbol} ${pod.pod}: ${pod.load.toLocaleString()} 次`);
            });
        }
        
        // 問題分析
        if (day.issues.length > 0) {
            report.push(`└─ ⚠️ 發現問題: ${day.issues.length} 個`);
            day.issues.forEach((issue, index) => {
                const symbol = index === day.issues.length - 1 ? '   └─' : '   ├─';
                report.push(`${symbol} ${issue.description}`);
                
                if (issue.pods && issue.pods.length > 0) {
                    issue.pods.slice(0, 2).forEach((pod, podIndex) => {
                        const podSymbol = podIndex === Math.min(1, issue.pods.length - 1) ? '      └─' : '      ├─';
                        report.push(`${podSymbol} ${pod.pod}: ${pod.load} 次 (${pod.ratio}x 平均值)`);
                    });
                }
            });
        } else {
            report.push(`└─ ✅ 無負載問題`);
        }
    });

    return report.join('\n');
}

function generateLoadDistributionCSV(dailyAnalysis) {
    const headers = [
        'Date',
        'Active_Pod_Count',
        'Total_Pods_In_Cluster',
        'Total_Requests',
        'Avg_Load_Per_Pod',
        'Min_Load',
        'Max_Load',
        'Std_Deviation',
        'Coefficient_of_Variation',
        'Adjusted_CV',
        'Balance_Level',
        'Is_Rolling_Update',
        'Is_Major_Rolling_Update',
        'Is_Minor_Rolling_Update',
        'Active_Generations',
        'New_Pods_Count',
        'Removed_Pods_Count',
        'Issue_Count',
        'Top_Loaded_Pod',
        'Top_Load_Count',
        'Least_Loaded_Pod',
        'Least_Load_Count'
    ];

    const rows = dailyAnalysis.map(day => {
        const topPod = day.topLoadedPods[0];
        const leastPod = day.leastLoadedPods[0];

        const minorUpdateDetails = day.rollingUpdateInfo?.minorUpdateDetails;
        
        return [
            day.date,
            day.podCount,
            day.totalPodsInCluster || day.podCount,
            day.totalRequests,
            Math.round(day.loadStats.mean),
            day.loadStats.min,
            day.loadStats.max,
            Math.round(day.loadStats.std),
            day.coefficientOfVariation,
            day.adjustedCV || day.coefficientOfVariation,
            day.balanceLevel,
            day.rollingUpdateInfo?.isRollingUpdate ? 'Yes' : 'No',
            day.rollingUpdateInfo?.isMajorRollingUpdate ? 'Yes' : 'No',
            day.rollingUpdateInfo?.isMinorRollingUpdate ? 'Yes' : 'No',
            day.rollingUpdateInfo?.activeGenerations || 1,
            minorUpdateDetails?.newPods || 0,
            minorUpdateDetails?.removedPods || 0,
            day.issues.length,
            topPod ? topPod.pod : '',
            topPod ? topPod.load : '',
            leastPod ? leastPod.pod : '',
            leastPod ? leastPod.load : ''
        ];
    });

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function generateDetailedLoadCSV(dailyAnalysis) {
    const allPods = new Set();
    
    // 收集所有 pod 名稱
    dailyAnalysis.forEach(day => {
        Object.keys(day.podLoads).forEach(pod => allPods.add(pod));
    });
    
    const podNames = Array.from(allPods).sort();
    const headers = ['Date', 'Total_Requests', 'Active_Pod_Count', 'Total_Pods_In_Cluster', 'Is_Rolling_Update', 'Is_Major_Rolling_Update', 'Is_Minor_Rolling_Update', 'Active_Generations', 'New_Pods', 'Removed_Pods', ...podNames];
    
    const rows = dailyAnalysis.map(day => {
        const minorUpdateDetails = day.rollingUpdateInfo?.minorUpdateDetails;
        
        const row = [
            day.date, 
            day.totalRequests, 
            day.podCount,
            day.totalPodsInCluster || day.podCount,
            day.rollingUpdateInfo?.isRollingUpdate ? 'Yes' : 'No',
            day.rollingUpdateInfo?.isMajorRollingUpdate ? 'Yes' : 'No',
            day.rollingUpdateInfo?.isMinorRollingUpdate ? 'Yes' : 'No',
            day.rollingUpdateInfo?.activeGenerations || 1,
            minorUpdateDetails?.newPods || 0,
            minorUpdateDetails?.removedPods || 0
        ];
        
        podNames.forEach(pod => {
            row.push(day.podLoads[pod] || 0);
        });
        
        return row;
    });
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// 執行分析
if (require.main === module) {
    analyzePodLoadDistribution().catch(console.error);
}

module.exports = {
    analyzePodLoadDistribution,
    analyzeLoadBalance,
    identifyLoadIssues,
    calculateStats
};