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
approved: true
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
- Monthly sections are fixed categories:
  1. Top Outcomes
  2. Problems Solved / Fires Prevented
  3. Cross-Team Impact & Leadership
  4. Risks & Blockers
  5. Next Month Focus

## Weekly Section Semantics
- `Task list from last Week` is the carry-forward list already open when the target week begins. It is not a dump of every open task seen during the week.
- `Problems solved / fires prevented` is limited to concrete fixes, remediations, incidents, and blockers addressed during the week. Personal or admin cleanup items do not belong here unless they clearly describe operational remediation.
- `Cross-team impact` should preserve the meaning and wording of meetings and collaboration notes from the source dailies. Do not rewrite meeting bullets into synthetic `Met with ...` phrases.
- `Task list for Next Week (Max 3)` is the forward-looking list of open tasks still relevant at the end of the week.

Default weekly semantic source labels:

```yaml
weekly:
  sections:
    - id: tasks_last_week
      source: carry_forward_tasks
    - id: fires_prevented
      source: fire_highlights
    - id: cross_team_impact
      source: collaboration_highlights
    - id: next_week_tasks
      source: upcoming_tasks
```

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

What it does not currently do:

- store a full copy of your writing in a database
- ship with sample writing for you
- automatically redact sensitive values in exported external-LLM prompt packages

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

Exported weekly prompt packages include:

- instructions telling the external LLM to create a markdown file with the correct weekly filename
- the weekly template
- current week source notes from `notes/daily`
- sample writing from the configured `voice.sample_dirs`
- voice/style constraints derived from your writing

Exported monthly prompt packages include:

- instructions telling the external LLM to create a markdown file with the correct monthly filename
- the monthly template
- source weekly notes from `notes/weekly`
- sample writing from the configured `voice.sample_dirs`
- voice/style constraints derived from your writing

Output locations:

- weekly prompt package: `drafts/prompts/weekly/YYYY-MM-DD-weekly-prompt.md`
- monthly prompt package: `drafts/prompts/monthly/YYYY-MM-monthly-prompt.md`

## Approval Flow
- Generate output into `drafts/`.
- Review and edit the draft.
- Approve via command, which:
  - sets metadata `approved: true`
  - moves the file into `notes/weekly` or `notes/monthly`
  - appends an audit event into `cache/index.json` under `approvals`
