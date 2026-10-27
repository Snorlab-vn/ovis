# Plan: Tasky-style sidebar and Connections

Ideas taken from Tasky (a friend's Ovis fork, installed at `~/.local/share/tasky3`, built bundle
only). NetBird is out. One step per branch and PR on the fork, each verified in a real browser
before the next.

## Step 0: housekeeping
- Merge `feat/local-asr-refine` into the fork's `main` (or keep it separate) and push.
- `brew upgrade bun` (1.3.14 to 1.4.x): `bun run check fast` and `bun run dev` need it.
- Verify: `bun run check fast` passes on `main`.

## Step 1: sidebar grouped by project folder
- Group a PC's workspaces under one project row per folder: `worktree.repo_root` when herdr
  reports one (a repo and its linked worktrees share a row, named `repo_name`), else the
  workspace's first pane cwd. A project with one workspace may stay flat (decide on sight).
- Each project row collapses and expands (chevron, also from the keyboard); the state survives a
  reload (settings, per PC).
- Settings > Appearance: "Group workspaces by folder" on/off, so the flat list stays available.
- Agents list below: unchanged.
- Verify: unit tests for the grouping function; browser check at desktop and 390px width; the
  filter box still finds workspaces inside a collapsed project (it opens them).

## Step 2: Needs attention and "answered ago"
- A "Needs attention" list on top of the sidebar: agents waiting for input or finished and unread.
- Each agent row shows how long ago it last answered (0s, 3m, 2h), compact, beside its state.
- Verify: unit tests for the selection and time format; browser check.

## Step 3: Connections (tailnet devices, one-click SSH)
- Server: `GET /api/connections/peers` from `tailscale status --json` (this PC and every peer:
  name, DNS name, OS, online, last seen). Read only; drive role or above.
- `POST /api/connections/ssh {fqdn, user}`: only a name in that peer list is accepted (no free
  hosts, no shell metacharacters); opens a herdr tab running `ssh user@fqdn` in a "Connections"
  workspace, named after the peer. Uses the PC's own `~/.ssh` and known_hosts, nothing stored.
- UI: a Connections page (sidebar button or palette), search, online first, per-peer default user
  (remembered), "Open SSH" and "Add as Remote PC" (hands off to the existing Remote PCs flow).
- Verify: contract test with a fake `tailscale` and fake herdr; manual check against a real peer.

## Backlog (pick later, from Tasky's changelog)
- Next-prompts picks as chips under the composer; send one or several as a message.
- Unsent drafts kept on the server across restarts.
- Edit and resend for Codex and Cursor CLI conversations.
- Voice: keep the local speech model warm (silence every minute); dictation shortcut as a single
  modifier (Left Option).
- Close: a pane, tab or workspace leaves the screen at the click.
- Paste: a `*` .gitignore in each pasted-files folder.
- Settings: Restart rows with spinner and last check time.
