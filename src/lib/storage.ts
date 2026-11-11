import type { Project, Store, AppSettings, Snapshot } from "../types";
import { getDB, STORE_META, STORE_PROJECTS, STORE_SNAPSHOTS } from "./db";

const LS_PROJECTS_KEY = "aiPlayground.projects";
const LS_CURRENT_KEY = "aiPlayground.currentProjectId";
const LS_SETTINGS_KEY = "aiPlayground.settings";
const META_MIGRATED = "migratedFromLocalStorage";
const META_CURRENT_ID = "currentProjectId";
const META_SETTINGS = "appSettings";

/* ============================================================
   State of what we've already written (sync optimization)
   ============================================================ */

const knownVersions = new Map<string, number>();

/* ============================================================
   Backend interface — IDB or localStorage fallback
   ============================================================ */

interface Backend {
  loadAll(): Promise<Store>;
  saveProjects(projects: Project[]): Promise<void>;
  saveCurrentProjectId(id: string): Promise<void>;
}

/* ============================================================
   IndexedDB backend
   ============================================================ */

async function idbGetMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get(STORE_META, key)) as T | undefined;
}

async function idbSetMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put(STORE_META, value, key);
}

async function idbEnsureMigrated(): Promise<void> {
  const migrated = await idbGetMeta<boolean>(META_MIGRATED);
  if (migrated) return;

  const db = await getDB();

  let rawProjects: unknown = null;
  let rawCurrent: string | null = null;
  try {
    const stored = localStorage.getItem(LS_PROJECTS_KEY);
    if (stored) rawProjects = JSON.parse(stored);
    rawCurrent = localStorage.getItem(LS_CURRENT_KEY);
  } catch {
    rawProjects = null;
  }

  if (Array.isArray(rawProjects) && rawProjects.length > 0) {
    const tx = db.transaction([STORE_PROJECTS, STORE_META], "readwrite");
    const projectStore = tx.objectStore(STORE_PROJECTS);
    for (const project of rawProjects as Project[]) {
      if (project && typeof project.id === "string") {
        await projectStore.put(project);
      }
    }
    if (rawCurrent && typeof rawCurrent === "string") {
      await tx.objectStore(STORE_META).put(rawCurrent, META_CURRENT_ID);
    }
    await tx.objectStore(STORE_META).put(true, META_MIGRATED);
    await tx.done;
  } else {
    await idbSetMeta(META_MIGRATED, true);
  }
}

const idbBackend: Backend = {
  async loadAll(): Promise<Store> {
    await idbEnsureMigrated();
    const db = await getDB();
    const projects = await db.getAll(STORE_PROJECTS);

    knownVersions.clear();
    for (const p of projects) knownVersions.set(p.id, p.updatedAt);

    const storedCurrent = (await idbGetMeta<string>(META_CURRENT_ID)) ?? "";
    const currentProjectId =
      storedCurrent && projects.some((p) => p.id === storedCurrent)
        ? storedCurrent
        : projects[0]?.id ?? "";

    return { projects, currentProjectId };
  },

  async saveProjects(projects: Project[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_PROJECTS, "readwrite");
    const store = tx.objectStore(STORE_PROJECTS);

    const existingKeys = new Set(await store.getAllKeys());
    const currentKeys = new Set(projects.map((p) => p.id));

    for (const key of existingKeys) {
      if (!currentKeys.has(key as string)) {
        await store.delete(key);
        knownVersions.delete(key as string);
      }
    }

    for (const project of projects) {
      const known = knownVersions.get(project.id);
      if (known !== undefined && known >= project.updatedAt) continue;
      await store.put(project);
      knownVersions.set(project.id, project.updatedAt);
    }

    await tx.done;
  },

  async saveCurrentProjectId(id: string): Promise<void> {
    await idbSetMeta(META_CURRENT_ID, id);
  },
};

/* ============================================================
   localStorage fallback backend
   ============================================================ */

const lsBackend: Backend = {
  async loadAll(): Promise<Store> {
    let projects: Project[] = [];
    try {
      const saved = localStorage.getItem(LS_PROJECTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) projects = parsed;
      }
    } catch {
      projects = [];
    }

    let currentProjectId = "";
    try {
      const saved = localStorage.getItem(LS_CURRENT_KEY);
      if (saved && projects.some((p) => p.id === saved)) currentProjectId = saved;
    } catch {
      // ignore
    }
    if (!currentProjectId) currentProjectId = projects[0]?.id ?? "";

    return { projects, currentProjectId };
  },

  async saveProjects(projects: Project[]): Promise<void> {
    try {
      localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify(projects));
    } catch (err) {
      console.error("localStorage save failed:", err);
    }
  },

  async saveCurrentProjectId(id: string): Promise<void> {
    try {
      localStorage.setItem(LS_CURRENT_KEY, id);
    } catch (err) {
      console.error("localStorage save failed:", err);
    }
  },
};

/* ============================================================
   Backend selection
   ============================================================ */

let activeBackend: Backend | null = null;
let backendInit: Promise<Backend> | null = null;

function initBackend(): Promise<Backend> {
  if (activeBackend) return Promise.resolve(activeBackend);
  if (backendInit) return backendInit;

  backendInit = (async () => {
    if (typeof indexedDB === "undefined") {
      console.warn("IndexedDB unavailable — using localStorage fallback.");
      activeBackend = lsBackend;
      return lsBackend;
    }
    try {
      await getDB();
      activeBackend = idbBackend;
      return idbBackend;
    } catch (err) {
      console.warn("IndexedDB init failed — using localStorage fallback:", err);
      activeBackend = lsBackend;
      return lsBackend;
    }
  })();

  return backendInit;
}

/* ============================================================
   Public API — Projects
   ============================================================ */

export async function loadAll(): Promise<Store> {
  return (await initBackend()).loadAll();
}

export async function saveProjects(projects: Project[]): Promise<void> {
  return (await initBackend()).saveProjects(projects);
}

export async function saveCurrentProjectId(id: string): Promise<void> {
  return (await initBackend()).saveCurrentProjectId(id);
}

/* ============================================================
   Public API — Settings
   ============================================================ */

export async function loadSettings(): Promise<AppSettings> {
  const defaultSettings: AppSettings = { theme: "light", defaultProvider: "", showAvatar: true };
  const backend = await initBackend();
  
  if (backend === idbBackend) {
    const settings = await idbGetMeta<AppSettings>(META_SETTINGS);
    return { ...defaultSettings, ...settings };
  } else {
    try {
      const saved = localStorage.getItem(LS_SETTINGS_KEY);
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return defaultSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const backend = await initBackend();
  if (backend === idbBackend) {
    await idbSetMeta(META_SETTINGS, settings);
  } else {
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error("localStorage save failed:", err);
    }
  }
}

/* ============================================================
   Public API — Snapshots (History)
   ============================================================ */

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const backend = await initBackend();
  if (backend === idbBackend) {
    const db = await getDB();
    await db.put(STORE_SNAPSHOTS, snapshot);
    
    // حفظ حداکثر ۲۰ نسخه برای هر پروژه
    const allForProject = await db.getAllFromIndex(STORE_SNAPSHOTS, "by-projectId", snapshot.projectId);
    if (allForProject.length > 20) {
      allForProject.sort((a, b) => a.timestamp - b.timestamp);
      const toDelete = allForProject.slice(0, allForProject.length - 20);
      for (const snap of toDelete) {
        await db.delete(STORE_SNAPSHOTS, snap.id);
      }
    }
  }
}

export async function getSnapshots(projectId: string): Promise<Snapshot[]> {
  const backend = await initBackend();
  if (backend === idbBackend) {
    const db = await getDB();
    const snaps = await db.getAllFromIndex(STORE_SNAPSHOTS, "by-projectId", projectId);
    return snaps.sort((a, b) => b.timestamp - a.timestamp);
  }
  return [];
}

/* ============================================================
   Public API — Clear All
   ============================================================ */

export async function clearAllStorage(): Promise<void> {
  try {
    if (typeof indexedDB !== "undefined") {
      indexedDB.deleteDatabase("aiPlayground");
    }
    localStorage.removeItem(LS_PROJECTS_KEY);
    localStorage.removeItem(LS_CURRENT_KEY);
    localStorage.removeItem(LS_SETTINGS_KEY);
    localStorage.removeItem("aiPlayground.autoMode");
  } catch (err) {
    console.error("Failed to clear storage:", err);
  }
}