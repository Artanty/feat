## Rules

1. **On every session start** — read `DECISIONS.md` to understand prior decisions and context.
2. **Before every code action** — write the planned next steps in `DECISIONS.md`.
3. **After every code action** — write progress/results in `DECISIONS.md`.
4. **Server lifecycle** — if I start the Flask app for dev, **stop it when the task is done**.
5. **Rotate `DECISIONS.md` when it gets too big** — explicitly flag it to the user; at ~250
   lines move everything except the current thread into `DECISIONS-archive.md` and leave a
   one-line pointer in `DECISIONS.md`. Never delete history.

## Guidelines

- Prefer editing existing files over creating new ones.
- New feature version = new `features/<feature>/v<n>/` dir — never edit a published version
  in place (all versions must stay accessible simultaneously).
- Do not commit unless explicitly asked.
- Follow existing code conventions and style.
