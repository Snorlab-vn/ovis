/**
 * Agent profiles: an agent started with an environment of its own, as a shell alias does
 * (`claude2` = `CLAUDE_CONFIG_DIR=… ANTHROPIC_BASE_URL=… claude`). Kept by hand in the state
 * directory's agent-profiles.json, mode 0600, since an environment can hold a token:
 *
 *   [{ "name": "claude2", "kind": "claude", "label": "Claude Code (claude2)", "env": { "CLAUDE_CONFIG_DIR": "…" } }]
 *
 * GET /api/agent-profiles lists their names, kinds and labels, never their environments. A create
 * request naming one (`profile`) starts its workspace or tab with that environment, and the agent in it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentProfile } from "../shared/agents.ts";
import { badRequest, jsonResponse, setRequestRoute } from "./http.ts";

export interface StoredAgentProfile extends AgentProfile { env: Record<string, string> }

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The profiles in `stateDir`'s agent-profiles.json, read on each call; a malformed entry is left out, a missing file is none. */
export function readAgentProfiles(stateDir: string): StoredAgentProfile[] {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(join(stateDir, "agent-profiles.json"), "utf8")); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): StoredAgentProfile[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { name, kind, label, env } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !NAME.test(name) || typeof kind !== "string" || kind === "") return [];
    if (typeof env !== "object" || env === null || Array.isArray(env)) return [];
    const pairs = Object.entries(env);
    if (!pairs.every(([key, value]) => ENV_NAME.test(key) && typeof value === "string")) return [];
    return [{ name, kind, label: typeof label === "string" && label.trim() !== "" ? label.trim() : `${kind} (${name})`, env: Object.fromEntries(pairs) as Record<string, string> }];
  });
}

/** GET /api/agent-profiles, or null when the path is another. */
export function handleAgentProfilesRequest(request: Request, pathname: string, stateDir: string): Response | null {
  if (pathname !== "/api/agent-profiles") return null;
  setRequestRoute(pathname);
  if (request.method !== "GET") return badRequest("method_not_allowed", "use GET");
  return jsonResponse({ profiles: readAgentProfiles(stateDir).map(({ name, kind, label }): AgentProfile => ({ name, kind, label })) });
}
