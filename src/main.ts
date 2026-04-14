import "./styles.css";
import { GrammarParseError, parseGrammarText } from "./grammar";
import { simplifyWithSteps } from "./simplify";

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setAlert(message: string | null) {
  const root = el("alertRoot");
  if (!root) return;
  if (!message) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = `
    <div class="alert alert-error">
      <div class="alert-title">Input error</div>
      <div class="alert-body"></div>
    </div>
  `;
  const body = root.querySelector(".alert-body");
  if (body) body.textContent = message;
}

function setPreview(statusText: string, pretty: string) {
  const status = el("previewStatus");
  const box = el("previewBox");
  if (status) status.textContent = statusText;
  if (box) box.textContent = pretty;
}

function clearAll() {
  setAlert(null);
  setPreview("No preview yet.", "");

  const grammarEl = document.getElementById("grammar") as HTMLTextAreaElement | null;
  if (grammarEl) grammarEl.value = "";

  const startSel = document.getElementById("start_symbol") as HTMLSelectElement | null;
  if (startSel) {
    startSel.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(parse to select)";
    startSel.appendChild(opt);
    startSel.value = "";
  }

  const resultsRoot = el("resultsRoot");
  if (resultsRoot) resultsRoot.innerHTML = "";
}

function populateStartSymbol(options: string[], keepValue: string | null) {
  const startSel = document.getElementById("start_symbol") as HTMLSelectElement | null;
  if (!startSel) return;
  const current = keepValue ?? startSel.value;
  startSel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "(select start symbol)";
  startSel.appendChild(opt0);

  for (const nt of options) {
    const opt = document.createElement("option");
    opt.value = nt;
    opt.textContent = nt;
    startSel.appendChild(opt);
  }

  if (options.includes(current)) startSel.value = current;
}

async function parsePreview() {
  const grammarEl = document.getElementById("grammar") as HTMLTextAreaElement | null;
  if (!grammarEl) return;

  setAlert(null);
  setPreview("Parsing…", "");

  try {
    const g = parseGrammarText(grammarEl.value, null);
    const nts = [...g.declaredNonterminals].sort();
    populateStartSymbol(nts, null);
    setPreview("Parsed successfully.", g.toPrettyText());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setPreview(msg, "");
  }
}

function renderResults(steps: ReturnType<typeof simplifyWithSteps>, originalPretty: string, startSymbol: string) {
  const root = el("resultsRoot");
  if (!root) return;
  root.innerHTML = "";

  const header = document.createElement("header");
  header.className = "header";
  header.innerHTML = `
    <div>
      <h1>Simplification steps</h1>
      <p class="subtitle">Start symbol: <code></code></p>
    </div>
  `;
  header.querySelector("code")!.textContent = startSymbol;
  root.appendChild(header);

  const origCard = document.createElement("section");
  origCard.className = "card";
  origCard.innerHTML = `
    <h2>Original grammar</h2>
    <pre class="codebox"></pre>
  `;
  origCard.querySelector("pre")!.textContent = originalPretty;
  root.appendChild(origCard);

  const copyText = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

  steps.forEach((step, idx) => {
    const card = document.createElement("section");
    card.className = "card step";

    const stepHeader = document.createElement("div");
    stepHeader.className = "step-header";
    const title = document.createElement("div");
    title.innerHTML = `<h2>${idx + 1}. </h2>`;
    title.querySelector("h2")!.append(document.createTextNode(step.title));
    stepHeader.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-secondary";
    copyBtn.textContent = "Copy after";
    copyBtn.addEventListener("click", () => copyText(step.after));
    actions.appendChild(copyBtn);
    stepHeader.appendChild(actions);

    card.appendChild(stepHeader);

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.innerHTML = `
      <div class="panel">
        <h3>Before</h3>
        <pre class="codebox"></pre>
      </div>
      <div class="panel">
        <h3>After</h3>
        <pre class="codebox"></pre>
      </div>
    `;
    (grid.querySelectorAll("pre")[0] as HTMLPreElement).textContent = step.before;
    (grid.querySelectorAll("pre")[1] as HTMLPreElement).textContent = step.after;
    card.appendChild(grid);

    const diffGrid = document.createElement("div");
    diffGrid.className = "grid diffGrid";
    diffGrid.innerHTML = `
      <div class="panel">
        <h3>Removed</h3>
        <div class="muted"></div>
        <ul class="diff diff-removed" style="display:none"></ul>
      </div>
      <div class="panel">
        <h3>Added</h3>
        <div class="muted"></div>
        <ul class="diff diff-added" style="display:none"></ul>
      </div>
    `;
    const removedMuted = diffGrid.querySelectorAll(".muted")[0] as HTMLDivElement;
    const addedMuted = diffGrid.querySelectorAll(".muted")[1] as HTMLDivElement;
    const removedUl = diffGrid.querySelectorAll("ul")[0] as HTMLUListElement;
    const addedUl = diffGrid.querySelectorAll("ul")[1] as HTMLUListElement;

    if (step.diffRemoved.length === 0) {
      removedMuted.textContent = "None";
    } else {
      removedMuted.remove();
      removedUl.style.display = "";
      step.diffRemoved.forEach((r) => {
        const li = document.createElement("li");
        const code = document.createElement("code");
        code.textContent = r;
        li.appendChild(code);
        removedUl.appendChild(li);
      });
    }

    if (step.diffAdded.length === 0) {
      addedMuted.textContent = "None";
    } else {
      addedMuted.remove();
      addedUl.style.display = "";
      step.diffAdded.forEach((a) => {
        const li = document.createElement("li");
        const code = document.createElement("code");
        code.textContent = a;
        li.appendChild(code);
        addedUl.appendChild(li);
      });
    }

    card.appendChild(diffGrid);

    const detailsCard = document.createElement("div");
    detailsCard.className = "panel detailsPanel";
    detailsCard.innerHTML = `
      <h3>Details</h3>
      <div class="detailsGrid"></div>
    `;
    const detailsGrid = detailsCard.querySelector(".detailsGrid") as HTMLDivElement;
    for (const [k, v] of Object.entries(step.details ?? {})) {
      const detail = document.createElement("div");
      detail.className = "detail";
      const key = document.createElement("div");
      key.className = "detail-key";
      key.textContent = k;
      const val = document.createElement("div");
      val.className = "detail-val";
      const code = document.createElement("code");
      code.textContent = typeof v === "string" ? v : JSON.stringify(v);
      val.appendChild(code);
      detail.appendChild(key);
      detail.appendChild(val);
      detailsGrid.appendChild(detail);
    }
    card.appendChild(detailsCard);

    root.appendChild(card);
  });
}

function simplifyFromForm() {
  const grammarEl = document.getElementById("grammar") as HTMLTextAreaElement | null;
  const startSel = document.getElementById("start_symbol") as HTMLSelectElement | null;
  if (!grammarEl || !startSel) return;

  setAlert(null);

  const start = (startSel.value || "").trim() || null;
  if (!start) {
    setAlert("Please select a start symbol (use “Parse preview” first).");
    return;
  }

  try {
    const g = parseGrammarText(grammarEl.value, start);
    const steps = simplifyWithSteps(g);
    renderResults(steps, g.toPrettyText(), g.startSymbol);
  } catch (e) {
    const msg =
      e instanceof GrammarParseError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    setAlert(msg);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const previewBtn = el("previewBtn");
  if (previewBtn) previewBtn.addEventListener("click", () => void parsePreview());

  const clearBtn = el("clearBtn");
  if (clearBtn) clearBtn.addEventListener("click", () => clearAll());

  const form = document.getElementById("grammarForm") as HTMLFormElement | null;
  if (form) {
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      simplifyFromForm();
    });
  }
});

