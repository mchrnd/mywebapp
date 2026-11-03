const HOLD_MS = 400; // この時間だけ押し続けると、動かせる状態になる
const MOVE_TOLERANCE = 8; // 押している間にこれ以上動くと、長押しではなくスクロールとみなす

// 並び替えモードの行を、長押ししてからドラッグして動かせるようにする。
// rows: 表示順に並んだ行の要素。onDrop(from, to) は、離した時点で位置が変わっていれば呼ばれる。
// ↑↓ボタンなど、行の中のボタンから始めた操作は対象外
export function attachDragReorder(rows, onDrop) {
    rows.forEach((row, index) => {
        let timer = null;
        let startX = 0;
        let startY = 0;
        let pointerId = null;
        let dragging = false;
        let rects = [];
        let target = index;

        const blockScroll = (e) => e.preventDefault();

        function begin() {
            dragging = true;
            rects = rows.map((r) => r.getBoundingClientRect());
            row.classList.add('dragging');
            try { row.setPointerCapture(pointerId); } catch { /* 取れなくても動作は続ける */ }
            // ドラッグ中は、画面のスクロールを止める
            document.addEventListener('touchmove', blockScroll, { passive: false });
            navigator.vibrate?.(15);
        }

        function reset() {
            clearTimeout(timer);
            timer = null;
            document.removeEventListener('touchmove', blockScroll);
            row.classList.remove('dragging');
            rows.forEach((r) => { r.style.transform = ''; });
            dragging = false;
        }

        row.addEventListener('contextmenu', (e) => e.preventDefault());

        row.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            startX = e.clientX;
            startY = e.clientY;
            pointerId = e.pointerId;
            target = index;
            timer = setTimeout(begin, HOLD_MS);
        });

        row.addEventListener('pointermove', (e) => {
            if (!dragging) {
                if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE) {
                    clearTimeout(timer);
                    timer = null;
                }
                return;
            }
            const dy = e.clientY - startY;
            row.style.transform = `translateY(${dy}px)`;

            // 離したときに入る位置：自分より上に中心がある、ほかの行の数
            const center = rects[index].top + rects[index].height / 2 + dy;
            target = rects.filter((r, j) => j !== index && r.top + r.height / 2 < center).length;

            // ほかの行は、空いた分だけ上下にずらして、入る場所を見せる
            const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
            const shift = rects[index].height + gap;
            rows.forEach((r, j) => {
                if (j === index) return;
                if (j > index && j <= target) r.style.transform = `translateY(${-shift}px)`;
                else if (j < index && j >= target) r.style.transform = `translateY(${shift}px)`;
                else r.style.transform = '';
            });
        });

        row.addEventListener('pointerup', () => {
            const moved = dragging && target !== index;
            const to = target;
            reset();
            if (moved) onDrop(index, to);
        });
        row.addEventListener('pointercancel', reset);
    });
}
