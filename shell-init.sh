#!/usr/bin/env zsh
# Apprentice Shell Integration
# This file provides command logging functionality for the Apprentice system.

APPRENTICE_HOME="${APPRENTICE_HOME:-$HOME/.apprentice}"
APPRENTICE_BUILD_HOME="${APPRENTICE_BUILD_HOME:-$HOME/.apprentice}"
APPRENTICE_LOG_DIR="$APPRENTICE_HOME/memory/logs"
APPRENTICE_OUTPUT_DIR="$APPRENTICE_HOME/memory/outputs"
APPRENTICE_LAST_COMMAND=""
APPRENTICE_LAST_EXIT_CODE=0

# Add apr to PATH
if [[ ! -f "$APPRENTICE_BUILD_HOME/dist/cli.js" ]]; then
   echo "Apprentice CLI not found, please run 'npm install && npm run build' in $APPRENTICE_HOME"
   return 0
fi

export PATH="$APPRENTICE_BUILD_HOME/node_modules/.bin:$PATH"

# Remove any existing alias and define as function for better completion support
unalias apr 2>/dev/null
function apr {
  node "$APPRENTICE_BUILD_HOME/dist/cli.js" "$@"
}
unalias pw 2>/dev/null
alias pw='apr patchwork run'

# Add completions to fpath and initialize
fpath=("$APPRENTICE_HOME/completions" $fpath)

# Initialize completions
autoload -Uz compinit
compinit -C -d "${ZDOTDIR:-$HOME}/.zcompdump-apprentice"

# Associate completion function with apr
compdef _apr apr

# Ensure output directory exists
mkdir -p "$APPRENTICE_OUTPUT_DIR" 2>/dev/null

# Before command: just record the command
apprentice_preexec() {
  APPRENTICE_LAST_COMMAND="$1"
}

# After command: log it (without output capture to avoid hangs)
apprentice_precmd() {
  APPRENTICE_LAST_EXIT_CODE=$?
  
  # Skip if no command was run
  [[ -z "$APPRENTICE_LAST_COMMAND" ]] && return
  
  # Gather context
  local cwd=$(pwd)
  
  # Get git branch - prefer symbolic-ref (for normal branches), fall back to describe, then short SHA
  local git_branch=$(
    git symbolic-ref --short HEAD 2>/dev/null || \
    git describe --tags --exact-match HEAD 2>/dev/null || \
    git rev-parse --short HEAD 2>/dev/null || \
    echo ""
  )
  
  # Get git SHA (first 7 characters)
  local git_sha=$(git rev-parse --short=7 HEAD 2>/dev/null || echo "")
  
  (
    node "$APPRENTICE_BUILD_HOME/dist/log-command.js" \
      "$APPRENTICE_LAST_COMMAND" \
      "$cwd" \
      "$git_branch" \
      "$git_sha" \
      "$APPRENTICE_LAST_EXIT_CODE" </dev/null 2>/dev/null
  ) &!

  APPRENTICE_LAST_COMMAND=""
}

# Register hooks
autoload -Uz add-zsh-hook
add-zsh-hook preexec apprentice_preexec
add-zsh-hook precmd apprentice_precmd

# Widget for smart git suggestions (Ctrl+G)
apprentice_git_suggest() {
  local prefix="$LBUFFER"
  local branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  local cwd=$(pwd)
  
  # Get suggestions as JSON
  local suggestions=$(node "$APPRENTICE_BUILD_HOME/dist/cli.js" suggest \
    --prefix "$prefix" \
    --json 2>/dev/null)
  
  if [[ -z "$suggestions" || "$suggestions" == "[]" ]]; then
    zle -M "No suggestions available"
    return
  fi
  
  # Extract first suggestion's command
  local first_cmd=$(echo "$suggestions" | node -e "
    let data = '';
    process.stdin.on('data', d => data += d);
    process.stdin.on('end', () => {
      try {
        const suggestions = JSON.parse(data);
        if (suggestions.length > 0) {
          console.log(suggestions[0].command);
        }
      } catch {}
    });
  ")
  
  if [[ -n "$first_cmd" ]]; then
    LBUFFER="$first_cmd"
    RBUFFER=""
    zle redisplay
  fi
}
zle -N apprentice_git_suggest
# Bind to Ctrl+X g instead of Ctrl+G (which can conflict with terminal)
bindkey '^Xg' apprentice_git_suggest

# Widget for showing all suggestions (Ctrl+X Ctrl+S)
apprentice_show_suggestions() {
  local prefix="$LBUFFER"
  
  echo
  node "$APPRENTICE_BUILD_HOME/dist/cli.js" suggest --prefix "$prefix" 2>/dev/null
  echo
  
  zle reset-prompt
}
zle -N apprentice_show_suggestions
bindkey '^Xs' apprentice_show_suggestions

# Start apprentice indexer daemon (quiet if already running)
apr indexer start --quiet
