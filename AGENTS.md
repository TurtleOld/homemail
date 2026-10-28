## Code comments

- Do not comment self-explanatory code. Comment only the why the code cannot show.
- Write comments in English.
- Document functions, classes and modules with Google-style docstrings.

## Workflow

Work on a ticket/issue follows the chain `/implement` → `/ponytail-review` → `/pr`.

Write PR descriptions in Russian.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`TurtleOld/homemail`), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
