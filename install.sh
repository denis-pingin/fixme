#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILLS_SRC="$REPO_ROOT/.claude/skills"
AGENTS_SRC="$REPO_ROOT/.claude/agents"

if [ ! -d "$SKILLS_SRC" ]; then
  echo "Error: source not found at $SKILLS_SRC" >&2
  exit 1
fi

SKILL_DESTS=(
  "$HOME/.claude/skills"
  "$HOME/.codex/skills"
)

for dest in "${SKILL_DESTS[@]}"; do
  mkdir -p "$dest"
  for dir in "$SKILLS_SRC"/fixme*; do
    name="$(basename "$dir")"
    rm -rf "$dest/$name"
    cp -R "$dir" "$dest/$name"
    echo "Installed $name -> $dest"
  done
done

if [ -d "$AGENTS_SRC" ]; then
  AGENTS_DEST="$HOME/.claude/agents"
  mkdir -p "$AGENTS_DEST"
  for file in "$AGENTS_SRC"/fixme-*.md; do
    [ -f "$file" ] || continue
    name="$(basename "$file")"
    cp "$file" "$AGENTS_DEST/$name"
    echo "Installed agent $name -> $AGENTS_DEST"
  done
fi
