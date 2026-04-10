# Remote Tasks — Copiar-pegar en claude.ai/code/scheduled

## Task 1: Morning Briefing (6:00 AM diario)

**Nombre:** Morning Briefing Bodega
**Repo:** Buleje/Mercado
**Branch:** feature/td018-float-to-decimal
**Schedule:** Every day at 6:00 AM
**Prompt:**
```
Read the project's CLAUDE.md and docs/ROADMAP-24-WEEKS.md. Check git log for recent commits. Read .claude/session-state.json for pending tasks from last session. Scan for any lint or type errors with npm run lint and npx tsc --noEmit. If there are errors, fix them automatically. Generate a brief morning report with: 1) What was done yesterday 2) What's pending 3) Top 3 priorities for today from Sprint 2. Save the report to docs/daily-reports/YYYY-MM-DD.md.
```

## Task 2: Nightly Code Audit (2:00 AM diario)

**Nombre:** Nightly Audit
**Repo:** Buleje/Mercado
**Branch:** feature/td018-float-to-decimal
**Schedule:** Every day at 2:00 AM
**Prompt:**
```
Run full verification: npm run lint, npx tsc --noEmit, npm run test. If any fail, attempt to fix automatically (max 3 attempts per error). Check for security vulnerabilities with npm audit. Scan for TODO/FIXME markers. Generate audit report. If all checks pass and there are fixes, create a commit with message "fix: nightly auto-fix [date]" and push.
```

## Task 3: Weekly Sprint Review (Domingos 8:00 PM)

**Nombre:** Weekly Sprint Review
**Repo:** Buleje/Mercado
**Branch:** feature/td018-float-to-decimal
**Schedule:** Every Sunday at 8:00 PM
**Prompt:**
```
Analyze all commits from the past week with git log --since="7 days ago". Read ROADMAP-24-WEEKS.md Sprint 2 section. Calculate: items completed vs planned, test coverage delta, new ADRs created, tech debt resolved. Generate a weekly sprint review in docs/sprint-reviews/week-YYYY-WW.md with metrics, accomplishments, and recommendations for next week.
```
