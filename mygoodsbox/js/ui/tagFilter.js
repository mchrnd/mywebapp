import { h } from './dom.js';
import { visibleFilterTags } from '../tree.js';

const LIMIT = 12;

const chip = (tag, count, selected, onClick) => h('button', {
    type: 'button',
    'aria-pressed': selected ? 'true' : 'false',
    class: `shrink-0 px-3 py-1.5 rounded-full text-sm border ${selected ? 'bg-primary text-white border-primary' : 'bg-surface border-border text-text'}`,
    onClick,
    'aria-label': count == null ? tag : `${tag}（${count}件）`,
}, tag, count == null ? null : h('span', {
    // タグ名と件数が続いて読めない（「タグ1」＋「2」→「タグ12」）ため、件数は別のバッジにする
    class: `ml-2 px-1.5 rounded-full text-xs ${selected ? 'bg-white/25' : 'bg-bg text-muted'}`,
}, String(count)));

// counts: tagCounts() の結果。上位12個と選択中のタグを並べ、13個以上なら「すべて」で全タグの一覧に切り替える。
// 全タグの一覧を開いている間は、上位12個の列は隠す（同じタグが2か所に出ないように、閉じるボタン・検索欄・一覧だけを出す）
export function renderTagFilter(root, { counts, selected, onToggle, panelOpen, onTogglePanel, query, onQuery }) {
    if (counts.length === 0) {
        root.replaceChildren();
        return;
    }
    const panelButton = (label) => h('button', {
        type: 'button',
        'aria-expanded': panelOpen ? 'true' : 'false',
        class: 'shrink-0 px-3 py-1.5 rounded-full text-sm border border-primary text-primary',
        onClick: onTogglePanel,
    }, label);

    if (panelOpen && counts.length > LIMIT) {
        const list = h('div', { class: 'flex flex-wrap gap-2 mt-2 max-h-64 overflow-y-auto' });
        const fill = () => {
            const q = query.trim().toLowerCase();
            const hits = counts.filter((x) => !q || x.tag.toLowerCase().includes(q));
            list.replaceChildren(...(hits.length
                ? hits.map((x) => chip(x.tag, x.count, selected.includes(x.tag), () => onToggle(x.tag)))
                : [h('p', { class: 'text-sm text-muted' }, '該当するタグはありません')]));
        };
        const search = h('input', {
            type: 'search',
            class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface mt-2',
            placeholder: 'タグを検索',
            value: query,
            // 入力のたびに全体を描き直すとフォーカスが外れるため、一覧だけ更新する
            onInput: (e) => { query = e.target.value; onQuery(query); fill(); },
        });
        fill();
        root.replaceChildren(
            h('div', { class: 'flex items-center justify-between gap-2' },
                h('span', { class: 'text-sm text-muted' }, `すべてのタグ（${counts.length}）`),
                panelButton('閉じる')),
            search,
            list);
        return;
    }

    const countOf = new Map(counts.map((x) => [x.tag, x.count]));
    const bar = h('div', { class: 'flex gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible' },
        visibleFilterTags(counts, selected, LIMIT).map((t) => chip(t, countOf.get(t), selected.includes(t), () => onToggle(t))));
    if (counts.length > LIMIT) bar.append(panelButton('すべて'));
    root.replaceChildren(bar);
}
