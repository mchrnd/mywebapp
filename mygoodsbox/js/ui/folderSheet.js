import { h } from './dom.js';
import { openSheet } from './sheet.js';
import { createTagInput } from './tagInput.js';
import { renderIcon, PRESET_ICONS, ICON_COLORS, DEFAULT_ICON_COLOR } from './icons.js';
import { showToast } from './toast.js';
import { resizeToDataUrl } from '../image.js';
import { pathLabel, wouldCreateCycle } from '../tree.js';

const MODES = [['none', 'なし'], ['image', '画像'], ['emoji', '絵文字'], ['preset', 'プリセット']];

const firstGrapheme = (text) => {
    const first = [...new Intl.Segmenter().segment(text.trim())][0];
    return first ? first.segment : '';
};

// onSave(data) は Promise。成功したらシートを閉じ、失敗したらトーストを出して開いたままにする
// onDelete() は Promise<boolean>（削除したら true）。onDuplicate() は、編集シートを閉じて複製用の追加シートを開く
// prefill: 追加シート（folder が null）の入力欄に、複製元の設定を入れておく
export function openFolderSheet({ folder, prefill = null, parentId, folders, suggestTags, onSave, onDelete, onDuplicate }) {
    const base = folder || prefill;
    let iconValue = base && base.icon ? base.icon : null;
    let mode = iconValue ? iconValue.type : 'none';
    let presetColor = iconValue && iconValue.type === 'preset' && iconValue.color ? iconValue.color : DEFAULT_ICON_COLOR;
    let close = () => {};

    const nameInput = h('input', {
        type: 'text',
        class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: '例：ゲームA、缶バッジ',
        value: base ? base.name : '',
    });
    const error = h('p', { class: 'text-sm text-danger min-h-[1.25rem]' });
    const tagInput = createTagInput({ getSuggestions: suggestTags, initial: base ? base.tags || [] : [] });

    const modeRoot = h('div', { class: 'flex flex-wrap gap-2' });
    const iconPanel = h('div', { class: 'mt-2' });
    const preview = h('div', { class: 'flex items-center gap-2 mb-2 text-sm text-muted' });

    function refreshIcon() {
        modeRoot.replaceChildren(...MODES.map(([key, label]) => h('button', {
            type: 'button',
            class: `px-3 py-1 rounded-full border text-sm ${mode === key ? 'bg-primary text-white border-primary' : 'border-border'}`,
            onClick: () => {
                mode = key;
                if (key === 'none') iconValue = null;
                else if (iconValue && iconValue.type !== key) iconValue = null;
                refreshIcon();
            },
        }, label)));
        preview.replaceChildren(renderIcon(iconValue), h('span', {}, iconValue ? 'このアイコンを使います' : 'アイコンなし'));

        if (mode === 'image') {
            iconPanel.replaceChildren(h('input', {
                type: 'file',
                accept: 'image/*',
                class: 'text-sm',
                onChange: async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                        iconValue = { type: 'image', value: await resizeToDataUrl(file) };
                        error.textContent = '';
                    } catch (err) {
                        error.textContent = err.message; // アイコンは変更しない
                    }
                    refreshIcon();
                },
            }));
        } else if (mode === 'emoji') {
            iconPanel.replaceChildren(h('input', {
                type: 'text',
                class: 'w-24 border border-border rounded-lg px-3 py-2 bg-surface text-xl text-center',
                placeholder: '😀',
                value: iconValue ? iconValue.value : '',
                onInput: (e) => {
                    const g = firstGrapheme(e.target.value);
                    iconValue = g ? { type: 'emoji', value: g } : null;
                    preview.replaceChildren(renderIcon(iconValue), h('span', {}, iconValue ? 'このアイコンを使います' : 'アイコンなし'));
                },
            }));
        } else if (mode === 'preset') {
            const withColor = (value) => ({ type: 'preset', value, color: presetColor });
            iconPanel.replaceChildren(
                h('div', { class: 'grid grid-cols-6 gap-2' }, PRESET_ICONS.map((name) => h('button', {
                    type: 'button',
                    'aria-label': name,
                    class: `h-11 flex items-center justify-center rounded-lg border ${iconValue && iconValue.value === name ? 'border-primary bg-bg' : 'border-border'}`,
                    onClick: () => { iconValue = withColor(name); refreshIcon(); },
                }, renderIcon(withColor(name), 'w-5 h-5 text-primary')))),
                h('div', { class: 'flex flex-wrap gap-2 mt-3', role: 'group', 'aria-label': 'アイコンの色' }, ICON_COLORS.map((c) => h('button', {
                    type: 'button',
                    'aria-label': c.label,
                    'aria-pressed': presetColor === c.value ? 'true' : 'false',
                    title: c.label,
                    class: `w-9 h-9 rounded-full border-2 ${presetColor === c.value ? 'border-text' : 'border-border'}`,
                    style: `background:${c.value}`,
                    onClick: () => {
                        presetColor = c.value;
                        if (iconValue && iconValue.type === 'preset') iconValue = withColor(iconValue.value);
                        refreshIcon();
                    },
                }))));
        } else {
            iconPanel.replaceChildren();
        }
        window.lucide?.createIcons();
    }

    let moveSelect = null;
    if (folder) {
        moveSelect = h('select', { class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface' },
            h('option', { value: '' }, 'ホーム'),
            folders
                .map((f) => ({ f, label: pathLabel(folders, f.id) }))
                .filter((x) => x.label)
                .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
                .map(({ f, label }) => h('option', {
                    value: f.id,
                    disabled: wouldCreateCycle(folders, folder.id, f.id),
                    selected: f.id === folder.parentId,
                }, label)));
        if (folder.parentId === null) moveSelect.value = '';
    }

    const label = (text) => h('div', { class: 'text-sm font-medium mt-3 mb-1' }, text);
    const saveButton = h('button', {
        type: 'button',
        class: 'px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50',
        onClick: async () => {
            const name = nameInput.value.trim();
            if (!name) { error.textContent = '名前を入力してください'; return; }
            // オフラインでは書き込みの完了を待てないので、すぐ閉じる（画面はローカルの更新で反映される）。失敗時だけトーストを出す
            saveButton.disabled = true;
            const data = {
                name,
                parentId: moveSelect ? (moveSelect.value || null) : parentId,
                tags: tagInput.getTags(),
                icon: iconValue,
            };
            const pending = Promise.resolve().then(() => onSave(data));
            close();
            pending.catch((err) => { console.error(err); showToast('保存できませんでした'); });
        },
    }, '保存');

    refreshIcon();
    close = openSheet(h('div', {},
        h('h2', { class: 'text-lg font-bold' }, folder ? 'フォルダーを編集' : prefill ? 'フォルダーを複製' : 'フォルダーを追加'),
        label('名前'), nameInput,
        label('アイコン'), preview, modeRoot, iconPanel,
        label('タグ'), tagInput.element,
        folder ? label('移動先') : null, moveSelect,
        error,
        h('div', { class: 'flex items-center justify-between gap-2 mt-2' },
            folder && onDelete
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
