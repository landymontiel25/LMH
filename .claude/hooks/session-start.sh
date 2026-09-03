#!/bin/bash
# Runs at the start of every Claude Code session (local or cloud) so whoever
# opens a chat is automatically working from the latest code on GitHub,
# instead of a stale local copy.
set -uo pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 0

git rev-parse --is-inside-work-tree > /dev/null 2>&1 || exit 0

git fetch origin > /dev/null 2>&1

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
REMOTE_REF=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)

if [ -z "$REMOTE_REF" ]; then
  echo "On branch '$BRANCH' with no upstream tracking branch — skipping auto-pull."
  exit 0
fi

LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse "@{u}")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "git: '$BRANCH' is already up to date with $REMOTE_REF."
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "git: '$BRANCH' has uncommitted local changes, so auto-pull was skipped to avoid clobbering them. Run 'git status' before pulling manually."
  exit 0
fi

PULL_OUTPUT=$(git pull --ff-only 2>&1)
if [ $? -eq 0 ]; then
  echo "git: pulled latest changes into '$BRANCH' from $REMOTE_REF:"
  echo "$PULL_OUTPUT"
else
  echo "git: could not fast-forward '$BRANCH' from $REMOTE_REF (local history has diverged). Check 'git status' / 'git log' before making changes:"
  echo "$PULL_OUTPUT"
fi
