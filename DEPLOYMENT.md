# Markdown Studio deployment

This document covers hosting **Markdown Studio** and its `/api/*` handlers for ACL-ADLC application projects (not the ACL-ADLC framework repo website).

## Local development

| Command | Use when |
|--------|----------|
| `node tools/studio-server.js` | Standalone studio (port **3333**). Set `ACL_PROJECT_ROOT` to your app root if needed. |
| `npm run studio:dev` | Sync studio assets from the framework and run the studio server with watch (framework maintainers). |
| Vite dev server + `aclMarkdownSaverPlugin()` | Installed Vite apps: installer injects `tools/installer/templates/vite-plugin-template.js`. |

### Smoke URLs (local)

- `http://localhost:3333/api/health` — JSON `{ "ok": true }`
- `http://localhost:3333/api/git-details` — GitHub link telemetry (`Cache-Control: no-store`)
- `http://localhost:3333/markdown.html` — Studio UI

## Vercel

1. **Root directory**: project root (where `public/markdown.html` or `src/public/markdown/markdown.html` lives after install).
2. **Environment variables** (Project → Settings → Environment Variables):
   - `GITHUB_TOKEN` — server-side Contents API for `_acl-output` sync (recommended on Vercel).
   - Optional: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` when not using Vercel’s linked Git repo.
   - Atlassian: credentials are saved in `_acl/atlassian-config.json` on the server filesystem (ephemeral on pure serverless unless you persist `_acl/`). For production, use a deployment that keeps `_acl/` or re-connect after deploy.
   - Email: `SMTP_*` or `GMAIL_USER` + `GMAIL_APP_PASSWORD`; recipients from `_acl/custom/team-notifications.toml` or `ACL_TEAM_NOTIFY_EMAILS`.
   - Optional: `ACL_PRODUCT_NAME` — product string in notifications (default: `ACL Markdown Studio`).
3. **`vercel.json`**: Installed projects receive rewrites for `/api/atlassian/*` → flat `api/atlassian-*.js` and `functions.api/**/*.js.includeFiles: tools/**` so `git-details-service.mjs` and `atlassian-service.mjs` are bundled.
4. **Smoke URLs** (replace host):
   - `/api/health`
   - `/api/git-details`
   - `/api/atlassian-config` (GET)
   - `/api/save-markdown` (POST)
   - `/markdown.html`

## Atlassian (browser + server)

- **Live credentials only** — no sandbox/demo mode. **Save & Connect** validates against Atlassian Cloud and sets `verifiedAt` on the server config.
- UI may mirror connection state in `localStorage` (`__acl_atlassian_config__`) for display; sync buttons require a verified server connection.

## GitHub User Control Centre

- `GET /api/git-details` returns `repoConnected`, `repoDeleted`, `githubOwner`, `githubRepo`, `githubBranch`, and related fields.
- **Connected** only when the GitHub repo exists (API 404 ⇒ deleted) or `git ls-remote origin` succeeds without a deleted-remote error.
- `package.json` / query `owner`/`repo` do **not** override `VERCEL_GIT_*` when Vercel git integration is active.
- On disconnect or deleted repo, the studio clears `acl_github_owner`, `acl_github_repo`, and `acl_github_branch` in `localStorage`.

## Optional: embedded read-only snapshot

Build or deploy hooks may inject `window.__ACL_EMBEDDED_FILES__` into `markdown.html` for offline read-only mode. Default installs use live GitHub/disk sync via `/api/list-markdown-files`.

## Team notifications template

Copy and edit (do not commit secrets):

```toml
# _acl/custom/team-notifications.toml
[[team]]
name = "Product Owner"
email = "po@example.com"

[[team]]
name = "Engineering Lead"
email = "lead@example.com"
```

Install `nodemailer` in the **application** project when using `/api/send-email`:

```bash
npm install nodemailer
```
