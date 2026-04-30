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
  rm -rf "$dest/fixme-tickets-md/scripts"
done

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
fi
