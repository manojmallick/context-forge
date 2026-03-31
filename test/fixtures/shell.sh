#!/bin/bash
# Setup script for ContextForge

set -e

install_hooks() {
    local hook_dir=".git/hooks"
    cp scripts/post-commit.sh "$hook_dir/post-commit"
    chmod +x "$hook_dir/post-commit"
}

generate_context() {
    node gen-context.js --generate
}

check_node_version() {
    local version
    version=$(node --version | tr -d 'v' | cut -d. -f1)
    if [ "$version" -lt 18 ]; then
        echo "Node 18+ required"
        exit 1
    fi
}

export PROJECT_ROOT=$(pwd)
export CONFIG_FILE="gen-context.config.json"

main "$@"
