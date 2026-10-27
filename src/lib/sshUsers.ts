/**
 * The user each tailnet device's SSH runs as, remembered in this browser (Connections): blank is
 * none, and `ssh` then takes ~/.ssh/config's or this PC's own. A per-device convenience, not shared.
 */
const KEY = "ovis:ssh-users";

export function sshUsers(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch { return {}; }
}

export function rememberSshUser(dns: string, user: string): void {
  const users = sshUsers();
  if (user === "") delete users[dns]; else users[dns] = user;
  try { localStorage.setItem(KEY, JSON.stringify(users)); } catch { /* storage denied: the user is asked again */ }
}
