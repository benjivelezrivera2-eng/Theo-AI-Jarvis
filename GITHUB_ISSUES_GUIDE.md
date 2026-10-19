# GitHub Issues Guide

Repo: [benjivelezrivera2-eng/Theo-AI-Jarvis](https://github.com/benjivelezrivera2-eng/Theo-AI-Jarvis)

What this repo is: Theo AI "Jarvis" — personal assistant (orb UI, voice, gated tools). Same issue discipline as BVR Atlas.

Follow this on every task. Benji confirms the issue before any code is written.

## Prime rule

**No code until a GitHub Issue exists for the work.** Plan the issue first, then build.  
Do not write code “because it seems useful.” Wait for an issue and Benji’s yes.

## Before you start

1. List open issues: `gh issue list` (or GitHub MCP).
2. Pick the issue this chat will work on, or draft a new one if none fits.
3. Confirm that choice with Benji. **Wait for a yes before writing code.**
4. **Default branch is `main`.** Commit and push on `main` unless Benji explicitly asks for a feature branch or PR workflow. Do not create branches on your own.

## Issue format

- **Title:** specific and clear.
- **Goal:** one short paragraph on the outcome.
- **Steps:** a checkbox list of the work.
- **Done when:** the checks that prove it is finished.

```markdown
## Goal
<one short paragraph>

## Steps
- [ ] ...

## Done when
- [ ] ...
```

## Labels

Use only labels that already exist. Check with `gh label list`. If the right label is missing, ask Benji to create it. Do not invent or create labels.

## Standard Labels

- **enhancement:** New features or improvements
- **bug:** Errors or broken functionality
- **documentation:** Changes to README, guides, or code comments
- **refactor:** Code cleanup with no change in behavior
- **urgent:** Blocks something critical, like the site or getting paid

## Milestones

This repo does not use milestones unless Benji adds them. Track work with issues and the GitHub Project board when one exists.

## While working

Comment on the issue with progress and any decision you make. Keep comments short and factual.  
For project context and standing rules, check Mempalace (`bvr_atlas` / `theo_ai_jarvis`) and this guide — do not invent process.

## When finished

1. Check off the completed steps.
2. Comment with a short summary of what changed.
3. Close the issue (or ask Benji before closing if unsure).
4. Move its card to **Done** on the GitHub Project board when applicable.

## Do not delete

Never delete issues, this repo, or branches unless Benji explicitly says yes in the same chat.

## Secrets

Keep tokens, API keys, and other secrets out of issues, comments, and code. Never commit `server/.env`.

## Related discipline

BVR Atlas source of truth for the same habit: [benjivelezrivera2-eng/bvr-atlas](https://github.com/benjivelezrivera2-eng/bvr-atlas) `GITHUB_ISSUES_GUIDE.md`. Sentry may be connected for runtime errors — use it to diagnose, not as permission to freestyle fixes without an issue.
