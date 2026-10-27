/**
 * The next-prompts mod's proposals for a Claude pane (Tasky's chips under the composer): read when
 * the pane opens and when its turn ends. Haiku writes them a few seconds after the turn, so an
 * ended turn is read again a few times until they are there; a working pane has none.
 */
import { useEffect, useState } from "react";
import type { AgentStatus } from "../../shared/protocol.ts";
import { useMachineApi } from "./machineContext.tsx";

/** after a turn ends, when to look again for its proposals (ms) */
const RETRIES_MS = [0, 3_000, 8_000, 15_000];

export function useNextPrompts(paneId: string, agent: string | null, status: AgentStatus | undefined): [string[], () => void] {
  const { fetchNextPrompts } = useMachineApi();
  const [picks, setPicks] = useState<string[]>([]);
  const working = status === "working";
  useEffect(() => {
    setPicks([]);
    if (agent !== "claude" || working) return;
    let cancelled = false;
    const timers = RETRIES_MS.map((delay, index) => window.setTimeout(() => {
      void fetchNextPrompts(paneId).then((next) => {
        if (cancelled) return;
        setPicks(next);
        // found: the later reads are not needed
        if (next.length > 0) for (const timer of timers.slice(index + 1)) window.clearTimeout(timer);
      });
    }, delay));
    return () => { cancelled = true; for (const timer of timers) window.clearTimeout(timer); };
  }, [paneId, agent, working, fetchNextPrompts]);
  return [picks, () => setPicks([])];
}
