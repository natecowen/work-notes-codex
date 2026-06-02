# Generation Rules

This document collects the markdown contract and semantic rules used during daily, weekly, and monthly generation.

## Daily Markdown Contract
Use frontmatter for machine fields and keep the body close to the daily template structure.

Frontmatter is the metadata block at the top of the markdown file between `---` lines.

```md
---
date: 2026-02-02
attendance: office # office | wfh | holiday | sick | vacation
tags: [auth, keycloak, devops]
approved: false
---

# Day: 2026-02-02

Meetings:
- Standup
- Vendor Working Session

Work:
- Architecture/Devops:
  - Clean-up documentation notes used to deploy and setup Keycloak.

Notes:
Task list for tomorrow:
- [ ] Continue rough yearly goals for manager
- [x] Code review for X
```

## Weekly And Monthly Rules
- Weekly generation reads daily files for the Monday through Friday window and warns on missing days.
- Monthly generation reads weekly files in the target month.
- The preferred `run weekly` and `run monthly` commands write directly into `notes/` with `approved: false`.
- Weekly notes use `notes/weekly/YYYY/YYYY-MM-DD-W##.md`, where `YYYY-MM-DD` is the Friday date and `W##` is the padded ISO week number.
- Monthly sections are fixed categories:
  1. Top Outcomes
  2. Problems Solved / Fires Prevented
  3. Cross-Team Impact & Leadership
  4. Risks & Blockers
  5. Next Month Focus

## Weekly Section Semantics
- `Task list from last Week` is a manual review section. Generated weekly notes leave it as `- Manual review required.`
- `Problems solved / fires prevented` is limited to concrete fixes, remediations, incidents, and blockers addressed during the week. Personal or admin cleanup items do not belong here unless they clearly describe operational remediation.
- `Cross-team impact` should preserve the meaning and wording of meetings and collaboration notes from the source dailies. Do not rewrite meeting bullets into synthetic `Met with ...` phrases.
- `Task list for Next Week (Max 3)` is a manual review section. Generated weekly notes leave it as `- Manual review required.`
- Generated weekly notes append `# Task Review` after the template body. This appendix lists open task candidates from the week's daily notes using last-status-wins normalization, so a later checked-off task closes an earlier open candidate and a later reopened task appears again.
- Task candidates are not sent to Ollama or exported prompt packages.

Default weekly semantic source labels:

```yaml
weekly:
  sections:
    - id: tasks_last_week
      source: manual_review
    - id: fires_prevented
      source: fire_highlights
    - id: cross_team_impact
      source: collaboration_highlights
    - id: next_week_tasks
      source: manual_review
```

## Monthly Section Semantics
- `Top Outcomes`, `Problems Solved / Fires Prevented`, and `Cross-Team Impact & Leadership` are synthesized from the weekly summaries.
- `Risks & Blockers` and `Next Month Focus` are manual review sections. Generated monthly notes leave them as `- Manual review required.`
- Monthly parsing ignores generated weekly appendices such as `# Task Review`.

## Sample Writing And Voice Profile
The app does not include built-in sample writing from you. You provide that by placing real weekly and monthly summaries in the configured sample folders.

By default, the app learns style from:

- `notes/weekly`
- `notes/monthly`

That list comes from `voice.sample_dirs` in `config/config.yaml`.

What the app learns from those files:

- average bullet length
- whether you tend to prefix bullets with category labels such as `Architecture:` or `Leadership:`
- common short prefixes used in summaries
- a small set of representative bullet examples for voice only

What it does not currently do:

- store a full copy of your writing in a database
- ship with sample writing for you
- paste full sample writing files into exported prompt packages
- automatically redact sensitive values in exported external-LLM prompt packages

By default, prompts may include up to three representative bullets from approved summaries as voice examples. These examples are labeled as style-only and are not factual source material. Set `voice.style_example_limit: 0` to disable them.

To build or refresh the style profile after adding your own samples:

```bash
npm run dev -- voice profile
```

This writes `cache/style-profile.json`.

## External LLM Prompt Export
Use prompt export when:

- Ollama is unavailable.
- The local model is not following the template well enough.
- You want to paste a prepared prompt into Copilot or another external AI tool.

Prompt packages are written to files so you can review or redact sensitive work details before sending them externally.

Security notes:

- Treat this repo as private.
- Generated notes, prompt packages, drafts, reports, and cache files may contain sensitive internal work details.
- Review exported prompt packages before sending them to any external AI service.

Exported prompt packages are compact by default. They merge repeated daily or weekly headings into one normalized evidence brief before sending the prompt to another model.

Exported weekly prompt packages include:

- instructions telling the external LLM to create a markdown file with the correct weekly filename
- the weekly template
- voice/style constraints derived from your writing
- one `Combined Daily Notes` block with:
  - included dates
  - attendance rollup
  - merged work grouped by category
  - merged meeting/collaboration evidence
  - problem-solving and cross-team-impact evidence
  - no task candidates

Exported monthly prompt packages include:

- instructions telling the external LLM to create a markdown file with the correct monthly filename
- the monthly template
- voice/style constraints derived from your writing
- one `Combined Weekly Summaries` block with:
  - source weekly filenames
  - merged top outcomes
  - merged problems solved / fires prevented
  - merged cross-team impact
  - manual placeholders for risks and next-month focus

Output locations:

- weekly prompt package: `drafts/prompts/weekly/YYYY-MM-DD-weekly-prompt.md`
- monthly prompt package: `drafts/prompts/monthly/YYYY-MM-monthly-prompt.md`

## Preferred Workflow
- `run weekly` writes directly into `notes/weekly` with `approved: false`.
- `run monthly` writes directly into `notes/monthly` with `approved: false`.
- Existing note files are not overwritten unless `--overwrite` is passed.
