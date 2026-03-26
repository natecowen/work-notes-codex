---
name: ollama-integration-test
description: Run repeatable Ollama-backed integration tests for Work Notes Codex weekly and monthly generation using disposable workspaces under /tmp. Use when validating prompt construction, real model output formatting, config-driven work categories, daily-to-weekly behavior, weekly-to-monthly behavior, or post-processing fixes without touching real notes.
---

# Ollama Worklog Integration Test

Create a disposable workspace under `/tmp`, populate it with fake notes, run the real CLI against Ollama, inspect prompt and output artifacts, then remove the workspace.

Keep the test isolated from the user's real `notes/` and `drafts/` folders.

## Build First

From the repo root, build the app before running the integration test:

```bash
npm run build
```

Use `node dist/cli.js ...` for the real integration run so the test exercises the built app.

## Choose The Test Type

Pick one of these flows:

- `daily-to-weekly`: Create fake daily notes for one work week and run `generate weekly --friday YYYY-MM-DD`.
- `weekly-to-monthly`: Create fake approved weekly notes for one month and run `generate monthly --month YYYY-MM`.

If the user is checking category behavior, prefer `daily-to-weekly`.

If the user is checking monthly aggregation, prefer `weekly-to-monthly`.

## Create The Disposable Workspace

Create a temp directory under `/tmp`, then create the app folder structure inside it:

```text
config/
templates/
notes/daily/YYYY/
notes/weekly/YYYY/
notes/monthly/YYYY/
drafts/weekly/
drafts/monthly/
drafts/prompts/weekly/
drafts/prompts/monthly/
cache/
reports/
```

Copy these files from the real repo into the disposable workspace:

- `config/config.yaml`
- `templates/daily.md`
- `templates/weekly.md`
- `templates/monthly.md`

## Align Config To The Test

Treat `config/config.yaml` in the disposable workspace as the source of truth for the fake data.

For category-sensitive tests:

1. Read `daily.sections.work.categories`.
2. Make the fake daily or weekly notes use exactly those category labels.
3. If the user wants to simulate a different config than the local repo currently has, edit only the disposable config to match the intended categories.

Do not assume fallback categories.

## Populate Fake Notes

### Daily-To-Weekly

Create five fake daily notes for Monday through Friday.

Use realistic markdown that matches the daily parser:

- `## Meetings:`
- `## Work:`
- `### <Configured Category>`
- `## Notes`
- `## Task list for tomorrow:`

Use concrete work bullets, meetings, and carry-forward tasks.

Use enough variety to test:

- multiple configured categories
- multiple tasks
- notes that could appear in `Problems solved / fires prevented`
- meetings that could appear in `Cross-team impact`

### Weekly-To-Monthly

Create approved weekly files under `notes/weekly/YYYY/`.

Use realistic weekly summaries with:

- `Task list from last Week:`
- `Work (Facts Only):`
- `Key outcomes shipped/delivered:`
- categorized weekly key outcomes such as `**Development/Coding:**`
- `Problems solved / fires prevented:`
- `Cross-team impact:`
- `Attendance Summary:`
- `Task list for Next Week (Max 3)`

Use multiple weekly files so monthly aggregation has enough material.

## Export The Prompt Package

Always export the prompt package before the live generation run.

Commands:

```bash
node dist/cli.js generate weekly --friday YYYY-MM-DD --export-prompt
node dist/cli.js generate monthly --month YYYY-MM --export-prompt
```

Inspect the prompt package and verify:

- the `Remember:` block is present
- category guidance reflects configured work categories
- the template block is present
- source notes are included
- sample writing is included when available

## Ollama Reachability

Assume the sandbox cannot reliably reach the user's local Ollama server on this repo.

Use the sandbox for:

- building the app
- creating the disposable workspace
- copying config and templates
- writing fake notes
- exporting the prompt package
- reading generated files

Use an outside-the-sandbox command with approval for the live Ollama generation unless the user explicitly wants to verify sandbox fallback behavior first.

If the user does want to verify fallback behavior, it is fine to try the sandbox run once, but treat an Ollama fetch failure as expected rather than surprising.

## Run The Live Ollama Generation

Run the real command against the disposable workspace:

```bash
node /abs/path/to/repo/dist/cli.js generate weekly --friday YYYY-MM-DD
node /abs/path/to/repo/dist/cli.js generate monthly --month YYYY-MM
```

Prefer requesting approval and running the live Ollama command outside the sandbox immediately.

Only run the live command in the sandbox first when one of these is true:

- the user explicitly asked to test sandbox behavior
- you are intentionally reproducing fallback handling

If a sandbox run is attempted and fails with a fetch or connection error, rerun outside the sandbox with approval and continue the integration test.

## Inspect The Output

Open the generated draft and check formatting first.

### Weekly Checks

Verify:

- `Work (Facts Only):` is present
- `Key outcomes shipped/delivered:` is present
- configured category headers appear only once each in the managed output
- no raw `### Category` headings leak into the weekly draft
- no `- None captured` appears when valid categorized work exists
- blank lines between major sections match the weekly template
- attendance and next-week tasks are present

Weekly failure patterns to call out explicitly:

- repeated category headers
- category headings rendered as bullets
- missing non-managed headings such as `Work (Facts Only):`
- compressed section spacing
- deterministic fallback used unexpectedly

### Monthly Checks

Verify:

- all five monthly sections are present
- no weekly category headers like `**DevOps:**` leak into monthly bullets
- no doubled bullets like `- - item`
- blank lines between major sections match the monthly template
- content is flattened into clean monthly bullets

Monthly failure patterns to call out explicitly:

- leaked weekly category headers
- doubled bullet markers
- missing section headings
- compressed section spacing
- fallback template used unexpectedly

## Report The Result

Summarize:

- which disposable workspace was used
- which command was run
- whether Ollama was reached successfully
- whether prompt construction looked correct
- whether output formatting looked correct
- any concrete defects found

If a defect is found, include the exact generated lines that demonstrate it and identify whether the problem is:

- config mismatch
- parser issue
- prompt issue
- validator gap
- post-processing gap
- Ollama formatting drift

## Clean Up

Delete the disposable workspace after inspection unless the user asks to keep it.

Use:

```bash
rm -rf /tmp/<workspace-name>
```

## Default Approach

When the user asks to "run an integration test" for this app:

1. Build the app.
2. Create a disposable workspace.
3. Copy config and templates.
4. Populate fake notes matching the configured categories.
5. Export the prompt package.
6. Run the live generation command through Ollama outside the sandbox with approval.
7. Inspect the prompt and generated markdown.
8. Report findings clearly.
9. Remove the disposable workspace.

## Example Prompts

- Run a daily-to-weekly Ollama integration test for this repo and verify category formatting.
- Run a weekly-to-monthly integration test with fake approved weekly notes and check for doubled bullets.
- Verify the prompt package and live weekly draft for my configured work categories.
- Reproduce the formatting bug in a disposable workspace and confirm the fix through Ollama.
