# __NAME__

Made by claude-setup's `new-project` workflow (`"kind": "game"`). Rules live in yverse-studio/claude-setup
(`CLAUDE.md`, `game-3d` and `publish` skills): a thread without that repo adds it with `add_repo` and
reads its `CLAUDE.md` first, then `game-3d`.

- Layout and tests: `game-3d` sections 2 and 4. Rules stay in `src/rules.ts` with no renderer import.
- Deploys: Workers Builds builds every push with `npm run check && npm run build`; `main` goes live,
  other branches get a Worker Preview. No keys in git or GitHub. `/api/config` returns the built `commit`.
- Every asset gets a row in `assets/manifest.json` (`game-3d` section 3).
