// 階層・タグ・候補の純粋関数。画面にもFirebaseにも依存しない。

// 数字を含む名前は自然順（タグ2 の次が タグ10）に並べる
const collator = new Intl.Collator('ja', { numeric: true });
const byName = (a, b) => collator.compare(a.name, b.name);
const hasOrder = (x) => typeof x.order === 'number';
// order を持つ項目が先（order の昇順、同じなら名前順）。持たない項目は後ろに名前順
const byOrder = (a, b) => {
    if (hasOrder(a) && hasOrder(b)) return a.order - b.order || byName(a, b);
    if (hasOrder(a)) return -1;
    if (hasOrder(b)) return 1;
    return byName(a, b);
};
const byText = (a, b) => collator.compare(a, b);

export function normalizeTag(tag) {
    return String(tag).replace(/[\s　]+/g, ' ').trim();
}

export function normalizeTags(tags) {
    const seen = new Set();
    const out = [];
    for (const t of tags) {
        const n = normalizeTag(t);
        if (n && !seen.has(n)) {
            seen.add(n);
            out.push(n);
        }
    }
    return out;
}

function indexById(folders) {
    return new Map(folders.map((f) => [f.id, f]));
}

// 親が存在しない（孤児）フォルダーはどの階層にも属さない
export function getChildFolders(folders, parentId) {
    const byId = indexById(folders);
    return folders
        .filter((f) => f.parentId === parentId && (parentId === null || byId.has(parentId)))
        .sort(byOrder);
}

export function getChipsIn(chips, folderId) {
    if (folderId === null) return [];
    return chips.filter((c) => c.folderId === folderId).sort(byOrder);
}

export function getBreadcrumb(folders, folderId) {
    if (folderId === null) return [];
    const byId = indexById(folders);
    const chain = [];
    const visited = new Set();
    let current = byId.get(folderId);
    while (current) {
        if (visited.has(current.id)) return [];
        visited.add(current.id);
        chain.unshift(current);
        if (current.parentId === null) return chain;
        current = byId.get(current.parentId);
    }
    return [];
}

export function getSiblings(folders, folderId) {
    const self = folders.find((f) => f.id === folderId);
    if (!self) return [];
    return getChildFolders(folders, self.parentId);
}

export function pathLabel(folders, folderId) {
    if (folderId === null) return 'ホーム';
    return getBreadcrumb(folders, folderId).map((f) => f.name).join(' > ');
}

export function collectDescendants(folders, chips, folderId) {
    const folderIds = [folderId];
    for (let i = 0; i < folderIds.length; i++) {
        for (const f of folders) {
            if (f.parentId === folderIds[i] && !folderIds.includes(f.id)) folderIds.push(f.id);
        }
    }
    const inSet = new Set(folderIds);
    const chipIds = chips.filter((c) => inSet.has(c.folderId)).map((c) => c.id);
    return { folderIds, chipIds };
}

export function wouldCreateCycle(folders, folderId, newParentId) {
    if (newParentId === null) return false;
    return collectDescendants(folders, [], folderId).folderIds.includes(newParentId);
}

// 階層をたどってホームまで届くフォルダーと、そこに入っているチップだけを返す（孤児は除く）
// ホームまで届くフォルダーのID。一度の走査で、たどった経路の結果を覚えて使い回す（フォルダー数にほぼ比例）。
// 同じ folders 配列（Firestoreの1回の更新）に対しては、結果をキャッシュする
const reachableCache = new WeakMap();
function reachableFolderIds(folders) {
    const cached = reachableCache.get(folders);
    if (cached) return cached;
    const byId = indexById(folders);
    const known = new Map(); // id -> true（ホームまで届く）/ false（届かない）
    for (const start of folders) {
        const path = [];
        const onPath = new Set();
        let current = start;
        let result = false;
        while (true) {
            if (known.has(current.id)) { result = known.get(current.id); break; }
            if (onPath.has(current.id)) { result = false; break; } // 循環しているデータ
            path.push(current.id);
            onPath.add(current.id);
            if (current.parentId === null) { result = true; break; }
            const parent = byId.get(current.parentId);
            if (!parent) { result = false; break; }
            current = parent;
        }
        for (const id of path) known.set(id, result);
    }
    const ids = new Set([...known].filter(([, ok]) => ok).map(([id]) => id));
    reachableCache.set(folders, ids);
    return ids;
}

function reachable(folders, chips) {
    const okIds = reachableFolderIds(folders);
    return { folders: folders.filter((f) => okIds.has(f.id)), chips: chips.filter((c) => okIds.has(c.folderId)) };
}

export function allTags(folders, chips) {
    const set = new Set();
    const r = reachable(folders, chips);
    for (const item of [...r.folders, ...r.chips]) {
        for (const t of item.tags || []) set.add(t);
    }
    return [...set].sort(byText);
}

export function filterByTags(folders, chips, tags) {
    if (tags.length === 0) return { folders: [], chips: [] };
    ({ folders, chips } = reachable(folders, chips));
    const hasAll = (item) => tags.every((t) => (item.tags || []).includes(t));
    return {
        folders: folders.filter(hasAll).sort(byName),
        chips: chips.filter(hasAll).sort(byName),
    };
}

function suggest(candidates, query, limit) {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, limit);
    const starts = [];
    const contains = [];
    for (const name of candidates) {
        const lower = name.toLowerCase();
        if (lower.startsWith(q)) starts.push(name);
        else if (lower.includes(q)) contains.push(name);
    }
    return [...starts, ...contains].slice(0, limit);
}

export function chipNameSuggestions(chips, query, limit = 8) {
    const names = [...new Set(chips.map((c) => c.name))].sort(byText);
    return suggest(names, query, limit);
}

export function tagSuggestions(folders, chips, query, exclude, limit = 8) {
    const excluded = new Set(exclude);
    const tags = allTags(folders, chips).filter((t) => !excluded.has(t));
    return suggest(tags, query, limit);
}

export function chunkIds(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

// 個数の入力検証。0以上の整数だけを受け付け、空欄・小数・負数・巨大な値は null
export function parseCount(text) {
    const t = String(text).trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isSafeInteger(n) ? n : null;
}

// タグごとの使用件数（フォルダーとチップの合計）。件数の多い順、同数は名前順
export function tagCounts(folders, chips) {
    const counts = new Map();
    const r = reachable(folders, chips);
    for (const item of [...r.folders, ...r.chips]) {
        for (const t of item.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || byText(a.tag, b.tag));
}

// 絞り込み欄に出すタグ。上位 limit 個と、選択中なら上位の外にあるタグも出す
export function visibleFilterTags(counts, selected, limit = 12) {
    const top = counts.slice(0, limit).map((x) => x.tag);
    const extra = selected.filter((t) => !top.includes(t));
    return [...top, ...extra];
}

function tagUpdates(folders, chips, mapTags) {
    const collect = (items) => items
        .filter((item) => (item.tags || []).includes(mapTags.from))
        .map((item) => ({ id: item.id, tags: mapTags.apply(item.tags) }));
    return { folderUpdates: collect(folders), chipUpdates: collect(chips) };
}

// タグの名前変更。変更先が既存のタグなら統合される。変更先が空なら null
export function renameTagUpdates(folders, chips, from, to) {
    const target = normalizeTag(to);
    if (!target) return null;
    if (target === from) return { folderUpdates: [], chipUpdates: [] };
    return tagUpdates(folders, chips, {
        from,
        apply: (tags) => normalizeTags(tags.map((t) => (t === from ? target : t))),
    });
}

export function removeTagUpdates(folders, chips, tag) {
    return tagUpdates(folders, chips, { from: tag, apply: (tags) => tags.filter((t) => t !== tag) });
}

// 並び替え。siblings は表示順に並んだ兄弟。id を toIndex の位置（範囲外は端に丸める）へ動かし、
// 兄弟すべてに 0, 1, 2… を振り直して、値が変わる項目だけ返す。位置が変わらない、存在しないIDは []
export function moveToIndex(siblings, id, toIndex) {
    const from = siblings.findIndex((x) => x.id === id);
    if (from === -1) return [];
    const to = Math.max(0, Math.min(siblings.length - 1, toIndex));
    if (to === from) return [];
    const next = [...siblings];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next
        .map((item, index) => ({ id: item.id, order: index, changed: item.order !== index }))
        .filter((x) => x.changed)
        .map(({ id: itemId, order }) => ({ id: itemId, order }));
}

// 1つ上（direction -1）か下（+1）へ動かす。端や存在しないIDは []
export function moveWithinSiblings(siblings, id, direction) {
    const from = siblings.findIndex((x) => x.id === id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= siblings.length) return [];
    return moveToIndex(siblings, id, to);
}

// チップ名の一括入力。mode: 'auto'（改行・カンマ・読点・スペースのすべて）| 'newline' | 'comma' | 'space'
const NAME_DELIMITERS = {
    auto: /[\r\n,，、\s]+/,
    newline: /\r?\n/,
    comma: /[,，、]/,
    space: /[ \t　]+/,
};

// 前後の空白を除き、空の名前と入力内の重複（最初の1つを残す）を取り除く。順序は保つ
export function parseChipNames(text, mode) {
    const seen = new Set();
    const names = [];
    for (const part of String(text).split(NAME_DELIMITERS[mode] || NAME_DELIMITERS.auto)) {
        const name = part.trim();
        if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    return names;
}

// すでに同じフォルダーにある名前を、skipExisting のときだけ追加しない
export function splitNewNames(names, existingNames, skipExisting) {
    if (!skipExisting) return { add: [...names], skipped: [] };
    const existing = new Set(existingNames);
    return {
        add: names.filter((n) => !existing.has(n)),
        skipped: names.filter((n) => existing.has(n)),
    };
}

const sameTags = (a, b) => {
    const x = a || [];
    const y = b || [];
    return x.length === y.length && x.every((t, i) => t === y[i]);
};
const sameIcon = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// チップの保存内容。新規は全項目、編集は変わった項目だけ（ほかの端末での個数の増減を上書きしない）
export function buildChipPatch(original, edited) {
    if (!original) return { name: edited.name, count: edited.count, tags: edited.tags };
    const patch = {};
    if (edited.name !== original.name) patch.name = edited.name;
    if (edited.count !== original.count) patch.count = edited.count;
    if (!sameTags(edited.tags, original.tags)) patch.tags = edited.tags;
    return patch;
}

// フォルダーの編集内容。変わった項目だけを返す。別の親へ移動したときは、元の並び順を消す（clearOrder）
export function buildFolderPatch(original, edited) {
    const patch = {};
    if (edited.name !== original.name) patch.name = edited.name;
    if (edited.parentId !== original.parentId) patch.parentId = edited.parentId;
    if (!sameTags(edited.tags, original.tags)) patch.tags = edited.tags;
    if (!sameIcon(edited.icon, original.icon)) patch.icon = edited.icon;
    const clearOrder = 'parentId' in patch && typeof original.order === 'number';
    return { patch, clearOrder };
}
