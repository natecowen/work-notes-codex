# Work Notes Reporter

Local-first TypeScript CLI to turn daily markdown notes into weekly/monthly summaries and attendance reports, with human approval before finalizing outputs.

See also: [V1 plan](../docs/v1-plan.md) and [future enhancements](../docs/future-enhancements.md).

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
```yaml
work-notes-reporter:
  config:
    config.yaml: app configuration for paths, model settings, categories, attendance rules, and voice settings
  notes:
    daily:
      "YYYY/YYYY-MM-DD.md": your main daily input files; write or generate one per workday here
    weekly:
      "YYYY/YYYY-MM-DD-ISOWeek.md": your real weekly summaries; used as historical records and monthly input
    monthly:
      "YYYY/YYYY-MM-Monthly.md": your real monthly summaries and historical archive
  templates:
    daily.md: editable daily note template used by `generate daily` and `generate dailies`
    weekly.md: editable weekly output template used during weekly generation
    monthly.md: editable monthly output template used during monthly generation
  drafts:
    weekly: generated weekly drafts waiting for your review
    monthly: generated monthly drafts waiting for your review
    prompts:
      weekly: exported prompt packages for generating weekly summaries in another LLM
      monthly: exported prompt packages for generating monthly summaries in another LLM
  final:
    weekly: approved weekly outputs copied from drafts
    monthly: approved monthly outputs copied from drafts
  reports:
    attendance: generated attendance reports for week, month, or custom date range
  cache:
    index.json: parsed daily-note index, validation errors, and approval audit trail
    style-profile.json: derived voice/style profile built from your sample weekly/monthly writing
  src:
    "*.ts": application source code
  dist:
    "*.js": compiled runtime output after `npm run build`
```

## Where You Work
You normally touch these folders directly:

- `notes/daily` for daily capture.
- `notes/weekly` for finalized weekly summaries you want to keep as source/history.
- `notes/monthly` for finalized monthly summaries you want to keep as source/history.
- `templates` to change the generated markdown structure.
- `config/config.yaml` to change app behavior.

The app mainly writes to:

- `drafts/*` for generated drafts.
- `final/*` for approved copies of drafts.
- `reports/attendance` for generated attendance reports.
- `cache/*` for machine-readable artifacts.

Recommended workflow:

1. Generate or create daily notes in `notes/daily`.
2. Fill in daily notes during the week.
3. Generate a weekly draft into `drafts/weekly`.
4. Review and approve the weekly draft, then keep finalized weekly summaries in `notes/weekly` or `final/weekly`.
5. Generate monthly drafts from your weekly summaries.

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

## Sample Writing And Voice Profile
The app does not include built-in sample writing from you. You provide that by placing your real weekly and monthly summaries in the configured sample folders.

By default, the app learns your style from:

- `notes/weekly`
- `notes/monthly`
- `final/weekly`
- `final/monthly`

That list comes from `voice.sample_dirs` in `config/config.yaml`.

What the app learns from those files:

- average bullet length
- whether you tend to prefix bullets with category labels like `Architecture:` or `Leadership:`
- common short prefixes used in your summaries

What it does not currently do:

- store a full copy of your writing in a database
- ship with sample writing for you
- automatically redact sensitive values in exported external-LLM prompt packages

To build or refresh the style profile after adding your own weekly/monthly samples:

```bash
npm run dev -- voice profile
```

This writes:

- `cache/style-profile.json`

If you want stronger style matching, add more real weekly/monthly summaries into the sample folders above before running `voice profile`.

## Customizing The App
Most customization happens in two places:

1. `config/config.yaml`
2. `templates/*.md`

Use `config/config.yaml` when you want to change behavior:

- `paths.*`: move where notes, drafts, finals, reports, or cache files live.
- `llm.model`: switch the default Ollama model.
- `llm.temperature` and `llm.max_tokens`: tighten or loosen generation behavior.
- `voice.sample_dirs`: choose which folders count as your sample writing.
- `voice.profile_path`: choose where the derived style profile is stored.
- `prompting.sample_writing_limit`: cap how many sample writing files are inserted into prompts.
- `prompting.remember_rules`: strict rules appended to the end of weekly and monthly prompts.
- `categories`: change the fixed category list used by the app.
- `attendance.values`: define allowed attendance values.
- `tasks.open_marker` and `tasks.done_marker`: change checkbox markers if you use a different format.
- `tags.input_mode`: control whether tags are expected in frontmatter, inline, or both.

Use `templates/*.md` when you want to change output shape:

- `templates/daily.md`: change the default daily note structure created by scaffolding commands.
- `templates/weekly.md`: change the weekly headings, ordering, or placeholder layout.
- `templates/monthly.md`: change the monthly headings and recap structure.

Current template placeholders:

- `templates/daily.md`: `{{DATE}}`
- `templates/weekly.md`: `{{FRIDAY}}`, `{{TASKS_FROM_LAST_WEEK}}`, `{{KEY_OUTCOMES}}`, `{{FIRES_PREVENTED}}`, `{{CROSS_TEAM_IMPACT}}`, `{{ATTENDANCE_SUMMARY}}`, `{{NEXT_WEEK_TASKS}}`
- `templates/monthly.md`: `{{MONTH}}`, `{{TOP_OUTCOMES}}`, `{{FIRES}}`, `{{IMPACT}}`, `{{RISKS}}`, `{{NEXT_FOCUS}}`

Customization examples:

- Want your notes somewhere else: change `paths.daily_notes_dir`, `paths.weekly_notes_dir`, and `paths.monthly_notes_dir`.
- Want stronger voice matching: add more of your real weekly/monthly summaries into the folders listed in `voice.sample_dirs`, then run `npm run dev -- voice profile`.
- Want a different weekly format: edit `templates/weekly.md` and keep the required placeholders.
- Want different attendance labels like `vacation` or `pto`: update `attendance.values` and then use those values in daily frontmatter.
- Want to use Copilot or another external AI instead of Ollama for a specific run: use `--export-prompt` on weekly or monthly generation.

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
worklog generate weekly --friday 2026-02-20 --export-prompt
worklog generate monthly --month 2026-01
worklog generate monthly --month 2026-01 --export-prompt
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

prompting:
  sample_writing_limit: 2
  remember_rules:
    - Be factual.
    - Use action verbs.
    - Include system, tool, and people names.
    - Categorize appropriately (DevOps, Development, Architecture, Leadership, Training).
    - Keep bullets concise but impactful.

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
3. Mode C: Docker development container.

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

If `worklog` is not found after `npm link`, add npm's global executable location to PATH.

macOS (zsh):
1. Find npm global prefix:
   - `npm config get prefix`
2. Add the prefix `bin` folder to PATH in `~/.zshrc`:
   - `export PATH="$PATH:$(npm config get prefix)/bin"`
3. Reload shell:
   - `source ~/.zshrc`
4. Verify:
   - `worklog --help`

Windows (PowerShell):
1. Find npm global prefix:
   - `npm config get prefix`
2. The value returned by that command is the folder that should contain `worklog.cmd` after `npm link`.
   - On most Windows installs this is `C:\Users\<you>\AppData\Roaming\npm`
3. Add that folder to user PATH if it is not already present:
   - `$prefix = npm config get prefix`
   - `[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$prefix", "User")`
4. Open a new terminal and verify:
   - `worklog --help`

### Mode C: Docker Development Container
Use this mode when you do not want to install Node/npm on the host, or you want a consistent dev environment across machines.

What is included:

- `Dockerfile.dev` for the Node-based dev image
- `compose.yaml` for running the app in a long-lived dev container
- `.devcontainer/devcontainer.json` for editor/devcontainer support

Start the container:

```bash
docker compose up -d --build
```

Run commands inside the container:

```bash
docker compose exec worklog npm run dev -- validate
docker compose exec worklog npm run dev -- generate dailies --friday 2026-02-20
docker compose exec worklog npm run dev -- generate weekly --friday 2026-02-20
```

Run one-off commands without attaching to the long-lived container:

```bash
docker compose run --rm worklog npm run dev -- validate
```

Stop the container:

```bash
docker compose down
```

Ollama note:

- The compose setup sets `WORKLOG_OLLAMA_ENDPOINT=http://host.docker.internal:11434/api/generate` so the container can talk to an Ollama instance running on the host.
- If your Ollama endpoint is different, update the environment value in `compose.yaml`.

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
10. Export a weekly prompt package for another LLM:
   ```bash
   npm run dev -- generate weekly --friday 2026-02-20 --export-prompt
   ```
   This writes a markdown prompt package under `drafts/prompts/weekly/`.
11. Generate monthly draft:
   ```bash
   npm run dev -- generate monthly --month 2026-02
   ```
12. Export a monthly prompt package for another LLM:
   ```bash
   npm run dev -- generate monthly --month 2026-02 --export-prompt
   ```
   This writes a markdown prompt package under `drafts/prompts/monthly/`.
13. Attendance reports:
   ```bash
   npm run dev -- report attendance --week 2026-02-20
   npm run dev -- report attendance --month 2026-02
   npm run dev -- report attendance --from 2026-02-01 --to 2026-02-20
   ```
14. Approve drafts:
   ```bash
   npm run dev -- approve weekly --friday 2026-02-20
   npm run dev -- approve monthly --month 2026-02
   ```

If you are using Docker Mode instead of installing Node locally, replace `npm run dev -- ...` with `docker compose exec worklog npm run dev -- ...`.

## External LLM Prompt Export
Use prompt export when:

- Ollama is unavailable.
- The local model is not following the template well enough.
- You want to paste a prepared prompt into Copilot or another external AI tool.

Prompt packages are written to files instead of only printing to the terminal so you can review or redact sensitive work details before sending them, avoid copy/paste mistakes, and keep a reusable record of what was sent.

Security note:

- This repo should be treated as private.
- Generated notes, prompt packages, finals, reports, and cache files may contain sensitive internal work details.
- Review exported prompt packages before sending them to any external AI service.

What exported weekly prompt packages include:

- instructions telling the external LLM to create a markdown file with the correct weekly filename
- the weekly template
- your current week source notes from `notes/daily`
- sample writing from the configured `voice.sample_dirs`
- voice/style constraints derived from your writing

What exported monthly prompt packages include:

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
- Review and edit draft.
- Approve via command (`worklog approve ...`) which:
  - sets metadata `approved: true`
  - copies file into `final/`
  - appends an audit event into `cache/index.json` under `approvals`

## Notes
- Outlook integration is intentionally excluded in V1 because meeting data is manually curated and more accurate in notes.
- Reporting is built from markdown + generated cache index (no DB required in V1).
