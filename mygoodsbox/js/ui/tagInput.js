import { h } from './dom.js';
import { normalizeTag, normalizeTags } from '../tree.js';

// getSuggestions(query, chosen) -> string[]。確定したタグは getTags() で取り出す
export function createTagInput({ getSuggestions, initial = [] }) {
    let tags = normalizeTags(initial);
    const chosenRoot = h('div', { class: 'flex flex-wrap gap-1 mb-2' });
    const suggestRoot = h('div', { class: 'flex flex-wrap gap-1 mt-2' });
    const input = h('input', {
        type: 'text',
        class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: 'タグを入力（Enterで確定）',
        enterkeyhint: 'done',
    });

    function commit(raw) {
        const t = normalizeTag(raw);
        if (!t) return;
        tags = normalizeTags([...tags, t]);
        input.value = '';
        refresh();
    }

    function refresh() {
        chosenRoot.replaceChildren(...tags.map((t) => h('span', {
            class: 'inline-flex items-center gap-1 text-sm px-2 py-1 rounded-full bg-bg text-primary border border-border',
        }, t, h('button', {
            type: 'button',
            'aria-label': `${t}を外す`,
            class: 'w-5 h-5 leading-none',
            onClick: () => { tags = tags.filter((x) => x !== t); refresh(); },
        }, '×'))));
        const candidates = getSuggestions(input.value, tags);
        suggestRoot.replaceChildren(...candidates.map((t) => h('button', {
            type: 'button',
            class: 'text-sm px-2 py-1 rounded-full border border-border text-muted',
            onClick: () => commit(t),
        }, `+ ${t}`)));
    }

    // カンマ（半角・全角）で確定する。日本語入力の変換中は判定せず、変換が終わってから判定する
    function splitOnComma() {
        if (input.value.includes(',') || input.value.includes('，')) {
            input.value.split(/[,，]/).forEach(commit);
            input.value = '';
        }
        refresh();
    }
    input.addEventListener('input', (e) => {
        if (e.isComposing) { refresh(); return; }
        splitOnComma();
    });
    input.addEventListener('compositionend', splitOnComma);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            commit(input.value);
        }
    });
    refresh();

    return {
        element: h('div', {}, chosenRoot, input, suggestRoot),
        // 入力途中の文字も、保存時にタグとして含める
        getTags() {
            commit(input.value);
            return tags;
        },
    };
}
