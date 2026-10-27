import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SessionSnapshot } from "../shared/protocol.ts";
import { DEVICE_COOKIE } from "./auth.ts";
import { parsePeers } from "./connections.ts";
import { DeviceStore } from "./devices.ts";
import * as herdr from "./herdr/client.ts";
import { createServer } from "./index.ts";

const STATUS = JSON.stringify({
  Self: { HostName: "Edward's Mac", DNSName: "mac.tail1.ts.net.", OS: "macOS", Online: true, LastSeen: "0001-01-01T00:00:00Z" },
  Peer: {
    a: { HostName: "zeta", DNSName: "zeta.tail1.ts.net.", OS: "linux", Online: true, LastSeen: "0001-01-01T00:00:00Z" },
    b: { HostName: "build", DNSName: "build.tail1.ts.net.", OS: "macOS", Online: false, LastSeen: "2026-08-12T04:39:36.1Z" },
    c: { HostName: "shared-gpu", DNSName: "gpu.other2.ts.net.", OS: "linux", Online: true },
    d: { HostName: "odd", DNSName: "odd host;rm.ts.net.", OS: "linux", Online: true },
  },
});

describe("parsePeers", () => {
  it("lists this PC first, then online devices by name, a shared-in one too, and drops a name ssh could not be given", () => {
    expect(parsePeers(STATUS)).toEqual([
      { name: "Edward's Mac", dns: "mac.tail1.ts.net", os: "macOS", online: true, last_seen: null, self: true },
      { name: "shared-gpu", dns: "gpu.other2.ts.net", os: "linux", online: true, last_seen: null, self: false },
      { name: "zeta", dns: "zeta.tail1.ts.net", os: "linux", online: true, last_seen: null, self: false },
      { name: "build", dns: "build.tail1.ts.net", os: "macOS", online: false, last_seen: "2026-08-12T04:39:36.1Z", self: false },
    ]);
    expect(parsePeers(null)).toEqual([]);
    expect(parsePeers("not json")).toEqual([]);
  });
});

describe("Connections routes", () => {
  const guard = { "x-herdr-machine": "1", "content-type": "application/json" };
  const stranger = { "x-forwarded-for": "100.64.0.9" };
  let stateDir: string;
  let server: ReturnType<typeof createServer>;
  let watchCookie: string;
  let workspaces: { workspace_id: string; label: string }[] = [];
  const typed: string[] = [];
  const spies = [
    spyOn(herdr, "sessionSnapshot").mockImplementation(async () => ({ workspaces } as unknown as SessionSnapshot)),
    spyOn(herdr, "workspaceCreate").mockImplementation(async (options) => {
      workspaces = [{ workspace_id: "w9", label: options.label ?? "" }];
      return { tab: { workspace_id: "w9" }, root_pane: { pane_id: "w9:p1" } } as unknown as Awaited<ReturnType<typeof herdr.workspaceCreate>>;
    }),
    spyOn(herdr, "tabCreate").mockImplementation(async (options) => ({ tab: { workspace_id: options.workspaceId, label: options.label }, root_pane: { pane_id: `${options.workspaceId}:p2` } }) as unknown as Awaited<ReturnType<typeof herdr.tabCreate>>),
    spyOn(herdr, "paneSendText").mockImplementation(async (paneId, text) => { typed.push(`${paneId} ${text}`); }),
    spyOn(herdr, "paneSendKeys").mockImplementation(async (paneId, keys) => { typed.push(`${paneId} [${keys.join(",")}]`); }),
  ];
  const url = (path: string) => `http://127.0.0.1:${server.port}${path}`;
  const ssh = (body: unknown, headers: Record<string, string> = {}) => fetch(url("/api/connections/ssh"), { method: "POST", headers: { ...guard, authorization: "Bearer t", ...headers }, body: JSON.stringify(body) });
  const code = async (response: Response) => [response.status, ((await response.json()) as { error?: { code: string } }).error?.code];

  beforeAll(() => {
    stateDir = mkdtempSync(join(tmpdir(), "ovis-connections-"));
    const store = new DeviceStore(stateDir);
    const watch = store.pair(store.startPairing().code, "Watch", "watch")!;
    store.match(watch.token);
    watchCookie = `${DEVICE_COOKIE}=${watch.token}`;
    server = createServer({ port: 0, hostname: "127.0.0.1", stateDir, token: "t", machines: false, sidecar: false, tailscaleOwner: null, tailscaleStatus: async () => STATUS });
  });
  afterAll(() => {
    server.stop();
    for (const spy of spies) spy.mockRestore();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("lists the tailnet's devices", async () => {
    const response = await fetch(url("/api/connections/peers"), { headers: { authorization: "Bearer t" } });
    expect(response.status).toBe(200);
    const body = await response.json() as { available: boolean; peers: { dns: string }[] };
    expect(body.available).toBe(true);
    expect(body.peers.map((peer) => peer.dns)).toEqual(["mac.tail1.ts.net", "gpu.other2.ts.net", "zeta.tail1.ts.net", "build.tail1.ts.net"]);
  });

  it("refuses a device the tailnet does not list, and a user name with a shell character in it", async () => {
    expect(await code(await ssh({ dns: "evil.example.com" }))).toEqual([400, "unknown_peer"]);
    expect(await code(await ssh({ dns: "zeta.tail1.ts.net", user: "root; rm -rf ~" }))).toEqual([400, "invalid_user"]);
    expect(await code(await ssh({ dns: "zeta.tail1.ts.net", user: "-oProxyCommand=x" }))).toEqual([400, "invalid_user"]);
    expect(await code(await ssh({ user: "root" }))).toEqual([400, "invalid_body"]);
    expect(typed).toEqual([]);
  });

  it("opens ssh in the Connections workspace, making it once and adding a tab named after the device after that", async () => {
    const first = await ssh({ dns: "zeta.tail1.ts.net", user: "ubuntu" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ workspace_id: "w9", pane_id: "w9:p1" });
    const second = await ssh({ dns: "build.tail1.ts.net", user: null });
    expect(await second.json()).toEqual({ workspace_id: "w9", pane_id: "w9:p2" });
    expect(typed).toEqual(["w9:p1 ssh ubuntu@zeta.tail1.ts.net", "w9:p1 [Enter]", "w9:p2 ssh build.tail1.ts.net", "w9:p2 [Enter]"]);
    expect(herdr.workspaceCreate).toHaveBeenCalledTimes(1);
    expect(herdr.tabCreate).toHaveBeenLastCalledWith({ workspaceId: "w9", label: "build" });
  });

  it("keeps the device list and ssh from a device that only watches", async () => {
    expect((await fetch(url("/api/connections/peers"), { headers: { ...stranger, cookie: watchCookie } })).status).toBe(403);
    expect(await code(await ssh({ dns: "zeta.tail1.ts.net" }, { ...stranger, cookie: watchCookie, authorization: "" }))).toEqual([403, "read_only"]);
  });
});
