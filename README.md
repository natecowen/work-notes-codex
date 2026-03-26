# Work Notes Reporter

Local-first TypeScript CLI for turning daily markdown work notes into weekly and monthly summaries, attendance reports, and reviewable drafts. The overall goal is to keep daily capture lightweight while producing structured summaries you can approve and keep as your long-term record.

## Goals / V1 Scope
- Keep daily entry fast.
- Generate reviewable weekly and monthly markdown drafts from notes you already maintain.
- Keep markdown as the source of truth.
- Run locally with Ollama and no required external API.
- Require approval before finalized summaries move into `notes/`.

For detailed V1 scope, milestones, constraints, and initial command spec, see [docs/v1-plan.md](./docs/v1-plan.md).

## Recommended Workflow
1. Generate or create daily notes in `notes/daily`.
2. Fill them in during the week.
3. Validate and index your notes.
4. Generate a weekly draft into `drafts/weekly`.
5. Review and approve the weekly draft so it moves into `notes/weekly`.
6. Generate monthly drafts from approved weekly summaries.
7. Approve monthly drafts to move them into `notes/monthly`.

## File Layout
```yaml
work-notes-reporter:
  config:
    config.yaml: app configuration for paths, model settings, categories, attendance rules, and voice settings
  notes:
    daily:
      "YYYY/YYYY-MM-DD.md": main daily input files
    weekly:
      "YYYY/YYYY-MM-DD-ISOWeek.md": approved weekly summaries and monthly input
    monthly:
      "YYYY/YYYY-MM-Monthly.md": approved monthly summaries and archive
  templates:
    daily.md: daily note template
    weekly.md: weekly output template
    monthly.md: monthly output template
  drafts:
    weekly: generated weekly drafts waiting for review
    monthly: generated monthly drafts waiting for review
    prompts:
      weekly: exported weekly prompt packages for another LLM
      monthly: exported monthly prompt packages for another LLM
  reports:
    attendance: generated attendance reports
  cache:
    index.json: parsed daily-note index, validation errors, and approval audit trail
    style-profile.json: derived voice/style profile
  src:
    "*.ts": application source code
  dist:
    "*.js": compiled runtime output
```

You normally work directly in:

- `notes/daily` for day-to-day capture.
- `notes/weekly` and `notes/monthly` for finalized summaries.
- `templates` to change generated markdown structure.
- `config/config.yaml` to change app behavior.

The app mainly writes to:

- `drafts/*` for generated drafts and exported prompts.
- `reports/attendance` for attendance reports.
- `cache/*` for machine-readable artifacts.

## Naming Rules
- Daily: `YYYY-MM-DD.md`
- Weekly: `YYYY-MM-DD-ISOWeek.md` where the date is that week's Friday
- Monthly: `YYYY-MM-Monthly.md`

## Quick Setup
The recommended mode is project-local commands via `npm run dev -- ...`.

1. Install Node 20+.
2. Install and run Ollama locally.
3. Pull your preferred model, for example `ollama pull llama3.1:8b`.
4. Install dependencies with `npm install`.
5. Validate the workspace with `npm run dev -- validate`.
6. Build a style profile with `npm run dev -- voice profile` after you have sample weekly/monthly summaries.

Common commands:

```bash
npm run dev -- validate
npm run dev -- generate daily --date 2026-02-18
npm run dev -- generate dailies --friday 2026-02-20
npm run dev -- generate weekly --friday 2026-02-20 --export-prompt
npm run dev -- generate weekly --friday 2026-02-20 --debug
npm run dev -- generate weekly --friday 2026-02-20
npm run dev -- generate monthly --month 2026-02 --debug
npm run dev -- generate monthly --month 2026-02
npm run dev -- approve weekly --friday 2026-02-20
```

For full setup instructions, alternate run modes, Docker usage, and a more complete command guide, see [docs/setup-and-run-modes.md](./docs/setup-and-run-modes.md) and [docs/cli-reference.md](./docs/cli-reference.md).

## Configuration And Templates
Most customization happens in `config/config.yaml` and `templates/*.md`.

Key configuration areas:

- `paths.*` to move notes, drafts, reports, templates, and cache locations.
- `llm.*` to control Ollama model and generation behavior.
- `voice.*` to define sample-writing folders and style-profile output.
- `prompting.*` to control sample-writing inclusion and reminder rules.
- `categories`, `attendance`, `tasks`, and `tags` to shape parsing and reporting behavior.

Template placeholders and `SECTION` directives control how scaffolded and generated markdown is rendered. For the full config example, placeholder reference, and template customization details, see [docs/configuration-and-templates.md](./docs/configuration-and-templates.md).

## Generation Rules
Daily notes use frontmatter for machine-readable metadata. Weekly generation reads Monday through Friday daily files and warns on missing days. Monthly generation reads weekly files in the target month. Approval is explicit: drafts are reviewed first, then moved into `notes/weekly` or `notes/monthly` only after approval.

Voice/style matching is derived from your own weekly and monthly samples, typically in `notes/weekly` and `notes/monthly`. External prompt export is available when you want to generate from another LLM instead of Ollama for a given run. Debug mode is available on weekly and monthly generation when you want the draft to include the exact Ollama prompt, raw response, and validation outcome.

For the daily markdown contract, weekly/monthly section semantics, style-profile behavior, approval flow, and prompt export details, see [docs/generation-rules.md](./docs/generation-rules.md).

## Documentation
- [V1 plan](./docs/v1-plan.md)
- [Setup and run modes](./docs/setup-and-run-modes.md)
- [CLI reference](./docs/cli-reference.md)
- [Configuration and templates](./docs/configuration-and-templates.md)
- [Generation rules](./docs/generation-rules.md)
- [Daily-to-weekly verification](./docs/daily-to-weekly-verification.md)
- [Future enhancements](./docs/future-enhancements.md)

## Notes
- Outlook integration is intentionally excluded in V1 because meeting data is manually curated and more accurate in notes.
- Reporting is built from markdown plus generated cache index; no database is required in V1.
