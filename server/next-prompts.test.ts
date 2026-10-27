import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as herdr from "./herdr/client.ts";
import { createServer } from "./index.ts";
import { readNextPrompts } from "./next-prompts.ts";

describe("next prompts", () => {
  let stateDir: string;
  let server: ReturnType<typeof createServer>;
  const panes = [
    { pane_id: "w1:p1", agent_session: { agent: "claude", kind: "id", source: "herdr:claude", value: "abc-123" } },
    { pane_id: "w1:p2", agent_session: { agent: "codex", kind: "id", source: "herdr:codex", value: "abc-123" } },
    { pane_id: "w1:p3", agent_session: { agent: "claude", kind: "id", source: "herdr:claude", value: "../../secrets" } },
    { pane_id: "w1:p4", agent_session: null },
  ];
  const spy = spyOn(herdr, "sessionSnapshot").mockImplementation(async () => ({ panes }) as unknown as Awaited<ReturnType<typeof herdr.sessionSnapshot>>);
  const get = async (paneId: string) => (await fetch(`http://127.0.0.1:${server.port}/api/pane/next-prompts?pane_id=${encodeURIComponent(paneId)}`, { headers: { authorization: "Bearer t" } })).json();

  beforeAll(() => {
    stateDir = mkdtempSync(join(tmpdir(), "ovis-next-prompts-"));
    mkdirSync(join(stateDir, "next-prompts"));
    writeFileSync(join(stateDir, "next-prompts", "abc-123.json"), JSON.stringify({ session_id: "abc-123", at: 5, picks: ["Run the tests", "", 7, "Open a PR"] }));
    server = createServer({ port: 0, hostname: "127.0.0.1", stateDir, token: "t", machines: false, sidecar: false, tailscaleOwner: null });
  });
  afterAll(() => {
    server.stop();
    spy.mockRestore();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("answers a Claude pane's picks, leaving out what is not a prompt", async () => {
    expect(await get("w1:p1")).toEqual({ picks: ["Run the tests", "Open a PR"], at: 5 });
  });

  it("answers none for another agent, a pane without a session, an unknown pane and an id that is not a session's", async () => {
    for (const pane of ["w1:p2", "w1:p3", "w1:p4", "w9:p9"]) expect(await get(pane)).toEqual({ picks: [], at: null });
    expect(readNextPrompts(stateDir, "../next-prompts/abc-123")).toEqual({ picks: [], at: null });
    expect(readNextPrompts(stateDir, "missing")).toEqual({ picks: [], at: null });
  });
});
