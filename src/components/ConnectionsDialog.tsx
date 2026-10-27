import { useEffect, useMemo, useState } from "react";
import { Pin, PinOff, SquareTerminal, X } from "lucide-react";

import "./ConnectionsDialog.css";
import type { TailnetPeer } from "../../shared/connections.ts";
import { SSH_USER } from "../../shared/connections.ts";
import { fetchTailnetPeers, openSsh } from "../lib/api.ts";
import { formatAgo } from "../lib/ago.ts";
import { useT } from "../lib/i18n.ts";
import { useSettings } from "../lib/settings.ts";
import { rememberSshUser, sshUsers } from "../lib/sshUsers.ts";
import { userErrorMessage } from "../lib/userError.ts";
import { nativeModalOver, useFocusTrap } from "../lib/useFocusTrap.ts";
import { useSheetSwipe } from "../lib/sheets.ts";
import { usePhoneSheetBack } from "../lib/sheetHistory.ts";

export interface ConnectionsDialogProps {
  /** the SSH tab is open on this PC: its pane, to show */
  onOpened: (paneId: string) => void;
  onClose: () => void;
}

/** `ssh` to a tailnet device as the user remembered for it, in a new tab of this PC's Connections workspace. */
export function startSsh(dns: string): Promise<string> {
  return openSsh(dns, sshUsers()[dns] ?? null).then((opened) => opened.pane_id);
}

/**
 * Connections (Tasky's): every device of this PC's tailnet, online first, with a user to SSH as and
 * Open SSH; the pin puts a device in the sidebar (Settings `sidebarDevices`, shared), so the
 * sidebar lists only the few the user chose.
 */
export function ConnectionsDialog({ onOpened, onClose }: ConnectionsDialogProps) {
  const t = useT();
  const { settings, update } = useSettings();
  const surface = useFocusTrap<HTMLElement>(true);
  useSheetSwipe(surface, onClose);
  usePhoneSheetBack(onClose, true);
  const [peers, setPeers] = useState<TailnetPeer[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState(sshUsers);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTailnetPeers().then((answer) => { if (!cancelled) { setPeers(answer.peers); setAvailable(answer.available); } },
      (reason: unknown) => { if (!cancelled) setError(userErrorMessage(reason).message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape" && !nativeModalOver(surface.current)) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return (peers ?? []).filter((peer) => words === "" || `${peer.name} ${peer.dns} ${peer.os}`.toLowerCase().includes(words));
  }, [peers, query]);
  const pinned = settings.sidebarDevices;
  const togglePin = (dns: string): void => update({ sidebarDevices: pinned.includes(dns) ? pinned.filter((name) => name !== dns) : [...pinned, dns] });
  const open = (peer: TailnetPeer): void => {
    const user = (users[peer.dns] ?? "").trim();
    if (user !== "" && !SSH_USER.test(user)) { setError(t("A user name is letters, digits, '.', '_' or '-'.")); return; }
    rememberSshUser(peer.dns, user);
    setOpening(peer.dns);
    setError(null);
    openSsh(peer.dns, user === "" ? null : user).then((opened) => onOpened(opened.pane_id),
      (reason: unknown) => setError(userErrorMessage(reason).message)).finally(() => setOpening(null));
  };
  const status = error ?? (peers === null ? t("Loading devices…") : !available ? t("Tailscale is not running on this PC.") : shown.length === 0 ? t("No devices match") : null);
  return (
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={surface} className="modal connections-dialog" role="dialog" aria-modal="true" aria-labelledby="connections-title" tabIndex={-1}>
        <header className="modal-header">
          <h2 className="modal-title" id="connections-title">{t("Connections")}</h2>
          <button type="button" className="icon-button" aria-label={t("Close dialog")} onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="modal-body">
          <input className="input connections-search" type="search" value={query} placeholder={t("Search devices")} aria-label={t("Search devices")} autoComplete="off" spellCheck={false} onChange={(event) => setQuery(event.target.value)} />
          <p className={status === null ? "visually-hidden" : error ? "field-error" : "field-hint"} role={error ? "alert" : "status"}>{status}</p>
          <ul className="connections-list">{shown.map((peer) => {
            const isPinned = pinned.includes(peer.dns);
            const seen = peer.online || peer.last_seen === null ? null : formatAgo(Date.now() - Date.parse(peer.last_seen));
            return <li key={peer.dns} className={`connections-peer${peer.online ? "" : " is-offline"}`}>
              <span className={`machine-dot is-${peer.online ? "connected" : "disconnected"}`} aria-hidden="true" />
              <span className="connections-peer-copy" title={peer.dns}>
                <span className="connections-peer-name">{peer.name}{peer.self && <span className="machine-kind">{t("This PC")}</span>}</span>
                <span className="connections-peer-place">{[peer.os, peer.online ? t("Online") : seen === null ? t("Offline") : t("Seen {when} ago", { when: seen })].filter(Boolean).join(" · ")}</span>
              </span>
              <input className="input connections-user" value={users[peer.dns] ?? ""} placeholder={t("user")} aria-label={t("SSH user for {name}", { name: peer.name })} autoComplete="off" autoCapitalize="off" spellCheck={false}
                onChange={(event) => setUsers({ ...users, [peer.dns]: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") open(peer); }} />
              <button type="button" className="btn connections-open" disabled={opening !== null} aria-busy={opening === peer.dns} onClick={() => open(peer)}><SquareTerminal aria-hidden="true" />{t("Open SSH")}</button>
              <button type="button" className="icon-button" aria-pressed={isPinned} aria-label={t(isPinned ? "Hide {name} from the sidebar" : "Show {name} in the sidebar", { name: peer.name })} title={t(isPinned ? "Hide {name} from the sidebar" : "Show {name} in the sidebar", { name: peer.name })} onClick={() => togglePin(peer.dns)}>
                {isPinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
              </button>
            </li>;
          })}</ul>
        </div>
      </section>
    </div>
  );
}
