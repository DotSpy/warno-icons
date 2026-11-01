import './style.css';
import { clear, h } from './dom';
import { homeView } from './views/home';
import { editorView } from './views/editor';
import { roomView } from './views/room';
import { resultBody } from './views/result';
import { ClientSession, HostSession, type Session } from './net';
import { decodeResult } from './storage';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

async function route() {
  cleanup?.();
  cleanup = null;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const wrap = (el: Node) => clear(app, h('div', { class: 'container' }, el));

  if (parts[0] === 'host' && parts[1]) {
    if (!HostSession.exists(parts[1])) return wrap(h('p', null, 'Room not found in this browser. ', h('a', { href: '#/' }, 'Home')));
    mountRoom(new HostSession(parts[1]));
  } else if (parts[0] === 'room' && parts[1]) {
    const role = parts[2] === 'A' || parts[2] === 'B' ? parts[2] : 'spec';
    const key = parts[3] ?? '';
    const nameKey = 'wd-name';
    let name = '';
    if (role !== 'spec') {
      name = localStorage.getItem(nameKey) || prompt('Your captain name?') || '';
      localStorage.setItem(nameKey, name);
    }
    mountRoom(new ClientSession(parts[1], role, key, name));
  } else if (parts[0] === 'result' && parts[1]) {
    try {
      const r = await decodeResult(parts.slice(1).join('/'));
      wrap(h('div', null, h('p', null, h('a', { href: '#/' }, '← Home')), resultBody(r)));
    } catch {
      wrap(h('p', { class: 'error' }, 'Invalid or corrupted result link.'));
    }
  } else if (parts[0] === 'editor') {
    wrap(editorView());
  } else {
    wrap(homeView());
  }

  function mountRoom(session: Session) {
    const v = roomView(session);
    wrap(v.el);
    cleanup = () => {
      v.dispose();
      session.dispose();
    };
  }
}

window.addEventListener('hashchange', route);
route();
