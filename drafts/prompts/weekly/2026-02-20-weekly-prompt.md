# External LLM Prompt Package: Weekly Summary

Use this prompt in another LLM when local generation is unavailable or not good enough.

## Instructions For The LLM
Create exactly one markdown file named `2026-02-20-ISOWeek.md`.
Return only the markdown file contents. Do not include commentary, explanation, or code fences around the final answer.
If the UI supports file export or download, make the result a downloadable markdown file with that file name.
Preserve the weekly template structure and headers exactly.
Voice constraints:
- Facts only. No hype, no fluff, no motivational tone.
- Use concise bullets and direct statements.
- Target average bullet length around 12 words.
- Use plain factual bullets without extra narrative framing.
- Do not invent accomplishments, outcomes, or blockers.
- Keep wording practical and concrete.
Use the daily notes below as the source of truth.
Use the sample writing only for tone and phrasing, not as factual source material.
Do not invent meetings, outcomes, risks, or blockers.

## Target Week
Friday date: 2026-02-20
Monday date: 2026-02-16

## Attendance Summary
- Office: 5
- WFH: 0
- Holiday: 0
- Sick: 0
- Vacation: 0

## Weekly Template
```md
---
week_friday: {{FRIDAY}}
approved: false
---

# Week of: {{FRIDAY}}

Task list from last Week:
{{TASKS_FROM_LAST_WEEK}}

Work (Facts Only):
Key outcomes shipped/delivered:
{{KEY_OUTCOMES}}

Problems solved / fires prevented:
{{FIRES_PREVENTED}}

Cross-team impact:
{{CROSS_TEAM_IMPACT}}

Attendance Summary:
{{ATTENDANCE_SUMMARY}}

Task list for Next Week (Max 3)
{{NEXT_WEEK_TASKS}}
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

## Source Daily Notes

## Source 1
Path: /Users/ncowen/repos/Work-Notes-Codex/notes/daily/2026/2026-02-16.md

```md
---
date: 2026-02-16
attendance: office
tags: []
approved: false
---

# Day: 2026-02-16

Meetings:
- 

Work:
- Architecture/Devops:
- Leadership/Training:
- Personal:

Notes:
Task list for tomorrow:
- [ ]
```

## Source 2
Path: /Users/ncowen/repos/Work-Notes-Codex/notes/daily/2026/2026-02-17.md

```md
---
date: 2026-02-17
attendance: office
tags: []
approved: false
---

# Day: 2026-02-17

Meetings:
- 

Work:
- Architecture/Devops:
- Leadership/Training:
- Personal:

Notes:
Task list for tomorrow:
- [ ]
```

## Source 3
Path: /Users/ncowen/repos/Work-Notes-Codex/notes/daily/2026/2026-02-18.md

```md
---
date: 2026-02-18
attendance: office
tags: []
approved: false
---

# Day: 2026-02-18

Meetings:
- 

Work:
- Architecture/Devops:
- Leadership/Training:
- Personal:

Notes:
Task list for tomorrow:
- [ ]
```

## Source 4
Path: /Users/ncowen/repos/Work-Notes-Codex/notes/daily/2026/2026-02-19.md

```md
---
date: 2026-02-19
attendance: office
tags: []
approved: false
---

# Day: 2026-02-19

Meetings:
- 

Work:
- Architecture/Devops:
- Leadership/Training:
- Personal:

Notes:
Task list for tomorrow:
- [ ]
```

## Source 5
Path: /Users/ncowen/repos/Work-Notes-Codex/notes/daily/2026/2026-02-20.md

```md
---
date: 2026-02-20
attendance: office
tags: []
approved: false
---

# Day: 2026-02-20

Meetings:
- 

Work:
- Architecture/Devops:
- Leadership/Training:
- Personal:

Notes:
Task list for tomorrow:
- [ ]
```
