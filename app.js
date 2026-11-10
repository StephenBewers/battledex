// Battleground — app logic.
// Stage 4: validation plus the fight flow against the mock API layer.
// The animated winner's card, BattleDex and art placeholders come in later
// stages (see project-build.md). Depends on validation.js and api-client.js.

const form = document.getElementById("fight-form");
const fightButton = form.querySelector(".fight-button");
const fields = {
  a: {
    input: document.getElementById("fighter-a"),
    error: document.getElementById("error-a"),
  },
  b: {
    input: document.getElementById("fighter-b"),
    error: document.getElementById("error-b"),
  },
};
const fightError = document.getElementById("fight-error");
const loadingView = document.getElementById("loading");
const resultView = document.getElementById("result");
const resultTitle = document.getElementById("result-title");
const resultFighters = document.getElementById("result-fighters");
const resultReasoning = document.getElementById("result-reasoning");
const newFightButton = document.getElementById("new-fight");

let isFighting = false;

/* ---------- Views ---------- */

// Exactly one view is visible at a time: the form, the loading screen or the result.
const views = { form, loading: loadingView, result: resultView };

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.hidden = key !== name;
  }
}

/* ---------- Field errors ---------- */

function showError(key, error) {
  const { input, error: el } = fields[key];
  el.textContent = error.message;
  el.dataset.type = error.type;
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", el.id);
}

function clearError(key) {
  const { input, error: el } = fields[key];
  el.textContent = "";
  delete el.dataset.type;
  input.removeAttribute("aria-invalid");
  input.removeAttribute("aria-describedby");
}

function clearAllErrors() {
  clearError("a");
  clearError("b");
}

function showFightError(message) {
  fightError.textContent = message;
  fightError.hidden = false;
}

function hideFightError() {
  fightError.textContent = "";
  fightError.hidden = true;
}

/* ---------- Result display (basic; replaced by the winner's card in stage 5) ---------- */

function buildFighterFigure(fighter, art, isWinner) {
  const figure = document.createElement("figure");
  figure.className = "result-fighter";
  if (isWinner) figure.dataset.winner = "true";

  if (art && art.image) {
    const img = document.createElement("img");
    img.src = art.image;
    img.alt = `Pixel portrait of ${fighter.name}`;
    img.width = 160;
    img.height = 160;
    figure.append(img);
  } else {
    // Proper placeholder sprite arrives in stage 6.
    const missing = document.createElement("div");
    missing.className = "result-no-art";
    missing.textContent = "No portrait";
    figure.append(missing);
  }

  const caption = document.createElement("figcaption");
  caption.textContent = isWinner ? `${fighter.name} (winner)` : fighter.name;
  figure.append(caption);
  return figure;
}

function renderResult(fighters, verdict, arts) {
  const winnerKey = verdict.winner === "A" ? "a" : "b";
  resultTitle.textContent = `${fighters[winnerKey].name} wins!`;
  resultReasoning.textContent = verdict.reasoning;
  resultFighters.replaceChildren(
    buildFighterFigure(fighters.a, arts.a, winnerKey === "a"),
    buildFighterFigure(fighters.b, arts.b, winnerKey === "b")
  );
  showView("result");
  // Moving focus to the heading reads the winner aloud and scrolls it into view.
  resultTitle.focus();
}

function isValidVerdict(verdict) {
  return (
    verdict &&
    (verdict.winner === "A" || verdict.winner === "B") &&
    typeof verdict.reasoning === "string"
  );
}

/* ---------- Fight flow ---------- */

async function startFight(fighters) {
  isFighting = true;
  hideFightError();
  showView("loading");
  // The form (and the focused button) just disappeared, so move focus to the
  // loading view. Screen readers read it aloud.
  loadingView.focus();

  try {
    // Verdict and art run in parallel. Everything is settled before the reveal.
    const [verdictResult, artAResult, artBResult] = await Promise.allSettled([
      getVerdict(fighters.a.name, fighters.b.name),
      getArt(fighters.a.name),
      getArt(fighters.b.name),
    ]);

    if (verdictResult.status !== "fulfilled" || !isValidVerdict(verdictResult.value)) {
      // Back to the form with the names intact so the user can retry.
      showFightError("The judges couldn't reach a verdict. Please try again.");
      showView("form");
      fightButton.focus();
      return;
    }

    // A failed art call just leaves that fighter without a portrait.
    const arts = {
      a: artAResult.status === "fulfilled" ? artAResult.value : null,
      b: artBResult.status === "fulfilled" ? artBResult.value : null,
    };
    renderResult(fighters, verdictResult.value, arts);
  } finally {
    isFighting = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isFighting) return; // no double submits

  const result = validateFighters(fields.a.input.value, fields.b.input.value);
  clearAllErrors();

  if (!result.valid) {
    for (const key of ["a", "b"]) {
      if (result.errors[key]) showError(key, result.errors[key]);
    }
    // Move focus to the first invalid field so keyboard and screen reader
    // users land on the problem.
    const firstInvalid = result.errors.a ? "a" : "b";
    fields[firstInvalid].input.focus();
    return;
  }

  startFight(result.fighters);
});

// From the result back to a fresh form.
newFightButton.addEventListener("click", () => {
  fields.a.input.value = "";
  fields.b.input.value = "";
  clearAllErrors();
  hideFightError();
  showView("form");
  fields.a.input.focus();
});

// Clear an error as soon as the user edits the field it belongs to.
// Editing Player 1 also clears a mirror-match error shown under Player 2.
fields.a.input.addEventListener("input", () => {
  clearError("a");
  if (fields.b.error.dataset.type === "mirror") clearError("b");
});

fields.b.input.addEventListener("input", () => {
  clearError("b");
});
