/**
 * Panes, tabs and workspaces a close was sent for (Tasky's "leaves the screen at the click"): the
 * roster leaves them out from the click on, until a roster without them comes, or brings them back
 * when herdr refuses the close. App reads every PC through `withoutClosing` (lib/useMachineRoster.ts).
 */
import type { Machine } from "../../shared/machines.ts";
import type { SessionSnapshot } from "../../shared/protocol.ts";

export type ClosingKind = "pane" | "tab" | "workspace";
interface Closing { machineId: string; kind: ClosingKind; id: string; at: number }

/** a close herdr never answers for, nor a roster ever shows done, is shown again after this long */
const FORGET_MS = 20_000;
let closing: Closing[] = [];
const listeners = new Set<() => void>();
const changed = (): void => { for (const listener of [...listeners]) listener(); };

export function subscribeClosing(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function closingVersion(): Closing[] { return closing; }

/** Hides the item now; the close's own promise decides: a refusal shows it again and is passed on. */
export async function closeAtOnce<T>(machineId: string, kind: ClosingKind, id: string, close: () => Promise<T>): Promise<T> {
  const entry: Closing = { machineId, kind, id, at: Date.now() };
  closing = [...closing, entry];
  changed();
  setTimeout(() => forget(entry), FORGET_MS);
  try {
    return await close();
  } catch (error) {
    forget(entry);
    throw error;
  }
}

function forget(entry: Closing): void {
  if (!closing.includes(entry)) return;
  closing = closing.filter((other) => other !== entry);
  changed();
}

function hides(snapshot: SessionSnapshot, entry: Closing): boolean {
  const list = entry.kind === "pane" ? snapshot.panes.map((pane) => pane.pane_id) : entry.kind === "tab" ? snapshot.tabs.map((tab) => tab.tab_id) : snapshot.workspaces.map((workspace) => workspace.workspace_id);
  return list.includes(entry.id);
}

/** Drops the marks a roster already shows done: the item is gone from it. */
export function settleClosing(machines: readonly Machine[]): void {
  const done = closing.filter((entry) => {
    const snapshot = machines.find((machine) => machine.id === entry.machineId)?.snapshot;
    return snapshot !== null && snapshot !== undefined && !hides(snapshot, entry);
  });
  if (done.length === 0) return;
  closing = closing.filter((entry) => !done.includes(entry));
  changed();
}

/** A PC's roster without what is being closed: a workspace takes its tabs and panes, a tab its panes. */
export function withoutClosingSnapshot(snapshot: SessionSnapshot, machineId: string, marks: readonly Closing[] = closing): SessionSnapshot {
  const mine = marks.filter((entry) => entry.machineId === machineId);
  if (mine.length === 0) return snapshot;
  const workspaces = new Set(mine.filter((entry) => entry.kind === "workspace").map((entry) => entry.id));
  const tabs = new Set([...mine.filter((entry) => entry.kind === "tab").map((entry) => entry.id), ...snapshot.tabs.filter((tab) => workspaces.has(tab.workspace_id)).map((tab) => tab.tab_id)]);
  const panes = new Set([...mine.filter((entry) => entry.kind === "pane").map((entry) => entry.id), ...snapshot.panes.filter((pane) => tabs.has(pane.tab_id)).map((pane) => pane.pane_id)]);
  return {
    ...snapshot,
    workspaces: snapshot.workspaces.filter((workspace) => !workspaces.has(workspace.workspace_id)),
    tabs: snapshot.tabs.filter((tab) => !tabs.has(tab.tab_id)),
    panes: snapshot.panes.filter((pane) => !panes.has(pane.pane_id)),
    agents: snapshot.agents.filter((agent) => !panes.has(agent.pane_id)),
  };
}

export function withoutClosing(machines: Machine[], marks: readonly Closing[] = closing): Machine[] {
  if (marks.length === 0) return machines;
  return machines.map((machine) => machine.snapshot ? { ...machine, snapshot: withoutClosingSnapshot(machine.snapshot, machine.id, marks) } : machine);
}
