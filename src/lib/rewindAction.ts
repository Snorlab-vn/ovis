/**
 * Claude Code's message is edited in the chat and sent again through its own rewind, which the server
 * drives (server/claude-rewind.ts); grok and agy hand rewind to their terminal, which sends no input.
 */
export type RewindAction = "edit" | "terminal" | null;

export function rewindAction(agent: string | null): RewindAction {
  return agent === "claude" ? "edit" : agent === "grok" || agent === "agy" ? "terminal" : null;
}

/** The pane and connection must still be available, with a native conversation. */
export interface RewindContext {
  agent: string | null;
  interactive: boolean;
  connected: boolean;
  ended: boolean;
  conversation: boolean;
}

export function rewindOffer(context: RewindContext): RewindAction {
  if (!context.interactive || !context.connected || context.ended || !context.conversation) return null;
  return rewindAction(context.agent);
}
