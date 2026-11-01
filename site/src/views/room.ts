import { clear, copyText, h } from '../dom';
import { divisions } from '../data';
import { availableList, currentStep, isAvailable, SIDES, type DraftState, type Target, type TeamId } from '../draft';
import type { Session } from '../net';
import { toResult } from '../storage';
import { itemIcon, itemName } from './tiles';
import { resultBody, shareButtons } from './result';

export function roomView(session: Session): { el: HTMLElement; dispose: () => void } {
  let selected: string | null = null;
  let side: 'all' | 'nato' | 'pact' = 'all';
  let query = '';

  const head = h('div', { class: 'card' });
  const banner = h('div', { class: 'card banner' });
  const links = h('div', { class: 'card' });
  const mapsEl = h('div', { class: 'grid' });
  const sidesEl = h('div', { class: 'grid' });
  const divsEl = h('div', { class: 'grid' });
  const logEl = h('ol', { class: 'log' });
  const resultEl = h('div', null);
  const mapsSec = h('section', null, h('h3', null, 'Side'), sidesEl, h('h3', null, 'Maps'), mapsEl);
  const search = h('input', { type: 'search', placeholder: 'Search divisions…', oninput: (e: Event) => { query = (e.target as HTMLInputElement).value.toLowerCase(); renderDivs(); } });
  const sideBtns = h('span', null, (['all', 'nato', 'pact'] as const).map((s) => h('button', { class: 'small', onclick: () => { side = s; renderDivs(); } }, s.toUpperCase())));
  const divsSec = h('section', null, h('h3', null, 'Divisions'), h('div', { class: 'toolbar' }, sideBtns, search), divsEl);
  const logSec = h('section', null, h('h3', null, 'Log'), logEl);
  const timerEl = h('span', { class: 'timer' });

  const me = session.role;
  const canActFor = (s: DraftState): boolean => {
    const step = currentStep(s);
    return !!step && (me === 'host' || me === step.team);
  };

  function tile(s: DraftState, target: Target, id: string): HTMLElement {
    const step = currentStep(s);
    const bannedBy = s.history.find((e) => e.target === target && e.itemId === id && e.action === 'ban');
    const pickedBy = s.history.filter((e) => e.target === target && e.itemId === id && e.action === 'pick');
    const actionable = !!step && step.target === target && canActFor(s) && isAvailable(s, step.team, step.action, step.target, id);
    const cls = ['tile'];
    if (bannedBy) cls.push('banned');
    for (const p of pickedBy) cls.push('picked-' + p.team);
    if (actionable) cls.push('actionable');
    if (selected === id && actionable) cls.push('selected');
    return h(
      'div',
      { class: cls.join(' '), onclick: actionable ? () => { selected = id; update(); } : undefined, title: itemName(target, id) },
      itemIcon(target, id),
      h('div', { class: 'tname' }, itemName(target, id)),
      bannedBy ? h('div', { class: 'mark ban' }, '✕ ' + s.teams[bannedBy.team].name) : null,
      pickedBy.map((p) => h('div', { class: 'mark pick-' + p.team }, '✓ ' + s.teams[p.team].name))
    );
  }

  function renderDivs() {
    const s = session.state;
    if (!s) return;
    const list = divisions.filter((d) => s.config.divisionIds.includes(d.id) && (side === 'all' || d.side === side) && (!query || (d.name + ' ' + d.nation).toLowerCase().includes(query)));
    clear(divsEl, list.map((d) => tile(s, 'division', d.id)));
  }

  function linkRow(label: string, hash: string) {
    const url = location.href.split('#')[0] + hash;
    return h('div', { class: 'linkrow' }, h('b', null, label), ' ', h('input', { readOnly: true, value: url }), h('button', { class: 'small', onclick: () => copyText(url) }, 'Copy'));
  }

  function update() {
    const s = session.state;
    if (!s) {
      clear(head, h('b', null, 'WARNO Draft'), ' ', h('span', { class: 'muted' }, session.status));
      return;
    }
    const step = currentStep(s);
    const roleLabel = me === 'host' ? 'Host' : me === 'spec' ? 'Spectator' : `Captain of ${s.teams[me].name}`;
    const teamBox = (t: TeamId) =>
      h(
        'div',
        { class: 'teambox team-' + t + (step?.team === t ? ' active' : '') },
        h('b', null, s.teams[t].name),
        h('div', { class: 'muted' }, (s.teams[t].connected ? '● ' : '○ ') + (s.teams[t].captain ?? 'waiting for captain') + (s.sides[t] ? ' · ' + itemName('side', s.sides[t]!) : ''))
      );
    clear(head, h('div', { class: 'headrow' }, h('h2', null, s.config.name, ' ', h('span', { class: 'muted' }, `(${s.config.presetName})`)), h('div', { class: 'muted' }, `${roleLabel} · ${session.status} · ${s.spectators} spectator(s)`)), h('div', { class: 'grid2' }, teamBox('A'), teamBox('B')));

    if (me === 'host') {
      const keys = session.keys!;
      clear(links, h('h3', null, 'Share links'), linkRow('Team A captain', `#/room/${s.id}/A/${keys.A}`), linkRow('Team B captain', `#/room/${s.id}/B/${keys.B}`), linkRow('Spectators', `#/room/${s.id}`), h('div', { class: 'muted' }, 'Keep this tab open: your browser is the draft server.'));
    }

    const controls = me === 'host' ? h('div', { class: 'toolbar' }, s.phase === 'lobby' ? h('button', { onclick: () => session.start!() }, 'Start draft') : null, s.phase !== 'lobby' ? h('button', { class: 'small', onclick: () => session.undo!() }, 'Undo last') : null, s.phase !== 'lobby' ? h('button', { class: 'small danger', onclick: () => { if (confirm('Reset the draft?')) session.reset!(); } }, 'Reset') : null) : null;

    if (s.phase === 'lobby') {
      clear(banner, 'Waiting for the host to start the draft.', controls);
    } else if (step) {
      const mine = canActFor(s);
      const sel = selected && isAvailable(s, step.team, step.action, step.target, selected) ? selected : null;
      clear(
        banner,
        h('div', null, h('b', { class: 'team-' + step.team }, s.teams[step.team].name), ` must ${step.action} a ${step.target}`, ' ', timerEl, h('span', { class: 'muted' }, ` (step ${s.stepIndex + 1}/${s.config.steps.length})`)),
        mine ? h('div', { class: 'toolbar' }, sel ? h('button', { onclick: () => { session.act(sel); selected = null; } }, `Confirm ${step.action}: ${itemName(step.target, sel)}`) : h('span', { class: 'muted' }, `Select a ${step.target}…`), h('button', { class: 'small', onclick: () => { const l = availableList(s, step); if (l.length) { session.act(l[Math.floor(Math.random() * l.length)]); selected = null; } } }, 'Random')) : null,
        controls
      );
    } else {
      clear(banner, h('b', null, 'Draft complete'), ' ', shareButtons(() => toResult(session.state!)), controls);
    }

    clear(sidesEl, SIDES.map((id) => tile(s, 'side', id)));
    clear(mapsEl, s.config.mapIds.map((id) => tile(s, 'map', id)));
    renderDivs();
    clear(logEl, s.history.map((e) => h('li', { class: 'team-' + e.team }, h('b', null, s.teams[e.team].name), ` ${e.action} ${e.target}: ${itemName(e.target, e.itemId)}`, e.auto ? ' (auto)' : '')));
    clear(resultEl, s.phase === 'done' ? resultBody(toResult(s)) : null);
    tickTimer();
  }

  function tickTimer() {
    const s = session.state;
    if (!s || s.deadline === null || s.phase !== 'drafting') {
      timerEl.textContent = '';
      return;
    }
    const left = Math.max(0, Math.ceil((s.deadline - session.now()) / 1000));
    timerEl.textContent = `⏱ ${left}s`;
    timerEl.classList.toggle('low', left <= 5);
  }

  const unsub = session.subscribe(update);
  const iv = window.setInterval(tickTimer, 250);
  update();

  const el = h('div', null, h('p', null, h('a', { href: '#/' }, '← Home')), head, links, banner, mapsSec, divsSec, resultEl, logSec);
  return { el, dispose: () => { unsub(); clearInterval(iv); } };
}
