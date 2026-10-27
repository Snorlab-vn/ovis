/**
 * POST /api/pane/rewind { pane_id, message, skip, text }: the chat's "edit and resend" of a Claude Code
 * message. Claude's own /rewind is driven from the screen, as a user would, and every step is read
 * back before the next (measured on Claude Code 2.1.311, fixtures claude-rewind-2.1.311-*):
 *
 * 1. `/rewind` + Enter opens the picker: the user's messages, a long or multi-line one by the start of
 *    its first line and `…`, the cursor `❯` on `(current)` at the bottom.
 * 2. Up until the cursor row is the message (`skip` later messages with the same first line go by),
 *    then Enter. At the top without it, nothing is restored.
 * 3. The confirm screen's first `Restore … conversation` option, by the digit it shows: what Claude's own
 *    rewind does on Enter (the code too when Claude has a checkpoint of it).
 * 4. Claude puts the message back in its box: it is emptied, row by row, and the new text sent as
 *    every chat send is (agentPrompt), in the pane's send queue.
 *
 * Anything else on screen at any step: Esc until the dialog is gone, and a 409 says which step it was.
 * The dispatcher in index.ts runs the access gate first.
 */
import { HerdrError, agentPrompt, paneRead, paneSendKeys, paneSendText, sessionSnapshot } from "./herdr/client.ts";
import { badRequest, errorResponse, jsonResponse, readJsonObject, setRequestRoute } from "./http.ts";
import { claudeInputBoxContent, claudeInputDraft, claudeInputEmpty, claudeRewindOpen } from "./prompt.ts";
import { closeMention } from "./core/composer.ts";

const MAX_TEXT = 20_000;
const MAX_SKIP = 100;
/** how many rows the picker is walked up at most */
const MAX_ROWS = 300;
const STEP_TIMEOUT_MS = 3_000;
const POLL_MS = 100;

const normalized = (text: string): string => text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const firstLine = (message: string): string => normalized(message.trim().split("\n")[0] ?? "");

/** The rows of the rewind dialog: what follows its top edge (a row of `▔`). */
function panel(screen: string): string[] | null {
  const lines = screen.split("\n");
  let top = -1;
  lines.forEach((line, index) => { if (/^▔{8,}/.test(line.trim())) top = index; });
  return top < 0 ? null : lines.slice(top + 1);
}

/** The picker's cursor row, `❯` and its indentation taken off; null when the picker is not on screen. */
export function rewindCursorRow(screen: string): string | null {
  const rows = panel(screen);
  if (rows === null || !rows.some((row) => row.trim() === "Rewind") || rows.some((row) => /Confirm you want to restore/.test(row))) return null;
  const cursor = rows.find((row) => /^\s+❯\s/.test(row));
  return cursor === undefined ? null : normalized(cursor.replace(/^\s+❯\s/, ""));
}

/** Whether a picker row shows `message`: its first line, or the start of it cut with `…`. */
export function rewindRowMatches(row: string, message: string): boolean {
  const line = firstLine(message);
  if (line === "") return false;
  const shown = normalized(row);
  if (shown === line) return true;
  const cut = shown.endsWith("…") ? normalized(shown.slice(0, -1)) : null;
  return cut !== null && cut.length > 0 && line.startsWith(cut);
}

/** The confirm screen's first option that restores the conversation (with the code or not), by its digit. */
export function restoreOptionDigit(screen: string): string | null {
  const rows = panel(screen);
  if (rows === null || !rows.some((row) => /Confirm you want to restore/.test(row))) return null;
  for (const row of rows) {
    const option = /^\s*(?:[❯↓↑]\s*)?(\d)\.\s+(.+?)\s*$/.exec(row);
    if (option && /^Restore (?:code and )?conversation$/.test(option[2]!)) return option[1]!;
  }
  return null;
}

export class RewindError extends HerdrError {
  constructor(code: string, message: string) { super(code, message); }
}

const read = async (paneId: string): Promise<string> => (await paneRead({ paneId, source: "detection", format: "text" })).text;

async function until(paneId: string, check: (screen: string) => boolean): Promise<string | null> {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  for (;;) {
    const screen = await read(paneId);
    if (check(screen)) return screen;
    if (Date.now() > deadline) return null;
    await Bun.sleep(POLL_MS);
  }
}

/** Esc until the dialog is gone (a confirm screen goes back to the picker first), then the refusal. */
async function leave(paneId: string, code: string, message: string): Promise<never> {
  for (let presses = 0; presses < 4 && claudeRewindOpen(await read(paneId)); presses++) {
    await paneSendKeys(paneId, ["Escape"]);
    await Bun.sleep(300);
  }
  throw new RewindError(code, message);
}

/** The whole sequence, for a pane already known to run Claude Code at rest with an empty box. */
export async function rewindAndSend(paneId: string, message: string, skip: number, text: string): Promise<void> {
  const before = await read(paneId);
  if (claudeRewindOpen(before)) throw new RewindError("rewind_dialog_open", "Claude's rewind dialog is already open in the terminal");
  if (claudeInputDraft(before, null)) throw new RewindError("input_has_draft", "Claude's message box has text in it: send or clear it in the terminal first");

  await paneSendText(paneId, "/rewind");
  await Bun.sleep(POLL_MS);
  await paneSendKeys(paneId, ["Enter"]);
  let screen = await until(paneId, (current) => rewindCursorRow(current) !== null);
  if (screen === null) return leave(paneId, "rewind_not_opened", "Claude's rewind did not open");

  let skipped = 0;
  for (let rows = 0; ; rows++) {
    const row = rewindCursorRow(screen)!;
    if (rewindRowMatches(row, message)) {
      if (skipped === skip) break;
      skipped += 1;
    }
    if (rows >= MAX_ROWS) return leave(paneId, "message_not_found", "The message is not in Claude's rewind list");
    const shown = panel(screen)!.join("\n");
    await paneSendKeys(paneId, ["Up"]);
    // a move redraws the list; a list that stays as it was is at its top
    const moved = await until(paneId, (current) => rewindCursorRow(current) !== null && panel(current)!.join("\n") !== shown);
    if (moved === null) return leave(paneId, "message_not_found", "The message is not in Claude's rewind list");
    screen = moved;
  }

  await paneSendKeys(paneId, ["Enter"]);
  const confirm = await until(paneId, (current) => restoreOptionDigit(current) !== null);
  if (confirm === null) return leave(paneId, "restore_not_offered", "Claude's rewind offered no way to restore the conversation");
  await paneSendKeys(paneId, [restoreOptionDigit(confirm)!]);

  // Claude closes the dialog and puts the message back in its box
  const restored = await until(paneId, (current) => !claudeRewindOpen(current) && claudeInputDraft(current, null));
  if (restored === null) throw new RewindError("restored_not_sent", "Claude went back, but its box did not show the message: the new text was not sent");
  const rowsOf = (claudeInputBoxContent(restored) ?? "").split("\n").length;
  for (let round = 0; ; round++) {
    const current = await read(paneId);
    if (claudeInputEmpty(current, null)) break;
    if (round > rowsOf + 3) throw new RewindError("restored_not_sent", "Claude went back, but its box would not empty: the old message is still in it and the new text was not sent");
    await paneSendKeys(paneId, ["ctrl+k", "ctrl+u", "Backspace"]);
    await Bun.sleep(POLL_MS);
  }
  await agentPrompt(paneId, closeMention(text));
}

/** The answer for /api/pane/rewind, or null when the path is another. */
export async function handleRewindRequest(request: Request, pathname: string, serialize: <T>(paneId: string, task: () => Promise<T>) => Promise<T>): Promise<Response | null> {
  if (pathname !== "/api/pane/rewind") return null;
  setRequestRoute(pathname);
  if (request.method !== "POST") return badRequest("method_not_allowed", "use POST");
  const payload = await readJsonObject<{ pane_id?: unknown; message?: unknown; skip?: unknown; text?: unknown }>(request);
  if (payload instanceof Response) return payload;
  const { pane_id: paneId, message, skip = 0, text } = payload;
  if (typeof paneId !== "string" || paneId === "") return badRequest("missing_pane_id", "pane_id is required");
  if (typeof message !== "string" || firstLine(message) === "") return badRequest("invalid_message", "message must be the text of the message to go back to");
  if (typeof text !== "string" || text.trim() === "" || text.length > MAX_TEXT) return badRequest("invalid_text", `text must be 1 to ${MAX_TEXT} characters`);
  if (typeof skip !== "number" || !Number.isInteger(skip) || skip < 0 || skip > MAX_SKIP) return badRequest("invalid_skip", `skip must be a whole number from 0 to ${MAX_SKIP}`);
  try {
    const pane = (await sessionSnapshot()).panes.find((candidate) => candidate.pane_id === paneId);
    if (!pane) return jsonResponse({ error: { code: "pane_not_found", message: "no such pane" } }, 404);
    if (pane.agent !== "claude") return badRequest("not_claude", "only a Claude Code pane can be rewound from the chat");
    if (pane.agent_status === "working" || pane.agent_status === "blocked") {
      return jsonResponse({ error: { code: "agent_busy", message: "Claude is working or waiting for an answer: rewind once it is done" } }, 409);
    }
    await serialize(paneId, () => rewindAndSend(paneId, message, skip, text));
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof RewindError) return jsonResponse({ error: { code: error.code, message: error.message } }, 409);
    return errorResponse(error);
  }
}
