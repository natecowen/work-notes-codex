# External LLM Prompt Package: Monthly Summary

Use this prompt in another LLM when local generation is unavailable or not good enough.

## Instructions For The LLM
Create exactly one markdown file named `2026-02-Monthly.md`.
Return only the markdown file contents. Do not include commentary, explanation, or code fences around the final answer.
If the UI supports file export or download, make the result a downloadable markdown file with that file name.
Preserve the monthly template structure and headers exactly.
Voice constraints:
- Facts only. No hype, no fluff, no motivational tone.
- Use concise bullets and direct statements.
- Target average bullet length around 12 words.
- Use plain factual bullets without extra narrative framing.
- Do not invent accomplishments, outcomes, or blockers.
- Keep wording practical and concrete.
Use the weekly summaries below as the source of truth.
Use the sample writing only for tone and phrasing, not as factual source material.
Do not invent accomplishments, blockers, or risks.

## Target Month
Month: 2026-02

## Monthly Template
```md
---
month: {{MONTH}}
approved: false
---

# {{MONTH}} Monthly Recap

1. Top Outcomes:
{{TOP_OUTCOMES}}

2. Problems Solved / Fires Prevented
{{FIRES}}

3. Cross-Team Impact & Leadership
{{IMPACT}}

4. Risks & Blockers
{{RISKS}}

5. Next Month Focus
{{NEXT_FOCUS}}
```

## Sample Writing
## Sample Writing 1
Source: final/monthly/2026-02-Monthly.md

```md
---
month: 2026-02
approved: true
---

# 2026-02 Monthly Recap
```

## Sample Writing 2
Source: final/weekly/2026-02-20-ISOWeek.md

```md
---
week_friday: 2026-02-20T00:00:00.000Z
approved: true
---

# Week of: 2026-02-20
```

## Source Weekly Notes
