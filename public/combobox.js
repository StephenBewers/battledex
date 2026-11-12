// Fighter combobox: a text input that also offers saved BattleDex fighters.
// Follows the WAI-ARIA "editable combobox with list autocomplete" pattern.
// Depends on normalizeName() from validation.js.
//
// The user can type any new fighter, or pick a saved one. Picking just fills in
// the saved fighter's name: fighter identity is the normalized name, so the
// saved art is reused automatically when the fight starts.
//
// Keys: Down/Up open the list and move through it, Enter picks the highlighted
// option (otherwise Enter submits the form as usual), Escape closes, Tab leaves.
// Mouse and touch: the arrow button opens the full list; tap an option to pick.

const COMBOBOX_MAX_OPTIONS = 50;

function createFighterCombobox({ input, toggle, listbox, status, getFighters }) {
  let isOpen = false;
  let activeIndex = -1;
  let shown = []; // fighters currently rendered in the list
  let suppressInput = false;

  // Polite screen reader message. Cleared first so repeats are announced again.
  function announce(message) {
    status.textContent = "";
    setTimeout(() => {
      status.textContent = message;
    }, 50);
  }

  function matches(showAll) {
    const query = showAll ? "" : normalizeName(input.value);
    return getFighters()
      .filter((fighter) => !query || fighter.id.includes(query))
      .slice(0, COMBOBOX_MAX_OPTIONS);
  }

  function buildOption(fighter, index) {
    const option = document.createElement("li");
    option.id = `${listbox.id}-option-${index}`;
    option.className = "combo-option";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");

    const img = document.createElement("img");
    img.src = fighter.image;
    img.alt = ""; // decorative: the name is right beside it
    img.width = 32;
    img.height = 32;

    const name = document.createElement("span");
    name.textContent = fighter.name;

    option.append(img, name);
    option.addEventListener("click", () => select(index));
    return option;
  }

  function setActive(index) {
    const options = listbox.children;
    if (activeIndex >= 0 && options[activeIndex]) {
      options[activeIndex].setAttribute("aria-selected", "false");
    }
    activeIndex = index;
    if (index >= 0 && options[index]) {
      options[index].setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", options[index].id);
      options[index].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function setExpanded(expanded) {
    isOpen = expanded;
    listbox.hidden = !expanded;
    input.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-expanded", String(expanded));
  }

  function close() {
    if (!isOpen) return;
    setActive(-1);
    setExpanded(false);
  }

  // Returns false (and stays closed) when there is nothing to show.
  function open(showAll = false) {
    shown = matches(showAll);
    if (shown.length === 0) {
      close();
      return false;
    }
    listbox.replaceChildren(...shown.map(buildOption));
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    setExpanded(true);
    announce(
      shown.length === 1
        ? "1 saved fighter available. Use the arrow keys to choose."
        : `${shown.length} saved fighters available. Use the arrow keys to choose.`
    );
    return true;
  }

  function select(index) {
    const fighter = shown[index];
    if (!fighter) return;
    // Setting the value fires "input" so other listeners (like clearing the
    // field's error) run, but that must not reopen the list.
    suppressInput = true;
    input.value = fighter.name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    suppressInput = false;
    close();
    input.focus();
    announce(`${fighter.name} selected from the BattleDex.`);
  }

  // The arrow button is only useful when something is saved.
  function refresh() {
    toggle.hidden = getFighters().length === 0;
    if (isOpen) open();
  }

  input.addEventListener("input", () => {
    if (suppressInput) return;
    open();
  });

  input.addEventListener("click", () => {
    if (!isOpen) open();
  });

  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!isOpen) {
          if (open(true)) setActive(0);
        } else {
          setActive((activeIndex + 1) % shown.length);
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (!isOpen) {
          if (open(true)) setActive(shown.length - 1);
        } else {
          setActive(activeIndex <= 0 ? shown.length - 1 : activeIndex - 1);
        }
        break;
      }
      case "Enter": {
        if (isOpen && activeIndex >= 0) {
          event.preventDefault(); // pick the option instead of submitting
          select(activeIndex);
        } else {
          close();
        }
        break;
      }
      case "Escape": {
        if (isOpen) {
          event.preventDefault();
          close();
        }
        break;
      }
      default:
        break;
    }
  });

  input.addEventListener("blur", close);

  // Keep focus in the input when the list or button is pressed, so the input's
  // blur handler doesn't close the list before the click lands.
  listbox.addEventListener("mousedown", (event) => event.preventDefault());
  toggle.addEventListener("mousedown", (event) => event.preventDefault());

  toggle.addEventListener("click", () => {
    input.focus();
    if (isOpen) {
      close();
    } else if (!open(true)) {
      announce("No saved fighters available.");
    }
  });

  refresh();
  return { refresh, close };
}
