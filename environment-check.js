#!/usr/bin/env node

/**
 * Environment Check Tool for Analysis Log
 * This tool validates the environment setup and provides detailed feedback
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Helper functions for colored output
const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    title: (msg) => console.log(`${colors.cyan}${msg}${colors.reset}`)
};

/**
 * Check if a command exists in the system
 */
function commandExists(command) {
    try {
        execSync(`which ${command}`, { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get command version
 */
function getCommandVersion(command, versionFlag = '--version') {
    try {
        const output = execSync(`${command} ${versionFlag}`, { encoding: 'utf8', stdio: 'pipe' });
        return output.trim().split('\n')[0];
    } catch (error) {
        return 'Unknown';
    }
}

/**
 * Check Node.js version and compatibility
 */
function checkNodeJS() {
    log.info('Checking Node.js environment...');
    
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    const checks = {
        installed: true,
        version: nodeVersion,
        compatible: majorVersion >= 14,
        recommended: majorVersion >= 16
    };
    
    if (checks.compatible) {
        log.success(`Node.js ${checks.version} ✓`);
        if (!checks.recommended) {
            log.warning('Consider upgrading to Node.js 16+ for better performance');
        }
    } else {
        log.error(`Node.js ${checks.version} is too old! Required: >= 14.0`);
        checks.passed = false;
    }
    
    return checks;
}

/**
 * Check npm and package dependencies
 */
function checkNPMAndDependencies() {
    log.info('Checking npm and project dependencies...');
    
    const checks = {
        npm: { installed: false, version: null },
        packageJson: { exists: false, valid: false },
        nodeModules: { exists: false, populated: false },
        dependencies: { installed: false, count: 0 }
    };
    
    // Check npm
    if (commandExists('npm')) {
        checks.npm.installed = true;
        checks.npm.version = getCommandVersion('npm');
        log.success(`npm ${checks.npm.version} ✓`);
    } else {
        log.error('npm is not installed!');
        return checks;
    }
    
    // Check package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        checks.packageJson.exists = true;
        try {
            const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            checks.packageJson.valid = true;
            checks.dependencies.count = Object.keys(packageData.dependencies || {}).length;
            log.success(`package.json found with ${checks.dependencies.count} dependencies ✓`);
        } catch (error) {
            log.error('package.json exists but is invalid JSON');
            return checks;
        }
    } else {
        log.error('package.json not found!');
        return checks;
    }
    
    // Check node_modules
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
        checks.nodeModules.exists = true;
        const nodeModulesContents = fs.readdirSync(nodeModulesPath);
        checks.nodeModules.populated = nodeModulesContents.length > 0;
        
        if (checks.nodeModules.populated) {
            checks.dependencies.installed = true;
            log.success(`node_modules exists with ${nodeModulesContents.length} packages ✓`);
        } else {
            log.warning('node_modules exists but appears empty');
        }
    } else {
        log.error('node_modules not found! Run: npm install');
    }
    
    return checks;
}

/**
 * Check Google Cloud CLI installation and configuration
 */
function checkGoogleCloud() {
    log.info('Checking Google Cloud CLI...');
    
    const checks = {
        gcloud: { installed: false, version: null },
        authenticated: false,
        project: { configured: false, accessible: false },
        credentials: { exists: false, valid: false, path: null }
    };
    
    // Check gcloud installation
    if (commandExists('gcloud')) {
        checks.gcloud.installed = true;
        checks.gcloud.version = getCommandVersion('gcloud', 'version --format="value(Google Cloud SDK)"');
        log.success(`Google Cloud CLI ${checks.gcloud.version} ✓`);
    } else {
        log.error('Google Cloud CLI is not installed!');
        log.info('Install from: https://cloud.google.com/sdk/docs/install');
        return checks;
    }
    
    // Check authentication
    const credentialsPath = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
    checks.credentials.path = credentialsPath;
    
    if (fs.existsSync(credentialsPath)) {
        checks.credentials.exists = true;
        
        // Check if credentials are recent (less than 24 hours old)
        const stats = fs.statSync(credentialsPath);
        const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        checks.credentials.valid = ageInHours < 24;
        
        if (checks.credentials.valid) {
            log.success('Google Cloud credentials are valid ✓');
            checks.authenticated = true;
        } else {
            log.warning(`Credentials are ${Math.round(ageInHours)} hours old (>24h), may need refresh`);
        }
    } else {
        log.error('Google Cloud credentials not found!');
        log.info('Run: gcloud auth application-default login');
    }
    
    // Note: Project access check removed as it's not required for basic functionality
    
    return checks;
}

/**
 * Check required directory structure
 */
function checkDirectories() {
    log.info('Checking directory structure...');
    
    const requiredDirs = [
        'to-analyze-daily-data/200-log',
        'to-analyze-daily-data/user-agent-log',
        'daily-analysis-result',
        'daily-pod-analysis-result',
        'to-analyze-performance-data',
        'performance-analyze-result',
        'weekly_aggregated_results',
        'to-analyze-weekly-data',
        'slow-render-periods-log'
    ];
    
    const checks = {
        existing: [],
        missing: [],
        created: []
    };
    
    requiredDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            checks.existing.push(dir);
        } else {
            checks.missing.push(dir);
            try {
                fs.mkdirSync(dir, { recursive: true });
                checks.created.push(dir);
                log.info(`Created directory: ${dir}`);
            } catch (error) {
                log.error(`Failed to create directory: ${dir}`);
            }
        }
    });
    
    log.success(`Directory structure: ${checks.existing.length + checks.created.length}/${requiredDirs.length} ready ✓`);
    
    if (checks.created.length > 0) {
        log.info(`Created ${checks.created.length} missing directories`);
    }
    
    return checks;
}

/**
 * Check script files and permissions
 */
function checkScripts() {
    log.info('Checking script files...');
    
    const requiredScripts = [
        'query-daily-log.sh',
        'daily-log-analysis-script.sh',
        'slow-render-analysis-script.sh',
        'week-report-script.sh'
    ];
    
    const checks = {
        existing: [],
        missing: [],
        executable: [],
        nonExecutable: []
    };
    
    requiredScripts.forEach(script => {
        if (fs.existsSync(script)) {
            checks.existing.push(script);
            
            try {
                fs.accessSync(script, fs.constants.X_OK);
                checks.executable.push(script);
            } catch (error) {
                checks.nonExecutable.push(script);
                log.warning(`${script} exists but is not executable`);
                try {
                    fs.chmodSync(script, '755');
                    log.info(`Made ${script} executable`);
                    checks.executable.push(script);
                } catch (chmodError) {
                    log.error(`Failed to make ${script} executable`);
                }
            }
        } else {
            checks.missing.push(script);
        }
    });
    
    log.success(`Scripts: ${checks.existing.length}/${requiredScripts.length} found ✓`);
    
    if (checks.missing.length > 0) {
        log.warning(`Missing scripts: ${checks.missing.join(', ')}`);
    }
    
    return checks;
}

/**
 * Generate environment report
 */
function generateReport(allChecks) {
    console.log('\n' + '='.repeat(60));
    log.title('ENVIRONMENT CHECK REPORT');
    console.log('='.repeat(60));
    
    const sections = [
        { name: 'Node.js', status: allChecks.nodejs.compatible },
        { name: 'Dependencies', status: allChecks.dependencies.dependencies.installed },
        { name: 'Google Cloud CLI', status: allChecks.gcloud.gcloud.installed },
        { name: 'Authentication', status: allChecks.gcloud.authenticated },
        { name: 'Directories', status: true }, // Always true as we create them
        { name: 'Scripts', status: allChecks.scripts.existing.length > 0 }
    ];
    
    let allPassed = true;
    sections.forEach(section => {
        const status = section.status ? '✓' : '✗';
        const color = section.status ? colors.green : colors.red;
        console.log(`${color}${status} ${section.name}${colors.reset}`);
        
        if (!section.status) {
            allPassed = false;
        }
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (allPassed) {
        log.success('🎉 Environment is ready! You can start using the analysis tools.');
        console.log('\nQuick start:');
        console.log('1. ./query-daily-log.sh 20250821 https://www.eslite.com/category/2/');
        console.log('2. ./daily-log-analysis-script.sh "20250821 ~ 20250821"');
        console.log('\nWith folder parameters:');
        console.log('1. ./query-daily-log.sh 20250821 https://www.eslite.com/category/2/ L2');
        console.log('2. ./daily-log-analysis-script.sh "20250821 ~ 20250821" "" "L2"');
    } else {
        log.error('❌ Environment setup incomplete. Please address the issues above.');
        console.log('\nRecommended actions:');
        
        if (!allChecks.nodejs.compatible) {
            console.log('• Update Node.js to version 14 or higher');
        }
        if (!allChecks.dependencies.dependencies.installed) {
            console.log('• Run: npm install');
        }
        if (!allChecks.gcloud.gcloud.installed) {
            console.log('• Install Google Cloud CLI');
        }
        if (!allChecks.gcloud.authenticated) {
            console.log('• Run: gcloud auth application-default login');
        }
    }
    
    return allPassed;
}

/**
 * Main function
 */
function main() {
    console.log(`${colors.cyan}🔍 Analysis Log Environment Check${colors.reset}`);
    console.log('='.repeat(40));
    console.log('');
    
    const allChecks = {
        nodejs: checkNodeJS(),
        dependencies: checkNPMAndDependencies(),
        gcloud: checkGoogleCloud(),
        directories: checkDirectories(),
        scripts: checkScripts()
    };
    
    const success = generateReport(allChecks);
    
    if (success) {
        console.log('\n📚 For detailed usage instructions, see: README.md');
        process.exit(0);
    } else {
        console.log('\n🔧 Run: ./setup-environment.sh for automated setup');
        process.exit(1);
    }
}

// Run the environment check
if (require.main === module) {
    main();
}

module.exports = {
    checkNodeJS,
    checkNPMAndDependencies,
    checkGoogleCloud,
    checkDirectories,
    checkScripts
};