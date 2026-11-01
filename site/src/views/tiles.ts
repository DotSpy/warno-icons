import { h } from '../dom';
import { getDivision, getMap, iconUrl } from '../data';
import type { Target } from '../draft';

export function itemName(target: Target, id: string): string {
  if (target === 'side') return id === 'nato' ? 'NATO' : id === 'pact' ? 'Warsaw Pact' : id;
  return target === 'map' ? getMap(id)?.name ?? id : getDivision(id)?.name ?? id;
}

export function itemIcon(target: Target, id: string): HTMLElement {
  const icon = target === 'map' ? getMap(id)?.icon : target === 'division' ? getDivision(id)?.icon : undefined;
  if (icon) return h('img', { class: 'icon', src: iconUrl(icon), alt: itemName(target, id), loading: 'lazy' });
  return h('div', { class: 'icon placeholder' }, target === 'side' ? id.toUpperCase() : itemName(target, id).slice(0, 2).toUpperCase());
}

export function chip(target: Target, id: string, extra = ''): HTMLElement {
  return h('span', { class: 'chip ' + extra }, itemIcon(target, id), h('span', null, itemName(target, id)));
}
