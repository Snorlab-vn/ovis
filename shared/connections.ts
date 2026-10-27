/**
 * The Connections page's wire contract (server/connections.ts): the devices of this PC's tailnet, as
 * `tailscale status --json` lists them, and an SSH session to one opened in a herdr tab.
 *
 *  GET  /api/connections/peers  -> { available: boolean; peers: TailnetPeer[] }  (available: false without Tailscale)
 *  POST /api/connections/ssh    { dns: string; user?: string | null }
 *                               -> { workspace_id: string; pane_id: string }
 *                               | 400 unknown_peer (not a device of the tailnet now) | invalid_user | invalid_body
 */
export interface TailnetPeer {
  /** the device's own name (`HostName`) */
  name: string;
  /** its MagicDNS name, without the trailing dot: what `ssh` is given */
  dns: string;
  os: string;
  online: boolean;
  /** when Tailscale last saw it, ISO; null while it is online or never said */
  last_seen: string | null;
  /** this PC */
  self: boolean;
}

export interface TailnetPeers { available: boolean; peers: TailnetPeer[] }

export interface SshOpened { workspace_id: string; pane_id: string }

/** A user name `ssh` is given: no space, quote or shell character, at most 32 characters. */
export const SSH_USER = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,31}$/;
