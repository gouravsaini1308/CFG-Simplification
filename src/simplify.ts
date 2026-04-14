import {
  Grammar,
  type Rhs,
  rhsNonterminals,
  freshStartSymbol,
  isUnitRhs,
  rhsToKey,
  keyToRhs,
} from "./grammar";

export type Step = {
  title: string;
  before: string;
  after: string;
  details: Record<string, unknown>;
  diffAdded: string[];
  diffRemoved: string[];
};

export function simplifyWithSteps(grammar: Grammar): Step[] {
  const steps: Step[] = [];

  let g = grammar;
  {
    const [g2, step] = removeUseless(g, "Remove useless symbols (non-generating + unreachable)");
    g = g2;
    steps.push(step);
  }
  {
    const [g2, step] = eliminateNullProductions(g);
    g = g2;
    steps.push(step);
  }
  {
    const [g2, step] = removeUnitProductions(g);
    g = g2;
    steps.push(step);
  }
  {
    const [g2, step] = removeUseless(g, "Final cleanup (useless symbols)");
    g = g2;
    steps.push(step);
  }

  return steps;
}

function removeUseless(grammar: Grammar, title: string): [Grammar, Step] {
  const beforeText = grammar.toPrettyText();
  const nts = grammar.nonterminals();

  const generating = computeGenerating(grammar);
  const removedNonGenerating = [...difference(nts, generating)].sort();

  const afterGen = filterByGenerating(grammar, generating);

  const reachable = computeReachable(afterGen);
  const removedUnreachable = [...difference(afterGen.nonterminals(), reachable)].sort();

  const after = filterByReachable(afterGen, reachable);

  const step = stepFromGrammars(title, grammar, after);
  step.details = {
    generating: [...generating].sort(),
    removed_non_generating: removedNonGenerating,
    reachable: [...reachable].sort(),
    removed_unreachable: removedUnreachable,
    start_symbol: after.startSymbol,
  };
  step.before = beforeText;
  step.after = after.toPrettyText();
  return [after, step];
}

function computeGenerating(grammar: Grammar): Set<string> {
  const nts = grammar.nonterminals();
  const gen = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const [lhs, rhssKeys] of grammar.productions.entries()) {
      if (gen.has(lhs)) continue;
      for (const rhsKey of rhssKeys) {
        const rhs = keyToRhs(rhsKey);
        let ok = true;
        for (const sym of rhs) {
          if (nts.has(sym) && !gen.has(sym)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          gen.add(lhs);
          changed = true;
          break;
        }
      }
    }
  }
  return gen;
}

function filterByGenerating(grammar: Grammar, generating: Set<string>): Grammar {
  const nts = grammar.nonterminals();
  const newProd = new Map<string, Set<string>>();

  const sortedGen = [...generating].sort();
  for (const lhs of sortedGen) {
    const kept = new Set<string>();
    for (const rhsKey of grammar.productions.get(lhs) ?? []) {
      const rhs = keyToRhs(rhsKey);
      let ok = true;
      for (const sym of rhs) {
        if (nts.has(sym) && !generating.has(sym)) {
          ok = false;
          break;
        }
      }
      if (ok) kept.add(rhsKey);
    }
    if (kept.size > 0) newProd.set(lhs, kept);
  }

  return new Grammar({
    startSymbol: grammar.startSymbol,
    productions: newProd,
    declaredNonterminals: new Set(grammar.declaredNonterminals),
  });
}

function computeReachable(grammar: Grammar): Set<string> {
  const nts = grammar.nonterminals();
  const start = grammar.startSymbol;
  if (!nts.has(start)) return new Set();

  const seen = new Set<string>([start]);
  const stack: string[] = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const rhsKey of grammar.productions.get(cur) ?? []) {
      const rhs = keyToRhs(rhsKey);
      for (const nt of rhsNonterminals(rhs, nts)) {
        if (!seen.has(nt)) {
          seen.add(nt);
          stack.push(nt);
        }
      }
    }
  }
  return seen;
}

function filterByReachable(grammar: Grammar, reachable: Set<string>): Grammar {
  const newProd = new Map<string, Set<string>>();
  for (const lhs of [...reachable].sort()) {
    const rhss = grammar.productions.get(lhs);
    if (rhss && rhss.size > 0) newProd.set(lhs, new Set(rhss));
  }
  return new Grammar({
    startSymbol: grammar.startSymbol,
    productions: newProd,
    declaredNonterminals: new Set(grammar.declaredNonterminals),
  });
}

function eliminateNullProductions(grammar: Grammar): [Grammar, Step] {
  const title = "Eliminate null (ε) productions";
  const beforeText = grammar.toPrettyText();

  const nullable = computeNullable(grammar);
  let introducedStart = false;
  let start0 = grammar.startSymbol;
  let g = grammar;

  if (nullable.has(grammar.startSymbol)) {
    start0 = freshStartSymbol(grammar.nonterminals(), "S0");
    introducedStart = true;
    const newProd = cloneProdMap(g.productions);
    if (!newProd.has(start0)) newProd.set(start0, new Set());
    newProd.get(start0)!.add(rhsToKey([g.startSymbol]));
    newProd.get(start0)!.add(rhsToKey([])); // ε
    g = new Grammar({
      startSymbol: start0,
      productions: newProd,
      declaredNonterminals: new Set([...g.declaredNonterminals, start0]),
    });
  }

  const nts = g.nonterminals();
  const newProd = new Map<string, Set<string>>();
  for (const nt of nts) newProd.set(nt, new Set());

  let addedCount = 0;

  for (const [lhs, rhssKeys] of g.productions.entries()) {
    for (const rhsKey of rhssKeys) {
      const rhs = keyToRhs(rhsKey);
      if (rhs.length === 0) {
        if (lhs === start0) newProd.get(lhs)!.add(rhsToKey([]));
        continue;
      }

      const variants = rhsNullableVariants(rhs, nullable);
      for (const v of variants) {
        if (v.length === 0) {
          if (lhs === start0) {
            const key = rhsToKey(v);
            if (!newProd.get(lhs)!.has(key)) addedCount += 1;
            newProd.get(lhs)!.add(key);
          }
          continue;
        }
        const key = rhsToKey(v);
        if (!newProd.get(lhs)!.has(key)) addedCount += 1;
        newProd.get(lhs)!.add(key);
      }
    }
  }

  // drop empties
  for (const [lhs, rhss] of [...newProd.entries()]) {
    if (rhss.size === 0) newProd.delete(lhs);
  }

  const afterG = new Grammar({
    startSymbol: start0,
    productions: newProd,
    declaredNonterminals: new Set(g.declaredNonterminals),
  });

  const step = stepFromGrammars(title, grammar, afterG);
  step.before = beforeText;
  step.after = afterG.toPrettyText();
  step.details = {
    nullable: [...nullable].sort(),
    introduced_fresh_start: introducedStart,
    fresh_start_symbol: introducedStart ? start0 : null,
    added_alternatives_count: addedCount,
    start_symbol: afterG.startSymbol,
  };
  return [afterG, step];
}

function computeNullable(grammar: Grammar): Set<string> {
  const nts = grammar.nonterminals();
  const nullable = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const [lhs, rhssKeys] of grammar.productions.entries()) {
      if (nullable.has(lhs)) continue;
      for (const rhsKey of rhssKeys) {
        const rhs = keyToRhs(rhsKey);
        if (rhs.length === 0) {
          nullable.add(lhs);
          changed = true;
          break;
        }
        let ok = true;
        for (const sym of rhs) {
          if (!nts.has(sym) || !nullable.has(sym)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          nullable.add(lhs);
          changed = true;
          break;
        }
      }
    }
  }

  return nullable;
}

function rhsNullableVariants(rhs: Rhs, nullable: Set<string>): Set<Rhs> {
  const positions: number[] = [];
  rhs.forEach((sym, i) => {
    if (nullable.has(sym)) positions.push(i);
  });

  const variants = new Map<string, Rhs>();
  variants.set(rhsToKey(rhs), rhs);

  // generate all subsets of nullable positions (excluding empty)
  const n = positions.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const removed = new Set<number>();
    for (let bit = 0; bit < n; bit++) {
      if (mask & (1 << bit)) removed.add(positions[bit]);
    }
    const v: string[] = [];
    rhs.forEach((sym, i) => {
      if (!removed.has(i)) v.push(sym);
    });
    const vRhs: Rhs = v;
    variants.set(rhsToKey(vRhs), vRhs);
  }

  return new Set(variants.values());
}

function removeUnitProductions(grammar: Grammar): [Grammar, Step] {
  const title = "Remove unit productions";
  const beforeText = grammar.toPrettyText();

  const nts = grammar.nonterminals();
  const unitEdges = new Map<string, Set<string>>();
  for (const A of nts) unitEdges.set(A, new Set());

  for (const A of nts) {
    for (const rhsKey of grammar.productions.get(A) ?? []) {
      const rhs = keyToRhs(rhsKey);
      if (isUnitRhs(rhs, nts)) unitEdges.get(A)!.add(rhs[0]);
    }
  }

  const closure = new Map<string, Set<string>>();
  for (const A of nts) closure.set(A, unitClosure(A, unitEdges));

  const newProd = new Map<string, Set<string>>();
  for (const A of nts) newProd.set(A, new Set());

  const removedUnits: string[] = [];
  let addedRules = 0;

  for (const A of nts) {
    for (const rhsKey of grammar.productions.get(A) ?? []) {
      const rhs = keyToRhs(rhsKey);
      if (isUnitRhs(rhs, nts)) {
        removedUnits.push(`${A} -> ${rhs[0]}`);
        continue;
      }
      newProd.get(A)!.add(rhsKey);
    }

    for (const B of closure.get(A) ?? []) {
      if (B === A) continue;
      for (const rhsKey of grammar.productions.get(B) ?? []) {
        const rhs = keyToRhs(rhsKey);
        if (isUnitRhs(rhs, nts)) continue;
        if (!newProd.get(A)!.has(rhsKey)) {
          newProd.get(A)!.add(rhsKey);
          addedRules += 1;
        }
      }
    }
  }

  for (const [lhs, rhss] of [...newProd.entries()]) {
    if (rhss.size === 0) newProd.delete(lhs);
  }

  const afterG = new Grammar({
    startSymbol: grammar.startSymbol,
    productions: newProd,
    declaredNonterminals: new Set(grammar.declaredNonterminals),
  });

  const step = stepFromGrammars(title, grammar, afterG);
  step.before = beforeText;
  step.after = afterG.toPrettyText();
  const unitPairsObj: Record<string, string[]> = {};
  for (const A of [...nts].sort()) unitPairsObj[A] = [...(closure.get(A) ?? new Set())].sort();
  step.details = {
    unit_pairs: unitPairsObj,
    removed_unit_productions: [...new Set(removedUnits)].sort(),
    added_alternatives_count: addedRules,
    start_symbol: afterG.startSymbol,
  };

  return [afterG, step];
}

function unitClosure(start: string, edges: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nxt of edges.get(cur) ?? []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        stack.push(nxt);
      }
    }
  }
  return seen;
}

function stepFromGrammars(title: string, beforeG: Grammar, afterG: Grammar): Step {
  const beforeSet = beforeG.allProductionsStrings();
  const afterSet = afterG.allProductionsStrings();
  return {
    title,
    before: beforeG.toPrettyText(),
    after: afterG.toPrettyText(),
    details: {},
    diffAdded: [...difference(afterSet, beforeSet)].sort(),
    diffRemoved: [...difference(beforeSet, afterSet)].sort(),
  };
}

function difference<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const x of a) if (!b.has(x)) out.add(x);
  return out;
}

function cloneProdMap(
  prod: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [lhs, rhss] of prod.entries()) out.set(lhs, new Set(rhss));
  return out;
}

