// Pure, immutable operations on the intake tree (array of root nodes).
// Node ids are unique across the whole tree, so edits address a node by
// id; options within a node are addressed by index. Every function
// returns a NEW tree (structural clone of the touched path) — safe for
// React state. Shared by the editor screen and the in-conversation
// quick-add.

let seq = 0;
export function genId(prefix = 'n') {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

// Recursively rebuild a node list, letting `fn(node)` replace any node.
// Children (node.children + every option.children) are rebuilt first so
// fn sees already-updated descendants.
function mapNodes(nodes, fn) {
  return nodes.map((n) => {
    const node = { ...n };
    if (Array.isArray(node.options)) {
      node.options = node.options.map((o) => (
        Array.isArray(o.children) ? { ...o, children: mapNodes(o.children, fn) } : o
      ));
    }
    if (Array.isArray(node.children)) node.children = mapNodes(node.children, fn);
    return fn(node);
  });
}

// Remove a node by id anywhere in the tree.
function filterNodes(nodes, keep) {
  return nodes
    .filter(keep)
    .map((n) => {
      const node = { ...n };
      if (Array.isArray(node.options)) {
        node.options = node.options.map((o) => (
          Array.isArray(o.children) ? { ...o, children: filterNodes(o.children, keep) } : o
        ));
      }
      if (Array.isArray(node.children)) node.children = filterNodes(node.children, keep);
      return node;
    });
}

export function updateNode(tree, id, updater) {
  return mapNodes(tree, (node) => (node.id === id ? updater(node) : node));
}

export function removeNode(tree, id) {
  return filterNodes(tree, (n) => n.id !== id);
}

// Update one option (by index) of a node.
export function updateOption(tree, nodeId, idx, patch) {
  return updateNode(tree, nodeId, (node) => {
    const options = (node.options || []).map((o, i) => (i === idx ? { ...o, ...patch } : o));
    return { ...node, options };
  });
}

export function addOption(tree, nodeId, option) {
  return updateNode(tree, nodeId, (node) => ({
    ...node,
    options: [...(node.options || []), { key: genId('opt'), label: 'אפשרות חדשה', ...option }],
  }));
}

// Read-time shape guard. Options are objects ({ key, label, ... }), but a
// legacy plain-string option must still render — normalize on read so the
// renderer and `collect` never see a bare string.
export function normalizeOption(o) {
  if (typeof o === 'string') return { key: o, label: o };
  return o || {};
}

// Key-addressed variants of update/removeOption. The intake screen hides
// `hidden` options, so its rendered index does NOT match the stored index —
// edits from the conversation screen must address an option by its key.
export function updateOptionByKey(tree, nodeId, key, patch) {
  return updateNode(tree, nodeId, (node) => ({
    ...node,
    options: (node.options || []).map((o) => (
      normalizeOption(o).key === key ? { ...normalizeOption(o), ...patch } : o
    )),
  }));
}

export function removeOptionByKey(tree, nodeId, key) {
  return updateNode(tree, nodeId, (node) => ({
    ...node,
    options: (node.options || []).filter((o) => normalizeOption(o).key !== key),
  }));
}

export function removeOption(tree, nodeId, idx) {
  return updateNode(tree, nodeId, (node) => ({
    ...node,
    options: (node.options || []).filter((_, i) => i !== idx),
  }));
}

export function moveOption(tree, nodeId, idx, dir) {
  return updateNode(tree, nodeId, (node) => {
    const options = [...(node.options || [])];
    const j = idx + dir;
    if (j < 0 || j >= options.length) return node;
    [options[idx], options[j]] = [options[j], options[idx]];
    return { ...node, options };
  });
}

// Add a follow-up branch (a new child node) under a specific option.
export function addBranch(tree, nodeId, idx, node) {
  return updateNode(tree, nodeId, (n) => {
    const options = [...(n.options || [])];
    const opt = { ...options[idx] };
    opt.children = [...(opt.children || []), node || newNode(n.group)];
    options[idx] = opt;
    return { ...n, options };
  });
}

// A fresh blank question node.
export function newNode(group = 'opening') {
  return { id: genId('q'), group, q: 'שאלה חדשה', options: [], freeText: true };
}

// Add a new root question to a group (appended after that group's block).
export function addRootNode(tree, group) {
  const node = newNode(group);
  // Insert right after the last node of the same group; else append.
  let lastIdx = -1;
  tree.forEach((n, i) => { if (n.group === group) lastIdx = i; });
  const next = [...tree];
  next.splice(lastIdx >= 0 ? lastIdx + 1 : tree.length, 0, node);
  return next;
}

// Move a ROOT node up/down within the flat list.
export function moveRoot(tree, id, dir) {
  const i = tree.findIndex((n) => n.id === id);
  if (i < 0) return tree;
  const j = i + dir;
  if (j < 0 || j >= tree.length) return tree;
  const next = [...tree];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
