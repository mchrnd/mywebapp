import { h } from './dom.js';
import { openSheet } from './sheet.js';
import { createTagInput } from './tagInput.js';
import { createIconPicker } from './iconPicker.js';
import { showToast } from './toast.js';
import { parseCount } from '../tree.js';

// 升目の表示でアイコンを大きく出すので、画像はフォルダー（128px）より大きく縮小する
const CHIP_IMAGE_SIDE = 256;

// onSave({name, count, tags, icon}) は Promise。失敗時はトーストを出してシートを開いたままにする
// onDelete() は Promise<boolean>（削除したら true）。onDuplicate() は、編集シートを閉じて複製用の追加シートを開く
// prefill: 追加シート（chip が null）の入力欄に、複製元の設定を入れておく
export function openChipSheet({ chip, prefill = null, suggestName, suggestTags, onSave, onDelete, onDuplicate }) {
    const base = chip || prefill;
    let close = () => {};
    const nameInput = h('input', {
        type: 'text',
        class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: '例：A',
        value: base ? base.name : '',
        autocomplete: 'off',
    });
    const nameSuggest = h('div', { class: 'flex flex-wrap gap-1 mt-2' });
    const countInput = h('input', {
        type: 'number',
        inputmode: 'numeric',
        min: '0',
        step: '1',
        class: 'w-32 border border-border rounded-lg px-3 py-2 bg-surface',
        value: String(base ? base.count : 1),
    });
    const error = h('p', { class: 'text-sm text-danger min-h-[1.25rem]' });
    const tagInput = createTagInput({ getSuggestions: suggestTags, initial: base ? base.tags || [] : [] });
    const iconPicker = createIconPicker({
        initial: base && base.icon ? base.icon : null,
        imageMaxSide: CHIP_IMAGE_SIDE,
        showFallback: false,
        onError: (message) => { error.textContent = message; },
    });

    function refreshNameSuggestions() {
        const candidates = suggestName(nameInput.value).filter((n) => n !== nameInput.value.trim());
        nameSuggest.replaceChildren(...candidates.map((n) => h('button', {
            type: 'button',
            class: 'text-sm px-2 py-1 rounded-full border border-border text-muted',
            onClick: () => { nameInput.value = n; refreshNameSuggestions(); countInput.focus(); },
        }, n)));
    }
    nameInput.addEventListener('input', refreshNameSuggestions);
    nameInput.addEventListener('focus', refreshNameSuggestions);

    const saveButton = h('button', {
        type: 'button',
        class: 'px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50',
        onClick: async () => {
            const name = nameInput.value.trim();
            if (!name) { error.textContent = '名前を入力してください'; return; }
            const count = parseCount(countInput.value);
            if (count === null) { error.textContent = '個数は0以上の整数で入力してください'; return; }
            // オフラインでは書き込みの完了を待てないので、すぐ閉じる。失敗時だけトーストを出す
            saveButton.disabled = true;
            const data = { name, count, tags: tagInput.getTags(), icon: iconPicker.getIcon() };
            const pending = Promise.resolve().then(() => onSave(data));
            close();
            pending.catch((err) => { console.error(err); showToast('保存できませんでした'); });
        },
    }, '保存');

    const label = (text) => h('div', { class: 'text-sm font-medium mt-3 mb-1' }, text);
    close = openSheet(h('div', {},
        h('h2', { class: 'text-lg font-bold' }, chip ? 'チップを編集' : prefill ? 'チップを複製' : 'チップを追加'),
        label('名前'), nameInput, nameSuggest,
        label('個数'), countInput,
        label('アイコン（升目の表示で大きく出ます）'), iconPicker.element,
        label('タグ'), tagInput.element,
        error,
        h('div', { class: 'flex items-center justify-between gap-2 mt-2' },
            chip && onDelete
                ? h('div', { class: 'flex gap-2' },
                    h('button', {
                        type: 'button',
                        class: 'px-3 py-2 rounded-lg text-danger border border-danger',
                        onClick: async () => { if (await onDelete()) close(); },
                    }, '削除'),
                    onDuplicate
                        ? h('button', {
                            type: 'button',
                            class: 'px-3 py-2 rounded-lg border border-primary text-primary',
                            onClick: () => { close(); onDuplicate(); },
                        }, '複製')
                        : null)
                : h('span'),
            h('div', { class: 'flex gap-2' },
                h('button', { type: 'button', class: 'px-4 py-2 rounded-lg border border-border', onClick: () => close() }, 'キャンセル'),
                saveButton))));
    nameInput.focus();
}
