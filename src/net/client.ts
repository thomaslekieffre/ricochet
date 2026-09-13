/**
 * Browser-side WebSocket wrapper for the authoritative match server.
 * Thin: connect, send typed messages, subscribe to incoming ones. Reconnect
 * is real (backoff below) once a first connection has succeeded — the match
 * layer (`Match.onNetStatus`) re-syncs via a `resync` message once
 * `onStatus` reports "reconnected". A failure on the very first `connect()`
 * is NOT retried here — that's a "server unreachable" case the caller
 * already handles (`App.tsx`'s `.connect().catch(...)`).
 */

import { DEFAULT_PORT, decode, encode } from "./protocol";
import type { ClientMsg, ServerMsg } from "./protocol";

export function defaultServerUrl(): string {
  const q = new URLSearchParams(location.search).get("server");
  if (q) return q;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname}:${DEFAULT_PORT}`;
}

type Listener = (m: ServerMsg) => void;
export type ConnStatus = "reconnecting" | "reconnected";
type StatusListener = (s: ConnStatus) => void;

/** Délais entre tentatives une fois qu'on a été connecté puis coupé. */
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 4000];

export class NetClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private queueOut: string[] = [];
  private closedByUs = false;
  private everConnected = false;
  private reconnectAttempt = 0;
  private reconnectTimer = 0;

  constructor(private url: string = defaultServerUrl()) {}

  connect(): Promise<void> {
    this.closedByUs = false;
    return this.openSocket();
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        settled = true;
        const wasReconnecting = this.reconnectAttempt > 0;
        this.everConnected = true;
        this.reconnectAttempt = 0;
        for (const m of this.queueOut) ws.send(m);
        this.queueOut = [];
        if (wasReconnecting) for (const l of [...this.statusListeners]) l("reconnected");
        resolve();
      };
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = decode<ServerMsg>(String(ev.data));
        } catch {
          return;
        }
        for (const l of [...this.listeners]) l(msg);
      };
      ws.onerror = () => {
        if (!settled) reject(new Error("connexion au serveur impossible"));
      };
      ws.onclose = () => {
        this.ws = null;
        if (this.closedByUs) return;
        if (this.everConnected && this.reconnectAttempt < RECONNECT_DELAYS_MS.length) {
          const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt];
          this.reconnectAttempt += 1;
          for (const l of [...this.statusListeners]) l("reconnecting");
          this.reconnectTimer = window.setTimeout(() => {
            if (this.closedByUs) return;
            this.openSocket().catch(() => {
              // onclose du socket manqué se redéclenchera tout seul via son propre onclose
            });
          }, delay);
          return;
        }
        for (const l of [...this.listeners]) l({ t: "error", msg: "connexion perdue" });
      };
    });
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Statut de reconnexion (pas des messages du protocole) — cf. `Match.onNetStatus`. */
  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  send(m: ClientMsg): void {
    const raw = encode(m);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(raw);
    else this.queueOut.push(raw);
  }

  close(): void {
    this.closedByUs = true;
    window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
    this.statusListeners.clear();
  }
}
