/**
 * How long ago a pane's status changed, as Tasky's rows say it: one unit, `0s`, `3m`, `2h`, `4d`.
 * The rows share one clock, which ticks while any of them is drawn.
 */
import { useSyncExternalStore } from "react";

const TICK_MS = 15_000;

export function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // a clock that stood still while nothing read it starts from now
  if (timer === undefined) now = Date.now();
  timer ??= setInterval(() => { now = Date.now(); for (const notify of listeners) notify(); }, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) { clearInterval(timer); timer = undefined; }
  };
}

/** the shared clock: the time of its last tick, refreshed each TICK_MS while a row reads it */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}
