import { h } from './dom.js';

let timer = null;

export function showToast(message) {
    const root = document.getElementById('toast');
    root.replaceChildren(h('div', { class: 'bg-text text-white text-sm px-4 py-2 rounded-lg shadow-lg' }, message));
    clearTimeout(timer);
    timer = setTimeout(() => root.replaceChildren(), 3000);
}
