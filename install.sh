#!/usr/bin/env bash
set -euo pipefail

SKILLS_SRC="$(cd "$(dirname "$0")" && pwd)/.claude/skills"
SKILLS_DEST="$HOME/.claude/skills"

if [ ! -d "$SKILLS_SRC" ]; then
  echo "Error: source not found at $SKILLS_SRC" >&2
  exit 1
fi

mkdir -p "$SKILLS_DEST"

for dir in "$SKILLS_SRC"/fixme*; do
  name="$(basename "$dir")"
  rm -rf "$SKILLS_DEST/$name"
  cp -R "$dir" "$SKILLS_DEST/$name"
  echo "Installed $name"
done
