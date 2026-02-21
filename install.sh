#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/.claude/skills/fixme"
DEST="$HOME/.claude/skills/fixme"

if [ ! -d "$SRC" ]; then
  echo "Error: source not found at $SRC" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$SRC" "$DEST"

echo "Installed fixme to $DEST"
