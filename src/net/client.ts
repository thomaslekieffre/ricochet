/**
 * Browser-side WebSocket wrapper for the authoritative match server.
 * Thin: connect, send typed messages, subscribe to incoming ones. Reconnect is
 * best-effort; the match layer re-syncs via a `resync` message on reconnect.
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

export class NetClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private queueOut: string[] = [];
  private closedByUs = false;

  constructor(private url: string = defaultServerUrl()) {}

  connect(): Promise<void> {
    this.closedByUs = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        settled = true;
        for (const m of this.queueOut) ws.send(m);
        this.queueOut = [];
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
        if (!this.closedByUs) {
          for (const l of [...this.listeners]) l({ t: "error", msg: "connexion perdue" });
        }
      };
    });
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(m: ClientMsg): void {
    const raw = encode(m);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(raw);
    else this.queueOut.push(raw);
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}
