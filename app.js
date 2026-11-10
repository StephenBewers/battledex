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
    hint: document.getElementById("hint-a"),
    thumb: document.getElementById("thumb-a"),
  },
  b: {
    input: document.getElementById("fighter-b"),
    error: document.getElementById("error-b"),
    hint: document.getElementById("hint-b"),
    thumb: document.getElementById("thumb-b"),
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
const openDexButton = document.getElementById("open-dex");
const dexTitle = document.getElementById("dex-title");
const dexNote = document.getElementById("dex-note");
const dexEmpty = document.getElementById("dex-empty");
const dexList = document.getElementById("dex-list");
const dexMessage = document.getElementById("dex-message");
const dexBackButton = document.getElementById("dex-back");
const newFightButton = document.getElementById("new-fight");

let isFighting = false;

/* ---------- Fighter inputs: type a new fighter or pick a saved one ---------- */

// Saved fighters, newest first. Cached so typing doesn't re-parse localStorage
// on every keystroke; dexChanged() clears it whenever the BattleDex changes.
let savedCache = null;

function savedFighters() {
  if (!savedCache) savedCache = BattleDex.loadAll().reverse();
  return savedCache;
}

function makeFighterCombobox(key, otherKey) {
  return createFighterCombobox({
    input: fields[key].input,
    toggle: document.getElementById(`toggle-${key}`),
    listbox: document.getElementById(`listbox-${key}`),
    status: document.getElementById("combo-status"),
    getFighters: savedFighters,
    // The fighter chosen in the other field can't be picked here.
    getExcludedId: () => normalizeName(fields[otherKey].input.value),
  });
}

const comboA = makeFighterCombobox("a", "b");
const comboB = makeFighterCombobox("b", "a");

// Call after anything that adds, removes or replaces saved fighters.
function dexChanged() {
  savedCache = null;
  updateDexCount();
  comboA.refresh();
  comboB.refresh();
  // A fighter may have just been saved or removed, so the markers can change.
  updateSavedMarker("a");
  updateSavedMarker("b");
}

// Keep in step with changes made in another tab.
window.addEventListener("storage", (event) => {
  if (event.key === "battledex" || event.key === null) dexChanged();
});

/* ---------- Views ---------- */

// Exactly one view is visible at a time: the form, the loading screen or the result.
const dexView = document.getElementById("battledex");
const views = { form, loading: loadingView, result: resultView, battledex: dexView };

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.hidden = key !== name;
  }
  if (name === "form") dexChanged();
}

/* ---------- Field errors ---------- */

// The input is described by its error and/or its "saved fighter" hint,
// whichever are currently showing.
function syncDescribedBy(key) {
  const { input, error, hint } = fields[key];
  const ids = [];
  if (error.textContent) ids.push(error.id);
  if (!hint.hidden) ids.push(hint.id);
  if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
  else input.removeAttribute("aria-describedby");
}

function showError(key, error) {
  const { input, error: el } = fields[key];
  el.textContent = error.message;
  el.dataset.type = error.type;
  input.setAttribute("aria-invalid", "true");
  syncDescribedBy(key);
}

function clearError(key) {
  const { input, error: el } = fields[key];
  el.textContent = "";
  delete el.dataset.type;
  input.removeAttribute("aria-invalid");
  syncDescribedBy(key);
}

// Marker for a typed or picked name that matches a saved fighter: a thumbnail
// of the saved portrait inside the field, plus a text hint under it. It means
// the saved art will be reused instead of generating a new portrait.
function updateSavedMarker(key) {
  const { input, hint, thumb } = fields[key];
  const id = normalizeName(input.value);
  const saved = id ? savedFighters().find((fighter) => fighter.id === id) : null;

  if (saved && thumb.getAttribute("src") !== saved.image) thumb.src = saved.image;
  thumb.hidden = !saved;
  hint.hidden = !saved;
  input.closest(".combo").dataset.saved = saved ? "true" : "false";
  syncDescribedBy(key);
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
  quota: "The BattleDex is full. Open the BattleDex and remove a fighter to make room.",
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
    dexChanged();
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

/* ---------- BattleDex view ---------- */

// The button on the form shows how many fighters are saved.
function updateDexCount() {
  const count = BattleDex.loadAll().length;
  openDexButton.textContent = count ? `BattleDex (${count})` : "BattleDex";
  openDexButton.setAttribute(
    "aria-label",
    count === 1 ? "BattleDex, 1 saved fighter" : `BattleDex, ${count} saved fighters`
  );
}

function setDexMessage(message, isError = false) {
  dexMessage.textContent = message;
  if (isError) dexMessage.dataset.error = "true";
  else delete dexMessage.dataset.error;
}

// Removing a fighter throws away their art, so it takes two presses.
// The button re-arms itself back to "Remove" after a few seconds.
const REMOVE_CONFIRM_MS = 4000;

function setRemoveState(button, fighter, armed) {
  if (armed) {
    button.dataset.armed = "true";
    button.textContent = "Confirm";
    // The visible word must appear in the accessible name (WCAG 2.5.3).
    button.setAttribute("aria-label", `Confirm removing ${fighter.name} from the BattleDex`);
  } else {
    delete button.dataset.armed;
    button.textContent = "Remove";
    button.setAttribute("aria-label", `Remove ${fighter.name} from the BattleDex`);
  }
}

function buildDexItem(fighter) {
  const item = document.createElement("li");
  item.className = "dex-item";

  const img = document.createElement("img");
  img.src = fighter.image;
  img.alt = `Pixel portrait of ${fighter.name}`;
  img.width = 96;
  img.height = 96;

  const info = document.createElement("div");
  info.className = "dex-item-info";

  const name = document.createElement("p");
  name.className = "dex-item-name";
  name.textContent = fighter.name;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-button";
  setRemoveState(button, fighter, false);

  let resetTimer;
  button.addEventListener("click", () => {
    clearTimeout(resetTimer);
    if (button.dataset.armed === "true") {
      removeFromDex(fighter);
      return;
    }
    setRemoveState(button, fighter, true);
    setDexMessage(`Press again to remove ${fighter.name}.`);
    resetTimer = setTimeout(() => {
      setRemoveState(button, fighter, false);
      setDexMessage("");
    }, REMOVE_CONFIRM_MS);
  });

  info.append(name, button);
  item.append(img, info);
  return item;
}

function renderDex() {
  const available = BattleDex.isAvailable();
  const fighters = BattleDex.loadAll().reverse(); // newest first
  dexNote.hidden = available;
  dexEmpty.hidden = !available || fighters.length > 0;
  dexList.replaceChildren(...fighters.map(buildDexItem));
}

function removeFromDex(fighter) {
  const buttons = [...dexList.querySelectorAll(".remove-button")];
  const index = buttons.findIndex((b) => b.dataset.armed === "true");

  const result = BattleDex.remove(fighter.id);
  if (!result.ok) {
    renderDex();
    setDexMessage("Couldn't remove that fighter. Your browser is blocking storage.", true);
    return;
  }

  renderDex();
  dexChanged();
  setDexMessage(`${fighter.name} removed from the BattleDex.`);

  // Keep keyboard focus useful: the next fighter's button, else the previous
  // one, else the heading when the list is now empty.
  const remaining = dexList.querySelectorAll(".remove-button");
  const target = remaining[Math.min(index, remaining.length - 1)];
  (target || dexTitle).focus();
}

openDexButton.addEventListener("click", () => {
  renderDex();
  setDexMessage("");
  showView("battledex");
  dexTitle.focus();
});

dexBackButton.addEventListener("click", () => {
  showView("form");
  openDexButton.focus();
});

updateDexCount();

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
  updateSavedMarker("a");
});

fields.b.input.addEventListener("input", () => {
  clearError("b");
  updateSavedMarker("b");
});
