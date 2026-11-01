import divisionsJson from './data/divisions.json';

export type TeamId = 'A' | 'B';
export type Action = 'pick' | 'ban';
export type Target = 'map' | 'division' | 'side';
export type Side = 'nato' | 'pact';
export const SIDES: Side[] = ['nato', 'pact'];

const divisionSide = new Map<string, Side>(divisionsJson.divisions.map((d) => [d.id, d.side as Side]));
export const otherTeam = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');

export interface Step {
  team: TeamId;
  action: Action;
  target: Target;
  timer: number;
}

export interface Config {
  name: string;
  presetName: string;
  teamSize: number;
  mapIds: string[];
  divisionIds: string[];
  steps: Step[];
}

export interface TeamInfo {
  name: string;
  captain: string | null;
  connected: boolean;
}

export interface Entry {
  index: number;
  team: TeamId;
  action: Action;
  target: Target;
  itemId: string;
  auto: boolean;
}

export interface DraftState {
  id: string;
  config: Config;
  phase: 'lobby' | 'drafting' | 'done';
  stepIndex: number;
  deadline: number | null;
  history: Entry[];
  sides: Record<TeamId, Side | null>;
  teams: Record<TeamId, TeamInfo>;
  spectators: number;
  serverNow: number;
  createdAt: number;
  finishedAt: number | null;
}

export function parseStep(s: string): Step {
  const p = s.trim().split(/\s+/);
  const team = (p[0] || '').toUpperCase();
  const action = (p[1] || '').toLowerCase();
  const target = (p[2] || '').toLowerCase();
  const timer = Number(p[3] ?? 0);
  if ((team !== 'A' && team !== 'B') || (action !== 'pick' && action !== 'ban') || (target !== 'map' && target !== 'division' && target !== 'side') || !Number.isFinite(timer) || timer < 0) {
    throw new Error(`Invalid step "${s}" (expected "A ban map 30")`);
  }
  return { team, action, target, timer } as Step;
}

export function formatStep(s: Step): string {
  return `${s.team} ${s.action} ${s.target} ${s.timer}`;
}

export function currentStep(state: DraftState): Step | null {
  return state.phase === 'drafting' ? state.config.steps[state.stepIndex] ?? null : null;
}

export function itemsFor(state: DraftState, target: Target): string[] {
  return target === 'map' ? state.config.mapIds : target === 'division' ? state.config.divisionIds : SIDES;
}

// Maps: global (any pick/ban removes the map). Sides: one pick; the opponent gets the other side.
// Divisions: a team picks only from its own side; a ban removes a division from the OPPONENT's pool.
export function isAvailable(state: DraftState, team: TeamId, action: Action, target: Target, itemId: string): boolean {
  if (!itemsFor(state, target).includes(itemId)) return false;
  if (target === 'map') return !state.history.some((e) => e.target === 'map' && e.itemId === itemId);
  if (target === 'side') return state.sides[team] === null && state.sides[otherTeam(team)] !== itemId;
  const owner = action === 'pick' ? team : otherTeam(team);
  if (state.sides[owner] === null || divisionSide.get(itemId) !== state.sides[owner]) return false;
  return !state.history.some((e) => {
    if (e.target !== 'division' || e.itemId !== itemId) return false;
    if (e.action === 'ban') return e.team !== owner; // banned against owner
    return e.team === owner; // already picked by owner
  });
}

export function availableList(state: DraftState, step: Step): string[] {
  return itemsFor(state, step.target).filter((id) => isAvailable(state, step.team, step.action, step.target, id));
}

function recomputeSides(state: DraftState) {
  state.sides = { A: null, B: null };
  for (const e of state.history) {
    if (e.target === 'side') {
      state.sides[e.team] = e.itemId as Side;
      state.sides[otherTeam(e.team)] = e.itemId === 'nato' ? 'pact' : 'nato';
    }
  }
}

function goto(state: DraftState, index: number, now: number) {
  const steps = state.config.steps;
  while (index < steps.length && availableList(state, steps[index]).length === 0) index++;
  if (index >= steps.length) {
    state.phase = 'done';
    state.stepIndex = steps.length;
    state.deadline = null;
    state.finishedAt = state.finishedAt ?? now;
  } else {
    state.phase = 'drafting';
    state.stepIndex = index;
    const t = steps[index].timer;
    state.deadline = t > 0 ? now + t * 1000 : null;
    state.finishedAt = null;
  }
}

export function createState(id: string, config: Config, teamNames: { A: string; B: string }, now: number): DraftState {
  return {
    id,
    config,
    phase: 'lobby',
    stepIndex: 0,
    deadline: null,
    history: [],
    sides: { A: null, B: null },
    teams: {
      A: { name: teamNames.A, captain: null, connected: false },
      B: { name: teamNames.B, captain: null, connected: false },
    },
    spectators: 0,
    serverNow: now,
    createdAt: now,
    finishedAt: null,
  };
}

export function startDraft(state: DraftState, now: number) {
  if (state.phase !== 'lobby') return;
  goto(state, 0, now);
}

export function resetDraft(state: DraftState) {
  state.phase = 'lobby';
  state.stepIndex = 0;
  state.deadline = null;
  state.history = [];
  state.sides = { A: null, B: null };
  state.finishedAt = null;
}

export function undoLast(state: DraftState, now: number) {
  const e = state.history.pop();
  if (!e) return;
  recomputeSides(state);
  state.phase = 'drafting';
  goto(state, e.index, now);
}

export function applyPick(state: DraftState, team: TeamId, itemId: string, now: number, auto: boolean): string | null {
  const step = currentStep(state);
  if (!step) return 'Draft is not running';
  if (step.team !== team) return 'Not your turn';
  if (!isAvailable(state, step.team, step.action, step.target, itemId)) return 'Item not available';
  state.history.push({ index: state.stepIndex, team, action: step.action, target: step.target, itemId, auto });
    if (step.target === 'side') recomputeSides(state);
    goto(state, state.stepIndex + 1, now);
  return null;
}

export function randomAvailable(state: DraftState): string | null {
  const step = currentStep(state);
  if (!step) return null;
  const l = availableList(state, step);
  return l.length ? l[Math.floor(Math.random() * l.length)] : null;
}

export function picksOf(state: { history: Entry[] }, team: TeamId, target: Target): string[] {
  return state.history.filter((e) => e.action === 'pick' && e.team === team && e.target === target).map((e) => e.itemId);
}
