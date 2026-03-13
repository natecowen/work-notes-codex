# Future Enhancements

This file tracks ideas discussed after the initial V1 scope. These items are not required for the current app to function, but they are good candidates for future iterations.

## Reliability And Guardrails
- Add a strict template validator and repair step so generated output is forced back into the required markdown structure.
- Add stronger source traceability so weekly and monthly bullets can point back to the daily or weekly notes they came from.
- Add model policy profiles such as `fast`, `balanced`, and `strict`.
- Add a `doctor` command to validate config, templates, folders, Ollama connectivity, and sample-writing coverage.

## Reporting And Workflow
- Add a one-command end-to-end flow such as `run weekly` to validate, index, generate, and surface the draft.
- Add richer tag and project rollups across days, weeks, and months.
- Add CSV export for attendance and summary rollups.
- Add trend reporting across months.
- Add confidence or "possible missing item" flags to catch likely omissions.

## Task And Review Support
- Add carry-forward conflict checks for tasks that remain open too long.
- Add a quality scorecard to track acceptance rate, edit rate, regeneration count, and time saved.
- Add redaction rules before sending content to any external AI.

## Data Sources
- Add fallback logic for monthly generation and monthly prompt export to read from `final/weekly` when `notes/weekly` is empty.
- Add optional Outlook or calendar integration later if automatic meeting ingest becomes useful and allowed.

## Engineering
- Add unit and integration tests for parsing, filename rules, approvals, attendance math, and template guardrails.
