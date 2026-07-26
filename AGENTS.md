# Agent instructions — BaresipUI

This repository (`LeeO86/baresipui`) is a fork of [`andyweiss/baresipui`](https://github.com/andyweiss/baresipui). Cloud agents use it to develop features and open **upstream feature requests / PRs**.

## Project layout

- **App**: Nuxt 3 + TypeScript + Tailwind + Socket.IO (`pages/`, `components/`, `server/`, port **3000**)
- **Baresip**: SIP softphone + TCP control interface under `baresip/` (control port **4444**)
- **Compose**: `compose.yaml` (prebuilt images) and `compose.build-from-source.yaml`

## Cursor Cloud specific instructions

### Environment (fork-only — do not upstream)

`.cursor/` and this `AGENTS.md` are **private to `LeeO86/baresipui`**. Never include them in PRs or patches to `andyweiss/baresipui`.

- Config: `.cursor/environment.json`
- Install clones upstream repos under `$HOME/upstream/` (override with `UPSTREAM_ROOT`):
  - `andyweiss-baresipui` — upstream UI (primary target for feature requests)
  - `baresip` / `re` — codec / library upstreams when a change spans the softphone
- After install: `npm run dev` serves the dashboard on `:3000`

**Dashboard alternative:** To keep the env entirely out of git, create a personal/team environment at [Cloud Agents → Environments](https://cursor.com/dashboard/cloud-agents#environments) (multi-repo: this fork + `andyweiss/baresipui`) and omit `.cursor/environment.json` from the repo.

### Local UI development (no SIP stack)

```bash
npm ci
npm run dev
```

### Full stack (Docker)

```bash
# Configure SIP credentials first (gitignored):
#   baresip/config/accounts
#   baresip/config/contacts
docker compose up -d --build
# Dashboard: http://localhost:3000
```

Prefer `npm run dev` for pure UI/API work. Use Compose when you need real baresip TCP/netstring behavior.

### Upstream feature-request workflow

Branch **from upstream `main`**, not from this fork’s `main`, so fork-only files (`.cursor/`, `AGENTS.md`) never appear in the upstream diff.

1. **Ensure upstream remote** and refresh:
   ```bash
   git remote add upstream https://github.com/andyweiss/baresipui.git 2>/dev/null || true
   git fetch upstream main
   ```
2. **Compare** (optional):
   ```bash
   diff -ruN "$HOME/upstream/andyweiss-baresipui/server" server | head
   ```
3. **Start a clean feature branch from upstream**:
   ```bash
   git checkout -b cursor/<feature>-25f8 upstream/main
   ```
4. **Implement only the feature** (no `.cursor/` or `AGENTS.md` changes).
5. **Verify**: `npm run build` at minimum; exercise the UI when the change is user-facing.
6. **Open an upstream PR** (fork head → parent):
   ```bash
   git push -u origin HEAD
   gh pr create \
     --repo andyweiss/baresipui \
     --head "LeeO86:$(git branch --show-current)" \
     --base main \
     --title "…" \
     --body "…"
   ```
   Before opening, confirm the PR diff has no `.cursor/` or `AGENTS.md`:
   ```bash
   gh pr diff --repo andyweiss/baresipui | grep -E '^\+\+\+ .*\.cursor/|^\+\+\+ .*AGENTS\.md' && exit 1 || true
   ```
7. **Feature request without code** (issue only):
   ```bash
   gh issue create --repo andyweiss/baresipui --title "…" --body "…"
   ```
8. Softphone-level work: target `baresip/baresip` / `baresip/re` via `$HOME/upstream/` checkouts when the GitHub App has access.

### Notes

- Do not commit secrets: `baresip/config/accounts`, `contacts`, `autoconnect.json`, and `.env` are gitignored.
- Built-in `ManagePullRequest` targets this fork. Prefer `gh pr create --repo andyweiss/baresipui` for true upstream PRs.
- Keep PRs focused: one feature or fix per upstream request.
- Fork `main` may keep the Cursor env; upstream PRs must not.
