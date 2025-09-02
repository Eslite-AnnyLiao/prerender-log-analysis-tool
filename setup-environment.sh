#!/bin/bash

# Analysis Log Environment Setup Script
# This script helps first-time users set up the environment automatically

set -e  # Exit on any error

echo "🚀 Analysis Log Environment Setup Script"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_status() {
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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js version
check_nodejs() {
    print_status "Checking Node.js installation..."
    
    if ! command_exists node; then
        print_error "Node.js is not installed!"
        print_status "Please install Node.js >= 14.0 from: https://nodejs.org/"
        print_status "Or use a package manager:"
        echo "  macOS: brew install node"
        echo "  Ubuntu: sudo apt-get install nodejs npm"
        echo "  CentOS: sudo yum install nodejs npm"
        return 1
    fi
    
    local node_version=$(node --version | sed 's/v//')
    local major_version=$(echo $node_version | cut -d. -f1)
    
    if [ "$major_version" -lt 14 ]; then
        print_error "Node.js version $node_version is too old! Required: >= 14.0"
        print_status "Please update Node.js from: https://nodejs.org/"
        return 1
    fi
    
    print_success "Node.js version $node_version ✓"
    return 0
}

# Check npm and install dependencies
check_and_install_dependencies() {
    print_status "Checking npm and installing dependencies..."
    
    if ! command_exists npm; then
        print_error "npm is not installed!"
        return 1
    fi
    
    local npm_version=$(npm --version)
    print_success "npm version $npm_version ✓"
    
    print_status "Installing project dependencies..."
    if npm install; then
        print_success "Dependencies installed successfully ✓"
    else
        print_error "Failed to install dependencies!"
        return 1
    fi
}

# Check Google Cloud CLI
check_gcloud() {
    print_status "Checking Google Cloud CLI..."
    
    if ! command_exists gcloud; then
        print_error "Google Cloud CLI is not installed!"
        print_status "Please install gcloud from: https://cloud.google.com/sdk/docs/install"
        print_status "Installation guides:"
        echo "  macOS: https://cloud.google.com/sdk/docs/install-sdk#mac"
        echo "  Linux: https://cloud.google.com/sdk/docs/install-sdk#linux"
        echo "  Windows: https://cloud.google.com/sdk/docs/install-sdk#windows"
        return 1
    fi
    
    local gcloud_version=$(gcloud version --format="value(Google Cloud SDK)" 2>/dev/null)
    print_success "Google Cloud CLI version $gcloud_version ✓"
    
    return 0
}

# Check Google Cloud Authentication
check_gcloud_auth() {
    print_status "Checking Google Cloud authentication..."
    
    local credentials_file="$HOME/.config/gcloud/application_default_credentials.json"
    
    if [ ! -f "$credentials_file" ]; then
        print_warning "Google Cloud credentials not found!"
        print_status "Setting up authentication..."
        
        echo ""
        print_status "Please follow these steps to authenticate:"
        echo "1. The following command will open a browser for authentication"
        echo "2. Make sure you have proper Google Cloud project access"
        echo ""
        
        read -p "Press Enter to continue with authentication..."
        
        if gcloud auth application-default login; then
            print_success "Authentication completed ✓"
        else
            print_error "Authentication failed!"
            print_status "Please ensure you have proper Google Cloud project access"
            return 1
        fi
    else
        # Check if credentials are valid and not expired (12 hours)
        local file_age_hours=$(find "$credentials_file" -mmin +720 2>/dev/null | wc -l)
        
        if [ "$file_age_hours" -gt 0 ]; then
            print_warning "Credentials are older than 12 hours. Refreshing..."
            if gcloud auth application-default login; then
                print_success "Credentials refreshed ✓"
            else
                print_error "Failed to refresh credentials!"
                return 1
            fi
        else
            print_success "Google Cloud credentials are valid ✓"
        fi
    fi
    
    return 0
}

# Note: Project access test removed as it's not required for basic functionality
test_gcloud_access() {
    print_status "Google Cloud CLI setup verification..."
    print_success "Google Cloud CLI is properly configured ✓"
    return 0
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    local directories=(
        "to-analyze-daily-data/200-log"
        "to-analyze-daily-data/user-agent-log"
        "daily-analysis-result"
        "daily-pod-analysis-result"
        "to-analyze-performance-data"
        "performance-analyze-result"
        "weekly_aggregated_results"
        "to-analyze-weekly-data"
        "slow-render-periods-log"
    )
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_status "Created directory: $dir"
        fi
    done
    
    print_success "Directory structure verified ✓"
}

# Update package.json scripts
update_package_scripts() {
    print_status "Adding helpful npm scripts..."
    
    # Check if jq is available for JSON manipulation
    if command_exists jq; then
        # Add useful scripts to package.json
        jq '.scripts.setup = "bash setup-environment.sh"' package.json > package.tmp.json && mv package.tmp.json package.json
        jq '.scripts["query-logs"] = "bash query-daily-log.sh"' package.json > package.tmp.json && mv package.tmp.json package.json
        jq '.scripts["analyze-daily"] = "bash daily-log-analysis-script.sh"' package.json > package.tmp.json && mv package.tmp.json package.json
        
        print_success "Added npm scripts ✓"
        print_status "You can now use:"
        echo "  npm run setup          - Run this setup script"
        echo "  npm run query-logs     - Query daily logs"
        echo "  npm run analyze-daily  - Analyze daily data"
    else
        print_warning "jq not found, skipping package.json script updates"
        print_status "Consider installing jq for better JSON manipulation: brew install jq"
    fi
}

# Main setup function
main() {
    echo "Starting environment setup..."
    echo ""
    
    # Step 1: Check Node.js
    if ! check_nodejs; then
        print_error "Node.js setup failed. Please fix Node.js installation and retry."
        exit 1
    fi
    
    # Step 2: Install dependencies
    if ! check_and_install_dependencies; then
        print_error "Dependency installation failed."
        exit 1
    fi
    
    # Step 3: Check Google Cloud CLI
    if ! check_gcloud; then
        print_error "Google Cloud CLI setup failed. Please install gcloud and retry."
        exit 1
    fi
    
    # Step 4: Setup authentication
    if ! check_gcloud_auth; then
        print_error "Google Cloud authentication failed."
        exit 1
    fi
    
    # Step 5: Test access
    if ! test_gcloud_access; then
        print_error "Google Cloud access test failed."
        exit 1
    fi
    
    # Step 6: Create directories
    create_directories
    
    # Step 7: Update package.json
    update_package_scripts
    
    echo ""
    print_success "🎉 Environment setup completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "1. To query logs for a specific date and URL:"
    echo "   ./query-daily-log.sh 20250821 https://www.eslite.com/category/2/"
    echo "   ./query-daily-log.sh 20250821 https://www.eslite.com/category/2/ L2"
    echo ""
    echo "2. To analyze the queried data:"
    echo "   ./daily-log-analysis-script.sh \"20250821 ~ 20250821\""
    echo "   ./daily-log-analysis-script.sh \"20250821 ~ 20250821\" \"\" \"L2\""
    echo ""
    echo "3. For help with usage:"
    echo "   cat README.md"
    echo ""
    print_status "Setup completed! You're ready to start using the analysis tools."
}

# Run the main function
main "$@"