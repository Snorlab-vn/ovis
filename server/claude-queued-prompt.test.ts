import { describe, expect, it } from "bun:test";
import { parseClaudeTranscript } from "./conversation.ts";

const jsonl = (...records: unknown[]) => records.map((record) => JSON.stringify(record)).join("\n");
const text = (turns: ReturnType<typeof parseClaudeTranscript>) => turns.map((turn) => `${turn.role}: ${turn.parts.map((part) => "text" in part ? part.text : part.kind).join(" | ")}`);

// recorded on Claude Code 2.1.312: a prompt sent while a background task's notification was being taken
describe("a prompt queued beside a task notification", () => {
  it("leaves the copy off the branch out, and shows the interrupt as Claude's screen does", () => {
    const turns = parseClaudeTranscript(jsonl(
      { type: "assistant", uuid: "a0", parentUuid: null, message: { content: [{ type: "text", text: "Monitoring." }], stop_reason: "end_turn" } },
      { type: "user", uuid: "p1", parentUuid: "a0", message: { content: "say Hi" } },
      { type: "user", uuid: "n1", parentUuid: "a0", origin: { kind: "task-notification" }, message: { content: "<task-notification>\n<task-id>bssozh282</task-id>\n<status>completed</status>\n<summary>Monitor ended</summary>\n</task-notification>" } },
      { type: "assistant", uuid: "a1", parentUuid: "n1", message: { content: [{ type: "text", text: "Noted." }], stop_reason: "end_turn" } },
      { type: "user", uuid: "i1", parentUuid: "a1", message: { content: [{ type: "text", text: "[Request interrupted by user]" }] } },
      { type: "user", uuid: "p2", parentUuid: "i1", message: { content: "say Hi" } },
      { type: "assistant", uuid: "a2", parentUuid: "p2", message: { content: [{ type: "text", text: "Hi" }], stop_reason: "end_turn" } },
    ));
    expect(text(turns)).toEqual(["assistant: Monitoring.", "assistant: Noted.", "user: [Request interrupted by user]", "user: say Hi", "assistant: Hi"]);
    expect(turns[2]!.parts[0]).toEqual({ kind: "notice", text: "[Request interrupted by user]", source: "interrupted" });
  });

  it("keeps a prompt the notification came after", () => {
    const turns = parseClaudeTranscript(jsonl(
      { type: "user", uuid: "p1", parentUuid: null, message: { content: "say Hi" } },
      { type: "user", uuid: "n1", parentUuid: "p1", message: { content: "<task-notification>\n<task-id>t</task-id>\n<status>completed</status>\n</task-notification>" } },
      { type: "assistant", uuid: "a1", parentUuid: "n1", message: { content: [{ type: "text", text: "Hi" }], stop_reason: "end_turn" } },
    ));
    expect(text(turns)).toEqual(["user: say Hi", "assistant: Hi"]);
  });
});
