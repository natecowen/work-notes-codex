# V1 Delivery Plan

## Constraints Locked
- Runtime: TypeScript CLI (Node 20+)
- LLM: Ollama local models
- Source of truth: Markdown files
- Daily files: one per date
- Weekly filename: Friday date + `-ISOWeek.md`
- Monthly filename: `YYYY-MM-Monthly.md`
- Attendance: M-F only
- Missing day handling: warn, do not fail
- Monthly generation source: weekly markdown files
- Categories: fixed
- Approval: command + metadata

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
- Carry unfinished daily tasks into weekly "Tasks from Last Week".
- Generate weekly draft in `drafts/weekly/`.

5. Monthly Generator
- Resolve month.
- Read weekly files in month.
- Build fixed-category monthly summary.
- Generate draft in `drafts/monthly/`.

6. Attendance Reports
- Weekly/monthly/custom range commands.
- Aggregate counts by attendance type.
- Output markdown report to `reports/attendance/`.

7. Approval Workflow
- `approve weekly` and `approve monthly` commands.
- Set `approved: true` metadata.
- Promote to `final/`.
- Write approval audit to cache index.

8. Voice Tuning
- Add style-profile builder from sample docs.
- Inject style constraints (`facts_only`, concise, direct).
- Add deterministic generation defaults.

## Command Spec (Initial)
- `worklog init`
- `worklog validate`
- `worklog index`
- `worklog voice profile`
- `worklog generate daily --date YYYY-MM-DD [--overwrite]`
- `worklog generate dailies --friday YYYY-MM-DD [--overwrite]`
- `worklog generate weekly --friday YYYY-MM-DD`
- `worklog generate monthly --month YYYY-MM`
- `worklog report attendance --week YYYY-MM-DD`
- `worklog report attendance --month YYYY-MM`
- `worklog report attendance --from YYYY-MM-DD --to YYYY-MM-DD`
- `worklog approve weekly --friday YYYY-MM-DD`
- `worklog approve monthly --month YYYY-MM`

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
  - approve flow draft->final promotion

## Definition of Done (V1)
- Daily scaffolding commands generate single day and full workweek files from template.
- Generate weekly and monthly drafts from markdown with Ollama.
- Attendance reports for week/month/custom ranges.
- Carry-forward tasks include all open tasks by default.
- Approvals work through both metadata and command.
- Voice profile is generated from sample notes and injected into generation prompts.
- README includes runnable setup and commands.
