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

1. **Compare with upstream** before coding:
   ```bash
   diff -ruN "$HOME/upstream/andyweiss-baresipui/server" server | head
   # or: git -C "$HOME/upstream/andyweiss-baresipui" log --oneline -20
   ```
2. **Implement on this fork** (`LeeO86/baresipui`) on a `cursor/...` feature branch.
3. **Verify**: `npm run build` at minimum; exercise the UI when the change is user-facing.
4. **Open an upstream PR** (fork → parent), not only a PR into this fork’s `main`:
   ```bash
   git push -u origin HEAD
   gh pr create \
     --repo andyweiss/baresipui \
     --head "LeeO86:$(git branch --show-current)" \
     --base main \
     --title "…" \
     --body "…"
   ```
5. **Feature request without code** (issue only):
   ```bash
   gh issue create --repo andyweiss/baresipui --title "…" --body "…"
   ```
6. For changes that belong in the softphone itself, target `baresip/baresip` (and `baresip/re` if needed) using the checkouts under `$HOME/upstream/`, after confirming the Cursor GitHub App (or your token) has access.

### Notes

- Do not commit secrets: `baresip/config/accounts`, `contacts`, `autoconnect.json`, and `.env` are gitignored.
- Built-in `ManagePullRequest` targets this fork. Prefer `gh pr create --repo andyweiss/baresipui` for true upstream PRs.
- Keep PRs focused: one feature or fix per upstream request.
