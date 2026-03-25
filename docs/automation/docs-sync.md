# Docs Sync Skill

This repository keeps documentation updates as a project-local skill instead of hook automation.

## Skill locations

- implementation workflow: `.agents/skills/repo-implement-feature/SKILL.md`
- docs sync: `.agents/skills/repo-docs-sync/SKILL.md`

## Purpose

Use this skill whenever code changes affect:
- architecture or file placement
- CLI usage or validation
- output JSON shape or semantics
- video artifact behavior
- target-specific behavior
- scraper-specific behavior
- repository workflow or automation

## Expected scope

The skill should update only:
- `docs/**`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

It should not change source code or tests.

## Usage rule

When implementation changes are made, start with the implementation workflow skill and then use the docs sync skill before finishing.
Use them whenever you update code, refactor behavior, or add a feature.

## Why skill-only

- no git-hook dependency on a specific local AI CLI
- no hard or soft failure during commit/push because a tool is missing
- documentation rules stay in the repository and can be read by agents directly
