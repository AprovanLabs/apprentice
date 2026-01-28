#!/usr/bin/env bash

set -e

APPRENTICE_HOME="${APPRENTICE_HOME:-$HOME/.apprentice}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

cp -f shell-init.sh config.yaml "$APPRENTICE_HOME/"
cp -rf completions "$APPRENTICE_HOME/"

echo "Build artifacts synced to $APPRENTICE_HOME"
