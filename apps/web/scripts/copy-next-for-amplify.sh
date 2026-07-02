#!/bin/bash
# Replaces pnpm symlink node_modules/next with real files for Amplify SSR.
set -e

NEXT_DIR=$(node -e "console.log(require('path').dirname(require.resolve('next/package.json')))")
echo "Resolved next at: $NEXT_DIR"

rm -rf node_modules/next
cp -r "$NEXT_DIR" node_modules/next

echo "Replaced symlink with real next at node_modules/next"
ls node_modules/next/package.json
