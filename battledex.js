// BattleDex: saved fighters and their art, kept in localStorage under "battledex".
//
// Each entry: { id, name, image, createdAt }
//   id         normalized name (see normalizeName in validation.js)
//   image      small data URI (see downsizeImage in image-utils.js)
//   createdAt  timestamp in ms
//
// localStorage can be missing, blocked or full, so every access is wrapped.
// save() returns { ok: true } or { ok: false, reason } where reason is
// "invalid", "unavailable" or "quota". Nothing here throws.

const BattleDex = (() => {
  const KEY = "battledex";

  // Even reading window.localStorage can throw (e.g. storage blocked).
  function getStorage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function isFighter(entry) {
    return (
      !!entry &&
      typeof entry.id === "string" &&
      typeof entry.name === "string" &&
      typeof entry.image === "string" &&
      entry.image.startsWith("data:image/")
    );
  }

  function isQuotaError(error) {
    return (
      !!error &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        error.code === 22 ||
        error.code === 1014)
    );
  }

  // All saved fighters, oldest first. Corrupt or malformed data reads as empty.
  function loadAll() {
    const storage = getStorage();
    if (!storage) return [];
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data.filter(isFighter) : [];
    } catch {
      return [];
    }
  }

  function get(id) {
    return loadAll().find((fighter) => fighter.id === id) || null;
  }

  // Add a fighter, or replace the existing entry with the same id.
  function save(fighter) {
    if (!isFighter(fighter)) return { ok: false, reason: "invalid" };

    const storage = getStorage();
    if (!storage) return { ok: false, reason: "unavailable" };

    const all = loadAll();
    const index = all.findIndex((entry) => entry.id === fighter.id);
    const entry = {
      id: fighter.id,
      name: fighter.name,
      image: fighter.image,
      createdAt: index >= 0 ? all[index].createdAt : fighter.createdAt ?? Date.now(),
    };
    if (index >= 0) all[index] = entry;
    else all.push(entry);

    try {
      storage.setItem(KEY, JSON.stringify(all));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: isQuotaError(error) ? "quota" : "unavailable" };
    }
  }

  return { loadAll, get, save };
})();
