import { clear, copyText, h } from '../dom';
import { encodeResult, type ResultData } from '../storage';
import { chip } from './tiles';

export function resultBody(r: ResultData): HTMLElement {
  const picks = (team: 'A' | 'B', target: 'map' | 'division') => r.history.filter((e) => e.team === team && e.action === 'pick' && e.target === target);
  const bans = (team: 'A' | 'B') => r.history.filter((e) => e.team === team && e.action === 'ban');
  const mapPick = r.history.find((e) => e.action === 'pick' && e.target === 'map');
  const teamCard = (t: 'A' | 'B') =>
    h(
      'div',
      { class: 'card team-' + t },
      h('h3', null, r.teams[t].name),
      h('div', { class: 'muted' }, (r.teams[t].captain ? 'Captain: ' + r.teams[t].captain : 'No captain') + (r.sides?.[t] ? ' · Side: ' + (r.sides[t] === 'nato' ? 'NATO' : 'Warsaw Pact') : '')),
      h('h4', null, 'Divisions'),
      h('div', { class: 'chips' }, picks(t, 'division').map((e) => chip('division', e.itemId))),
      h('h4', null, 'Bans'),
      h('div', { class: 'chips' }, bans(t).map((e) => chip(e.target, e.itemId, 'banned')))
    );
  return h(
    'div',
    null,
    h('h2', null, r.name, ' ', h('span', { class: 'muted' }, `(${r.preset})`)),
    h('div', { class: 'card' }, h('h3', null, 'Map'), mapPick ? chip('map', mapPick.itemId, 'big') : h('span', { class: 'muted' }, 'No map picked')),
    h('div', { class: 'grid2' }, teamCard('A'), teamCard('B')),
    h(
      'div',
      { class: 'card' },
      h('h3', null, 'Order'),
      h(
        'ol',
        { class: 'log' },
        r.history.map((e) =>
          h(
            'li',
            { class: 'team-' + e.team },
            h('b', null, r.teams[e.team].name),
            ` ${e.action === 'ban' ? 'banned' : 'picked'} `,
            chip(e.target, e.itemId, e.action === 'ban' ? 'banned' : ''),
            e.auto ? h('span', { class: 'muted' }, ' (auto - timer ran out)') : null
          )
        )
      )
    )
  );
}

export function shareButtons(getResult: () => ResultData): HTMLElement {
  const msg = h('span', { class: 'muted' });
  const btn = h('button', {
    onclick: async () => {
      const enc = await encodeResult(getResult());
      const url = location.href.split('#')[0] + '#/result/' + enc;
      await copyText(url);
      clear(msg, 'Link copied (' + url.length + ' chars)');
    },
  }, 'Copy shareable result link');
  return h('span', null, btn, ' ', msg);
}
