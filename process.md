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
| 1.4 Folder row: fold, name, count; fold state per PC in localStorage like the worktree fold | done | folded row carries its panes' rolled-up state | Folds share the worktree fold state under `folder:<dir>`; a workspace row drops its folder face in the tree.
| 1.5 Pane rows under a workspace (agent mark, title, state, unread), reusing AgentSidebar's row parts; a workspace row folds its panes | done | click selects that pane | `AgentRowBody` and `agentRowText` moved into `Sidebar.tsx` (shared with the Agents list, no import cycle); a workspace of 2+ panes lists them, one line each; menu: Mute alerts (agent pins not offered in the tree). Workspace rows do not fold their panes (the folder does).
| 1.6 Hide the Agents list while grouped; keep its features reachable (Activity order, filter matches panes) | done | | `MachineSidebar` mounts `AgentSidebar` only for Workspaces; "Agents order" is inert in the tree.
| 1.7 Drag: a workspace within its folder, a folder as a block (`placeBlock`/`workspaceMoves`) | done | touch reorder too | Drag and Alt+↑/↓ stay inside the folder; a folder row drags its workspaces as one block. Not yet run on the demo session (1.9).
| 1.8 Filter: matches workspaces and panes, opens folds it needs | done | reuse `filterWorkspaceGroups` | Checked live: "iap" leaves one folder with its matches; pane rows follow `filtered.panes`.
| 1.9 Tests, browser check (desktop, 390px), changelog fragment, DESIGN.md entry | done | owner kept By folder as the code default: the browser scripts that read the old sidebar seed `sidebarLayout: "workspaces"`; advisor + vision e2e check before handing over | Done: 14 scripts seed `sidebarLayout: "workspaces"`; 8 of 9 demo scripts pass (workspace-touch-reorder fails the same on the previous main); unit suite: no new failure (bridge loopback relay is flaky alone); folder drag checked on the demo (block move, cross-folder drop refused, Alt+↓ stays in the folder); DESIGN.md entry, changelog fragment. Vision e2e (Fable) and advisor done; fixes: a folded folder keeps only the open workspace row, counts panes, worktree fold is a chevron in the tree, smaller pane indent; seeded demo scripts re-run green after them. In-folder workspace drag: covered by logic (`sameFolder`, `placeBlock`), no browser run (the demo folders hold one movable group each).
| 1.6b Setting "Agents list": Auto (shown with Workspaces, hidden in By folder), On, Off | done | owner's request; shared setting |
| 1.6c Lighter tree: Claude's mark without its tile (its orange asterisk), a workspace that lists its panes leaves its mark to them | done | owner's request (screenshot) |
| 1.10 A `+` on each folder row: menu Terminal and each agent (Claude Code, Codex, Cursor, OpenCode, pi, ...), starting a workspace in that folder (`createWorkspace({ cwd, agent })`) | done | Claude's `--dangerously-skip-permissions` = Settings > Chat > New agents: bypassPermissions (existing); `claude2` (owner's alias: `CLAUDE_CONFIG_DIR=~/.claude2` + pool env) needs a launch with its own env: find how herdr can start it. Done: + on hover (always on touch), menu = Terminal + herdr's agents with their marks, starts at once with the New workspace defaults (launch mode settings), selects the new pane; a failed start says so under the list. Checked on the demo: hover, menu, Claude Code start, new pane selected, no console errors Lead for claude2: herdr's `workspace.create` / `tab.create` take `env` (server/herdr/client.ts) claude2 done: agent profiles (server/agent-profiles.ts, stateDir agent-profiles.json 0600, env never sent out), listed under their agent in the folder +; `--dangerously-skip-permissions` = Claude launch mode bypassPermissions (set, shared) |
| 1.11 Fold-all on the PC row (folder tree): collapses every folder, or opens them all once all are folded; saved like a folder's own fold | done | owner's request (screenshot); checked on the demo: both ways, kept across a reload |

## Step 2: Needs attention and "answered ago"

| Task | Status | Notes |
|---|---|---|
| 2.1 Find where agent state and last answer time live (snapshot, agent list) | done | herdr gives no time, only a counter: the bridge stamps `status_since` when it sees a pane's state change (server/finishes.ts), sent on the snapshot and every pane-status frame; absent until it has seen one change since it started |
| 2.2 Selection: waiting for input, or finished and unread | done | pure, unit tests `attentionRows` (lib/agentRoster.ts): blocked, then unread done, newest first; muted panes and away PCs left out; unit test |
| 2.3 "Needs attention" list on top of the sidebar | done | `NeedsAttention` above the PCs; hidden while empty or filtering; a row opens its pane |
| 2.4 Compact "answered ago" on agent rows (0s, 3m, 2h) | done | reuse an existing time formatter `formatAgo` + one shared 15s clock (lib/ago.ts); on agent rows and one-pane workspace rows |
| 2.4b Unread mark on agent rows the user has not opened since they finished | todo | reuse `sidebarActivity` / `seenFinishes` (already shared across browsers); also a count on a folded folder or PC |
| 2.5 Tests, browser check, changelog fragment | done | tests pass (9 AgentSidebar DOM failures pre-exist on main); demo checked at 1200px and 390px drawer, no overflow, no console errors; changelog + DESIGN.md |

## Step 3: Connections (tailnet devices, one-click SSH)

| Task | Status | Notes |
|---|---|---|
| 3.1 `GET /api/connections/peers` from `tailscale status --json`, reusing `server/tailscale.ts` | done | role check like other read routes `server/connections.ts` `parsePeers`: Self first, online then name; LastSeen 0001 = null; names outside [a-z0-9.-] dropped. `readTailscaleStatus` exported from tailscale.ts, injectable (`tailscaleStatus` option). Watch devices refused (index.ts gate) |
| 3.2 `POST /api/connections/ssh {fqdn, user}`: listed peers only, checked user name | done | opens a herdr tab running `ssh`, no focus move fresh status read per request; user optional, `SSH_USER` regex; tab in the `Connections` workspace (made once), `ssh [user@]dns` typed + Enter after 300ms; no `-o` ever |
| 3.3 Contract tests with a fake `tailscale` and isolated herdr; demo transport routes | done | server/connections.test.ts: herdr spied, never the real session; parse, refusals, reuse of the workspace, watch 403 |
| 3.4 Connections page: search, online first, per-peer user, Open SSH, Add as Remote PC | done | dialog (owner's pick, not the sidebar): search, online first, user per device (localStorage), Open SSH, pin to show it in the sidebar (shared setting `sidebarDevices`); sidebar lists pinned ones only. Add as Remote PC left out (MachineDialog takes no prefilled target) |
| 3.5 i18n, browser check, changelog fragment | done | ko/ja/zh; demo peers + ssh route; browser check desktop + 390px: list, search, pin, bad user refused, Open SSH and sidebar row open a tab, no overflow, no console errors |

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

## Backlog decisions (owner, 2026-10-27)

| Task | Status | Notes |
|---|---|---|
| B1 claude2 + skip permissions | done | agent profiles; Claude launch mode bypassPermissions (shared) |
| B2 Unread mark (2.4b) | dropped | Needs attention covers it |
| B3 Next-prompts chips | done (v1) | mod patch `scripts/next-prompts-ovis.patch` writes `~/.config/ovis/next-prompts/<session>.json`; chips under a Claude pane's composer, click sends one. Multi-select send/copy and kept earlier sets: next |
| B4 Unsent drafts kept on the server | todo | |
| B5 Edit and resend for Codex / Cursor | later | |
| B6 Voice: model kept warm, single-modifier dictation shortcut | done | Settings → Voice input → Dictation key: chord, Left or Right Option alone (held 250 ms, so Option+key keeps working); local ASR server runs 0.5 s of silence through the loaded model every minute, logs when it had been paged out |
| B7 Close leaves the screen at the click | todo | |
| B8 Paste `.gitignore` | done upstream | `server/paste.ts` preparePasteDirectory |
| B9 Settings restart rows | later | Ovis has no restart rows yet |

