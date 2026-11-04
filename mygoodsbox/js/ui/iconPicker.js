import { h } from './dom.js';
import { renderIcon, PRESET_ICONS, ICON_COLORS, DEFAULT_ICON_COLOR } from './icons.js';
import { cropImage } from './imageCropper.js';

const MODES = [['none', 'なし'], ['image', '画像'], ['emoji', '絵文字'], ['preset', 'プリセット']];

const firstGrapheme = (text) => {
    const first = [...new Intl.Segmenter().segment(text.trim())][0];
    return first ? first.segment : '';
};

// フォルダーとチップで共通の、アイコンの入力欄（なし・画像・絵文字・プリセットと色）
// initial: 今のアイコン（null ならなし）。imageMaxSide: 画像を縮小する長辺(px)
// onError(message): 画像を読み込めなかったときに呼ぶ。空文字は、エラーを消すとき
// showFallback: アイコンなしのとき、見本にフォルダーの絵を出すか
export function createIconPicker({ initial = null, imageMaxSide = 128, onError = () => {}, showFallback = true } = {}) {
    let iconValue = initial || null;
    let mode = iconValue ? iconValue.type : 'none';
    let presetColor = iconValue && iconValue.type === 'preset' && iconValue.color ? iconValue.color : DEFAULT_ICON_COLOR;

    const modeRoot = h('div', { class: 'flex flex-wrap gap-2' });
    const panel = h('div', { class: 'mt-2' });
    const preview = h('div', { class: 'flex items-center gap-2 mb-2 text-sm text-muted' });

    // フォルダーは、アイコンなしでもフォルダーの絵を出す。チップは何も出さない
    const refreshPreview = () => preview.replaceChildren(
        ...(iconValue || showFallback ? [renderIcon(iconValue)] : []),
        h('span', {}, iconValue ? 'このアイコンを使います' : 'アイコンなし'));

    function refresh() {
        modeRoot.replaceChildren(...MODES.map(([key, label]) => h('button', {
            type: 'button',
            class: `px-3 py-1 rounded-full border text-sm ${mode === key ? 'bg-primary text-white border-primary' : 'border-border'}`,
            onClick: () => {
                mode = key;
                if (key === 'none') iconValue = null;
                else if (iconValue && iconValue.type !== key) iconValue = null;
                refresh();
            },
        }, label)));
        refreshPreview();

        if (mode === 'image') {
            panel.replaceChildren(h('input', {
                type: 'file',
                accept: 'image/*',
                class: 'text-sm',
                // 選んだ画像は、切り取り画面を挟んでから使う。キャンセルしたらアイコンは変えない
                onChange: async (e) => {
                    const input = e.target;
                    const file = input.files[0];
                    input.value = ''; // 同じ画像をもう一度選び直せるようにする
                    if (!file) return;
                    try {
                        const value = await cropImage(file, { maxSide: imageMaxSide });
                        if (value) iconValue = { type: 'image', value };
                        onError('');
                    } catch (err) {
                        onError(err.message); // アイコンは変更しない
                    }
                    refresh();
                },
            }));
        } else if (mode === 'emoji') {
            panel.replaceChildren(h('input', {
                type: 'text',
                class: 'w-24 border border-border rounded-lg px-3 py-2 bg-surface text-xl text-center',
                placeholder: '😀',
                value: iconValue ? iconValue.value : '',
                onInput: (e) => {
                    const g = firstGrapheme(e.target.value);
                    iconValue = g ? { type: 'emoji', value: g } : null;
                    refreshPreview();
                },
            }));
        } else if (mode === 'preset') {
            const withColor = (value) => ({ type: 'preset', value, color: presetColor });
            panel.replaceChildren(
                h('div', { class: 'grid grid-cols-6 gap-2' }, PRESET_ICONS.map((name) => h('button', {
                    type: 'button',
                    'aria-label': name,
                    class: `h-11 flex items-center justify-center rounded-lg border ${iconValue && iconValue.value === name ? 'border-primary bg-bg' : 'border-border'}`,
                    onClick: () => { iconValue = withColor(name); refresh(); },
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
                        refresh();
                    },
                }))));
        } else {
            panel.replaceChildren();
        }
        window.lucide?.createIcons();
    }

    refresh();
    return {
        element: h('div', {}, preview, modeRoot, panel),
        getIcon: () => iconValue,
    };
}
