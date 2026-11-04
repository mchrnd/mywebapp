import { h, icon } from './dom.js';
import { initialOf } from '../tree.js';

export const PRESET_ICONS = [
    'book', 'gamepad-2', 'star', 'heart', 'box', 'gift',
    'sparkles', 'shirt', 'music', 'image', 'key-round', 'tag',
];

// 色は色コードで保存する。初期値は青
export const DEFAULT_ICON_COLOR = '#3b82f6';
export const ICON_COLORS = [
    { label: '青', value: DEFAULT_ICON_COLOR },
    { label: '赤', value: '#ef4444' },
    { label: '橙', value: '#f97316' },
    { label: '黄', value: '#eab308' },
    { label: '緑', value: '#22c55e' },
    { label: '水色', value: '#0ea5e9' },
    { label: '紫', value: '#a855f7' },
    { label: 'ピンク', value: '#ec4899' },
    { label: '灰', value: '#6b7280' },
];

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

// icon: null | {type: 'image'|'emoji'|'preset', value: string, color?: string}
export function renderIcon(ic, cls = 'w-7 h-7 text-primary shrink-0') {
    if (ic && ic.type === 'image' && typeof ic.value === 'string' && ic.value.startsWith('data:image/')) {
        return h('img', { src: ic.value, alt: '', class: 'w-8 h-8 rounded object-cover shrink-0' });
    }
    if (ic && ic.type === 'emoji' && ic.value) {
        return h('span', { class: 'w-8 h-8 flex items-center justify-center text-2xl shrink-0' }, ic.value);
    }
    if (ic && ic.type === 'preset' && PRESET_ICONS.includes(ic.value)) {
        if (typeof ic.color === 'string' && COLOR_PATTERN.test(ic.color)) {
            // 色コードは currentColor 経由で渡す（テーマの text-primary は付けない）
            return h('span', { class: 'shrink-0 flex', style: `color:${ic.color}` },
                icon(ic.value, cls.replace('text-primary', '').trim()));
        }
        return icon(ic.value, cls);
    }
    return icon('folder', cls);
}

// 升目の表示で、四角の枠いっぱいに出すチップのアイコン。アイコンがないときは、名前の最初の1文字を出す
export function renderTileIcon(ic, name) {
    if (ic && ic.type === 'image' && typeof ic.value === 'string' && ic.value.startsWith('data:image/')) {
        return h('img', { src: ic.value, alt: '', class: 'w-full h-full object-cover' });
    }
    if (ic && ic.type === 'emoji' && ic.value) {
        return h('span', { class: 'text-5xl leading-none' }, ic.value);
    }
    if (ic && ic.type === 'preset' && PRESET_ICONS.includes(ic.value)) {
        return renderIcon(ic, 'w-12 h-12 text-primary');
    }
    return h('span', { class: 'text-4xl font-bold text-primary' }, initialOf(name));
}
