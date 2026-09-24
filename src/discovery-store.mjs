import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const valid = id => /^[A-Za-z0-9_-]{43}$/.test(id);
const hash = id => crypto.createHash('sha256').update(id).digest('hex');
const MAX_LEAF_BYTES = 2 * 1024 * 1024;
const BRANCH = 'arns-mesh-index-branch/v1';
const cache = new Map();
const boundedFiles = new Map();
export function configureLocationCache(file,limits){if(limits)boundedFiles.set(file,limits);else boundedFiles.delete(file);}

function saveBounded(file,entries,limits){
 let rows={};try{if(fs.statSync(file).size<=limits.maxBytes)rows=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(!rows||typeof rows!=='object'||Array.isArray(rows))rows={};
 let added=0;
 for(const [id,hint] of entries){if(Buffer.byteLength(JSON.stringify({[id]:hint}))>limits.maxBytes)continue;if(!Object.hasOwn(rows,id))added++;delete rows[id];rows[id]=hint;}
 let keys=Object.keys(rows),encoded=JSON.stringify(rows);
 while(keys.length>limits.maxEntries||Buffer.byteLength(encoded)>limits.maxBytes){delete rows[keys.shift()];encoded=JSON.stringify(rows);}
 fs.mkdirSync(path.dirname(file),{recursive:true});writeNode(file,encoded);return {added,full:[]};
}

// One synchronous writer per data directory. Legacy two-digit shards remain
// readable. Only overflowing leaves split, so small desktop indexes stay small.
function readNode(file) {
  let stat;
  try { stat = fs.statSync(file); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  if (stat.size > MAX_LEAF_BYTES) throw new Error('index_leaf_too_large');
  const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  let entry = cache.get(file);
  if (entry?.stamp !== stamp) {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) throw new Error('invalid_index_leaf');
    if (rows.schema === BRANCH) {
      if (!Array.isArray(rows.children) || rows.children.some(key => !/^[a-f0-9]{2,64}$/.test(key))) throw new Error('invalid_index_branch');
    } else if (Object.keys(rows).some(id => !valid(id))) throw new Error('invalid_index_leaf');
    entry = {stamp, rows};
    cache.set(file, entry);
    if (cache.size > 32) cache.delete(cache.keys().next().value);
  }
  return entry.rows;
}

function writeNode(file, encoded) {
  fs.writeFileSync(file + '.tmp', encoded);
  fs.renameSync(file + '.tmp', file);
  cache.delete(file);
}

function groupsFor(entries, length) {
  const groups = new Map();
  for (const [id, hint] of entries) {
    const key = hash(id).slice(0, length);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([id, hint]);
  }
  return groups;
}

function writeLeaf(dir, key, rows) {
  const encoded = JSON.stringify(rows);
  const file = path.join(dir, key + '.json');
  if (Buffer.byteLength(encoded) <= MAX_LEAF_BYTES) {
    writeNode(file, encoded);
    return;
  }
  if (key.length >= 64) throw new Error('index_hash_bucket_limit');
  // Children are written from the full authoritative parent snapshot. Do not
  // merge orphan children left by an interrupted, unpublished earlier split.
  const children = groupsFor(Object.entries(rows), key.length + 2);
  for (const [child, entries] of children) {
    writeLeaf(dir, child, Object.fromEntries(entries));
  }
  // Publish the branch last. Until this rename readers still use the old leaf.
  writeNode(file, JSON.stringify({schema: BRANCH, children: [...children.keys()]}));
}

function updateNode(dir, key, entries) {
  const file = path.join(dir, key + '.json');
  const existing = readNode(file);
  if (existing.schema === BRANCH) {
    if (key.length >= 64) throw new Error('invalid_index_branch');
    let added = 0;
    const children = new Set(existing.children);
    for (const [child, rows] of groupsFor(entries, key.length + 2)) {
      if (children.has(child)) added += updateNode(dir, child, rows);
      else {
        const fresh = Object.fromEntries(rows);
        writeLeaf(dir, child, fresh);
        children.add(child);
        // Publish each newly committed child before processing another.
        writeNode(file, JSON.stringify({schema: BRANCH, children: [...children]}));
        added += Object.keys(fresh).length;
      }
    }
    return added;
  }
  const rows = {...existing};
  let added = 0;
  for (const [id, hint] of entries) {
    if (!Object.hasOwn(rows, id)) added++;
    rows[id] = hint;
  }
  writeLeaf(dir, key, rows);
  return added;
}

export function lookupDiscoveredLocation(file, id) {
  if (!file || !valid(id)) return null;
  if(boundedFiles.has(file))return null; // The small cache is in the primary file.
  try {
    const digest = hash(id);
    for (let length = 2; length <= 64; length += 2) {
      const rows = readNode(path.join(file + '.d', digest.slice(0, length) + '.json'));
      if (rows.schema !== BRANCH) return rows[id] || null;
      if (!rows.children.includes(digest.slice(0, length + 2))) return null;
    }
  } catch { /* A damaged routing hint cannot authorize content. */ }
  return null;
}

export function saveDiscoveredLocations(file, entries) {
  const accepted = entries.filter(([id]) => valid(id));
  if(boundedFiles.has(file))return saveBounded(file,accepted,boundedFiles.get(file));
  // Reject pathological entries before changing any shard.
  for (const [id, hint] of accepted) {
    if (Buffer.byteLength(JSON.stringify({[id]: hint})) > MAX_LEAF_BYTES) throw new Error('index_entry_too_large');
  }
  const dir = file + '.d';
  fs.mkdirSync(dir, {recursive: true});
  let added = 0;
  for (const [key, rows] of groupsFor(accepted, 2)) added += updateNode(dir, key, rows);
  return {added, full: []};
}
