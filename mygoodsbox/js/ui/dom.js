// 小さなDOM生成ヘルパー。テキストは必ず textContent 相当（createTextNode）で入れる（XSS防止）
export function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === false || value == null) continue;
        if (key === 'class') node.className = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
        if (child == null || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

export function icon(name, cls = 'w-5 h-5') {
    return h('i', { 'data-lucide': name, class: cls });
}

export function tagPills(tags) {
    if (!tags || tags.length === 0) return null;
    return h('div', { class: 'flex flex-wrap gap-1 mt-1' },
        tags.map((t) => h('span', { class: 'text-xs px-1.5 py-0.5 rounded bg-bg text-primary border border-border' }, t)));
}
