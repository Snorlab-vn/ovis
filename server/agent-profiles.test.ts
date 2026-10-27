import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readAgentProfiles } from "./agent-profiles.ts";
import * as herdr from "./herdr/client.ts";
import { createServer } from "./index.ts";

const PROFILES = [
  { name: "claude2", kind: "claude", label: "Claude Code (claude2)", env: { CLAUDE_CONFIG_DIR: "/home/u/.claude2", ANTHROPIC_AUTH_TOKEN: "secret-token" } },
  { name: "Bad Name", kind: "claude", env: {} },
  { name: "badenv", kind: "claude", env: { "NOT OK": "x" } },
  { name: "nolabel", kind: "codex", env: {} },
];

describe("agent profiles", () => {
  let stateDir: string;
  let server: ReturnType<typeof createServer>;
  const guard = { "x-herdr-machine": "1", "content-type": "application/json", authorization: "Bearer t" };
  const created: { env?: Record<string, string> }[] = [];
  const spies = [
    spyOn(herdr, "workspaceCreate").mockImplementation(async (options) => {
      created.push({ ...(options.env ? { env: options.env } : {}) });
      return { tab: { workspace_id: "w1" }, root_pane: { pane_id: "w1:p1" } } as unknown as Awaited<ReturnType<typeof herdr.workspaceCreate>>;
    }),
    spyOn(herdr, "agentStart").mockImplementation(async () => undefined as never),
    spyOn(herdr, "sessionSnapshot").mockImplementation(async () => ({ agents: [], workspaces: [], panes: [], tabs: [] }) as unknown as Awaited<ReturnType<typeof herdr.sessionSnapshot>>),
  ];
  const url = (path: string) => `http://127.0.0.1:${server.port}${path}`;

  beforeAll(() => {
    stateDir = mkdtempSync(join(tmpdir(), "ovis-profiles-"));
    writeFileSync(join(stateDir, "agent-profiles.json"), JSON.stringify(PROFILES), { mode: 0o600 });
    server = createServer({ port: 0, hostname: "127.0.0.1", stateDir, token: "t", machines: false, sidecar: false, tailscaleOwner: null });
  });
  afterAll(() => {
    server.stop();
    for (const spy of spies) spy.mockRestore();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("reads the well-formed profiles, labelling one that has no label", () => {
    expect(readAgentProfiles(stateDir).map(({ name, label }) => [name, label])).toEqual([["claude2", "Claude Code (claude2)"], ["nolabel", "codex (nolabel)"]]);
    expect(readAgentProfiles(join(stateDir, "missing"))).toEqual([]);
  });

  it("lists names, kinds and labels, never an environment", async () => {
    const text = await (await fetch(url("/api/agent-profiles"), { headers: guard })).text();
    expect(JSON.parse(text)).toEqual({ profiles: [{ name: "claude2", kind: "claude", label: "Claude Code (claude2)" }, { name: "nolabel", kind: "codex", label: "codex (nolabel)" }] });
    expect(text).not.toContain("secret-token");
  });

  it("starts a workspace with the profile's environment, and refuses an unknown profile or another kind", async () => {
    const create = (body: unknown) => fetch(url("/api/workspace/create"), { method: "POST", headers: guard, body: JSON.stringify(body) });
    expect((await create({ agent: { kind: "claude" }, profile: "claude2" })).status).toBe(200);
    expect(created.at(-1)).toEqual({ env: PROFILES[0]!.env as Record<string, string> });
    const unknown = await create({ agent: { kind: "claude" }, profile: "nobody" });
    expect([unknown.status, ((await unknown.json()) as { error: { code: string } }).error.code]).toEqual([400, "invalid_profile"]);
    expect((await create({ agent: { kind: "codex" }, profile: "claude2" })).status).toBe(400);
    expect(created).toHaveLength(1);
  });
});
