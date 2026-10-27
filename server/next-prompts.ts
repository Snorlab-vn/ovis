/**
 * GET /api/pane/next-prompts?pane_id=: the prompts the next-prompts Claude Code mod proposes for
 * a Claude pane's next turn, which Ovis shows as chips under the composer. The mod, patched for
 * Ovis, writes them per session to this state directory's next-prompts/<session id>.json as
 * `{ session_id, at, picks }`, and empties them when a prompt is sent. A pane with no Claude
 * session, or a session the mod never wrote for, has none. The dispatcher in index.ts runs the access gate first.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextPrompts } from "../shared/protocol.ts";
import { sessionSnapshot } from "./herdr/client.ts";
import { badRequest, errorResponse, jsonResponse, setRequestRoute } from "./http.ts";

/** a session id as Claude Code names its transcripts; anything else never reaches the path */
const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_PICKS = 5;

/** The picks written for `sessionId`, at most five non-empty strings; none when there is no readable file. */
export function readNextPrompts(stateDir: string, sessionId: string): NextPrompts {
  if (!SESSION_ID.test(sessionId)) return { picks: [], at: null };
  try {
    const parsed = JSON.parse(readFileSync(join(stateDir, "next-prompts", `${sessionId}.json`), "utf8")) as { picks?: unknown; at?: unknown };
    const picks = Array.isArray(parsed.picks) ? parsed.picks.filter((pick): pick is string => typeof pick === "string" && pick.trim() !== "").slice(0, MAX_PICKS) : [];
    return { picks, at: typeof parsed.at === "number" ? parsed.at : null };
  } catch {
    return { picks: [], at: null };
  }
}

export async function handleNextPromptsRequest(request: Request, url: URL, pathname: string, stateDir: string): Promise<Response | null> {
  if (pathname !== "/api/pane/next-prompts") return null;
  setRequestRoute(pathname);
  if (request.method !== "GET") return badRequest("method_not_allowed", "use GET");
  const paneId = url.searchParams.get("pane_id") ?? "";
  if (paneId === "") return badRequest("missing_pane_id", "pane_id is required");
  try {
    const pane = (await sessionSnapshot()).panes.find((candidate) => candidate.pane_id === paneId);
    const session = pane?.agent_session;
    if (!session || session.agent !== "claude" || session.kind !== "id") return jsonResponse({ picks: [], at: null } satisfies NextPrompts);
    return jsonResponse(readNextPrompts(stateDir, session.value));
  } catch (error) {
    return errorResponse(error);
  }
}
