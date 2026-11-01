import mapsJson from './data/maps.json';
import divisionsJson from './data/divisions.json';
import presetsJson from './data/presets.json';
import { parseStep, type Config } from './draft';

export interface MapDef {
  id: string;
  name: string;
  icon?: string;
}
export interface DivisionDef {
  id: string;
  name: string;
  side: 'nato' | 'pact';
  nation: string;
  icon: string;
}
export interface Preset {
  id: string;
  name: string;
  teamSize: number;
  pool?: string;
  mapIds?: string[];
  divisionIds?: string[];
  steps: string[];
}

export const maps: MapDef[] = mapsJson.maps as MapDef[];
export const divisions: DivisionDef[] = divisionsJson.divisions as DivisionDef[];
export const pools: Record<string, string[]> = mapsJson.pools;
export const builtinPresets: Preset[] = presetsJson.presets as Preset[];

const mapById = new Map(maps.map((m) => [m.id, m]));
const divById = new Map(divisions.map((d) => [d.id, d]));

export function mapName(id: string): string {
  return mapById.get(id)?.name ?? id;
}
export function getMap(id: string): MapDef | undefined {
  return mapById.get(id);
}
export function getDivision(id: string): DivisionDef | undefined {
  return divById.get(id);
}

export function iconUrl(path: string): string {
  return 'icons/' + encodeURI(path);
}

const CUSTOM_KEY = 'wd-custom-presets';

export function loadCustomPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
  } catch {
    return [];
  }
}
export function saveCustomPresets(list: Preset[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
}
export function allPresets(): Preset[] {
  return [...builtinPresets, ...loadCustomPresets()];
}

export function presetToConfig(p: Preset, roomName: string): Config {
  return {
    name: roomName,
    presetName: p.name,
    teamSize: p.teamSize,
    mapIds: p.mapIds ?? pools[p.pool ?? ''] ?? [],
    divisionIds: p.divisionIds ?? divisions.map((d) => d.id),
    steps: p.steps.map(parseStep),
  };
}

export function validatePreset(p: Preset): string[] {
  const problems: string[] = [];
  let steps;
  try {
    steps = p.steps.map(parseStep);
  } catch (e: any) {
    return [e.message];
  }
  const c = presetToConfig(p, '');
  if (!c.steps.length) problems.push('Preset has no steps.');
  const mapSteps = steps.filter((s) => s.target === 'map').length;
  if (steps.some((s) => s.target === 'division') && !steps.some((s) => s.target === 'side')) problems.push('Warning: division steps but no "pick side" step - divisions cannot be drafted until sides are known.');
  if (mapSteps > c.mapIds.length) problems.push(`More map steps (${mapSteps}) than maps in pool (${c.mapIds.length}).`);
  if (!steps.some((s) => s.action === 'pick' && s.target === 'map')) problems.push('Warning: no map pick step.');
  return problems;
}
