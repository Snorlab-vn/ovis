/**
 * The Agents list's rows in the order it draws them: the pinned card first, in pin order, then
 * every PC's agents in the roster's order, or in that PC's own Activity order when Settings asks
 * for it (lib/sidebarOrder.ts). A row is its PC and its pane: two PCs may reuse a pane id.
 */
import type { Machine } from "../../shared/machines.ts";
import { sidebarAgents, type SidebarAgent } from "./sidebarAgents.ts";
import { activityOrder } from "./sidebarOrder.ts";
import { sidebarPinKey, splitPinnedRows } from "./sidebarPins.ts";
import { paneMuteKey } from "./paneMutes.ts";

export interface AgentRow { machine: Machine; entry: SidebarAgent }

export interface AgentRosterOptions {
  /** Settings → Agents order: Activity sorts each PC's rows by that PC's own counters */
  byActivity: boolean;
  /** a PC's state-change counters, as lib/sidebarActivity.tsx keeps them */
  seqs(machineId: string): ReadonlyMap<string, number>;
  /** the pinned rows' keys (lib/sidebarPins.ts), in pin order */
  pinned: readonly string[];
}

/** Every PC's agent rows as the list draws them: the pinned ones first, then the rest in source order. */
export function agentRoster(machines: readonly Machine[], options: AgentRosterOptions): { pinned: AgentRow[]; rest: AgentRow[] } {
  const rows = machines.flatMap((machine) => {
    const agents = sidebarAgents(machine.snapshot);
    return (options.byActivity ? activityOrder(agents, (entry) => entry.pane, options.seqs(machine.id)) : agents).map((entry): AgentRow => ({ machine, entry }));
  });
  return splitPinnedRows(rows, options.pinned, ({ machine, entry }) => sidebarPinKey(machine.id, entry.pane.pane_id));
}

/**
 * Needs attention (Tasky's list): the rows that wait on the user, an agent asking first, then one
 * that finished and was not opened since, each newest change first. A muted pane is left out, as
 * its alerts are. `status` is the state the rows show (lib/sidebarActivity.tsx), a seen finish idle.
 */
export function attentionRows(rows: readonly AgentRow[], status: (row: AgentRow) => string | undefined, muted: readonly string[] | null): AgentRow[] {
  const rank = (row: AgentRow): number => {
    const shown = status(row);
    return shown === "blocked" ? 0 : shown === "done" ? 1 : -1;
  };
  return rows
    .filter((row) => row.machine.state === "connected" && rank(row) >= 0 && !muted?.includes(paneMuteKey(row.machine.id, row.entry.pane.pane_id)))
    .map((row, index) => ({ row, index, rank: rank(row), since: row.entry.pane.status_since ?? 0 }))
    .sort((a, b) => a.rank - b.rank || b.since - a.since || a.index - b.index)
    .map((entry) => entry.row);
}
