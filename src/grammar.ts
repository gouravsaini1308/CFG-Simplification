export class GrammarParseError extends Error {
  name = "GrammarParseError";
}

export type Symbol = string;
export type Rhs = readonly Symbol[]; // empty array represents ε

export type RhsKey = string;

export function rhsToKey(rhs: Rhs): RhsKey {
  // Use a delimiter unlikely to appear in tokens.
  return rhs.join("\u0000");
}

export function keyToRhs(key: RhsKey): Rhs {
  if (key === "") return [];
  return key.split("\u0000");
}

export class Grammar {
  readonly startSymbol: string;
  readonly productions: ReadonlyMap<string, ReadonlySet<RhsKey>>;
  readonly declaredNonterminals: ReadonlySet<string>;

  constructor(args: {
    startSymbol: string;
    productions: Map<string, Set<RhsKey>>;
    declaredNonterminals: Set<string>;
  }) {
    this.startSymbol = args.startSymbol;
    this.productions = args.productions;
    this.declaredNonterminals = args.declaredNonterminals;
  }

  nonterminals(): Set<string> {
    return new Set(this.productions.keys());
  }

  alternatives(lhs: string): Rhs[] {
    const set = this.productions.get(lhs);
    if (!set) return [];
    return [...set].map(keyToRhs);
  }

  allProductionsStrings(): Set<string> {
    const out = new Set<string>();
    const lhss = [...this.productions.keys()].sort();
    for (const lhs of lhss) {
      const rhss = this.productions.get(lhs);
      if (!rhss || rhss.size === 0) continue;
      const rhsList = [...rhss].map(keyToRhs).sort(rhsSortCmp);
      for (const rhs of rhsList) {
        out.add(`${lhs} -> ${rhsToText(rhs)}`);
      }
    }
    return out;
  }

  toPrettyText(): string {
    const lines: string[] = [];
    const lhss = [...this.productions.keys()].sort();
    for (const lhs of lhss) {
      const rhss = this.productions.get(lhs);
      if (!rhss || rhss.size === 0) continue;
      const rhsList = [...rhss].map(keyToRhs).sort(rhsSortCmp);
      const rhsText = rhsList.map(rhsToText).join(" | ");
      lines.push(`${lhs} -> ${rhsText}`);
    }
    return lines.join("\n");
  }

  withStart(startSymbol: string): Grammar {
    return new Grammar({
      startSymbol,
      productions: cloneProductions(this.productions),
      declaredNonterminals: new Set(this.declaredNonterminals),
    });
  }

  withProductions(productions: Map<string, Set<RhsKey>>): Grammar {
    return new Grammar({
      startSymbol: this.startSymbol,
      productions,
      declaredNonterminals: new Set(this.declaredNonterminals),
    });
  }
}

function cloneProductions(
  prod: ReadonlyMap<string, ReadonlySet<RhsKey>>,
): Map<string, Set<RhsKey>> {
  const out = new Map<string, Set<RhsKey>>();
  for (const [lhs, rhss] of prod.entries()) {
    out.set(lhs, new Set(rhss));
  }
  return out;
}

export function parseGrammarText(text: string, startSymbol: string | null): Grammar {
  const lines = splitLines(text);
  if (lines.length === 0) {
    throw new GrammarParseError(
      "No productions found. Please enter at least one production like: S -> aA | ε",
    );
  }

  const raw: Array<[string, string[]]> = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    const arrowIdx = line.indexOf("->");
    if (arrowIdx < 0) {
      throw new GrammarParseError(`Line ${lineNo}: missing '->' in production: ${JSON.stringify(line)}`);
    }
    const lhsPart = line.slice(0, arrowIdx);
    const rhsPart = line.slice(arrowIdx + 2);
    const lhs = lhsPart.trim();
    if (!lhs) {
      throw new GrammarParseError(`Line ${lineNo}: missing LHS nonterminal before '->'`);
    }
    if (lhs.includes(" ")) {
      throw new GrammarParseError(
        `Line ${lineNo}: LHS must be a single nonterminal token, got: ${JSON.stringify(lhs)}`,
      );
    }
    const rhsAlts = rhsPart.split("|").map((a) => a.trim());
    if (rhsAlts.length === 1 && rhsAlts[0] === "") {
      throw new GrammarParseError(
        `Line ${lineNo}: RHS is empty. Use ε or lambda to represent empty string.`,
      );
    }
    raw.push([lhs, rhsAlts]);
  }

  const declared = new Set(raw.map(([lhs]) => lhs));

  const rhsCandidates = new Set<string>();
  for (const [, rhsAlts] of raw) {
    for (const alt of rhsAlts) {
      for (const tok of tokenizeRhs(alt)) {
        if (isEpsilonToken(tok)) continue;
        if (looksLikeNonterminal(tok)) rhsCandidates.add(tok);
      }
    }
  }

  const nonterminals = new Set<string>([...declared, ...rhsCandidates]);
  const productions = new Map<string, Set<RhsKey>>();
  for (const nt of nonterminals) productions.set(nt, new Set());

  for (const [lhs, rhsAlts] of raw) {
    const set = productions.get(lhs)!;
    for (const alt of rhsAlts) {
      const rhs = parseRhs(alt);
      set.add(rhsToKey(rhs));
    }
  }

  let start: string;
  if (startSymbol == null) {
    start = raw[0][0];
  } else {
    if (!declared.has(startSymbol)) {
      const available = [...declared].sort().join(", ");
      throw new GrammarParseError(
        `Start symbol ${JSON.stringify(startSymbol)} is not a nonterminal in the grammar. Available: ${available}`,
      );
    }
    start = startSymbol;
  }

  return new Grammar({ startSymbol: start, productions, declaredNonterminals: declared });
}

function splitLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped) continue;
    if (stripped.startsWith("#")) continue;
    out.push(stripped);
  }
  return out;
}

export function isEpsilonToken(tok: string): boolean {
  return tok === "ε" || tok === "lambda" || tok === "Λ" || tok === "EPS" || tok === "eps";
}

export function looksLikeNonterminal(tok: string): boolean {
  return tok.length > 0 && /^[A-Za-z]/.test(tok[0]) && tok[0].toUpperCase() === tok[0];
}

export function tokenizeRhs(alt: string): string[] {
  const s = alt.trim();
  if (s === "") return [s];
  if (/\s/.test(s)) return s.split(/\s+/).filter(Boolean);
  return [...s];
}

export function parseRhs(alt: string): Rhs {
  const s = alt.trim();
  if (isEpsilonToken(s)) return [];
  if (s === "") {
    throw new GrammarParseError("Blank RHS is not allowed; use ε or lambda.");
  }
  return tokenizeRhs(s);
}

export function rhsToText(rhs: Rhs): string {
  if (rhs.length === 0) return "ε";
  return rhs.join("");
}

function rhsSortCmp(a: Rhs, b: Rhs): number {
  // ε first, then shorter, then lexicographic by tuple
  const a0 = a.length === 0 ? 0 : 1;
  const b0 = b.length === 0 ? 0 : 1;
  if (a0 !== b0) return a0 - b0;
  if (a.length !== b.length) return a.length - b.length;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function isUnitRhs(rhs: Rhs, nonterminals: Set<string>): boolean {
  return rhs.length === 1 && nonterminals.has(rhs[0]);
}

export function rhsNonterminals(rhs: Rhs, nonterminals: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const s of rhs) {
    if (nonterminals.has(s)) out.add(s);
  }
  return out;
}

export function freshStartSymbol(existing: Iterable<string>, base = "S0"): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let idx = 1;
  while (true) {
    const cand = `${base}${idx}`;
    if (!taken.has(cand)) return cand;
    idx += 1;
  }
}

