# Work Notes Reporter

Local-first TypeScript CLI for turning daily markdown work notes into weekly and monthly summaries, attendance reports, and compact prompt packages. The overall goal is to keep daily capture lightweight while producing structured summaries you can review and keep as your long-term record.

## Goals / V1 Scope
- Keep daily entry fast.
- Generate reviewable weekly and monthly markdown summaries from notes you already maintain.
- Keep markdown as the source of truth.
- Run locally with Ollama and no required external API.
- Write normal weekly and monthly summaries directly into `notes/` with `approved: false`.

For detailed V1 scope, milestones, constraints, and initial command spec, see [docs/v1-plan.md](./docs/v1-plan.md).

## Recommended Workflow
1. Generate or create daily notes in `notes/daily`.
2. Fill them in during the week.
3. Validate and index your notes.
4. Run the weekly workflow, which writes the summary directly into `notes/weekly` with `approved: false`.
5. Review the weekly note and manually adjust task sections using the `Task Review` appendix.
6. Run the monthly workflow, which writes the recap directly into `notes/monthly` with `approved: false`.

## File Layout
```yaml
work-notes-reporter:
  config:
    config.yaml: app configuration for paths, model settings, categories, attendance rules, and voice settings
  notes:
    daily:
      "YYYY/MM-MonthName/YYYY-MM-DD.md": main daily input files
    weekly:
      "YYYY/YYYY-MM-DD-W##.md": weekly summaries and monthly input
    monthly:
      "YYYY/YYYY-MM-Monthly.md": monthly summaries and archive
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
    index.json: parsed daily-note index and validation errors
    style-profile.json: derived voice/style profile
  src:
    "*.ts": application source code
  dist:
    "*.js": compiled runtime output
```

You normally work directly in:

- `notes/daily` for day-to-day capture.
- `notes/weekly` and `notes/monthly` for generated summaries.
- `templates` to change generated markdown structure.
- `config/config.yaml` to change app behavior.

The app mainly writes to:

- `drafts/*` for compatibility drafts and exported prompts.
- `reports/attendance` for attendance reports.
- `cache/*` for machine-readable artifacts.

## Naming Rules
- Daily: `YYYY/MM-MonthName/YYYY-MM-DD.md`
- Weekly: `YYYY/YYYY-MM-DD-W##.md` where the date is that week's Friday and `W##` is the two-digit ISO week number
- Monthly: `YYYY-MM-Monthly.md`

## Quick Setup
The recommended mode is project-local commands via `npm run dev -- ...`.

1. Install Node 20+.
2. Install and run Ollama locally.
3. Pull your preferred model, for example `ollama pull llama3.1:8b`.
4. Install dependencies with `npm install`.
5. Validate the workspace with `npm run dev -- validate`.
6. Build a style profile with `npm run dev -- voice profile` after you have sample weekly/monthly summaries.

## Which Command Should I Run?

Use `run` for the normal workflow. These commands use Ollama when available, write directly into `notes/`, set `approved: false`, and refuse to overwrite an existing note unless you pass `--overwrite`.

```bash
npm run dev -- generate daily --date 2026-02-18
npm run dev -- generate dailies --friday 2026-02-20
npm run dev -- run weekly --friday 2026-02-20
npm run dev -- run monthly --month 2026-02
```

Run them in this order:

1. `generate daily` creates one daily note.
2. `generate dailies` creates the Monday-Friday daily files for a week.
3. `run weekly` reads that week's dailies, sends a compact summary prompt to Ollama, and writes `notes/weekly/YYYY/YYYY-MM-DD-W##.md`.
4. `run monthly` reads weekly notes for the month, sends a compact monthly prompt to Ollama, and writes `notes/monthly/YYYY/YYYY-MM-Monthly.md`.

Use prompt export when you want Copilot or another external model to generate the note instead of Ollama. These commands only write prompt packages under `drafts/prompts/`; they do not create weekly or monthly notes.

```bash
npm run dev -- generate weekly --friday 2026-02-20 --export-prompt
npm run dev -- generate monthly --month 2026-02 --export-prompt
```

Use these support commands when needed:

```bash
npm run dev -- validate
npm run dev -- voice profile
```

- `validate` parses notes and refreshes `cache/index.json`.
- `voice profile` rebuilds compact voice examples from your approved summaries.
- `generate weekly` and `generate monthly` require `--export-prompt`; local LLM note generation lives under `run`.

For full setup instructions, alternate run modes, Docker usage, and a more complete command guide, see [docs/setup-and-run-modes.md](./docs/setup-and-run-modes.md) and [docs/cli-reference.md](./docs/cli-reference.md).

## Configuration And Templates
Most customization happens in `config/config.yaml` and `templates/*.md`.

Key configuration areas:

- `paths.*` to move notes, drafts, reports, templates, and cache locations.
- `llm.*` to control Ollama model and generation behavior.
- `voice.*` to define sample-writing folders and style-profile output.
- `prompting.*` to control reminder rules.
- `categories`, `attendance`, `tasks`, and `tags` to shape parsing and reporting behavior.

Template placeholders and `SECTION` directives control how scaffolded and generated markdown is rendered. For the full config example, placeholder reference, and template customization details, see [docs/configuration-and-templates.md](./docs/configuration-and-templates.md).

## Generation Rules
Daily notes use frontmatter for machine-readable metadata. Weekly generation reads Monday through Friday daily files and warns on missing days. Monthly generation reads weekly files in the target month. The preferred `run weekly` and `run monthly` commands write directly into `notes/weekly` and `notes/monthly` with `approved: false`; existing files are not overwritten unless `--overwrite` is passed.

Voice/style matching is derived from your own weekly and monthly samples, typically in `notes/weekly` and `notes/monthly`. External prompt export is available when you want to generate from another LLM instead of Ollama for a given run. Debug mode is available on weekly and monthly generation when you want the draft to include the exact Ollama prompt, raw response, and validation outcome.

For the daily markdown contract, weekly/monthly section semantics, style-profile behavior, and prompt export details, see [docs/generation-rules.md](./docs/generation-rules.md).

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
