# Configuration And Templates

Most customization happens in:

1. `config/config.yaml`
2. `templates/*.md`

Use the config file to change app behavior. Use templates to change the rendered markdown structure.

## Config Reference

```yaml
version: 1
paths:
  daily_notes_dir: notes/daily
  weekly_notes_dir: notes/weekly
  monthly_notes_dir: notes/monthly
  templates_dir: templates
  drafts_dir: drafts
  reports_dir: reports
  cache_dir: cache

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

## What To Change In `config/config.yaml`
- `paths.*`: move where notes, drafts, templates, reports, or cache files live.
- `llm.model`: switch the default Ollama model.
- `llm.temperature` and `llm.max_tokens`: tighten or loosen generation behavior.
- `voice.sample_dirs`: choose which folders count as sample writing.
- `voice.profile_path`: choose where the style profile is stored.
- `prompting.sample_writing_limit`: cap how many sample files are inserted into prompts.
- `prompting.remember_rules`: append strict reminder rules to weekly and monthly prompts.
- `categories`: change the fixed category list used by the app.
- `attendance.values`: define allowed attendance values.
- `tasks.open_marker` and `tasks.done_marker`: change checkbox markers if your notes use a different format.
- `tags.input_mode`: control whether tags are expected in frontmatter, inline, or both.

## Template Reference
- `templates/daily.md`: default daily note structure used by `generate daily` and `generate dailies`
- `templates/weekly.md`: weekly output template used during weekly generation
- `templates/monthly.md`: monthly output template used during monthly generation

Current placeholders:

- `templates/daily.md`: `{{DATE}}` and `{{SECTION ...}}`
- `templates/weekly.md`: `{{FRIDAY}}`, `{{TASKS_FROM_LAST_WEEK}}`, `{{KEY_OUTCOMES}}`, `{{FIRES_PREVENTED}}`, `{{CROSS_TEAM_IMPACT}}`, `{{ATTENDANCE_SUMMARY}}`, `{{NEXT_WEEK_TASKS}}`
- `templates/monthly.md`: `{{MONTH}}`, `{{TOP_OUTCOMES}}`, `{{FIRES}}`, `{{IMPACT}}`, `{{RISKS}}`, `{{NEXT_FOCUS}}`

## Daily Template `SECTION` Directives
- `{{SECTION id="meetings" label=true heading_level=2}}` renders the configured section label as a Markdown heading.
- `{{SECTION id="meetings"}}` renders default starter content for that section.
- `{{SECTION id="work" nested=true category_level=3}}` renders starter content for each configured work category as nested headings plus bullet placeholders.
- Supported `id` values come from `daily.sections[*].id` in `config/config.yaml`.
- `heading_level` controls the Markdown heading level for label directives.
- `category_level` controls the Markdown heading level for nested work categories.
- `nested=true` is currently meaningful for the `work` section and expands configured categories.

Example daily template:

```md
---
date: {{DATE}}
attendance: office
tags: []
approved: false
---

# Day: {{DATE}}

{{SECTION id="meetings" label=true heading_level=2}}:
{{SECTION id="meetings"}}

{{SECTION id="work" label=true heading_level=2}}:
{{SECTION id="work" nested=true category_level=3}}

{{SECTION id="notes" label=true heading_level=2}}
{{SECTION id="notes"}}

{{SECTION id="tasks_tomorrow" label=true heading_level=2}}:
{{SECTION id="tasks_tomorrow"}}
```

The intended split is:

- `config/config.yaml` defines which daily sections and categories exist, plus their labels.
- `templates/daily.md` defines markdown structure such as heading levels and spacing.
- The scaffold renderer combines both when `worklog generate daily` or `worklog generate dailies` creates files.

## Customization Examples
- Want your notes somewhere else: change `paths.daily_notes_dir`, `paths.weekly_notes_dir`, and `paths.monthly_notes_dir`.
- Want stronger voice matching: add more real weekly/monthly summaries into the folders listed in `voice.sample_dirs`, then run `npm run dev -- voice profile`.
- Want a different weekly format: edit `templates/weekly.md` and keep the required placeholders.
- Want different attendance labels like `vacation` or `pto`: update `attendance.values` and then use those values in daily frontmatter.
- Want to use Copilot or another external AI instead of Ollama for a specific run: use `--export-prompt` on weekly or monthly generation.
