# CFG Simplifier (Static Web App)

A teaching-focused web application to **simplify context-free grammars (CFGs)** and **visualize each transformation step-by-step**.

It performs (in order):
- **Remove useless symbols** (non-generating, then unreachable)
- **Eliminate null (ε) productions** using the **standard ε-preserving approach** (introduce a fresh start symbol `S0` when needed)
- **Remove unit productions**
- **Final cleanup** (useless symbols again)

For every stage, the UI shows:
- **Before** grammar
- **After** grammar
- **Added/Removed** productions (diff)
- **Details** (computed sets like generating/reachable/nullable/unit-pairs)

---

## Requirements
- Node.js 20+ (recommended)

---

## Setup

```bash
cd "/Users/gouravsaini1316/TAFL project"
npm install
```

---

## Run

```bash
cd "/Users/gouravsaini1316/TAFL project"
npm run dev
```

Open:
- the URL printed by Vite (usually `http://localhost:5173`)

## Build (for GitHub Pages)

```bash
npm run build
```

---

## Input format

### Productions
- **One production per line**
- Use `->`
- Use `|` for alternatives
- Use `ε` or `lambda` for the empty string

Example:

```
S -> AB | ε
A -> aA | a
B -> b
```

### Symbols / tokenization rules
This tool supports two common notations:

1) **No spaces on RHS** (classic textbook style)
- The RHS is interpreted as a sequence of **single-character symbols**.
- Example: `S -> aA` means symbols `a` then `A`.

2) **Spaces on RHS** (recommended for multi-letter symbols)
- If the RHS contains spaces, tokens are split by whitespace.
- Example:

```
Expr -> Expr + Term | Term
Term -> id
```

### Nonterminal detection
- Any symbol on a **left-hand side** is a nonterminal.
- Additionally, RHS tokens that **look like nonterminals** (start with an uppercase letter, e.g. `B`, `Expr`) are also treated as nonterminals, **even if they don’t have productions**.
  - This is important for correct “useless symbol” removal.

---

## Example (matches a common classroom case)

Input:

```
A -> a
C -> BC | c
E -> aA | e
S -> AC | B
```

Start symbol: `S`

Explanation:
- `B` is treated as a **nonterminal** but has **no productions**, so it is **non-generating** and gets removed.
- Then rules containing `B` (like `S -> B` and `C -> BC`) are removed too.
- `E` becomes unreachable from `S` and is removed.

Expected final grammar:

```
A -> a
C -> c
S -> AC
```

---

## Project structure

```
TAFL project/
  README.md
  index.html
  src/
    main.ts
    grammar.ts
    simplify.ts
    styles.css
  .github/workflows/deploy-pages.yml
```

---

## GitHub Pages

This project is a **static** web app and is deployable on **GitHub Pages** via GitHub Actions.

---

## Troubleshooting

### “I changed code but UI still shows old behavior”
- Restart the dev server and hard refresh the page (Shift+Reload / Cmd+Shift+R).

### “Start symbol dropdown is empty”
- Click **Parse preview** first; it populates the dropdown using LHS nonterminals.

