## Gate

`bun run check` = typecheck + tests + generated-DSL drift + adapter probe + fallow
audit. Run before any commit; CI runs it.

## Decisions and measurements

- `docs/BUILD_PROMPT.md` — the v1 decisions and what is out of scope.
- `docs/adapter-findings.md` — what each renderer actually does, with the command that
  shows it. Supersedes the seed table in `docs/diagram-spec-bootstrap.md` §7.

## Agent skills

### Issue tracker

Issues and specs use GitHub Issues through `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five default states. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.
