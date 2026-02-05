#!/bin/bash

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Function to show usage
show_usage() {
    echo "Usage: $0 [patch|minor|major|<specific_version>] [--beta]"
    echo ""
    echo "Examples:"
    echo "  $0 patch              # Bump patch version"
    echo "  $0 minor              # Bump minor version"
    echo "  $0 1.2.3              # Set specific version to 1.2.3"
    echo "  $0 patch --beta       # Create beta release"
    echo "  $0                    # Interactive mode"
    echo ""
    echo "Note: This creates a unified release containing both CLI and Daemon artifacts."
    echo "Tags are created as: v0.1.0, v0.1.1-beta.1, etc."
}

# Function to get current version from CLI Cargo.toml
get_current_version() {
    grep '^version = ' cli/Cargo.toml | head -1 | sed -E 's/version = "([^"]+)"/\1/'
}

# Function to validate semantic version format
validate_version() {
    local version=$1
    if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]]; then
        print_error "Invalid version format: $version. Expected format: X.Y.Z or X.Y.Z-beta.N"
        return 1
    fi
    return 0
}

# Function to bump version
bump_version() {
    local current_version=$1
    local bump_type=$2
    
    IFS='.' read -ra VERSION_PARTS <<< "$current_version"
    local major=${VERSION_PARTS[0]}
    local minor=${VERSION_PARTS[1]}
    local patch=${VERSION_PARTS[2]}
    
    case $bump_type in
        "patch")
            patch=$((patch + 1))
            ;;
        "minor")
            minor=$((minor + 1))
            patch=0
            ;;
        "major")
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        *)
            print_error "Invalid bump type: $bump_type"
            return 1
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Function to update version in all package files
update_version() {
    local new_version=$1
    
    # Update CLI Cargo.toml
    local temp_file=$(mktemp)
    sed "s/^version = \".*\"/version = \"$new_version\"/" cli/Cargo.toml > "$temp_file"
    mv "$temp_file" cli/Cargo.toml
    print_success "Updated CLI Cargo.toml version to $new_version"
    
    # Update daemon package.json
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('./daemon/package.json', 'utf8'));
        pkg.version = '$new_version';
        fs.writeFileSync('./daemon/package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    print_success "Updated daemon package.json version to $new_version"
    
    # Update daemon package-lock.json
    print_info "Updating daemon package-lock.json..."
    (cd daemon && npm install --package-lock-only 2>/dev/null || true)
    print_success "Updated daemon package-lock.json"
    
    # Update CLI Cargo.lock
    print_info "Updating CLI Cargo.lock..."
    (cd cli && cargo update --package browser)
    print_success "Updated CLI Cargo.lock"
}

# Function to check if git working directory is clean
check_git_status() {
    if [[ -n $(git status --porcelain) ]]; then
        print_warning "Working directory has uncommitted changes."
        echo "The following files will be included in the release commit:"
        git status --short
        echo ""
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Release cancelled."
            exit 0
        fi
    fi
}

# Function to commit and push changes
commit_and_push() {
    local version=$1
    
    print_info "Adding changes to git..."
    
    # Add version files
    git add cli/Cargo.toml cli/Cargo.lock daemon/package.json daemon/package-lock.json 2>/dev/null || git add cli/Cargo.toml cli/Cargo.lock daemon/package.json
    
    # Add any other uncommitted changes if they exist
    if [[ -n $(git status --porcelain) ]]; then
        git add .
    fi
    
    print_info "Committing version bump..."
    git commit -m "chore: bump version to $version"
    
    print_info "Pushing changes to remote..."
    git push origin $(git branch --show-current)
    
    print_success "Changes committed and pushed"
}

# Function to create and push git tag
create_and_push_tag() {
    local version=$1
    local tag="v${version}"
    
    print_info "Creating git tag: $tag"
    git tag "$tag"
    
    print_info "Pushing tag to remote..."
    git push --tags
    
    print_success "Tag $tag created and pushed"
}

# Function to get next beta number for a version
get_next_beta_number() {
    local base_version=$1
    local latest_beta=$(git tag -l "v${base_version}-beta.*" | sort -V | tail -1)
    
    if [[ -z "$latest_beta" ]]; then
        echo "1"
    else
        local current_beta_num=$(echo "$latest_beta" | sed -E 's/.*-beta\.([0-9]+)/\1/')
        echo $((current_beta_num + 1))
    fi
}

# Main script logic
main() {
    # Parse arguments
    local version_input=""
    local is_beta=false
    
    for arg in "$@"; do
        if [[ "$arg" == "--beta" ]]; then
            is_beta=true
        elif [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
            show_usage
            exit 0
        elif [[ -z "$version_input" && "$arg" != "" ]]; then
            version_input="$arg"
        fi
    done
    
    print_info "Starting release process for unified artifact (CLI + Daemon)..."
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not in a git repository"
        exit 1
    fi
    
    # Check if CLI Cargo.toml exists
    if [[ ! -f "cli/Cargo.toml" ]]; then
        print_error "cli/Cargo.toml not found"
        exit 1
    fi
    
    # Get current version
    local current_version=$(get_current_version)
    local base_version=$(echo "$current_version" | sed -E 's/-beta\.[0-9]+$//')
    
    if [[ -z "$current_version" ]]; then
        print_error "Could not find version in cli/Cargo.toml"
        exit 1
    fi
    
    print_info "Current version: $current_version"
    if [[ "$is_beta" == true ]]; then
        print_info "Beta release mode enabled"
    fi
    
    # Determine new version
    local new_version
    
    if [[ -z "$version_input" ]]; then
        # Interactive mode
        echo ""
        echo "Select version bump type:"
        echo "1) patch (${base_version} -> $(bump_version "$base_version" "patch"))"
        echo "2) minor (${base_version} -> $(bump_version "$base_version" "minor"))"
        echo "3) major (${base_version} -> $(bump_version "$base_version" "major"))"
        echo "4) custom (specify exact version)"
        echo ""
        read -p "Enter choice (1-4): " -n 1 -r choice
        echo ""
        
        case $choice in
            1) new_version=$(bump_version "$base_version" "patch") ;;
            2) new_version=$(bump_version "$base_version" "minor") ;;
            3) new_version=$(bump_version "$base_version" "major") ;;
            4) 
                read -p "Enter custom version (X.Y.Z format): " custom_version
                if validate_version "$custom_version"; then
                    new_version="$custom_version"
                else
                    exit 1
                fi
                ;;
            *)
                print_error "Invalid choice"
                exit 1
                ;;
        esac
    elif [[ "$version_input" == "patch" || "$version_input" == "minor" || "$version_input" == "major" ]]; then
        # Bump version based on type
        new_version=$(bump_version "$base_version" "$version_input")
    elif validate_version "$version_input"; then
        # Specific version provided
        new_version="$version_input"
    else
        show_usage
        exit 1
    fi
    
    # Add beta suffix if --beta flag is set
    if [[ "$is_beta" == true ]]; then
        beta_num=$(get_next_beta_number "$new_version")
        new_version="${new_version}-beta.${beta_num}"
        print_info "Beta version: $new_version"
    fi
    
    print_info "New version will be: $new_version"
    
    # Confirm the release
    echo ""
    if [[ "$is_beta" == true ]]; then
        read -p "Proceed with BETA release $current_version -> $new_version? (y/N): " -n 1 -r
    else
        read -p "Proceed with release $current_version -> $new_version? (y/N): " -n 1 -r
    fi
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Release cancelled."
        exit 0
    fi
    
    # Check git status
    check_git_status
    
    # Update version
    update_version "$new_version"
    
    # Commit and push changes
    commit_and_push "$new_version"
    
    # Create and push tag
    create_and_push_tag "$new_version"
    
    if [[ "$is_beta" == true ]]; then
        print_success "Beta release $new_version completed successfully!"
    else
        print_success "Release $new_version completed successfully!"
    fi
    print_info "GitHub Actions will build and publish the unified release (CLI + Daemon)."
    print_info "Check the GitHub Actions workflow for build status."
}

# Handle help flag
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage
    exit 0
fi

# Run main function
main "$@"
