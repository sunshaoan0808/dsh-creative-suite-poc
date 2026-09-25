// lib/regex-engine.js — N3 Regex/Worldbook/Macro engine (small, ESM).
// Mirrors SillyTavern regex script fields:
//   findRegex / replaceString / placement / markdownOnly / promptOnly / runOnEdit / substituteRegex
// plus {{w::key}} worldbook macros and {{arg::name}} param substitution.

const str = (v) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

function compileRegex(findRegex) {
  const source = str(findRegex);
  if (!source) throw new Error('empty findRegex');
  // Slash-delimited "/pattern/flags" (upstream style); otherwise plain pattern (global).
  if (source.length >= 2 && source[0] === '/') {
    const lastSlash = source.lastIndexOf('/');
    if (lastSlash > 0) {
      const body = source.slice(1, lastSlash);
      const flags = source.slice(lastSlash + 1);
      if (/^[a-z]*$/i.test(flags)) return new RegExp(body, flags);
    }
  }
  return new RegExp(source, 'g');
}

function buildReplacement(replaceString, substituteRegex) {
  const tpl = str(replaceString);
  if (substituteRegex === false) return tpl.replace(/\$/g, '$$$$'); // literal: escape `$`
  // {{match}} (case-insensitive) -> whole match, like upstream replacementFor().
  // NOTE: '$' in the replacement arg is itself interpreted, so emit '$$&'
  // which yields a literal '$&' token for the final String.replace pass.
  return tpl.replace(/\{\{\s*match\s*\}\}/gi, '$$&');
}

function withGlobal(regex) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function ruleEnabledFor(rule, phase, options) {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.enabled === false || rule.disabled === true) return false;
  if (phase === 'display' && rule.promptOnly === true) return false;
  if (phase === 'prompt' && rule.markdownOnly === true) return false;
  const isEdit = options.isEdit ?? options.runOnEdit ?? false;
  if (isEdit === true && rule.runOnEdit !== true) return false;
  // placement only filters when the caller passes an explicit options.placement.
  if (options.placement !== undefined && Array.isArray(rule.placement)) {
    if (!rule.placement.map(Number).includes(Number(options.placement))) return false;
  }
  return true;
}

/**
 * Apply regex rules in array order.
 * @param {string} text
 * @param {Array} rules
 * @param {{phase?: 'display'|'prompt', placement?: number, isEdit?: boolean}} [options]
 * @returns {{text: string, applied: Array<{index:number,matches:number}>, errors: Array<{index:number,message:string}>}}
 * Invalid regexes are recorded in `errors`, never thrown.
 */
export function applyRegexRules(text, rules, options = {}) {
  const phase = options.phase === 'prompt' ? 'prompt' : 'display';
  let out = str(text);
  const applied = [];
  const errors = [];
  const list = Array.isArray(rules) ? rules : [];
  for (const [index, rule] of list.entries()) {
    if (!ruleEnabledFor(rule, phase, options)) continue;
    let regex;
    try {
      regex = compileRegex(rule.findRegex);
    } catch (err) {
      errors.push({ index, message: str(err && err.message ? err.message : err) });
      continue;
    }
    const replacement = buildReplacement(rule.replaceString, rule.substituteRegex);
    try {
      const probe = out.match(withGlobal(regex));
      const matches = probe ? probe.length : 0;
      if (matches === 0) continue;
      out = out.replace(regex, replacement); // native `$`-pattern semantics
      applied.push({ index, matches });
    } catch (err) {
      errors.push({ index, message: str(err && err.message ? err.message : err) });
    }
  }
  return { text: out, applied, errors };
}

/**
 * Expand {{w::key}} placeholders from worldbook entries.
 * entries: [{ keys: string[] | key: string, content: string }]
 * Unknown keys keep the original placeholder.
 */
export function expandWorldbookMacros(text, entries) {
  const source = str(text);
  const list = Array.isArray(entries) ? entries : [];
  const lookup = new Map();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const content = str(entry.content ?? entry.text ?? '');
    const keys = Array.isArray(entry.keys) ? entry.keys : entry.key !== undefined ? [entry.key] : [];
    for (const k of keys) {
      const key = str(k).trim();
      if (!key) continue;
      if (!lookup.has(key)) lookup.set(key, content);
      const lower = key.toLowerCase();
      if (!lookup.has(lower)) lookup.set(lower, content);
    }
  }
  return source.replace(/\{\{\s*w::([^}]+?)\s*\}\}/g, (full, rawKey) => {
    const key = str(rawKey).trim();
    if (lookup.has(key)) return lookup.get(key);
    if (lookup.has(key.toLowerCase())) return lookup.get(key.toLowerCase());
    return full;
  });
}

/**
 * Substitute {{arg::name}} family params ({arg,param,params,var,args}::).
 * Unknown names keep the original placeholder.
 */
export function substituteParams(text, params) {
  const source = str(text);
  const dict = params && typeof params === 'object' ? params : {};
  return source.replace(/\{\{\s*(arg|param|params|var|args)::([^}]+?)\s*\}\}/g, (full, _prefix, rawName) => {
    const name = str(rawName).trim();
    if (Object.prototype.hasOwnProperty.call(dict, name)) {
      const v = dict[name];
      return v === undefined || v === null ? '' : str(v);
    }
    return full;
  });
}

export default { applyRegexRules, expandWorldbookMacros, substituteParams };
