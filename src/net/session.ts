/**
 * Session PocketBase côté navigateur (docs/PHASES.md P4). Aucune dépendance
 * runtime (voir CLAUDE.md) : on parle en `fetch` brut à l'API REST de
 * PocketBase plutôt que d'embarquer le SDK JS officiel — même contrat, moins
 * de bundle. Le token est un JWT PocketBase (collection `users`, identité =
 * email) ; il est renvoyé tel quel au serveur de match dans `QueueSetup.token`
 * pour qu'il valide l'identité via `/auth-refresh` (voir `server/server.ts`).
 *
 * Persistance en `localStorage` : la session survit à un rechargement, mais
 * reste locale au navigateur — jouer sans compte fonctionne toujours (bot,
 * hotseat, en ligne non identifié).
 */

const STORAGE_KEY = "ricochet.session.v1";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  account_xp: number;
}

interface StoredSession {
  token: string;
  user: SessionUser;
}

function pocketbaseUrl(): string {
  const env = (import.meta as { env?: Record<string, string> }).env;
  return env?.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
}

function load(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(s: StoredSession | null): void {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage indisponible (navigation privée…) — la session reste en mémoire pour l'onglet.
  }
}

export class AuthError extends Error {}

let current: StoredSession | null = load();

async function pbFetch(path: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${pocketbaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new AuthError("Serveur de comptes injoignable — réessaie plus tard.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? `${res.status}`;
    throw new AuthError(msg);
  }
  return body;
}

function toUser(record: Record<string, unknown>): SessionUser {
  return {
    id: String(record.id),
    email: String(record.email ?? ""),
    name: String(record.name ?? ""),
    account_xp: Number(record.account_xp ?? 0),
  };
}

export const Session = {
  /** Utilisateur courant, `null` si non connecté. */
  user(): SessionUser | null {
    return current?.user ?? null;
  },

  /** Token JWT à transmettre au serveur de match (`QueueSetup.token`). */
  token(): string | undefined {
    return current?.token;
  },

  async register(email: string, password: string, name: string): Promise<SessionUser> {
    await pbFetch("/api/collections/users/records", {
      method: "POST",
      body: JSON.stringify({ email, password, passwordConfirm: password, name }),
    });
    return this.login(email, password);
  },

  async login(email: string, password: string): Promise<SessionUser> {
    const body = (await pbFetch("/api/collections/users/auth-with-password", {
      method: "POST",
      body: JSON.stringify({ identity: email, password }),
    })) as { token: string; record: Record<string, unknown> };
    const user = toUser(body.record);
    current = { token: body.token, user };
    save(current);
    return user;
  },

  logout(): void {
    current = null;
    save(null);
  },

  /** Rafraîchit le token + les champs du profil (XP de compte après un match). Silencieux si non connecté. */
  async refresh(): Promise<SessionUser | null> {
    if (!current) return null;
    try {
      const body = (await pbFetch("/api/collections/users/auth-refresh", {
        method: "POST",
        headers: { Authorization: current.token },
      })) as { token: string; record: Record<string, unknown> };
      const user = toUser(body.record);
      current = { token: body.token, user };
      save(current);
      return user;
    } catch {
      // token expiré/révoqué — repasser en invité plutôt que rester bloqué.
      current = null;
      save(null);
      return null;
    }
  },
};
