import Peer, { type DataConnection } from 'peerjs';
import {
  applyPick,
  createState,
  randomAvailable,
  resetDraft,
  startDraft,
  undoLast,
  type Config,
  type DraftState,
  type TeamId,
} from './draft';
import { upsertHistory } from './storage';

export type Role = 'host' | TeamId | 'spec';

export interface Session {
  role: Role;
  roomId: string;
  state: DraftState | null;
  status: string;
  subscribe(fn: () => void): () => void;
  now(): number;
  act(itemId: string): void;
  start?(): void;
  undo?(): void;
  reset?(): void;
  keys?: Record<TeamId, string>;
  dispose(): void;
}

const rid = (n: number) => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (b) => chars[b % chars.length]).join('');
};

abstract class Base {
  state: DraftState | null = null;
  status = 'connecting…';
  protected listeners = new Set<() => void>();
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  protected notify() {
    this.listeners.forEach((f) => f());
  }
}

interface HostRecord {
  state: DraftState;
  keys: Record<TeamId, string>;
}
const hostKey = (id: string) => 'wd-host-' + id;

export class HostSession extends Base implements Session {
  role: Role = 'host';
  keys: Record<TeamId, string>;
  private peer: Peer;
  private conns = new Map<DataConnection, { role: Role; name: string }>();
  private timer: number;

  static create(config: Config, teams: { A: string; B: string }): string {
    const id = 'wd-' + rid(8);
    const rec: HostRecord = { state: createState(id, config, teams, Date.now()), keys: { A: rid(10), B: rid(10) } };
    localStorage.setItem(hostKey(id), JSON.stringify(rec));
    return id;
  }

  static exists(id: string) {
    return !!localStorage.getItem(hostKey(id));
  }

  constructor(public roomId: string) {
    super();
    const rec: HostRecord = JSON.parse(localStorage.getItem(hostKey(roomId)) || 'null');
    this.state = rec.state;
    this.keys = rec.keys;
    for (const t of ['A', 'B'] as TeamId[]) this.state.teams[t].connected = false;
    this.state.spectators = 0;
    if (this.state.phase === 'drafting') {
      const t = this.state.config.steps[this.state.stepIndex]?.timer ?? 0;
      this.state.deadline = t > 0 ? Date.now() + t * 1000 : null;
    }
    this.peer = new Peer(roomId);
    this.peer.on('open', () => {
      this.status = 'online';
      this.notify();
    });
    this.peer.on('error', (e: any) => {
      this.status = e.type === 'unavailable-id' ? 'Room is already open in another tab/window' : 'Network error: ' + e.type;
      this.notify();
    });
    this.peer.on('disconnected', () => {
      this.status = 'reconnecting to broker…';
      this.notify();
      this.peer.reconnect();
    });
    this.peer.on('connection', (conn) => {
      conn.on('data', (m) => this.onMsg(conn, m as any));
      conn.on('close', () => this.drop(conn));
      conn.on('error', () => this.drop(conn));
    });
    this.timer = window.setInterval(() => this.tick(), 250);
    this.publish();
  }

  now() {
    return Date.now();
  }

  private tick() {
    const s = this.state!;
    if (s.phase === 'drafting' && s.deadline !== null && Date.now() >= s.deadline) {
      const id = randomAvailable(s);
      if (id) applyPick(s, s.config.steps[s.stepIndex].team, id, Date.now(), true);
      this.publish();
    }
  }

  private onMsg(conn: DataConnection, m: any) {
    if (m.t === 'hello') {
      const role: Role = m.role;
      let name = String(m.name || '').slice(0, 30);
      if (role === 'A' || role === 'B') {
        if (m.key !== this.keys[role]) {
          conn.send({ t: 'error', message: 'Invalid captain link' });
          setTimeout(() => conn.close(), 200);
          return;
        }
        for (const [c, i] of this.conns) {
          if (i.role === role) {
            c.send({ t: 'kicked' });
            this.conns.delete(c);
            setTimeout(() => c.close(), 200);
          }
        }
        name = name || 'Captain ' + role;
        this.state!.teams[role].captain = name;
        this.state!.teams[role].connected = true;
      }
      this.conns.set(conn, { role: role === 'A' || role === 'B' ? role : 'spec', name });
      this.publish();
    } else if (m.t === 'act') {
      const info = this.conns.get(conn);
      if (!info || info.role === 'spec' || info.role === 'host') return;
      applyPick(this.state!, info.role, String(m.itemId), Date.now(), false);
      this.publish();
    }
  }

  private drop(conn: DataConnection) {
    const info = this.conns.get(conn);
    if (!info) return;
    this.conns.delete(conn);
    if (info.role === 'A' || info.role === 'B') this.state!.teams[info.role].connected = false;
    this.publish();
  }

  act(itemId: string) {
    const s = this.state!;
    if (s.phase !== 'drafting') return;
    applyPick(s, s.config.steps[s.stepIndex].team, itemId, Date.now(), false);
    this.publish();
  }
  start() {
    startDraft(this.state!, Date.now());
    this.publish();
  }
  undo() {
    undoLast(this.state!, Date.now());
    this.publish();
  }
  reset() {
    resetDraft(this.state!);
    this.publish();
  }

  private publish() {
    const s = this.state!;
    s.serverNow = Date.now();
    s.spectators = [...this.conns.values()].filter((i) => i.role === 'spec').length;
    localStorage.setItem(hostKey(this.roomId), JSON.stringify({ state: s, keys: this.keys } as HostRecord));
    upsertHistory({ id: this.roomId, role: 'host', state: s });
    const msg = { t: 'state', state: s };
    for (const c of this.conns.keys()) if (c.open) c.send(msg);
    this.notify();
  }

  dispose() {
    clearInterval(this.timer);
    this.peer.destroy();
  }
}

export class ClientSession extends Base implements Session {
  private peer: Peer;
  private conn: DataConnection | null = null;
  private offset = 0;
  private disposed = false;
  private retry: number | undefined;

  constructor(public roomId: string, public role: Role, private key: string, private name: string) {
    super();
    this.peer = new Peer();
    this.peer.on('open', () => this.connect());
    this.peer.on('error', (e: any) => {
      this.status = e.type === 'peer-unavailable' ? 'Host not found (is the host online?)' : 'Network error: ' + e.type;
      this.notify();
      if (!this.disposed && e.type === 'peer-unavailable') this.scheduleRetry();
    });
    this.peer.on('disconnected', () => {
      if (!this.disposed) this.peer.reconnect();
    });
  }

  now() {
    return Date.now() + this.offset;
  }

  private scheduleRetry() {
    clearTimeout(this.retry);
    this.retry = window.setTimeout(() => !this.disposed && this.connect(), 3000);
  }

  private connect() {
    if (this.disposed || !this.peer.open) return;
    this.status = 'connecting…';
    this.notify();
    const conn = this.peer.connect(this.roomId, { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      this.status = 'connected';
      conn.send({ t: 'hello', role: this.role, key: this.key, name: this.name });
      this.notify();
    });
    conn.on('data', (m: any) => {
      if (m.t === 'state') {
        this.state = m.state;
        this.offset = m.state.serverNow - Date.now();
        upsertHistory({
          id: this.roomId,
          role: this.role === 'A' || this.role === 'B' ? 'captain' : 'spectator',
          captainTeam: this.role === 'A' || this.role === 'B' ? this.role : undefined,
          captainKey: this.key || undefined,
          state: m.state,
        });
      } else if (m.t === 'kicked') {
        this.status = 'Disconnected: captain slot opened elsewhere';
        this.disposed = true;
      } else if (m.t === 'error') {
        this.status = m.message;
        this.disposed = true;
      }
      this.notify();
    });
    conn.on('close', () => {
      if (conn !== this.conn || this.disposed) return;
      this.status = 'disconnected - retrying…';
      this.notify();
      this.scheduleRetry();
    });
    window.setTimeout(() => {
      if (!conn.open && conn === this.conn && !this.disposed) {
        conn.close();
        this.status = 'host unreachable - retrying…';
        this.notify();
        this.scheduleRetry();
      }
    }, 10000);
  }

  act(itemId: string) {
    if (this.conn?.open) this.conn.send({ t: 'act', itemId });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.retry);
    this.peer.destroy();
  }
}
