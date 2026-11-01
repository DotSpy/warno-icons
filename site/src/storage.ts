import type { DraftState, Entry, TeamId } from './draft';
import { formatStep, parseStep } from './draft';

export interface ResultData {
  v: 1;
  name: string;
  preset: string;
  teamSize: number;
  teams: Record<TeamId, { name: string; captain: string | null }>;
  sides?: Record<TeamId, string | null>;
  steps: string[];
  history: Entry[];
  createdAt: number;
  finishedAt: number | null;
}

export function toResult(state: DraftState): ResultData {
  return {
    v: 1,
    name: state.config.name,
    preset: state.config.presetName,
    teamSize: state.config.teamSize,
    teams: {
      A: { name: state.teams.A.name, captain: state.teams.A.captain },
      B: { name: state.teams.B.name, captain: state.teams.B.captain },
    },
    sides: state.sides,
    steps: state.config.steps.map(formatStep),
    history: state.history,
    createdAt: state.createdAt,
    finishedAt: state.finishedAt,
  };
}

export function resultSteps(r: ResultData) {
  return r.steps.map(parseStep);
}

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

// Compact array form for history entries keeps URLs short.
export async function encodeResult(r: ResultData): Promise<string> {
  const compact = { ...r, history: r.history.map((e) => [e.index, e.team, e.action, e.target, e.itemId, e.auto ? 1 : 0]) };
  const raw = new TextEncoder().encode(JSON.stringify(compact));
  return toB64Url(await pipe(raw, new CompressionStream('deflate-raw')));
}

export async function decodeResult(s: string): Promise<ResultData> {
  const raw = await pipe(fromB64Url(s), new DecompressionStream('deflate-raw'));
  const c = JSON.parse(new TextDecoder().decode(raw));
  c.history = c.history.map((a: any[]) => ({ index: a[0], team: a[1], action: a[2], target: a[3], itemId: a[4], auto: !!a[5] }));
  return c as ResultData;
}

export type HistoryRole = 'host' | 'captain' | 'spectator';
export interface HistoryRecord {
  id: string;
  role: HistoryRole;
  captainTeam?: TeamId;
  captainKey?: string;
  savedAt: number;
  state: DraftState;
}

const HISTORY_KEY = 'wd-history';

export function loadHistory(): HistoryRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function upsertHistory(rec: Omit<HistoryRecord, 'savedAt'>) {
  const list = loadHistory().filter((r) => r.id !== rec.id);
  list.unshift({ ...rec, savedAt: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
}

export function deleteHistory(id: string) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(loadHistory().filter((r) => r.id !== id)));
  localStorage.removeItem('wd-host-' + id);
}
