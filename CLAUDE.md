# Working on this repo

This project is shared between two people working from separate machines/sessions
(local Mac + Claude Code on the web). GitHub is the single source of truth — not
iCloud, not any local folder.

- A `SessionStart` hook (`.claude/hooks/session-start.sh`) auto-pulls the latest
  commit from `origin` at the start of every session, as long as the branch has
  an upstream and there are no uncommitted local changes in the way. If it warns
  about diverged history or uncommitted changes, run `git status` and resolve
  that before making edits.
- After finishing a change: commit and `git push -u origin <branch-name>`. Don't
  leave work uncommitted/unpushed at the end of a session — the other person's
  session can't see it otherwise.
- Don't both work directly on `main` at the same time. Whoever starts second
  should branch off (`git checkout -b <name>`) and open a PR to merge back in,
  the same way PR #1 (Firebase security rules) was done.
