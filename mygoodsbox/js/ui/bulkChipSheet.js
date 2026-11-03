import { h } from './dom.js';
import { openSheet } from './sheet.js';
import { createTagInput } from './tagInput.js';
import { showToast } from './toast.js';
import { parseChipNames, splitNewNames, parseCount } from '../tree.js';

export const BULK_MAX = 200;

const DELIMITERS = [
    ['auto', '自動（改行・カンマ・読点・スペース）'],
    ['newline', '改行のみ（名前にスペースを含められる）'],
    ['comma', 'カンマ・読点のみ'],
    ['space', 'スペースのみ'],
];

// onSave(items) は Promise。items は [{name, count, tags}]。すぐ閉じ、失敗時だけトーストを出す
export function openBulkChipSheet({ existingNames, suggestTags, onSave }) {
    let close = () => {};
    const textarea = h('textarea', {
        rows: '5',
        class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: 'A、B、C、D\n（改行で区切って、1行に1つずつでも入力できます）',
    });
    const delimiter = h('select', { class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface' },
        DELIMITERS.map(([value, text]) => h('option', { value }, text)));
    const countInput = h('input', {
        type: 'number',
        inputmode: 'numeric',
        min: '0',
        step: '1',
        value: '1',
        class: 'w-32 border border-border rounded-lg px-3 py-2 bg-surface',
    });
    const skip = h('input', { type: 'checkbox', checked: true, class: 'w-5 h-5' });
    const tagInput = createTagInput({ getSuggestions: suggestTags, initial: [] });
    const preview = h('p', { class: 'text-sm text-muted min-h-[1.25rem]' });
    const error = h('p', { class: 'text-sm text-danger min-h-[1.25rem]' });

    const current = () => {
        const names = parseChipNames(textarea.value, delimiter.value);
        return { names, ...splitNewNames(names, existingNames, skip.checked) };
    };
    function refreshPreview() {
        const { names, add, skipped } = current();
        error.textContent = '';
        preview.textContent = names.length === 0
            ? '名前を入力してください'
            : `${add.length}件を追加します${skipped.length ? `（すでにある ${skipped.length}件はスキップ：${skipped.join('、')}）` : ''}`;
    }
    for (const el of [textarea, delimiter, skip]) el.addEventListener('input', refreshPreview);
    refreshPreview();

    const saveButton = h('button', {
        type: 'button',
        class: 'px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50',
        onClick: () => {
            const { add } = current();
            if (add.length === 0) { error.textContent = '追加するチップがありません'; return; }
            if (add.length > BULK_MAX) { error.textContent = `一度に追加できるのは${BULK_MAX}件までです（現在${add.length}件）`; return; }
            const count = parseCount(countInput.value);
            if (count === null) { error.textContent = '初期個数は0以上の整数で入力してください'; return; }
            const tags = tagInput.getTags();
            saveButton.disabled = true;
            const items = add.map((name) => ({ name, count, tags: [...tags] }));
            const pending = Promise.resolve().then(() => onSave(items));
            close();
            pending.catch((err) => { console.error(err); showToast('保存できませんでした'); });
        },
    }, '追加');

    const label = (text) => h('div', { class: 'text-sm font-medium mt-3 mb-1' }, text);
    close = openSheet(h('div', {},
        h('h2', { class: 'text-lg font-bold' }, 'チップを一括追加'),
        label('名前（複数）'), textarea,
        label('区切り文字'), delimiter,
        label('初期個数（全員に同じ）'), countInput,
        label('全部に付けるタグ'), tagInput.element,
        h('label', { class: 'flex items-center gap-2 mt-3 text-sm' }, skip, 'すでに同じ名前のチップがあるときは追加しない'),
        h('div', { class: 'mt-3' }, preview),
        error,
        h('div', { class: 'flex justify-end gap-2 mt-2' },
            h('button', { type: 'button', class: 'px-4 py-2 rounded-lg border border-border', onClick: () => close() }, 'キャンセル'),
            saveButton)));
    textarea.focus();
}
