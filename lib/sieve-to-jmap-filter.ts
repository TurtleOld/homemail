/**
 * Parses a subset of Sieve script syntax into JMAP Email/query filter objects
 * and JMAP Email/set update objects for "apply to existing messages".
 *
 * Supported conditions:
 *   header :contains "From"    "value"  → { from: "value" }
 *   header :contains "To"      "value"  → { to: "value" }
 *   header :contains "Subject" "value"  → { subject: "value" }
 *   envelope :contains "to"    "value"  → { to: "value" }
 *   size :over  N                       → { minSize: N }
 *   size :under N                       → { maxSize: N }
 *   allof / anyof nesting
 *
 * Supported actions:
 *   fileinto "FolderName"   → mailboxIds (needs caller to resolve name → id)
 *   addflag "\\Seen"        → keywords.$seen
 *   addflag "\\Flagged"     → keywords.$flagged
 *   addflag "\\Important"   → keywords.$important
 *
 * Returns { parseable: false } when unsupported constructs are encountered.
 */

export type JMAPFilter =
  | { [key: string]: string | number | boolean }
  | { operator: 'AND' | 'OR'; conditions: JMAPFilter[] };

export type SieveAction =
  | { type: 'fileinto'; folderName: string }
  | { type: 'addflag'; flag: string }
  | { type: 'discard' }
  | { type: 'keep' };

export type SieveParseResult =
  | { parseable: true; filter: JMAPFilter; actions: SieveAction[] }
  | { parseable: false; reason: string };

// ── Tokeniser ──────────────────────────────────────────────────────────────

type Token =
  | { kind: 'tag'; value: string }      // :contains, :over, :under, :matches
  | { kind: 'string'; value: string }   // "quoted" or bare word
  | { kind: 'number'; value: number }
  | { kind: 'word'; value: string }     // unquoted identifier
  | { kind: 'lbracket' }
  | { kind: 'rbracket' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'semicolon' }
  | { kind: 'comma' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // Whitespace & comments
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Punctuation
    if (ch === '[') { tokens.push({ kind: 'lbracket' }); i++; continue; }
    if (ch === ']') { tokens.push({ kind: 'rbracket' }); i++; continue; }
    if (ch === '(') { tokens.push({ kind: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ kind: 'rparen' }); i++; continue; }
    if (ch === ';') { tokens.push({ kind: 'semicolon' }); i++; continue; }
    if (ch === ',') { tokens.push({ kind: 'comma' }); i++; continue; }

    // Tags (:word)
    if (ch === ':') {
      i++;
      let w = '';
      while (i < src.length && /\w/.test(src[i])) w += src[i++];
      tokens.push({ kind: 'tag', value: w.toLowerCase() });
      continue;
    }

    // Quoted strings (single or double)
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      let s = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { i++; s += src[i++]; }
        else s += src[i++];
      }
      i++; // closing quote
      tokens.push({ kind: 'string', value: s });
      continue;
    }

    // Numbers
    if (/\d/.test(ch)) {
      let n = '';
      while (i < src.length && /\d/.test(src[i])) n += src[i++];
      // Optional size suffix K / M / G
      if (i < src.length && /[KkMmGg]/.test(src[i])) {
        const suffix = src[i++].toUpperCase();
        const mult = suffix === 'K' ? 1024 : suffix === 'M' ? 1024 * 1024 : 1024 * 1024 * 1024;
        tokens.push({ kind: 'number', value: parseInt(n, 10) * mult });
      } else {
        tokens.push({ kind: 'number', value: parseInt(n, 10) });
      }
      continue;
    }

    // Bare words (identifiers, require, fileinto, if, allof, anyof…)
    if (/[A-Za-z_]/.test(ch)) {
      let w = '';
      while (i < src.length && /[\w-]/.test(src[i])) w += src[i++];
      tokens.push({ kind: 'word', value: w.toLowerCase() });
      continue;
    }

    // Unknown char — skip
    i++;
  }
  return tokens;
}

// ── Parser helpers ─────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined { return this.tokens[this.pos]; }
  next(): Token | undefined { return this.tokens[this.pos++]; }
  done(): boolean { return this.pos >= this.tokens.length; }

  expect(kind: Token['kind']): Token {
    const t = this.next();
    if (!t || t.kind !== kind) throw new Error(`Expected ${kind}, got ${t?.kind ?? 'EOF'}`);
    return t;
  }

  // Consume a string token (kind='string' or kind='word')
  expectString(): string {
    const t = this.next();
    if (!t) throw new Error('Expected string, got EOF');
    if (t.kind === 'string' || t.kind === 'word') return t.value;
    throw new Error(`Expected string, got ${t.kind}`);
  }

  expectNumber(): number {
    const t = this.next();
    if (!t || t.kind !== 'number') throw new Error(`Expected number, got ${t?.kind}`);
    return t.value;
  }

  tag(): string | undefined {
    const t = this.peek();
    if (t?.kind === 'tag') { this.pos++; return t.value; }
    return undefined;
  }

  word(): string | undefined {
    const t = this.peek();
    if (t?.kind === 'word') { this.pos++; return t.value; }
    return undefined;
  }

  // Parse comma-separated list of strings in brackets: ["a", "b"]
  stringList(): string[] {
    if (this.peek()?.kind === 'lbracket') {
      this.next();
      const items: string[] = [];
      while (this.peek()?.kind !== 'rbracket' && !this.done()) {
        items.push(this.expectString());
        if (this.peek()?.kind === 'comma') this.next();
      }
      this.expect('rbracket');
      return items;
    }
    return [this.expectString()];
  }
}

// ── Condition parsing ──────────────────────────────────────────────────────

function parseCondition(p: Parser): JMAPFilter | null {
  const w = p.peek();
  if (!w || w.kind !== 'word') return null;

  const cmd = (p.next() as { kind: 'word'; value: string }).value;

  if (cmd === 'header') {
    const matchType = p.tag() ?? 'contains'; // :contains, :is, :matches, :regex
    // :regex cannot be safely emulated with substring matching — not parseable
    if (matchType === 'regex') return null;
    const headers = p.stringList().map((h) => h.toLowerCase());
    const value = p.expectString();

    // Map known headers to JMAP filter fields
    for (const h of headers) {
      if (h === 'from') return { from: value };
      if (h === 'to') return { to: value };
      if (h === 'cc') return { cc: value };
      if (h === 'bcc') return { bcc: value };
      if (h === 'subject') return { subject: value };
    }
    // Unknown header — not parseable
    return null;
  }

  if (cmd === 'envelope') {
    const _matchType = p.tag();
    const parts = p.stringList().map((s) => s.toLowerCase());
    const value = p.expectString();
    for (const part of parts) {
      if (part === 'to') return { to: value };
      if (part === 'from') return { from: value };
    }
    return null;
  }

  if (cmd === 'size') {
    const dir = p.tag();
    const num = p.expectNumber();
    if (dir === 'over') return { minSize: num };
    if (dir === 'under') return { maxSize: num };
    return null;
  }

  if (cmd === 'allof') {
    const conditions = parseConditionList(p);
    if (conditions === null) return null;
    return { operator: 'AND', conditions };
  }

  if (cmd === 'anyof') {
    const conditions = parseConditionList(p);
    if (conditions === null) return null;
    return { operator: 'OR', conditions };
  }

  // Unsupported test
  return null;
}

function parseConditionList(p: Parser): JMAPFilter[] | null {
  p.expect('lparen');
  const conditions: JMAPFilter[] = [];
  while (p.peek()?.kind !== 'rparen' && !p.done()) {
    const c = parseCondition(p);
    if (c === null) return null;
    conditions.push(c);
    if (p.peek()?.kind === 'comma') p.next();
  }
  p.expect('rparen');
  return conditions;
}

// ── Action parsing ─────────────────────────────────────────────────────────

function parseActions(p: Parser): SieveAction[] | null {
  const actions: SieveAction[] = [];

  while (!p.done()) {
    const t = p.peek();

    if (!t || t.kind === 'rbracket') break; // end of block
    if (t.kind === 'word' && (t.value === 'elsif' || t.value === 'else')) break;

    if (t.kind !== 'word') { p.next(); continue; }

    const cmd = (p.next() as { kind: 'word'; value: string }).value;

    if (cmd === 'fileinto') {
      const name = p.expectString();
      p.peek()?.kind === 'semicolon' && p.next();
      actions.push({ type: 'fileinto', folderName: name });
      continue;
    }

    if (cmd === 'addflag' || cmd === 'setflag') {
      const flags = p.stringList();
      p.peek()?.kind === 'semicolon' && p.next();
      for (const f of flags) {
        actions.push({ type: 'addflag', flag: f });
      }
      continue;
    }

    if (cmd === 'keep') {
      p.peek()?.kind === 'semicolon' && p.next();
      actions.push({ type: 'keep' });
      continue;
    }

    if (cmd === 'discard') {
      p.peek()?.kind === 'semicolon' && p.next();
      actions.push({ type: 'discard' });
      continue;
    }

    // Unsupported action (vacation, reject, redirect with complex args, etc.)
    return null;
  }

  return actions;
}

// ── Top-level parse ────────────────────────────────────────────────────────

export function parseSieveForJMAP(script: string): SieveParseResult {
  let tokens: Token[];
  try {
    tokens = tokenize(script);
  } catch (e) {
    return { parseable: false, reason: `Tokenize error: ${e}` };
  }

  const p = new Parser(tokens);
  const filters: JMAPFilter[] = [];
  const actions: SieveAction[] = [];

  try {
    while (!p.done()) {
      const t = p.peek();
      if (!t) break;

      // require statement — skip
      if (t.kind === 'word' && t.value === 'require') {
        p.next();
        p.stringList();
        p.peek()?.kind === 'semicolon' && p.next();
        continue;
      }

      // if / elsif / else block
      if (t.kind === 'word' && (t.value === 'if' || t.value === 'elsif')) {
        p.next();
        const condition = parseCondition(p);
        if (condition === null) {
          return { parseable: false, reason: 'Unsupported test condition' };
        }
        filters.push(condition);

        // Parse action block { ... }
        if (p.peek()?.kind === 'lbracket') {
          p.next();
          const blockActions = parseActions(p);
          if (blockActions === null) {
            return { parseable: false, reason: 'Unsupported action in script' };
          }
          actions.push(...blockActions);
          p.peek()?.kind === 'rbracket' && p.next();
        }
        continue;
      }

      // else block — skip for existing-message apply purposes
      if (t.kind === 'word' && t.value === 'else') {
        p.next();
        if (p.peek()?.kind === 'lbracket') {
          p.next();
          while (p.peek()?.kind !== 'rbracket' && !p.done()) p.next();
          p.peek()?.kind === 'rbracket' && p.next();
        }
        continue;
      }

      // Top-level action (fileinto, keep, etc. outside if)
      const topAction = parseActions(p);
      if (topAction === null) {
        return { parseable: false, reason: 'Unsupported top-level action' };
      }
      actions.push(...topAction);
    }
  } catch (e) {
    return { parseable: false, reason: `Parse error: ${e}` };
  }

  if (filters.length === 0 && actions.length === 0) {
    return { parseable: false, reason: 'No conditions or actions found in script' };
  }

  const filter: JMAPFilter =
    filters.length === 1
      ? filters[0]
      : { operator: 'AND', conditions: filters };

  return { parseable: true, filter, actions };
}

// ── JMAP update builder ───────────────────────────────────────────────────

/** Convert parsed Sieve actions to a JMAP Email/set patch object */
export function buildJMAPUpdate(
  actions: SieveAction[],
  folderNameToId: (name: string) => string | undefined
): { update: Record<string, boolean>; kind: 'keywords' | 'mailboxIds' } | null {
  for (const action of actions) {
    if (action.type === 'fileinto') {
      const id = folderNameToId(action.folderName);
      if (!id) return null;
      return { update: { [id]: true }, kind: 'mailboxIds' };
    }
    if (action.type === 'addflag') {
      const flag = action.flag.toLowerCase();
      if (flag === '\\seen' || flag === '$seen') {
        return { update: { '$seen': true }, kind: 'keywords' };
      }
      if (flag === '\\flagged' || flag === '$flagged') {
        return { update: { '$flagged': true }, kind: 'keywords' };
      }
      if (flag === '\\important' || flag === '$important' || flag === '$is_important') {
        return { update: { '$important': true }, kind: 'keywords' };
      }
    }
  }
  return null;
}
