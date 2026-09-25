// lib/mvu-runtime.js — minimal MVU state machine (ESM). <300 lines.
const VALID_TYPES = new Set(['number', 'string', 'boolean']);

/** Parse openclaw stat_data tolerantly: non-objects -> {}. */
export function parseStatData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw.stat_data && typeof raw.stat_data === 'object' && !Array.isArray(raw.stat_data)
    ? raw.stat_data
    : raw;
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
    else if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/** Validate stat fields against schema {field: 'number|string|boolean'}. */
export function validateSchema(stat, schema) {
  const errors = [];
  if (!stat || typeof stat !== 'object' || Array.isArray(stat)) {
    return { ok: false, errors: ['stat must be an object'] };
  }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { ok: false, errors: ['schema must be an object'] };
  }
  for (const [field, type] of Object.entries(schema)) {
    if (!VALID_TYPES.has(type)) {
      errors.push(`invalid schema type for "${field}": ${JSON.stringify(type)}`);
      continue;
    }
    const v = stat[field];
    if (v === undefined) {
      errors.push(`missing field "${field}"`);
    } else if (typeof v !== type) {
      errors.push(`field "${field}" expected ${type}, got ${typeof v}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Apply numeric/string deltas, return new object (no input mutation). */
export function applySettlement(stat, delta) {
  const base = (stat && typeof stat === 'object' && !Array.isArray(stat)) ? stat : {};
  const d = (delta && typeof delta === 'object' && !Array.isArray(delta)) ? delta : {};
  const next = { ...base };
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'number' && typeof next[k] === 'number') next[k] = next[k] + v;
    else next[k] = v;
  }
  return next;
}

function toModifier(stat, field) {
  const v = stat?.[field];
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v / 2) : 0;
}

/** d20 check: roll + floor(stat[field]/2) vs dc. Returns {roll, total, success}. */
export function rollMvuCheck(stat, field, dc, rng = Math.random) {
  const safe = (stat && typeof stat === 'object' && !Array.isArray(stat)) ? stat : {};
  const dcNum = Number(dc);
  const dcSafe = Number.isFinite(dcNum) ? dcNum : 0;
  const roll = 1 + Math.floor(rng() * 20);
  const total = roll + toModifier(safe, field);
  return { roll, total, success: total >= dcSafe };
}

/** Render a plain-text status panel. */
export function renderStatusPanel(stat, opts = {}) {
  const safe = (stat && typeof stat === 'object' && !Array.isArray(stat)) ? stat : {};
  const o = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? opts : {};
  const title = typeof o.title === 'string' && o.title ? o.title : 'STATUS';
  const keys = Array.isArray(o.fields) && o.fields.length > 0
    ? o.fields.filter((k) => k in safe)
    : Object.keys(safe);
  const body = keys.length > 0
    ? keys.map((k) => `${k}: ${safe[k]}`).join('\n')
    : '(empty)';
  return `== ${title} ==\n${body}`;
}
