(function (global) {
  "use strict";

  function create(options) {
    const {
      getUpgradeIds,
      maxLevel,
      clamp,
      cacheKey,
      legacySaveKey,
      profileAuthKey,
      storage = global.localStorage
    } = options;

    function createDefaultMetaSave() {
      const save = { coins: 0, upgrades: {} };
      getUpgradeIds().forEach((id) => {
        save.upgrades[id] = 0;
      });
      return save;
    }

    function normalizeMetaSave(save) {
      const defaults = createDefaultMetaSave();
      const next = {
        coins: Math.max(0, Math.floor(Number(save?.coins) || 0)),
        upgrades: { ...defaults.upgrades }
      };
      Object.keys(defaults.upgrades).forEach((id) => {
        next.upgrades[id] = clamp(Math.floor(Number(save?.upgrades?.[id]) || 0), 0, maxLevel);
      });
      const oldGunLevel = clamp(Math.floor(Number(save?.upgrades?.gun) || 0), 0, maxLevel);
      const oldBowLevel = clamp(Math.floor(Number(save?.upgrades?.bow) || 0), 0, maxLevel);
      const oldLauncherLevel = clamp(Math.floor(Number(save?.upgrades?.launcher) || 0), 0, maxLevel);
      if (oldGunLevel > 0) {
        ["c_power", "b_power", "e_power"].forEach((id) => {
          next.upgrades[id] = Math.max(next.upgrades[id], oldGunLevel);
        });
      }
      if (oldBowLevel > 0) {
        next.upgrades.a_power = Math.max(next.upgrades.a_power, oldBowLevel);
      }
      if (oldLauncherLevel > 0) {
        next.upgrades.d_charge = Math.max(next.upgrades.d_charge, oldLauncherLevel);
      }
      return next;
    }

    function loadMetaSave() {
      try {
        return normalizeMetaSave(JSON.parse(storage.getItem(cacheKey) || "{}"));
      } catch {
        return createDefaultMetaSave();
      }
    }

    function saveMetaSave(save) {
      try {
        const normalized = normalizeMetaSave(save);
        storage.setItem(cacheKey, JSON.stringify(normalized));
        storage.removeItem(legacySaveKey);
      } catch {
        // Storage can be unavailable in private or embedded browser modes.
      }
    }

    function loadProfileAuth() {
      try {
        const auth = JSON.parse(storage.getItem(profileAuthKey) || "{}");
        const profileId = String(auth.profile_id || "").trim();
        const profileSecret = String(auth.profile_secret || "").trim();
        return profileId && profileSecret
          ? { profile_id: profileId, profile_secret: profileSecret }
          : null;
      } catch {
        return null;
      }
    }

    function saveProfileAuth(auth) {
      try {
        if (!auth?.profile_id || !auth?.profile_secret) {
          storage.removeItem(profileAuthKey);
          return;
        }
        storage.setItem(profileAuthKey, JSON.stringify({
          profile_id: String(auth.profile_id),
          profile_secret: String(auth.profile_secret)
        }));
      } catch {
        // Storage can be unavailable in private or embedded browser modes.
      }
    }

    return Object.freeze({
      createDefaultMetaSave,
      normalizeMetaSave,
      loadMetaSave,
      saveMetaSave,
      loadProfileAuth,
      saveProfileAuth
    });
  }

  const api = Object.freeze({ create });
  global.SchoolZombiePersistence = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
