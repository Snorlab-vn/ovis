/**
 * The Connections routes (shared/connections.ts): the devices of this PC's tailnet, read from
 * `tailscale status --json` and never changed, and an SSH session to one of them in a herdr tab of
 * the `Connections` workspace. Only a device the tailnet lists now is accepted, with a checked user
 * name, so the typed command is `ssh` and two plain words. Host keys and passwords are the user's,
 * asked in the pane: no `-o` option is ever added. The dispatcher in index.ts runs the access gate first.
 */
import { SSH_USER, type SshOpened, type TailnetPeer, type TailnetPeers } from "../shared/connections.ts";
import { paneSendKeys, paneSendText, sessionSnapshot, tabCreate, workspaceCreate } from "./herdr/client.ts";
import { badRequest, errorResponse, jsonResponse, readJsonObject, setRequestRoute } from "./http.ts";

export const CONNECTIONS_WORKSPACE = "Connections";
/** what a MagicDNS name may hold; the tailnet's list is the real check, this keeps the typed line plain */
const DNS_NAME = /^[a-z0-9.-]+$/;
/** herdr's own agent.prompt waits as long between its text and its Enter */
const ENTER_DELAY_MS = 300;

interface StatusNode { HostName?: unknown; DNSName?: unknown; OS?: unknown; Online?: unknown; LastSeen?: unknown }

function peerOf(node: StatusNode, self: boolean): TailnetPeer | null {
  const dns = typeof node.DNSName === "string" ? node.DNSName.replace(/\.$/, "") : "";
  if (dns === "" || !DNS_NAME.test(dns)) return null;
  const seen = typeof node.LastSeen === "string" && !node.LastSeen.startsWith("0001-") ? node.LastSeen : null;
  return { name: typeof node.HostName === "string" && node.HostName !== "" ? node.HostName : dns.split(".")[0]!, dns,
    os: typeof node.OS === "string" ? node.OS : "", online: node.Online === true, last_seen: seen, self };
}

/** Every device of `tailscale status --json`: this PC first, then the online ones, then by name. */
export function parsePeers(status: string | null): TailnetPeer[] {
  let parsed: { Self?: StatusNode; Peer?: Record<string, StatusNode> };
  try { parsed = status === null ? {} : JSON.parse(status); } catch { return []; }
  const self = parsed.Self ? peerOf(parsed.Self, true) : null;
  const peers = Object.values(parsed.Peer ?? {}).map((node) => peerOf(node, false)).filter((peer): peer is TailnetPeer => peer !== null)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return self ? [self, ...peers] : peers;
}

/** The answer for a Connections route, or null when the path is not one. */
export async function handleConnectionsRequest(request: Request, pathname: string, readStatus: () => Promise<string | null>): Promise<Response | null> {
  if (pathname === "/api/connections/peers") {
    setRequestRoute(pathname);
    if (request.method !== "GET") return badRequest("method_not_allowed", "use GET");
    const status = await readStatus();
    return jsonResponse({ available: status !== null, peers: parsePeers(status) } satisfies TailnetPeers);
  }
  if (pathname === "/api/connections/ssh") {
    setRequestRoute(pathname);
    if (request.method !== "POST") return badRequest("method_not_allowed", "use POST");
    const payload = await readJsonObject<{ dns?: unknown; user?: unknown }>(request);
    if (payload instanceof Response) return payload;
    if (typeof payload.dns !== "string") return badRequest("invalid_body", "dns must be a string");
    const user = payload.user === undefined || payload.user === null || payload.user === "" ? null : payload.user;
    if (user !== null && (typeof user !== "string" || !SSH_USER.test(user))) return badRequest("invalid_user", "user must be a plain user name: letters, digits, '.', '_' or '-', at most 32");
    // the tailnet as it is now, not a list the page kept
    const peer = parsePeers(await readStatus()).find((candidate) => candidate.dns === payload.dns);
    if (!peer) return badRequest("unknown_peer", "dns must be a device of this PC's tailnet");
    try {
      const workspace = (await sessionSnapshot()).workspaces.find((candidate) => candidate.label === CONNECTIONS_WORKSPACE);
      const created = workspace
        ? await tabCreate({ workspaceId: workspace.workspace_id, label: peer.name })
        : await workspaceCreate({ label: CONNECTIONS_WORKSPACE });
      const paneId = created.root_pane.pane_id;
      // ponytail: typed into the new shell, as a user would; a shell slow to start still reads it from the terminal's buffer
      await paneSendText(paneId, `ssh ${user === null ? "" : `${user}@`}${peer.dns}`);
      await new Promise((done) => setTimeout(done, ENTER_DELAY_MS));
      await paneSendKeys(paneId, ["Enter"]);
      return jsonResponse({ workspace_id: created.tab.workspace_id, pane_id: paneId } satisfies SshOpened);
    } catch (error) {
      return errorResponse(error);
    }
  }
  return null;
}
