# CLI Reference

The CLI can be run as `worklog ...` if globally linked, or as `npm run dev -- ...` from the repo root.

> Note: If using the CLI `worklog` command you will need to run `npm run build` to get the latest changes (after pulling them with git).

## Core Commands

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

## Command Groups

### Workspace Setup
- `worklog init`

### Validation And Indexing
- `worklog validate`
- `worklog index`

### Voice Profile
- `worklog voice profile`

### Daily Note Generation
- `worklog generate daily --date YYYY-MM-DD`
- `worklog generate dailies --friday YYYY-MM-DD`

Use `generate dailies` when you want a Monday through Friday set derived from a Friday date.

### Weekly And Monthly Draft Generation
- `worklog generate weekly --friday YYYY-MM-DD`
- `worklog generate weekly --friday YYYY-MM-DD --export-prompt`
- `worklog generate monthly --month YYYY-MM`
- `worklog generate monthly --month YYYY-MM --export-prompt`

### Attendance Reports
- `worklog report attendance --week YYYY-MM-DD`
- `worklog report attendance --month YYYY-MM`
- `worklog report attendance --from YYYY-MM-DD --to YYYY-MM-DD`

### Approval Commands
- `worklog approve weekly --friday YYYY-MM-DD`
- `worklog approve monthly --month YYYY-MM`

## Typical Command Flow
1. `npm run dev -- validate` to parse notes, check required fields, and refresh `cache/index.json`
2. `npm run dev -- index` to rebuild the machine-readable note index without running full validation flow
3. `npm run dev -- voice profile` to derive the style profile from your sample weekly and monthly summaries
4. `npm run dev -- generate weekly --friday YYYY-MM-DD`
5. Review the draft in `drafts/weekly`
6. `npm run dev -- approve weekly --friday YYYY-MM-DD`

## Prompt Export Commands
Use prompt export when:

- Ollama is unavailable.
- The local model is not following the template well enough.
- You want to paste a prepared prompt into Copilot or another external AI tool.

Prompt packages are written to files instead of only printing to the terminal so you can review or redact sensitive work details before sending them.

Output locations:

- Weekly prompt package: `drafts/prompts/weekly/YYYY-MM-DD-weekly-prompt.md`
- Monthly prompt package: `drafts/prompts/monthly/YYYY-MM-monthly-prompt.md`

## Approval Behavior
Approving a draft:

- sets metadata `approved: true`
- moves the file into `notes/weekly` or `notes/monthly`
- appends an approval audit event into `cache/index.json` under `approvals`
