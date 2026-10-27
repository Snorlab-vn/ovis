# Process

Status of the work planned in [docs/plans/tasky-parity.md](docs/plans/tasky-parity.md).
Status: `todo`, `doing`, `done`, `blocked`. One branch per step, merged into the fork's `main`
only after its checks and a real-browser check.

## Rules every task keeps

- Match the code around it: naming, comment density, one-line helpers, no new abstraction for
  one use, no unrelated cleanup. Comments say why, in the repo's voice.
- Read the `AGENTS.md` files (root, `server/`, `src/`), `CONTRIBUTING.md`, `.github/REVIEW.md`
  and the matching `DESIGN.md` section before a step; `conventions.test.ts` failures say what to
  change.
- UI: theme tokens only (no color literals), every new string with ko/ja/zh entries in the right
  `src/lib/i18n/*` part, a new setting gets its default and check in `sanitizeSettings`, secret
  input stays in the DOM input. Name the coding-agent app the design follows.
- Server: one herdr RPC connection per call; never move herdr's focus on a select; keys go
  upstream only. An HTTP/WS contract change is covered on both sides with a contract test, and
  the demo transport (`site/demo/transport.ts`) answers every new `/api` route.
- Tests use their own state (`mkdtempSync`, `port: 0`, isolated herdr), never the live session.
- Before merge: `bun run check fast` (known macOS-only failures: Portal, install.sh, bridge,
  composer-framing, with-bun, ci-browser, self-hosted-runner, also on untouched upstream), a
  browser check on desktop and 390px width, a changelog fragment in `changelog.d/`.

## Step 0: housekeeping

| Task | Status | Notes |
|---|---|---|
| Merge `feat/local-asr-refine` into `main` | done | fast-forward |
| Upgrade Bun to 1.4 | done | 1.4.4; typecheck clean |
| Demo transport answers `/api/voice/models` | done | conventions test |
| Push `main` to the fork | blocked | global ECC pre-push hook runs the full test script; its failures also fail on untouched upstream on this Mac |

## Step 1: sidebar grouped by project folder

| Task | Status | Notes |
|---|---|---|
| 1.1 Read `Sidebar.tsx`, `MachineSidebar.tsx`, the workspace row and DESIGN.md sidebar section | todo | how rows, filter and focus work today |
| 1.2 Grouping function: `worktree.repo_root` (name `repo_name`), else first pane cwd; order kept | todo | pure, in `src/lib/`, unit tests |
| 1.3 Setting "Group workspaces by folder" (default, `sanitizeSettings`, Appearance row, i18n) | todo | |
| 1.4 Project row: chevron, name, count; collapse/expand by click and keyboard | todo | follows an existing tree/group pattern in the app |
| 1.5 Collapsed state per PC and project, kept across reloads | todo | settings or existing per-view storage |
| 1.6 Filter opens a collapsed project when it matches inside | todo | |
| 1.7 Tests, browser check (desktop, 390px), changelog fragment | todo | |

## Step 2: Needs attention and "answered ago"

| Task | Status | Notes |
|---|---|---|
| 2.1 Find where agent state and last answer time live (snapshot, agent list) | todo | |
| 2.2 Selection: waiting for input, or finished and unread | todo | pure, unit tests |
| 2.3 "Needs attention" list on top of the sidebar | todo | |
| 2.4 Compact "answered ago" on agent rows (0s, 3m, 2h) | todo | reuse an existing time formatter |
| 2.5 Tests, browser check, changelog fragment | todo | |

## Step 3: Connections (tailnet devices, one-click SSH)

| Task | Status | Notes |
|---|---|---|
| 3.1 `GET /api/connections/peers` from `tailscale status --json`, reusing `server/tailscale.ts` | todo | role check like other read routes |
| 3.2 `POST /api/connections/ssh {fqdn, user}`: listed peers only, checked user name | todo | opens a herdr tab running `ssh`, no focus move |
| 3.3 Contract tests with a fake `tailscale` and isolated herdr; demo transport routes | todo | |
| 3.4 Connections page: search, online first, per-peer user, Open SSH, Add as Remote PC | todo | |
| 3.5 i18n, browser check, changelog fragment | todo | |

## Backlog

Not scheduled; see the plan's backlog list.
