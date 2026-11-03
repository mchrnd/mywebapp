import { h } from './dom.js';
import { getBreadcrumb, getSiblings } from '../tree.js';

let listenersReady = false;
let openListId = null; // 開いている▼メニューの一覧のID（画面の更新後に開き直すため）

function closeAll(except) {
    openListId = null;
    document.querySelectorAll('[data-bc-toggle][aria-expanded="true"]').forEach((btn) => {
        if (btn === except) return;
        btn.setAttribute('aria-expanded', 'false');
        document.getElementById(btn.getAttribute('aria-controls'))?.setAttribute('hidden', '');
    });
}

function setupGlobalListeners() {
    if (listenersReady) return;
    listenersReady = true;
    document.addEventListener('click', (e) => {
        if (!e.target.closest('[data-bc-menu]')) closeAll();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const open = document.querySelector('[data-bc-toggle][aria-expanded="true"]');
        if (!open) return;
        closeAll();
        open.focus();
    });
}

function openMenu(btn, list, { focus = true } = {}) {
    closeAll(btn);
    openListId = list.id;
    btn.setAttribute('aria-expanded', 'true');
    list.removeAttribute('hidden');
    // 画面の右端からはみ出さないように寄せる
    list.style.left = '0px';
    const rect = list.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 8);
    if (overflow > 0) list.style.left = `-${overflow}px`;
    if (focus) list.querySelector('button')?.focus();
}

// 画面を描き直したあとに呼ぶ。描き直す前に開いていた▼メニューを、フォーカスを動かさずに開き直す
export function restoreOpenMenu() {
    if (!openListId) return;
    const list = document.getElementById(openListId);
    const toggle = document.querySelector(`[data-bc-toggle][aria-controls="${openListId}"]`);
    if (list && toggle) openMenu(toggle, list, { focus: false });
    else openListId = null;
}

export function renderBreadcrumb(root, { folders, currentId, onNavigate }) {
    setupGlobalListeners();
    const levels = [{ id: null, name: 'ホーム' }, ...getBreadcrumb(folders, currentId)];
    const ol = h('ol', { class: 'flex flex-wrap items-center gap-x-1 gap-y-1 text-sm' });

    levels.forEach((level, index) => {
        const isLast = index === levels.length - 1;
        const li = h('li', { class: 'relative flex items-center gap-0.5', 'data-bc-menu': true });
        li.append(h('button', {
            type: 'button',
            class: `px-2 py-1 rounded ${isLast ? 'font-bold text-text' : 'text-primary underline'}`,
            'aria-current': isLast ? 'page' : false,
            onClick: () => onNavigate(level.id),
        }, level.name));

        const siblings = level.id === null ? [] : getSiblings(folders, level.id);
        if (siblings.length > 1) {
            const listId = `bc-sub-${level.id}`;
            const toggle = h('button', {
                type: 'button',
                class: 'w-8 h-8 flex items-center justify-center rounded text-primary hover:bg-bg',
                'data-bc-toggle': true,
                'aria-expanded': 'false',
                'aria-controls': listId,
                'aria-label': `${level.name}と同じ階層のフォルダー`,
            }, '▼');
            const list = h('ul', {
                id: listId,
                hidden: true,
                class: 'absolute top-full z-30 mt-1 min-w-[10rem] max-w-[80vw] max-h-64 overflow-auto bg-surface border border-border rounded-lg shadow-lg py-1',
            }, siblings.map((s) => h('li', {}, h('button', {
                type: 'button',
                class: `w-full text-left px-3 py-2 hover:bg-bg ${s.id === level.id ? 'font-bold text-primary' : ''}`,
                'aria-current': s.id === level.id ? 'true' : false,
                onClick: () => { closeAll(); onNavigate(s.id); },
            }, (s.id === level.id ? '✓ ' : '') + s.name))));
            toggle.addEventListener('click', () => {
                if (toggle.getAttribute('aria-expanded') === 'true') closeAll();
                else openMenu(toggle, list);
            });
            li.append(toggle, list);
        }

        ol.append(li);
        if (!isLast) ol.append(h('li', { 'aria-hidden': 'true', class: 'text-muted' }, '>'));
    });

    root.replaceChildren(h('nav', { 'aria-label': 'パンくずリスト' }, ol));
}
