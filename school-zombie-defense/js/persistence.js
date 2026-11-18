(function (global) {
  "use strict";

  function create(options) {
    const {
      getUpgradeIds,
      maxLevel,
      clamp,
      cacheKey,
      legacySaveKey,
      profileAuthKey
    } = options;
    let storage = options.storage;
    if (!storage) { try { storage = global.localStorage; } catch (_err) {} }
    let databaseFactory = options.databaseFactory;
    if (!databaseFactory) { try { databaseFactory = global.indexedDB; } catch (_err) {} }
    let memoryAuth = null;
    let database;
    let authWrite = Promise.resolve(false);

    function normalizeAuth(auth) {
      const profileId = String(((auth === null || auth === void 0 ? void 0 : auth.profile_id)) || "").trim();
      const profileSecret = String(((auth === null || auth === void 0 ? void 0 : auth.profile_secret)) || "").trim();
      return profileId && profileSecret ? { profile_id: profileId, profile_secret: profileSecret } : null;
    }

    function openDatabase() {
      if (database) return database;
      database = new Promise((resolve) => {
        try {
          const request = databaseFactory.open("school-zombie-profile", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("credentials");
          request.onsuccess = () => resolve(request.result);
          request.onerror = request.onblocked = () => resolve(null);
        } catch (_err) { resolve(null); }
      });
      return database;
    }

    async function writeBackup(auth) {
      const db = await openDatabase();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction("credentials", "readwrite");
          const store = transaction.objectStore("credentials");
          if (auth) store.put(auth, profileAuthKey); else store.delete(profileAuthKey);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = transaction.onabort = () => resolve(false);
        } catch (_err) { resolve(false); }
      });
    }

    async function readProfileAuthBackup() {
      const db = await openDatabase();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const request = db.transaction("credentials", "readonly").objectStore("credentials").get(profileAuthKey);
          request.onsuccess = () => {
            resolve(normalizeAuth(request.result));
          };
          request.onerror = () => resolve(null);
        } catch (_err) { resolve(null); }
      });
    }

    async function restoreProfileAuth() {
      const auth = loadProfileAuth();
      if (auth) return auth;
      memoryAuth = await readProfileAuthBackup();
      if (memoryAuth) { try { storage.setItem(profileAuthKey, JSON.stringify(memoryAuth)); } catch (_err) {} }
      return memoryAuth;
    }

    async function isProfileAuthSaved(auth) {
      const matches = (saved) => { return (
((saved === null || saved === void 0 ? void 0 : saved.profile_id)) === ((auth === null || auth === void 0 ? void 0 : auth.profile_id)) && ((saved === null || saved === void 0 ? void 0 : saved.profile_secret)) === ((auth === null || auth === void 0 ? void 0 : auth.profile_secret))
); };
      try { if (matches(normalizeAuth(JSON.parse(storage.getItem(profileAuthKey) || "{}")))) return true; } catch (_err) {}
      return matches(await readProfileAuthBackup());
    }

    function createDefaultMetaSave() {
      const save = { coins: 0, upgrades: {} };
      getUpgradeIds().forEach((id) => {
        save.upgrades[id] = 0;
      });
      return save;
    }

    function normalizeMetaSave(save) { var __oc1, __oc2, __oc3;
      const defaults = createDefaultMetaSave();
      const next = {
        coins: Math.max(0, Math.floor(Number(((save === null || save === void 0 ? void 0 : save.coins))) || 0)),
        upgrades: { ...defaults.upgrades }
      };
      Object.keys(defaults.upgrades).forEach((id) => { var __oc0;
        next.upgrades[id] = clamp(Math.floor(Number((((__oc0 = save === null || save === void 0 ? void 0 : save.upgrades) === null || __oc0 === void 0 ? void 0 : __oc0[id]))) || 0), 0, maxLevel);
      });
      const oldGunLevel = clamp(Math.floor(Number((((__oc1 = save === null || save === void 0 ? void 0 : save.upgrades) === null || __oc1 === void 0 ? void 0 : __oc1.gun))) || 0), 0, maxLevel);
      const oldBowLevel = clamp(Math.floor(Number((((__oc2 = save === null || save === void 0 ? void 0 : save.upgrades) === null || __oc2 === void 0 ? void 0 : __oc2.bow))) || 0), 0, maxLevel);
      const oldLauncherLevel = clamp(Math.floor(Number((((__oc3 = save === null || save === void 0 ? void 0 : save.upgrades) === null || __oc3 === void 0 ? void 0 : __oc3.launcher))) || 0), 0, maxLevel);
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
      } catch (_err) {
        return createDefaultMetaSave();
      }
    }

    function saveMetaSave(save) {
      try {
        const normalized = normalizeMetaSave(save);
        storage.setItem(cacheKey, JSON.stringify(normalized));
        storage.removeItem(legacySaveKey);
      } catch (_err) {
        // Storage can be unavailable in private or embedded browser modes.
      }
    }

    function loadProfileAuth() {
      try {
        return normalizeAuth(JSON.parse(storage.getItem(profileAuthKey) || "{}")) || memoryAuth;
      } catch (_err) {
        return memoryAuth;
      }
    }

    function saveProfileAuth(auth) {
      memoryAuth = normalizeAuth(auth);
      let saved = false;
      try {
        if (!memoryAuth) {
          storage.removeItem(profileAuthKey);
        } else {
          storage.setItem(profileAuthKey, JSON.stringify(memoryAuth));
        }
        saved = true;
      } catch (_err) {
        // Storage can be unavailable in private or embedded browser modes.
      }
      const snapshot = memoryAuth;
      authWrite = authWrite.then(() => writeBackup(snapshot)).then((backupSaved) => saved || backupSaved);
      return authWrite;
    }

    return Object.freeze({
      createDefaultMetaSave,
      normalizeMetaSave,
      loadMetaSave,
      saveMetaSave,
      loadProfileAuth,
      saveProfileAuth,
      restoreProfileAuth,
      readProfileAuthBackup,
      isProfileAuthSaved
    });
  }

  const api = Object.freeze({ create });
  global.SchoolZombiePersistence = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
