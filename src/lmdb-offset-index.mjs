// Read the published HyperBEAM LMDB 1.0 offset index using bounded byte reads.
// Format reference: permaweb/HyperBEAM, hb_store_arlmdb.erl and hb_opts.erl
// at 5142ab9515b86f9a2c4938672a657faa39c67bf9 (2026-09-22).
// These 77-bit keys are routing hints. Full IDs AND signatures must be checked
// against downloaded ANS-104 bytes before any result is accepted as content.
export const OFFSET_INDEX_ROOT = '7vg2832WFsisEcBr1oBQ8ldc4EGOkjQdwW46hDvJsOs';
const fail = message => { throw new Error('offset_index_' + message); };
const integer = n => { const x = Number(n); if (!Number.isSafeInteger(x) || x < 0) fail('integer'); return x; };
const big = b => BigInt('0x' + b.toString('hex'));
const db = b => {
  if (b.length !== 48) fail('database_size');
  return { width: b.readUInt32LE(0), flags: b.readUInt16LE(4), depth: b.readUInt16LE(6), entries: integer(b.readBigUInt64LE(32)), root: integer(b.readBigUInt64LE(40)) };
};
function meta(b) {
  if (b.length < 160 || b.readUInt32LE(24) !== 0xbeefc0de || b.readUInt32LE(28) !== 3 || b.readUInt16LE(18) !== 8) fail('metadata');
  const pageSize = b.readUInt32LE(48);
  if (pageSize < 256 || pageSize > 65536 || (pageSize & (pageSize - 1))) fail('page_size');
  return { pageSize, main: db(b.subarray(96, 144)), last: integer(b.readBigUInt64LE(144)), txn: b.readBigUInt64LE(152) };
}
function header(b) {
  if (b.length < 24) fail('page_header');
  const lower = b.readUInt16LE(20);
  if (lower & 1) fail('slot_count');
  return { flags: b.readUInt16LE(18), width: b.readUInt16LE(16), count: lower / 2 };
}
function node(b, slot) {
  const h = header(b);
  if (slot < 0 || slot >= h.count || 24 + h.count * 2 > b.length) fail('node_slot');
  const at = 24 + b.readUInt16LE(24 + slot * 2);
  if (at < 24 + h.count * 2 || at + 8 > b.length) fail('node_pointer');
  const keySize = b.readUInt16LE(at + 6), flags = b.readUInt16LE(at + 4);
  const low = b.readUInt16LE(at), high = b.readUInt16LE(at + 2);
  if (at + 8 + keySize > b.length) fail('key_bounds');
  const dataAt = at + 8 + keySize + (keySize & 1);
  return {
    key: b.subarray(at + 8, at + 8 + keySize), flags,
    child: low + high * 65536 + flags * 4294967296,
    data() { const size = low + high * 65536; if (dataAt + size > b.length) fail('data_bounds'); return b.subarray(dataAt, dataAt + size); }
  };
}
function lowerBound(count, read, target) {
  let lo = 0, hi = count;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (Buffer.compare(read(mid), target) < 0) lo = mid + 1; else hi = mid; }
  return lo;
}
export async function lookupOffsetIndex(read, size, dataId, { maxPages = 48, maxCandidates = 8 } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(dataId) || !Number.isSafeInteger(size) || size < 512) fail('arguments');
  let reads = 0;
  const bounded = async (at, length) => {
    if (!Number.isSafeInteger(at) || at < 0 || at + length > size || ++reads > maxPages) fail('read_budget_or_bounds');
    const b = await read(at, length); if (!Buffer.isBuffer(b) || b.length !== length) fail('short_read'); return b;
  };
  const m0 = meta(await bounded(0, 160));
  const m1 = meta(await bounded(m0.pageSize, 160));
  if (m0.pageSize !== m1.pageSize) fail('page_size_conflict');
  const m = m0.txn >= m1.txn ? m0 : m1;
  if ((m.last + 1) * m.pageSize > size || m.main.flags !== 20 || m.main.depth !== 1 || m.main.root < 2) fail('unsupported_layout');
  const page = async number => {
    if (!Number.isSafeInteger(number) || number < 2 || number > m.last) fail('page_number');
    const b = await bounded(number * m.pageSize, m.pageSize);
    if (b.readBigUInt64LE(0) !== BigInt(number)) fail('page_identity');
    return b;
  };
  const root = await page(m.main.root), rh = header(root);
  if (rh.flags !== 2 || rh.count !== 1) fail('single_key_required');
  const n = node(root, 0);
  if (n.flags !== 6) fail('duplicate_tree_required');
  const tree = db(n.data());
  if (tree.width !== 20 || tree.depth < 1 || tree.depth > 16 || tree.root < 2) fail('duplicate_geometry');
  const prefix = big(Buffer.from(dataId, 'base64url')) >> 179n;
  const target = Buffer.from((prefix << 83n).toString(16).padStart(40, '0'), 'hex');
  const descend = async target => {
    let number = tree.root, bound = null;
    const visited = new Set();
    for (let depth = tree.depth; depth >= 1; depth--) {
      if (visited.has(number)) fail('cycle'); visited.add(number);
      const b = await page(number), h = header(b);
      if (h.flags === 1 && depth > 1) {
        if (!h.count || 24 + h.count * 2 > b.length) fail('branch_count');
        let chosen = 0, previous = null;
        for (let i = 1; i < h.count; i++) {
          const key = node(b, i).key;
          if (key.length !== 20 || (previous && Buffer.compare(previous, key) >= 0)) fail('branch_order');
          previous = key;
          if (Buffer.compare(key, target) <= 0) chosen = i;
        }
        if (chosen + 1 < h.count) bound = node(b, chosen + 1).key;
        number = node(b, chosen).child;
      } else if (h.flags === 34 && depth === 1) {
        if (h.width !== 20 || h.count < 1 || 24 + h.count * 20 > b.length) fail('leaf_geometry');
        const row = i => b.subarray(24 + i * 20, 44 + i * 20);
        for (let i = 1; i < h.count; i++) if (Buffer.compare(row(i - 1), row(i)) >= 0) fail('leaf_order');
        return { count: h.count, row, slot: lowerBound(h.count, row, target), bound };
      } else fail('tree_depth_or_flags');
    }
    fail('tree_depth');
  };
  const candidates = []; let seek = target;
  while (true) {
    const leaf = await descend(seek);
    for (let i = leaf.slot; i < leaf.count; i++) {
      const value = big(leaf.row(i));
      if ((value >> 83n) !== prefix) return { candidates, records: tree.entries, pagesRead: reads };
      if (candidates.length >= maxCandidates) fail('candidate_limit');
      const weaveOffset = integer((value >> 34n) & ((1n << 49n) - 1n));
      const itemSize = integer(value & ((1n << 34n) - 1n));
      if (!itemSize || !Number.isSafeInteger(weaveOffset + itemSize)) fail('item_range');
      candidates.push({ weaveOffset, itemSize, indexSource: OFFSET_INDEX_ROOT });
    }
    if (!leaf.bound || (big(leaf.bound) >> 83n) !== prefix) return { candidates, records: tree.entries, pagesRead: reads };
    if (Buffer.compare(leaf.bound, seek) <= 0) fail('nonadvancing_leaf');
    seek = leaf.bound;
  }
}
