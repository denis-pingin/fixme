#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILLS_SRC="$REPO_ROOT/.claude/skills"
AGENTS_SRC="$REPO_ROOT/.claude/agents"
RULES_SRC="$REPO_ROOT/.claude/rules"

if [ ! -d "$SKILLS_SRC" ]; then
  echo "Error: source not found at $SKILLS_SRC" >&2
  exit 1
fi

node "$SKILLS_SRC/fixme-tools/scripts/fixme-tools.cjs" claude-skills install \
  --skills-src "$SKILLS_SRC" \
  --claude-dir "$HOME/.claude"
echo "Installed Claude skills -> $HOME/.claude/skills"

node "$SKILLS_SRC/fixme-tools/scripts/fixme-tools.cjs" codex-skills install \
  --skills-src "$SKILLS_SRC" \
  --codex-dir "$HOME/.codex"
echo "Installed Codex skills -> $HOME/.codex/skills"

if [ -d "$RULES_SRC" ]; then
  RULE_DESTS=(
    "$HOME/.claude/rules"
    "$HOME/.codex/rules"
  )

  for dest in "${RULE_DESTS[@]}"; do
    mkdir -p "$dest"
    for file in "$RULES_SRC"/*.md; do
      [ -f "$file" ] || continue
      name="$(basename "$file")"
      cp "$file" "$dest/$name"
      echo "Installed rule $name -> $dest"
    done
  done
fi

if [ -d "$AGENTS_SRC" ]; then
  AGENTS_DEST="$HOME/.claude/agents"
  mkdir -p "$AGENTS_DEST"
  for file in "$AGENTS_SRC"/fixme-*.md; do
    [ -f "$file" ] || continue
    name="$(basename "$file")"
    cp "$file" "$AGENTS_DEST/$name"
    echo "Installed agent $name -> $AGENTS_DEST"
  done

  node "$SKILLS_SRC/fixme-tools/scripts/fixme-tools.cjs" codex-agents install \
    --agents-src "$AGENTS_SRC" \
    --codex-dir "$HOME/.codex"
  echo "Installed Codex agent registry -> $HOME/.codex/config.toml"
fi
