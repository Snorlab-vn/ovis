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
| Push `main` to the fork | done | Snorlab-vn/ovis (org fork of devswha/ovis); pushed with ECC_SKIP_PREPUSH=1 at the owner's OK |

## Step 1: sidebar tree: PC > folder > workspace > pane (option B)

Decided with the owner: the tree replaces the separate Agents list; a folder row even for one
workspace; on by default, with a setting "Group by folder" whose off state is today's sidebar
exactly (the safety net); drag stays smooth (a workspace within its folder, a folder as a block).

| Task | Status | Notes |
|---|---|---|
| 1.1 Read `Sidebar.tsx`, `MachineSidebar.tsx`, the workspace row and DESIGN.md sidebar section | done | see "Findings" below |
| 1.1b Analyse the owner's mockup and agree the design | done | option B, mock trees in the chat |
| 1.2 `folderGroups()` in `src/lib/`: worktree groups into folders keyed by `worktree.repo_root`, else the first pane's cwd; name `repo_name` or the folder's basename; herdr's order kept | done | `workspaceOrder.ts` `folderGroups`, `workspaceFolder` + tests |
| 1.3 Setting `sidebarLayout` ("folders" default, "workspaces") (default on, `sanitizeSettings`, Appearance row, i18n) | done | shared setting; excluded from telemetry and the legacy fixture like other new settings |
| 1.4 Folder row: fold, name, count; fold state per PC in localStorage like the worktree fold | todo | folded row carries its panes' rolled-up state |
| 1.5 Pane rows under a workspace (agent mark, title, state, unread), reusing AgentSidebar's row parts; a workspace row folds its panes | todo | click selects that pane |
| 1.6 Hide the Agents list while grouped; keep its features reachable (Activity order, filter matches panes) | todo | |
| 1.7 Drag: a workspace within its folder, a folder as a block (`placeBlock`/`workspaceMoves`) | todo | touch reorder too |
| 1.8 Filter: matches workspaces and panes, opens folds it needs | todo | reuse `filterWorkspaceGroups` |
| 1.9 Tests, browser check (desktop, 390px), changelog fragment | todo | |

## Step 2: Needs attention and "answered ago"

| Task | Status | Notes |
|---|---|---|
| 2.1 Find where agent state and last answer time live (snapshot, agent list) | todo | |
| 2.2 Selection: waiting for input, or finished and unread | todo | pure, unit tests |
| 2.3 "Needs attention" list on top of the sidebar | todo | |
| 2.4 Compact "answered ago" on agent rows (0s, 3m, 2h) | todo | reuse an existing time formatter |
| 2.4b Unread mark on agent rows the user has not opened since they finished | todo | reuse `sidebarActivity` / `seenFinishes` (already shared across browsers); also a count on a folded folder or PC |
| 2.5 Tests, browser check, changelog fragment | todo | |

## Step 3: Connections (tailnet devices, one-click SSH)

| Task | Status | Notes |
|---|---|---|
| 3.1 `GET /api/connections/peers` from `tailscale status --json`, reusing `server/tailscale.ts` | todo | role check like other read routes |
| 3.2 `POST /api/connections/ssh {fqdn, user}`: listed peers only, checked user name | todo | opens a herdr tab running `ssh`, no focus move |
| 3.3 Contract tests with a fake `tailscale` and isolated herdr; demo transport routes | todo | |
| 3.4 Connections page: search, online first, per-peer user, Open SSH, Add as Remote PC | todo | |
| 3.5 i18n, browser check, changelog fragment | todo | |

## Findings (1.1)

- PCs are already top-level, foldable sections (`MachineSidebar.tsx`, `machine-group`, "Host" badge).
- Workspaces already fold linked worktrees under their repo's main workspace
  (`worktreeGroups` in `src/lib/workspaceOrder.ts`; fold state in localStorage
  `ovis:worktree-group-collapsed:<pc>:<repo_key>`; the filter opens a fold with a match).
- Rows are herdr's order and can be dragged and pinned (`sidebarPins.ts`, `workspaceMoves`);
  any folder level must keep that order and not fight the drag.
- "Finished, not looked at" already exists: `sidebarActivity.tsx` + `seenFinishes.ts` drive the dot.
- Agents are a separate list under the PCs (`AgentSidebar.tsx`).

## Mockup (owner's Workspace Navigator)

- Tree: PC (Host, status dot, foldable) > folder (repo or cwd, foldable, item count or state) >
  rows: the workspace and each of its agent and terminal panes, with a state pill (Idle, Active,
  Done, Orchestrating), a version or pid.
- Filter chips over the tree: All n, Running n, CLI n, Agents.
- Other PCs folded with "n folders"; tailnet machines join here as PCs (step 3).
- Footer: host CPU and RAM.

## Backlog

Not scheduled; see the plan's backlog list.
