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
const winnerActions = document.getElementById("winner-actions");
const loserActions = document.getElementById("loser-actions");
const saveMessage = document.getElementById("save-message");
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

/* ---------- Saving to the BattleDex ---------- */

function setSaveMessage(message, isError = false) {
  saveMessage.textContent = message;
  if (isError) saveMessage.dataset.error = "true";
  else delete saveMessage.dataset.error;
}

const SAVE_ERRORS = {
  quota: "The BattleDex is full. Remove a fighter to make room.",
  unavailable: "Can't save: your browser is blocking storage.",
  invalid: "Can't save this fighter.",
};

// The button uses aria-disabled rather than disabled so keyboard focus stays put.
function setSaveButtonState(button, fighter, state) {
  button.dataset.state = state;
  if (state === "saved") {
    button.textContent = "Saved";
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-label", `${fighter.name} is saved in the BattleDex`);
  } else if (state === "saving") {
    button.textContent = "Saving...";
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-label", `Saving ${fighter.name}`);
  } else {
    button.textContent = "Save";
    button.removeAttribute("aria-disabled");
    button.setAttribute("aria-label", `Save ${fighter.name} to the BattleDex`);
  }
}

async function saveToBattleDex(button, fighter, art) {
  if (button.getAttribute("aria-disabled") === "true") return;
  setSaveButtonState(button, fighter, "saving");

  try {
    const image = await downsizeImage(art.image);
    const result = BattleDex.save({
      id: fighter.id,
      name: fighter.name,
      image,
      createdAt: Date.now(),
    });
    if (!result.ok) {
      setSaveButtonState(button, fighter, "unsaved");
      setSaveMessage(SAVE_ERRORS[result.reason] || SAVE_ERRORS.invalid, true);
      return;
    }
    setSaveButtonState(button, fighter, "saved");
    setSaveMessage(`${fighter.name} saved to the BattleDex.`);
  } catch {
    setSaveButtonState(button, fighter, "unsaved");
    setSaveMessage("Couldn't prepare this portrait for saving.", true);
  }
}

// Save button for one fighter. A fighter without real art can't be saved: the
// BattleDex stores art, and saving a placeholder would stop the real portrait
// ever being generated.
function buildSaveControl(fighter, art) {
  if (!art || !art.image) {
    const note = document.createElement("p");
    note.className = "save-note";
    note.textContent = "Can't save: no portrait";
    return note;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "save-button";
  setSaveButtonState(button, fighter, BattleDex.get(fighter.id) ? "saved" : "unsaved");
  button.addEventListener("click", () => saveToBattleDex(button, fighter, art));
  return button;
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
  winnerActions.replaceChildren(buildSaveControl(winner, arts[winnerKey]));
  loserActions.replaceChildren(buildSaveControl(loser, arts[loserKey]));
  setSaveMessage("");

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

// Fighters already in the BattleDex reuse their saved art, so no image call is
// made for them.
function fetchArt(fighter) {
  const saved = BattleDex.get(fighter.id);
  if (saved) return Promise.resolve({ image: saved.image });
  return withTimeout(getArt(fighter.name), API_TIMEOUT_MS);
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
      fetchArt(fighters.a),
      fetchArt(fighters.b),
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
