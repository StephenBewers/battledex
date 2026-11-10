// Battleground — app logic.
// Stage 3: form validation. The fight flow, result card and BattleDex are added
// in later stages (see project-build.md). Depends on validation.js.

const form = document.getElementById("fight-form");
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

// Placeholder: the real fight flow arrives in stage 4.
function startFight(fighters) {
  console.log("Valid fight:", fighters);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

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

// Clear an error as soon as the user edits the field it belongs to.
// Editing Player 1 also clears a mirror-match error shown under Player 2.
fields.a.input.addEventListener("input", () => {
  clearError("a");
  if (fields.b.error.dataset.type === "mirror") clearError("b");
});

fields.b.input.addEventListener("input", () => {
  clearError("b");
});
