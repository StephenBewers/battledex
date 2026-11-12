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
const loadingSub = document.getElementById("loading-sub");
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
const artNote = document.getElementById("art-note");
const energySection = document.getElementById("energy");
const energyRows = {};
for (const key of ["a", "b"]) {
  energyRows[key] = {
    name: document.getElementById(`energy-name-${key}`),
    bar: document.getElementById(`energy-bar-${key}`),
    fill: document.getElementById(`energy-fill-${key}`),
    value: document.getElementById(`energy-value-${key}`),
  };
}
const openDexButton = document.getElementById("open-dex");
const dexTitle = document.getElementById("dex-title");
const dexNote = document.getElementById("dex-note");
const dexEmpty = document.getElementById("dex-empty");
dexNote.textContent = MESSAGES.dex.blocked;
dexEmpty.textContent = MESSAGES.dex.empty;
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

function makeFighterCombobox(key) {
  return createFighterCombobox({
    input: fields[key].input,
    toggle: document.getElementById(`toggle-${key}`),
    listbox: document.getElementById(`listbox-${key}`),
    status: document.getElementById("combo-status"),
    getFighters: savedFighters,
  });
}

const comboA = makeFighterCombobox("a");
const comboB = makeFighterCombobox("b");

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

// Save failure reasons from BattleDex.save, mapped to their messages.
const SAVE_ERRORS = {
  quota: MESSAGES.save.quota,
  unavailable: MESSAGES.save.unavailable,
  invalid: MESSAGES.save.invalid,
  too_large: MESSAGES.save.tooLarge,
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
    setSaveMessage(MESSAGES.save.saved(fighter.name));
    dexChanged();
  } catch (error) {
    setSaveButtonState(button, fighter, "unsaved");
    setSaveMessage(
      error instanceof ImageTooLargeError ? SAVE_ERRORS.too_large : MESSAGES.save.prepareFailed,
      true
    );
  }
}

// Save button for one fighter. A fighter without real art can't be saved: the
// BattleDex stores art, and saving a placeholder would stop the real portrait
// ever being generated.
function buildSaveControl(fighter, art) {
  if (!art || !art.image) {
    const note = document.createElement("p");
    note.className = "save-note";
    note.textContent = MESSAGES.save.noPortrait;
    return note;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "save-button";
  setSaveButtonState(button, fighter, BattleDex.get(fighter.id) ? "saved" : "unsaved");
  button.addEventListener("click", () => saveToBattleDex(button, fighter, art));
  return button;
}

// Say so when a portrait was blocked by the image safety system or failed to
// generate, so a placeholder doesn't look like a bug. Blocked and failed have
// their own wording.
function setArtNote(fighters, artStatus) {
  artNote.textContent = artNoteMessage(fighters, artStatus);
}

/* ---------- Energy bars ---------- */

// `labelOf(key)` adds the " (Player 1)" style label in a mirror match.
function renderEnergy(fighters, verdict, labelOf) {
  const valid = hasValidEnergy(verdict);
  energySection.hidden = !valid;
  if (!valid) return;

  for (const key of ["a", "b"]) {
    const value = key === "a" ? verdict.energyA : verdict.energyB;
    const row = energyRows[key];
    row.name.textContent = fighters[key].name + labelOf(key);
    row.bar.setAttribute("aria-valuenow", String(value));
    row.bar.setAttribute("aria-valuetext", `${value} percent energy remaining`);
    // The CSS animation drains the bar from full down to this value.
    row.fill.style.setProperty("--energy", `${value}%`);
    row.fill.dataset.level = energyLevel(value);
    row.value.textContent = `${value}%`;
  }
}

function renderResult(fighters, verdict, arts, artStatus) {
  const winnerKey = verdict.winner === "A" ? "a" : "b";
  const loserKey = winnerKey === "a" ? "b" : "a";
  const winner = fighters[winnerKey];
  const loser = fighters[loserKey];

  // In a mirror match both sides share a name and a portrait, so say which
  // player won (as visible text) and offer a single save.
  const isMirror = winner.id === loser.id;
  const playerLabel = (key) => (isMirror ? ` (Player ${key === "a" ? 1 : 2})` : "");

  winnerName.textContent = winner.name + playerLabel(winnerKey);
  winnerPortrait.replaceChildren(buildPortrait(winner, arts[winnerKey], 240));
  resultReasoning.textContent = verdict.reasoning;
  loserName.textContent = loser.name + playerLabel(loserKey);
  loserPortrait.replaceChildren(buildPortrait(loser, arts[loserKey], 96));
  winnerActions.replaceChildren(buildSaveControl(winner, arts[winnerKey]));
  loserActions.replaceChildren(...(isMirror ? [] : [buildSaveControl(loser, arts[loserKey])]));
  setSaveMessage("");
  setArtNote(fighters, artStatus);
  renderEnergy(fighters, verdict, (key) => (isMirror ? ` (Player ${key === "a" ? 1 : 2})` : ""));

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
    setDexMessage(MESSAGES.dex.confirmRemove(fighter.name));
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
    setDexMessage(MESSAGES.dex.removeFailed, true);
    return;
  }

  renderDex();
  dexChanged();
  setDexMessage(MESSAGES.dex.removed(fighter.name));

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

// Fighters saved before the 10KB image limit are shrunk once, in the
// background. Anything that can't be shrunk is left as it is.
async function shrinkOversizedFighters() {
  const oversized = BattleDex.loadAll().filter((fighter) => fighter.image.length > IMAGE_BUDGET_CHARS);
  let changed = false;
  for (const fighter of oversized) {
    try {
      const image = await downsizeImage(fighter.image);
      if (BattleDex.save({ ...fighter, image }).ok) changed = true;
    } catch {
      // Leave this one alone.
    }
  }
  if (changed) dexChanged();
}

shrinkOversizedFighters();

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

/* ---------- Loading phrases ---------- */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let loadingTimer = null;

// Cycles fun phrases while a fight loads, in a fresh order each time. With
// reduced motion it shows one phrase and keeps it still.
function startLoadingMessages() {
  stopLoadingMessages();
  const phrases = shuffled(MESSAGES.loading);
  let index = 0;
  loadingSub.textContent = phrases[0];
  if (reducedMotion.matches) return;
  loadingTimer = setInterval(() => {
    index = (index + 1) % phrases.length;
    loadingSub.textContent = phrases[index];
  }, MESSAGES.loadingIntervalMs);
}

function stopLoadingMessages() {
  clearInterval(loadingTimer);
  loadingTimer = null;
}

async function startFight(fighters) {
  isFighting = true;
  hideFightError();
  showView("loading");
  startLoadingMessages();
  // The form (and the focused button) just disappeared, so move focus to the
  // loading view. Screen readers read it aloud.
  loadingView.focus();

  try {
    // Fighters already in the BattleDex reuse their saved art, so the server is
    // told not to generate an image for them.
    const savedA = BattleDex.get(fighters.a.id);
    const savedB = BattleDex.get(fighters.b.id);

    // One request runs the whole fight: the server does the verdict and any
    // needed art in parallel. A failed or refused art call comes back as null.
    let fight;
    try {
      fight = await withTimeout(
        getFight(fighters.a.name, fighters.b.name, { needArtA: !savedA, needArtB: !savedB }),
        API_TIMEOUT_MS
      );
    } catch (reason) {
      fight = { failure: reason };
    }

    if (fight.failure || !fight.verdict || !isValidVerdict(fight.verdict)) {
      // Back to the form with the names intact so the user can retry.
      showFightError(fightFailureMessage(fight.failure));
      showView("form");
      fightButton.focus();
      return;
    }

    // Saved art wins. Otherwise use the new art, or null for the placeholder
    // portrait when it failed, was refused or was not generated.
    const arts = {
      a: savedA ? { image: savedA.image } : fight.art.a ? { image: fight.art.a } : null,
      b: savedB ? { image: savedB.image } : fight.art.b ? { image: fight.art.b } : null,
    };
    renderResult(fighters, fight.verdict, arts, fight.artStatus);
  } finally {
    stopLoadingMessages();
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
// A name over the length limit shows its error straight away (typing or pasting),
// rather than waiting for Fight. The text is the same every time, so a screen
// reader isn't re-announced on every keystroke.
function handleNameInput(key) {
  clearError(key);
  const tooLong = checkNameLength(fields[key].input.value);
  if (tooLong) showError(key, tooLong);
  updateSavedMarker(key);
}

fields.a.input.addEventListener("input", () => handleNameInput("a"));
fields.b.input.addEventListener("input", () => handleNameInput("b"));
