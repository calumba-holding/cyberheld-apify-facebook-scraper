---
name: update-changelog
description: Update the repository changelog with notable user-facing changes between the latest release baseline and the current branch head. Use when the user asks to update `CHANGELOG.md`, prepare unreleased notes, or summarize release-worthy changes from git history.
---

# Update Changelog

Update the repository changelog with changes between the last release and the current version that are not yet incorporated.

If `CHANGELOG.md` does not exist, use `CHANGELOG` instead.

## Step-by-step process

### 1. Determine baseline version

If no baseline version is provided, use the most recent git tag:

```bash
git describe --tags --abbrev=0
```

If no tags exist, use the earliest meaningful commit range available and state that no release tag exists.

### 2. Find commits from git

Use git history to gather commit information:

```bash
# Get baseline version
git describe --tags --abbrev=0

# Get all commits since the baseline version
git log <baseline-version>..HEAD
```

### 3. Update the changelog

Read the existing changelog file (`CHANGELOG.md`, or `CHANGELOG` if missing) and check whether there are notable changes not yet incorporated. Add them only to the `Unreleased` section. If there is no `Unreleased` section yet, create one at the top in the same style as the existing changelog.

## Ground rules when writing changelogs

### Content guidelines

- Focus on notable user-facing changes: features, fixes, behavior changes, and breaking changes.
- Mention pull requests (`#NUMBER`) when available, but do not use raw commit hashes.
- Ignore insignificant changes such as typo fixes, purely internal refactors, or minor docs-only updates.
- Group related changes together when appropriate.
- Order entries by importance: breaking changes first, then features, then fixes.

### Style guidelines

- Use valid markdown syntax.
- Start each entry with a past-tense verb or descriptive phrase.
- Keep entries concise but descriptive enough to understand the change.
- Use bullet points for individual changes.
- Format code references with backticks.
- Preserve the existing changelog style and heading format.

## Notes

- If the current changelog already has an `Unreleased` section with content, append instead of replacing.
- If the repo uses a different default branch name, treat that as the current version instead of `main`.
- When in doubt about significance, err on the side of including the change.
