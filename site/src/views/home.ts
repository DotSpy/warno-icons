import { clear, download, h } from '../dom';
import { allPresets, presetToConfig } from '../data';
import { HostSession } from '../net';
import { deleteHistory, encodeResult, loadHistory, toResult, type HistoryRecord } from '../storage';

export function homeView(): HTMLElement {
  const presets = allPresets();
  const sel = h('select', null, presets.map((p) => h('option', { value: p.id }, `${p.name} (${p.teamSize}v${p.teamSize})`)));
  const name = h('input', { value: 'WARNO Tournament Match' });
  const a = h('input', { value: 'Team A' });
  const b = h('input', { value: 'Team B' });
  const err = h('div', { class: 'error' });

  const create = () => {
    const p = presets.find((x) => x.id === sel.value)!;
    try {
      const id = HostSession.create(presetToConfig(p, name.value || p.name), { A: a.value || 'Team A', B: b.value || 'Team B' });
      location.hash = '#/host/' + id;
    } catch (e: any) {
      clear(err, e.message);
    }
  };

  const historyEl = h('div', null);
  const renderHistory = () => {
    const list = loadHistory();
    clear(
      historyEl,
      list.length ? null : h('p', { class: 'muted' }, 'No drafts yet.'),
      list.map((r) => historyRow(r, renderHistory))
    );
  };
  renderHistory();

  return h(
    'div',
    null,
    h('h1', null, 'WARNO Draft'),
    h('p', { class: 'muted' }, 'Serverless pick/ban drafts for tournaments. You host the room in your browser and share links with captains and spectators.'),
    h(
      'div',
      { class: 'card form' },
      h('h3', null, 'Create a draft room'),
      h('label', null, 'Preset', sel),
      h('label', null, 'Room name', name),
      h('label', null, 'Team A name', a),
      h('label', null, 'Team B name', b),
      h('div', { class: 'toolbar' }, h('button', { onclick: create }, 'Create room'), h('a', { href: '#/editor' }, 'Preset editor')),
      err
    ),
    h('h2', null, 'History (this browser)'),
    historyEl
  );
}

function historyRow(r: HistoryRecord, refresh: () => void): HTMLElement {
  const s = r.state;
  const open = () => {
    if (r.role === 'host' && HostSession.exists(r.id)) location.hash = '#/host/' + r.id;
    else if (r.role === 'captain' && r.captainTeam) location.hash = `#/room/${r.id}/${r.captainTeam}/${r.captainKey ?? ''}`;
    else location.hash = '#/room/' + r.id;
  };
  const viewResult = async () => {
    location.hash = '#/result/' + (await encodeResult(toResult(s)));
  };
  return h(
    'div',
    { class: 'card histrow' },
    h('div', null, h('b', null, s.config.name), ` — ${s.config.presetName} · ${s.teams.A.name} vs ${s.teams.B.name}`, h('div', { class: 'muted' }, `${r.role} · ${s.phase} · ${new Date(r.savedAt).toLocaleString()}`)),
    h(
      'div',
      { class: 'toolbar' },
      h('button', { class: 'small', onclick: open }, s.phase === 'done' ? 'Reopen room' : 'Reopen'),
      s.phase === 'done' ? h('button', { class: 'small', onclick: viewResult }, 'Result') : null,
      h('button', { class: 'small', onclick: () => download(`draft-${r.id}.json`, JSON.stringify({ result: toResult(s), state: s }, null, 2)) }, 'Export JSON'),
      h('button', { class: 'small danger', onclick: () => { if (confirm('Delete this draft from local history?')) { deleteHistory(r.id); refresh(); } } }, 'Delete')
    )
  );
}
