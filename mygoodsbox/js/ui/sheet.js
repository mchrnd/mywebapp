import { h } from './dom.js';

const openSheets = new Set();

// ログアウトしたときなど、開いているシートをすべて閉じる
export function closeAllSheets() {
    [...openSheets].forEach((close) => close());
}

// 下から出るシート（モバイル）／中央のダイアログ（PC）。document.body に付けるので、
// 本体の再描画で消えない。戻り値は閉じる関数
// onClose: 閉じたときに呼ぶ（外側のタップ、ログアウト時の closeAllSheets も含む）
export function openSheet(content, { onClose } = {}) {
    const backdrop = h('div', {
        class: 'fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center',
        onClick: (e) => { if (e.target === backdrop) close(); },
    }, h('div', {
        class: 'w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl',
        role: 'dialog',
        'aria-modal': 'true',
    }, content));
    function close() {
        if (!openSheets.has(close)) return; // 2回目以降は何もしない
        backdrop.remove();
        openSheets.delete(close);
        onClose?.();
    }
    openSheets.add(close);
    document.body.append(backdrop);
    window.lucide?.createIcons();
    return close;
}
