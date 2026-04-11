#!/usr/bin/env bash
# INI integrity test — validates list/ files are consistent and correctly paired.
# Run from repo root: bash test/ini-integrity.sh

set -euo pipefail

LIST_DIR="site/list"
fail=0

GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

pass() { echo -e "${GREEN}PASS${RESET} $*"; }
fail_msg() { echo -e "${RED}FAIL${RESET} $*"; fail=1; }

# Standard asset types that require both a DDS list and a PNG preview list.
PAIRED_TYPES=(art buttons consoles icons models overlays portraits sprites ui wireframes)

# Asset types using a single INI (createLocalItemList — no -png pair needed).
SINGLE_TYPES=(terrain-cliffs terrain-doodads terrain-tilesets)

# Special-purpose files that exist outside the paired/single conventions.
SPECIAL=(data textures models-glb)

echo "── Paired INI checks (DDS + PNG) ─────────────────────────────"

for name in "${PAIRED_TYPES[@]}"; do
  dds="$LIST_DIR/${name}.ini"
  png="$LIST_DIR/${name}-png.ini"

  [ -f "$dds" ] && pass "$dds exists" || fail_msg "$dds missing"
  [ -f "$png" ] && pass "$png exists" || fail_msg "$png missing"

  if [ -f "$dds" ] && [ -f "$png" ]; then
    # Both files must have at least one non-blank, non-comment line
    dds_entries=$(grep -cv '^\s*\(#\|;\|$\|\[\)' "$dds" 2>/dev/null || true)
    png_entries=$(grep -cv '^\s*\(#\|;\|$\|\[\)' "$png" 2>/dev/null || true)
    [ "$dds_entries" -gt 0 ] && pass "$name.ini has $dds_entries entries" \
      || fail_msg "$name.ini is empty"
    [ "$png_entries" -gt 0 ] && pass "${name}-png.ini has $png_entries entries" \
      || fail_msg "${name}-png.ini is empty"
  fi
done

echo "── Single INI checks ──────────────────────────────────────────"

for name in "${SINGLE_TYPES[@]}"; do
  f="$LIST_DIR/${name}.ini"
  [ -f "$f" ] && pass "$f exists" || fail_msg "$f missing"
  if [ -f "$f" ]; then
    entries=$(grep -cv '^\s*\(#\|;\|$\|\[\)' "$f" 2>/dev/null || true)
    [ "$entries" -gt 0 ] && pass "$name.ini has $entries entries" \
      || fail_msg "$name.ini is empty"
  fi
done

echo "── Special files ──────────────────────────────────────────────"

for name in "${SPECIAL[@]}"; do
  f="$LIST_DIR/${name}.ini"
  [ -f "$f" ] && pass "$f exists" || fail_msg "$f missing"
done

echo "── Section header format ──────────────────────────────────────"
# Every INI must have at least one [section] header
for f in "$LIST_DIR"/*.ini; do
  if grep -q '^\[.\+\]' "$f"; then
    pass "$(basename "$f") has section headers"
  else
    fail_msg "$(basename "$f") has no section headers (malformed INI)"
  fi
done

echo "── No unexpected files ────────────────────────────────────────"
known=()
for n in "${PAIRED_TYPES[@]}"; do known+=("${n}.ini" "${n}-png.ini"); done
for n in "${SINGLE_TYPES[@]}";  do known+=("${n}.ini"); done
for n in "${SPECIAL[@]}";       do known+=("${n}.ini"); done

for f in "$LIST_DIR"/*.ini; do
  base=$(basename "$f")
  matched=0
  for k in "${known[@]}"; do [ "$k" = "$base" ] && matched=1 && break; done
  if [ "$matched" -eq 1 ]; then
    pass "$base is a known file"
  else
    fail_msg "$base is UNKNOWN — add it to PAIRED_TYPES, SINGLE_TYPES, or SPECIAL in this script"
  fi
done

echo "──────────────────────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  echo -e "${GREEN}All INI checks passed.${RESET}"
else
  echo -e "${RED}Some INI checks failed.${RESET}"
fi

exit "$fail"
