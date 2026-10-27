import { describe, expect, it } from "bun:test";
import type { Machine } from "../../shared/machines.ts";
import type { SessionSnapshot } from "../../shared/protocol.ts";
import { closeAtOnce, closingVersion, settleClosing, withoutClosing, withoutClosingSnapshot } from "./closingItems.ts";

const snapshot = {
  workspaces: [{ workspace_id: "w1" }, { workspace_id: "w2" }],
  tabs: [{ tab_id: "w1:t1", workspace_id: "w1" }, { tab_id: "w2:t1", workspace_id: "w2" }, { tab_id: "w2:t2", workspace_id: "w2" }],
  panes: [{ pane_id: "w1:p1", tab_id: "w1:t1" }, { pane_id: "w2:p1", tab_id: "w2:t1" }, { pane_id: "w2:p2", tab_id: "w2:t2" }, { pane_id: "w2:p3", tab_id: "w2:t2" }],
  agents: [{ pane_id: "w1:p1" }, { pane_id: "w2:p3" }],
} as unknown as SessionSnapshot;
const ids = (s: SessionSnapshot) => [s.workspaces.map((w) => w.workspace_id), s.tabs.map((t) => t.tab_id), s.panes.map((p) => p.pane_id), s.agents.map((a) => a.pane_id)];
const machine = (snap: SessionSnapshot): Machine => ({ id: "local", snapshot: snap } as unknown as Machine);

describe("closing at once", () => {
  it("leaves out a workspace with its tabs and panes, a tab with its panes, a pane alone, on its PC only", () => {
    const at = 0;
    expect(ids(withoutClosingSnapshot(snapshot, "local", [{ machineId: "local", kind: "workspace", id: "w1", at }]))).toEqual([["w2"], ["w2:t1", "w2:t2"], ["w2:p1", "w2:p2", "w2:p3"], ["w2:p3"]]);
    expect(ids(withoutClosingSnapshot(snapshot, "local", [{ machineId: "local", kind: "tab", id: "w2:t2", at }]))).toEqual([["w1", "w2"], ["w1:t1", "w2:t1"], ["w1:p1", "w2:p1"], ["w1:p1"]]);
    expect(ids(withoutClosingSnapshot(snapshot, "local", [{ machineId: "local", kind: "pane", id: "w2:p3", at }]))[2]).toEqual(["w1:p1", "w2:p1", "w2:p2"]);
    expect(withoutClosingSnapshot(snapshot, "remote", [{ machineId: "local", kind: "pane", id: "w2:p3", at }])).toBe(snapshot);
  });

  it("shows a refused close again, and forgets a close once a roster without the item comes", async () => {
    await expect(closeAtOnce("local", "pane", "w2:p3", async () => { expect(ids(withoutClosing([machine(snapshot)])[0]!.snapshot!)[2]).not.toContain("w2:p3"); throw new Error("refused"); })).rejects.toThrow("refused");
    expect(closingVersion()).toEqual([]);
    await closeAtOnce("local", "tab", "w2:t2", async () => undefined);
    expect(closingVersion()).toHaveLength(1);
    settleClosing([machine(snapshot)]);
    expect(closingVersion()).toHaveLength(1);
    settleClosing([machine({ ...snapshot, tabs: snapshot.tabs.filter((tab) => tab.tab_id !== "w2:t2") })]);
    expect(closingVersion()).toEqual([]);
  });
});
