import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { restoreOptionDigit, rewindCursorRow, rewindRowMatches } from "./claude-rewind.ts";
import * as herdr from "./herdr/client.ts";
import { createServer } from "./index.ts";

const fixture = (name: string): string => readFileSync(join(import.meta.dir, "fixtures", `claude-rewind-${name}.txt`), "utf8");

describe("reading Claude's rewind dialog", () => {
  it("finds the picker's cursor row, never the box's", () => {
    expect(rewindCursorRow(fixture("2.1.311-picker-top"))).toBe("Reply with just the word ALPHA");
    expect(rewindCursorRow(fixture("2.1.311-picker-multiline"))).toBe("(current)");
    expect(rewindCursorRow(fixture("2.1.304-select-banana-40"))).toBe("banana");
    expect(rewindCursorRow(fixture("2.1.311-confirm"))).toBeNull();
    expect(rewindCursorRow(fixture("2.1.311-cleared"))).toBeNull();
  });

  it("matches a row to its message: the whole first line, or its start cut with …", () => {
    expect(rewindRowMatches("Reply with just the word ALPHA", "Reply with just the word ALPHA")).toBe(true);
    expect(rewindRowMatches("First line: reply DELTA…", "First line: reply DELTA\nsecond line")).toBe(true);
    expect(rewindRowMatches("Create a file named…", "Create a file named note.txt")).toBe(true);
    expect(rewindRowMatches("Reply with just the word ALPHA", "Reply with just the word ALPHABET")).toBe(false);
    expect(rewindRowMatches("…", "anything")).toBe(false);
    expect(rewindRowMatches("(current)", "")).toBe(false);
  });

  it("takes the first option that restores the conversation, as Claude's Enter does", () => {
    expect(restoreOptionDigit(fixture("2.1.311-confirm"))).toBe("1");
    expect(restoreOptionDigit(fixture("2.1.311-confirm-code"))).toBe("1");
    expect(restoreOptionDigit(fixture("2.1.311-confirm-code").replace("1. Restore code and conversation", "1. Summarize from here"))).toBe("2");
    expect(restoreOptionDigit(fixture("2.1.311-picker-top"))).toBeNull();
  });
});

/** A Claude Code terminal that answers keys as 2.1.311 does, drawn the way the fixtures are. */
class FakeClaude {
  mode: "idle" | "picker" | "confirm" = "idle";
  box: string[] = [];
  cursor = 0;
  keys: string[] = [];
  sent: string[] = [];
  constructor(public messages: string[], public stuck = false) {}
  screen(): string {
    const bar = "▔".repeat(60);
    const rule = "─".repeat(60);
    if (this.mode === "picker") {
      const rows = [...this.messages.map((message) => message.split("\n")[0]! + (message.includes("\n") ? "…" : "")), "(current)"]
        .map((row, index) => `${index === this.cursor ? "   ❯ " : "     "}${row}`);
      return [`⏺ done`, bar, "   Rewind", "", "   Restore the code and/or conversation to the point before…", "", ...rows, "", "   Enter to continue · Esc to cancel"].join("\n");
    }
    if (this.mode === "confirm") {
      return [bar, "   Rewind", "", "   Confirm you want to restore to the point before you sent this message:", "", `   │ ${this.messages[this.cursor]}`, "",
        "   ❯ 1. Restore conversation", "     2. Summarize from here", "     3. Summarize up to here", "     4. Never mind"].join("\n");
    }
    const box = this.box.length === 0 ? ["❯"] : this.box.map((row, index) => index === 0 ? `❯ ${row}` : `  ${row}`);
    return ["⏺ done", "", rule, ...box, rule, "  ⏵⏵ auto mode on (shift+tab to cycle)"].join("\n");
  }
  text(text: string): void { if (this.mode === "idle") this.box = text.split("\n"); }
  press(key: string): void {
    this.keys.push(key);
    if (this.mode === "idle") {
      if (key === "Enter" && this.box.join("\n") === "/rewind") { this.box = []; this.mode = "picker"; this.cursor = this.messages.length; }
      else if (["ctrl+k", "ctrl+u"].includes(key) && !this.stuck) this.box = this.box.length > 0 ? [...this.box.slice(0, -1), ""] : [];
      else if (key === "Backspace" && !this.stuck) this.box = this.box.length > 0 && this.box.at(-1) === "" ? this.box.slice(0, -1) : this.box;
    } else if (this.mode === "picker") {
      if (key === "Up") this.cursor = Math.max(0, this.cursor - 1);
      if (key === "Down") this.cursor = Math.min(this.messages.length, this.cursor + 1);
      if (key === "Enter" && this.cursor < this.messages.length) this.mode = "confirm";
      if (key === "Escape") this.mode = "idle";
    } else if (key === "1") {
      this.box = this.messages[this.cursor]!.split("\n");
      this.messages = this.messages.slice(0, this.cursor);
      this.mode = "idle";
    } else if (key === "Escape") this.mode = "picker";
  }
}

describe("POST /api/pane/rewind", () => {
  let stateDir: string;
  let server: ReturnType<typeof createServer>;
  let claude: FakeClaude;
  let status = "idle";
  const spies = [
    spyOn(herdr, "sessionSnapshot").mockImplementation(async () => ({ panes: [{ pane_id: "w1:p1", agent: "claude", agent_status: status }], workspaces: [], tabs: [], agents: [] }) as unknown as Awaited<ReturnType<typeof herdr.sessionSnapshot>>),
    spyOn(herdr, "paneRead").mockImplementation(async () => ({ text: claude.screen() }) as unknown as Awaited<ReturnType<typeof herdr.paneRead>>),
    spyOn(herdr, "paneSendText").mockImplementation(async (_pane, text) => claude.text(text)),
    spyOn(herdr, "paneSendKeys").mockImplementation(async (_pane, keys) => { for (const key of keys) claude.press(key); }),
    spyOn(herdr, "agentPrompt").mockImplementation(async (_pane, text) => { claude.sent.push(text); }),
  ];
  const rewind = async (body: Record<string, unknown>) => {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/pane/rewind`, { method: "POST", headers: { "x-herdr-machine": "1", "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify({ pane_id: "w1:p1", ...body }) });
    return [response.status, ((await response.json()) as { error?: { code: string } }).error?.code ?? "ok"];
  };

  beforeAll(() => {
    stateDir = mkdtempSync(join(tmpdir(), "ovis-rewind-"));
    server = createServer({ port: 0, hostname: "127.0.0.1", stateDir, token: "t", machines: false, sidecar: false, tailscaleOwner: null });
  });
  beforeEach(() => { status = "idle"; });
  afterAll(() => {
    server.stop();
    for (const spy of spies) spy.mockRestore();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("goes back to the message, empties the box Claude fills with it, and sends the new text", async () => {
    claude = new FakeClaude(["Reply ALPHA", "Reply BRAVO\nand more", "Reply CHARLIE"]);
    expect(await rewind({ message: "Reply BRAVO\nand more", text: "Reply DELTA" })).toEqual([200, "ok"]);
    expect(claude.messages).toEqual(["Reply ALPHA"]);
    expect(claude.mode).toBe("idle");
    expect(claude.sent).toEqual(["Reply DELTA"]);
  });

  it("passes later messages with the same first line by", async () => {
    claude = new FakeClaude(["go on", "check", "go on"]);
    expect(await rewind({ message: "go on", skip: 1, text: "stop" })).toEqual([200, "ok"]);
    expect(claude.messages).toEqual([]);
  });

  it("goes back to the oldest copy Claude still lists when the chat shows more copies than Claude has", async () => {
    claude = new FakeClaude(["Reply ALPHA", "say Hi", "Reply BRAVO"]);
    expect(await rewind({ message: "say Hi", skip: 1, text: "say Hii" })).toEqual([200, "ok"]);
    expect(claude.messages).toEqual(["Reply ALPHA"]);
    expect(claude.sent).toEqual(["say Hii"]);
  });

  it("leaves the dialog and sends nothing when the message is not in the list", async () => {
    claude = new FakeClaude(["Reply ALPHA"]);
    expect(await rewind({ message: "never sent", text: "x" })).toEqual([409, "message_not_found"]);
    expect(claude.mode).toBe("idle");
    expect(claude.messages).toEqual(["Reply ALPHA"]);
    expect(claude.sent).toEqual([]);
  });

  it("touches nothing while Claude works or has text in its box", async () => {
    claude = new FakeClaude(["Reply ALPHA"]);
    status = "working";
    expect(await rewind({ message: "Reply ALPHA", text: "x" })).toEqual([409, "agent_busy"]);
    status = "idle";
    claude.box = ["half typed"];
    expect(await rewind({ message: "Reply ALPHA", text: "x" })).toEqual([409, "input_has_draft"]);
    expect(claude.keys).toEqual([]);
  });

  it("says the new text was not sent when the box will not empty", async () => {
    claude = new FakeClaude(["Reply ALPHA"], true);
    expect(await rewind({ message: "Reply ALPHA", text: "x" })).toEqual([409, "restored_not_sent"]);
    expect(claude.sent).toEqual([]);
  });

  it("refuses a body without the message or the new text", async () => {
    expect(await rewind({ message: "", text: "x" })).toEqual([400, "invalid_message"]);
    expect(await rewind({ message: "a", text: " " })).toEqual([400, "invalid_text"]);
    expect(await rewind({ message: "a", text: "b", skip: -1 })).toEqual([400, "invalid_skip"]);
  });
});
