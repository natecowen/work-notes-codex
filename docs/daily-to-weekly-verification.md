# Daily-To-Weekly Verification

Use this disposable-workspace flow when you need to verify weekly generation behavior without touching real notes.

## Setup
1. Build the app from the repo root: `npm run build`
2. Create a temp workspace under `/tmp`
3. Copy:
   - `config/config.yaml`
   - `templates/daily.md`
   - `templates/weekly.md`
   - `templates/monthly.md`
4. Create five fake daily notes for Monday through Friday in `notes/daily/YYYY/`

## Weekly Behaviors To Verify
- `Task list from last Week` uses carry-forward items already open on Monday.
- `Task list for Next Week (Max 3)` uses forward-looking tasks still open on Friday.
- `Problems solved / fires prevented` includes concrete fixes, remediations, incidents, or blockers addressed during the week.
- `Problems solved / fires prevented` excludes personal/admin-only cleanup unless it is clearly operational remediation.
- `Cross-team impact` preserves source meeting or collaboration wording and does not rewrite bullets into `Met with ...` phrases.
- Category headers in `Key outcomes shipped/delivered` remain bold section headers, not bullets.
- Weekly template spacing and non-managed headings stay intact.

## Suggested Command Sequence
1. `node dist/cli.js validate`
2. `node dist/cli.js generate weekly --friday YYYY-MM-DD --export-prompt`
3. `node dist/cli.js generate weekly --friday YYYY-MM-DD`

## Review Checklist
- Prompt package includes distinct carry-forward tasks, end-of-week tasks, fire lines, and collaboration lines.
- Weekly draft does not contain `Met with ...` artifacts for natural meeting bullets.
- Weekly draft does not place personal/admin cleanup into `Problems solved / fires prevented`.
- Weekly draft keeps `Task list from last Week` and `Task list for Next Week` materially different when the fixture implies different carry-in and carry-out tasks.
- Weekly draft preserves existing category formatting and section spacing.
