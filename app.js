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
const winnerHeading = document.getElementById("result-title");
const winnerName = document.getElementById("winner-name");
const winnerPortrait = document.getElementById("winner-portrait");
const resultReasoning = document.getElementById("result-reasoning");
const loserName = document.getElementById("loser-name");
const loserPortrait = document.getElementById("loser-portrait");
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

/* ---------- Winner's card ---------- */

// Portrait image. If the art failed or was refused, show the retro "?"
// placeholder sprite instead, so the card always looks complete.
function buildPortrait(fighter, art, size) {
  const img = document.createElement("img");
  img.width = size;
  img.height = size;
  if (art && art.image) {
    img.src = art.image;
    img.alt = `Pixel portrait of ${fighter.name}`;
  } else {
    img.src = PLACEHOLDER_PORTRAIT;
    img.alt = `Placeholder portrait for ${fighter.name}. The portrait could not be generated.`;
    img.dataset.placeholder = "true";
  }
  return img;
}

function renderResult(fighters, verdict, arts) {
  const winnerKey = verdict.winner === "A" ? "a" : "b";
  const loserKey = winnerKey === "a" ? "b" : "a";
  const winner = fighters[winnerKey];
  const loser = fighters[loserKey];

  winnerName.textContent = winner.name;
  winnerPortrait.replaceChildren(buildPortrait(winner, arts[winnerKey], 240));
  resultReasoning.textContent = verdict.reasoning;
  loserName.textContent = loser.name;
  loserPortrait.replaceChildren(buildPortrait(loser, arts[loserKey], 96));

  // Un-hiding the view restarts the CSS entrance animation each time.
  showView("result");
  // Moving focus to the heading reads "Winner! <name>" aloud and scrolls the
  // card into view.
  winnerHeading.focus();
}

function isValidVerdict(verdict) {
  return (
    verdict &&
    (verdict.winner === "A" || verdict.winner === "B") &&
    typeof verdict.reasoning === "string"
  );
}

/* ---------- Fight flow ---------- */

// Give up on a request that never answers, so the user isn't stuck on the
// loading screen. Generous, because real image generation can be slow.
const API_TIMEOUT_MS = 60000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Request timed out");
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function verdictFailureMessage(reason) {
  if (reason && reason.name === "TimeoutError") {
    return "The judges took too long to decide. Press Fight to try again.";
  }
  return "The judges couldn't reach a verdict. Press Fight to try again.";
}

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
      withTimeout(getVerdict(fighters.a.name, fighters.b.name), API_TIMEOUT_MS),
      withTimeout(getArt(fighters.a.name), API_TIMEOUT_MS),
      withTimeout(getArt(fighters.b.name), API_TIMEOUT_MS),
    ]);

    if (verdictResult.status !== "fulfilled" || !isValidVerdict(verdictResult.value)) {
      // Back to the form with the names intact so the user can retry.
      showFightError(verdictFailureMessage(verdictResult.reason));
      showView("form");
      fightButton.focus();
      return;
    }

    // A failed, refused or timed-out art call leaves that fighter with the
    // placeholder portrait (null here). The fight still completes.
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
