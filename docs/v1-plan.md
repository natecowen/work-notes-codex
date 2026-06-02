# V1 Delivery Plan

## Constraints Locked
- Runtime: TypeScript CLI (Node 20+)
- LLM: Ollama local models
- Source of truth: Markdown files
- Daily files: one per date under `notes/daily/YYYY/MM-MonthName/`
- Weekly filename: Friday date + padded ISO week, e.g. `YYYY-MM-DD-W12.md`
- Monthly filename: `YYYY-MM-Monthly.md`
- Attendance: M-F only
- Missing day handling: warn, do not fail
- Monthly generation source: weekly markdown files
- Categories: fixed
- Preferred workflow: write weekly/monthly notes directly with `approved: false`

## Milestones
1. Foundation
- Initialize TypeScript project.
- Add CLI framework and command scaffolding.
- Add config loader and schema validation.
- Add logging and error format.

2. Daily Scaffolding
- Add single-day file generation from template.
- Add workweek file generation (Mon-Fri) from Friday input date.
- Support safe default behavior (skip existing files unless overwrite is requested).

3. Parsing + Validation
- Parse daily markdown (frontmatter + sections).
- Parse task checkboxes and carry-forward state.
- Validate required fields (`date`, `attendance`).
- Build normalized JSON index in `cache/index.json`.

4. Weekly Generator
- Resolve target week from Friday date.
- Read Monday-Friday daily files.
- Warn on missing days and continue.
- Leave weekly task sections manual and append deterministic `Task Review` candidates.
- Generate weekly notes in `notes/weekly/`.

5. Monthly Generator
- Resolve month.
- Read weekly files in month.
- Build fixed-category monthly summary.
- Leave risks and next-month focus manual.
- Generate monthly notes in `notes/monthly/`.

6. Attendance Reports
- Weekly/monthly/custom range commands.
- Aggregate counts by attendance type.
- Output markdown report to `reports/attendance/`.

7. Direct Note Workflow
- `run weekly` and `run monthly` commands.
- Set generated note metadata to `approved: false`.
- Refuse to overwrite existing note files unless `--overwrite` is passed.

8. Voice Tuning
- Add style-profile builder from sample docs.
- Inject style constraints (`facts_only`, concise, direct).
- Add deterministic generation defaults.

9. External LLM Prompt Export
- Export weekly prompt packages containing combined daily evidence, the template, and instructions for another LLM.
- Export monthly prompt packages containing combined weekly evidence, the template, and instructions for another LLM.
- Write prompt packages under `drafts/prompts/weekly/` and `drafts/prompts/monthly/`.
- Support prompt export through CLI flags on weekly/monthly generation commands.

## Command Spec (Initial)
- `worklog init`
- `worklog validate`
- `worklog index`
- `worklog voice profile`
- `worklog generate daily --date YYYY-MM-DD [--overwrite]`
- `worklog generate dailies --friday YYYY-MM-DD [--overwrite]`
- `worklog generate weekly --friday YYYY-MM-DD --export-prompt`
- `worklog generate monthly --month YYYY-MM --export-prompt`
- `worklog run weekly --friday YYYY-MM-DD [--overwrite]`
- `worklog run monthly --month YYYY-MM [--overwrite]`
- `worklog report attendance --week YYYY-MM-DD`
- `worklog report attendance --month YYYY-MM`
- `worklog report attendance --from YYYY-MM-DD --to YYYY-MM-DD`

## Open Decisions
- Tag handling default:
  - Option A: frontmatter only
  - Option B: frontmatter + inline `#tags`
- Draft format:
  - Option A: full markdown draft
  - Option B: structured + rendered markdown

## Test Strategy
- Unit tests:
  - date window resolution
  - filename generation/parsing
  - markdown parser section extraction
  - attendance aggregation
  - task status carry-forward
- Integration tests:
  - weekly generation with missing day warnings
  - monthly generation from weekly docs
  - direct run flow writes notes and refuses overwrite

## Definition of Done (V1)
- Daily scaffolding commands generate single day and full workweek files from template.
- Generate weekly and monthly notes from markdown with Ollama.
- Export weekly and monthly prompt packages for use with an external LLM.
- Attendance reports for week/month/custom ranges.
- Weekly task sections stay manual with deterministic task candidates in `Task Review`.
- Direct note workflow works through metadata and command.
- Voice profile is generated from sample notes and injected into generation prompts.
- README includes runnable setup, customization guidance, folder purpose documentation, and external prompt export usage.
