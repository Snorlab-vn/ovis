import { describe, expect, it } from "bun:test";
import { rewindOffer, type RewindContext } from "./rewindAction.ts";

const ready: RewindContext = { agent: "claude", interactive: true, connected: true, ended: false, conversation: true };

describe("a user message's rewind action", () => {
  it("edits a Claude Code message in the chat, and opens the terminal for grok and agy", () => {
    expect(rewindOffer(ready)).toBe("edit");
    for (const agent of ["grok", "agy"]) expect(rewindOffer({ ...ready, agent })).toBe("terminal");
  });

  it("offers nothing when the connection or native conversation is unavailable", () => {
    for (const agent of ["claude", "grok", "agy"]) {
      for (const unavailable of [{ interactive: false }, { connected: false }, { ended: true }, { conversation: false }]) {
        expect(rewindOffer({ ...ready, agent, ...unavailable })).toBeNull();
      }
    }
  });

  it("offers nothing for an agent without a rewind", () => {
    for (const agent of ["codex", "omp", "opencode", null]) expect(rewindOffer({ ...ready, agent })).toBeNull();
  });
});
