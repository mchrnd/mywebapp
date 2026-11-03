import { h } from './dom.js';
import { openSheet } from './sheet.js';

export function confirmDialog(message, okLabel = '削除') {
    return new Promise((resolve) => {
        const done = (value) => { close(); resolve(value); };
        const close = openSheet(h('div', { class: 'grid gap-4' },
            h('p', { class: 'whitespace-pre-line' }, message),
            h('div', { class: 'flex gap-2 justify-end' },
                h('button', { type: 'button', class: 'px-4 py-2 rounded-lg border border-border', onClick: () => done(false) }, 'キャンセル'),
                h('button', { type: 'button', class: 'px-4 py-2 rounded-lg bg-danger text-white font-medium', onClick: () => done(true) }, okLabel))));
    });
}
