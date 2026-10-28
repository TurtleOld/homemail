## Code comments

- Do not comment self-explanatory code. Comment only the why the code cannot show.
- Write comments in English.
- Document functions, classes and modules with Google-style docstrings.

## Workflow

Work on a ticket/issue follows the chain `/implement` → `/ponytail-review` → `/pr`. Load each step through the skill tool by that name and follow the loaded instructions.

- Base the branch on fresh `origin/main` (`git fetch origin main`, then rebase if `git merge-base HEAD origin/main` differs): local `main` is often stale.
- `/ponytail-review` covers the whole branch diff (`git diff origin/main...HEAD`) plus the code it touches.
- A step is done when `npm test` and `npx tsc --noEmit` pass.
- Commit messages: short, in Russian, with a conventional prefix (`fix(mail): …`).
- Write PR descriptions in Russian, in the `/pr` template, ending with `Closes #<N>`.
- Commits and PRs carry the author only: no AI attribution (Co-Authored-By, "Generated with", session links).
- Merging and issue labels stay with the owner.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`TurtleOld/homemail`), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
