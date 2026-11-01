import { clear, h } from '../dom';
import { builtinPresets, divisions, loadCustomPresets, maps, pools, saveCustomPresets, validatePreset, type Preset } from '../data';
import { parseStep } from '../draft';
import { itemIcon } from './tiles';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function normalize(p: Preset): Preset {
  const q = clone(p);
  if (!q.mapIds) q.mapIds = [...(pools[q.pool ?? ''] ?? [])];
  if (!q.divisionIds) q.divisionIds = divisions.map((d) => d.id);
  delete q.pool;
  return q;
}

export function editorView(): HTMLElement {
  const customs = loadCustomPresets();
  let p: Preset = normalize(builtinPresets[1]);
  p.id = 'custom-' + Date.now();
  p.name = 'My preset';

  const root = h('div', null);
  const msg = h('div', { class: 'muted' });
  const json = h('textarea', { rows: '8' });

  function toggleTile(target: 'map' | 'division', id: string, name: string, on: boolean, flip: () => void) {
    return h('div', { class: 'tile actionable' + (on ? ' selected' : ' dim'), onclick: flip, title: name }, itemIcon(target, id), h('div', { class: 'tname' }, name));
  }

  function render() {
    const stepRows = p.steps.map((raw, i) => {
      let s = { team: 'A', action: 'ban', target: 'map', timer: 30 } as any;
      try { s = parseStep(raw); } catch { /* keep defaults */ }
      const set = (patch: any) => { p.steps[i] = `${patch.team ?? s.team} ${patch.action ?? s.action} ${patch.target ?? s.target} ${patch.timer ?? s.timer}`; render(); };
      const opt = (v: string, cur: string) => h('option', { value: v, selected: v === cur }, v);
      const move = (d: number) => { const j = i + d; if (j < 0 || j >= p.steps.length) return; [p.steps[i], p.steps[j]] = [p.steps[j], p.steps[i]]; render(); };
      return h('div', { class: 'steprow' },
        h('span', { class: 'muted' }, String(i + 1)),
        h('select', { onchange: (e: Event) => set({ team: (e.target as HTMLSelectElement).value }) }, opt('A', s.team), opt('B', s.team)),
        h('select', { onchange: (e: Event) => set({ action: (e.target as HTMLSelectElement).value }) }, opt('ban', s.action), opt('pick', s.action)),
        h('select', { onchange: (e: Event) => set({ target: (e.target as HTMLSelectElement).value }) }, opt('map', s.target), opt('side', s.target), opt('division', s.target)),
        h('input', { type: 'number', min: '0', value: String(s.timer), title: 'Timer in seconds (0 = none)', onchange: (e: Event) => set({ timer: Number((e.target as HTMLInputElement).value) }) }),
        h('button', { class: 'small', onclick: () => move(-1) }, '↑'),
        h('button', { class: 'small', onclick: () => move(1) }, '↓'),
        h('button', { class: 'small danger', onclick: () => { p.steps.splice(i, 1); render(); } }, '✕'));
    });

    const poolBtns = (label: string, ids: string[], key: 'mapIds' | 'divisionIds') =>
      h('div', { class: 'toolbar' }, h('b', null, label), h('button', { class: 'small', onclick: () => { p[key] = ids; render(); } }, 'All'), h('button', { class: 'small', onclick: () => { p[key] = []; render(); } }, 'None'));

    const toggle = (key: 'mapIds' | 'divisionIds', id: string) => {
      const l = p[key] ?? [];
      p[key] = l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
      render();
    };

    const sources = [...builtinPresets, ...customs];
    clear(
      root,
      h('p', null, h('a', { href: '#/' }, '← Home')),
      h('h1', null, 'Preset editor'),
      h('div', { class: 'card form' },
        h('label', null, 'Start from', h('select', { onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          const src = sources.find((x) => x.id === v);
          if (!src) return;
          const isCustom = customs.some((c) => c.id === v);
          p = normalize(src);
          if (!isCustom) { p.id = 'custom-' + Date.now(); p.name += ' (copy)'; }
          render();
        } }, h('option', { value: '' }, '—'), sources.map((x) => h('option', { value: x.id }, x.name)))),
        h('label', null, 'Name', h('input', { value: p.name, onchange: (e: Event) => { p.name = (e.target as HTMLInputElement).value; } })),
        h('label', null, 'Team size', h('input', { type: 'number', min: '1', max: '10', value: String(p.teamSize), onchange: (e: Event) => { p.teamSize = Number((e.target as HTMLInputElement).value) || 1; } }))),
      h('h3', null, 'Steps (order and timers)'),
      h('div', { class: 'muted' }, 'Map bans/picks are global. "pick side" lets the team choose NATO/Pact (opponent gets the other). Division picks come from the team\'s own side; a division ban removes one from the opponent\'s pool.'),
      stepRows,
      h('div', { class: 'toolbar' }, h('button', { class: 'small', onclick: () => { p.steps.push('A ban map 30'); render(); } }, '+ Add step')),
      h('h3', null, 'Map pool'),
      poolBtns('Maps', maps.map((m) => m.id), 'mapIds'),
      h('div', { class: 'toolbar' }, Object.keys(pools).map((k) => h('button', { class: 'small', onclick: () => { p.mapIds = [...pools[k]]; render(); } }, k + ' pool'))),
      h('div', { class: 'grid' }, maps.map((m) => toggleTile('map', m.id, m.name, !!p.mapIds?.includes(m.id), () => toggle('mapIds', m.id)))),
      h('h3', null, 'Division pool'),
      poolBtns('Divisions', divisions.map((d) => d.id), 'divisionIds'),
      h('div', { class: 'grid' }, divisions.map((d) => toggleTile('division', d.id, d.name, !!p.divisionIds?.includes(d.id), () => toggle('divisionIds', d.id)))),
      h('div', { class: 'toolbar' },
        h('button', { onclick: () => {
          const problems = validatePreset(p);
          const fatal = problems.filter((x) => !x.startsWith('Warning'));
          if (fatal.length) { clear(msg, fatal.join(' ')); return; }
          const i = customs.findIndex((c) => c.id === p.id);
          if (i >= 0) customs[i] = clone(p); else customs.push(clone(p));
          saveCustomPresets(customs);
          clear(msg, 'Saved. ' + problems.join(' '));
        } }, 'Save preset'),
        h('button', { class: 'small danger', onclick: () => { const i = customs.findIndex((c) => c.id === p.id); if (i >= 0) { customs.splice(i, 1); saveCustomPresets(customs); clear(msg, 'Deleted.'); } } }, 'Delete saved preset')),
      msg,
      h('h3', null, 'Import / export JSON'),
      json,
      h('div', { class: 'toolbar' },
        h('button', { class: 'small', onclick: () => { json.value = JSON.stringify(p, null, 2); } }, 'Export current'),
        h('button', { class: 'small', onclick: () => {
          try {
            const x = JSON.parse(json.value);
            if (!Array.isArray(x.steps)) throw new Error('Missing steps');
            p = normalize({ id: 'custom-' + Date.now(), name: 'Imported', teamSize: 1, ...x });
            render();
          } catch (e: any) { clear(msg, 'Import failed: ' + e.message); }
        } }, 'Import'))
    );
  }
  render();
  return root;
}
