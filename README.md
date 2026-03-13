# Work Notes Reporter

Local-first TypeScript CLI to turn daily markdown notes into weekly/monthly summaries and attendance reports, with human approval before finalizing outputs.

## Goals
- Keep daily entry fast (10-15 minutes).
- Generate weekly summary with a ~5 minute review.
- Generate monthly summary from approved weekly summaries.
- Keep markdown as the source of truth.
- Run locally with Ollama (no external API required).

## Scope (V1)
- Parse daily markdown files (one file per workday).
- Generate weekly markdown drafts using the Friday date in filename.
- Generate monthly markdown drafts using `YYYY-MM-Monthly.md`.
- Track and roll up attendance (M-F only).
- Carry unfinished task items forward day-to-day and week-to-week.
- Require approval before promoting drafts to final.

## File/Folder Layout
```text
work-notes-reporter/
  config/
    config.yaml
  notes/
    daily/
      2026/
        2026-02-17.md
    weekly/
      2026/
        2026-02-20-ISOWeek.md
    monthly/
      2026/
        2026-01-Monthly.md
  templates/
    daily.md
    weekly.md
    monthly.md
  drafts/
    weekly/
    monthly/
  final/
    weekly/
    monthly/
  reports/
    attendance/
  cache/
    index.json
```

## Naming Rules
- Daily: `YYYY-MM-DD.md`
- Weekly: `YYYY-MM-DD-ISOWeek.md` (date must be that week's Friday)
- Monthly: `YYYY-MM-Monthly.md`

## Daily Markdown Contract (V1)
Use frontmatter for machine fields; keep body close to current template.

Frontmatter is the metadata block at the top of markdown files between `---` lines.

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

## Weekly/Monthly Rules
- Weekly generation reads daily files for Monday-Friday window and warns on missing days.
- Monthly generation reads weekly files in the month.
- Monthly sections are fixed categories:
  1. Top Outcomes
  2. Problems Solved / Fires Prevented
  3. Cross-Team Impact & Leadership
  4. Risks & Blockers
  5. Next Month Focus

## Command Reference (`worklog`)
Use these only after setting up the global command in "Run Modes".

```bash
worklog init
worklog validate
worklog index
worklog voice profile
worklog generate daily --date 2026-02-18
worklog generate dailies --friday 2026-02-20
worklog generate weekly --friday 2026-02-20
worklog generate monthly --month 2026-01
worklog report attendance --week 2026-02-20
worklog report attendance --month 2026-01
worklog report attendance --from 2026-01-01 --to 2026-02-20
worklog approve weekly --friday 2026-02-20
worklog approve monthly --month 2026-01
```

## Config (`config/config.yaml`)
```yaml
version: 1
paths:
  daily_notes_dir: notes/daily
  weekly_notes_dir: notes/weekly
  monthly_notes_dir: notes/monthly
  templates_dir: templates
  drafts_dir: drafts
  final_dir: final
  reports_dir: reports

llm:
  provider: ollama
  model: llama3.1:8b
  temperature: 0.1
  max_tokens: 1600

voice:
  mode: facts_only
  style_profile_from_samples: true
  sample_dirs:
    - notes/weekly
    - notes/monthly
    - final/weekly
    - final/monthly
  profile_path: cache/style-profile.json

categories:
  - Top Outcomes
  - Problems Solved / Fires Prevented
  - Cross-Team Impact & Leadership
  - Risks & Blockers
  - Next Month Focus

attendance:
  workdays_only: true
  values: [office, wfh, holiday, sick, vacation]
  missing_policy: warn

tasks:
  carry_forward_enabled: true
  open_marker: "[ ]"
  done_marker: "[x]"

tags:
  enabled: true
  input_mode: frontmatter_or_inline
```

## Run Modes
Use one of these modes. Mode A is recommended.

1. Mode A (recommended): project-local commands, no PATH changes required.
2. Mode B: global `worklog` command available in terminal.

### Mode A: Project-Local (macOS + Windows)
- Run commands through npm scripts:
  - `npm run dev -- <command>`
- Examples:
  - `npm run dev -- validate`
  - `npm run dev -- generate dailies --friday 2026-02-20`

### Mode B: Global `worklog` Command
1. Build and link once from the repo root:
   - `npm run build`
   - `npm link`
2. Verify:
   - `worklog --help`

If `worklog` is not found after `npm link`, add npm's global bin folder to PATH.

macOS (zsh):
1. Find npm global bin:
   - `npm bin -g`
2. Add to PATH in `~/.zshrc` (replace with your actual output path):
   - `export PATH="$PATH:/Users/<you>/.npm-global/bin"`
3. Reload shell:
   - `source ~/.zshrc`

Windows (PowerShell):
1. Find npm global bin:
   - `npm bin -g`
2. Add to user PATH (replace with your actual output path):
   - `[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\\Users\\<you>\\AppData\\Roaming\\npm", "User")`
3. Open a new terminal and verify:
   - `worklog --help`

## Development Setup
1. Install Node 20+.
2. Install and run Ollama locally.
3. Pull your preferred model (example: `ollama pull llama3.1:8b`).
4. Install dependencies:
   ```bash
   npm install
   ```
5. Validate config:
   ```bash
   npm run dev -- validate
   ```
   This parses all daily files and writes `cache/index.json`.
6. Rebuild index only:
   ```bash
   npm run dev -- index
   ```
7. Build voice profile from your sample summaries:
   ```bash
   npm run dev -- voice profile
   ```
8. Generate weekly draft (Friday date required):
   ```bash
   npm run dev -- generate daily --date 2026-02-18
   npm run dev -- generate dailies --friday 2026-02-20
   ```
9. Generate weekly draft (Friday date required):
   ```bash
   npm run dev -- generate weekly --friday 2026-02-20
   ```
10. Generate monthly draft:
   ```bash
   npm run dev -- generate monthly --month 2026-02
   ```
11. Attendance reports:
   ```bash
   npm run dev -- report attendance --week 2026-02-20
   npm run dev -- report attendance --month 2026-02
   npm run dev -- report attendance --from 2026-02-01 --to 2026-02-20
   ```
12. Approve drafts:
   ```bash
   npm run dev -- approve weekly --friday 2026-02-20
   npm run dev -- approve monthly --month 2026-02
   ```

## Approval Flow
- Generate output into `drafts/`.
- Review and edit draft.
- Approve via command (`worklog approve ...`) which:
  - sets metadata `approved: true`
  - copies file into `final/`
  - appends an audit event into `cache/index.json` under `approvals`

## Notes
- Outlook integration is intentionally excluded in V1 because meeting data is manually curated and more accurate in notes.
- Reporting is built from markdown + generated cache index (no DB required in V1).
