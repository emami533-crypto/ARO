import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project, Snapshot } from "../types";

const DB_NAME = "aiPlayground";
const DB_VERSION = 2; // 👈 نسخه از ۱ به ۲ ارتقا یافت

export const STORE_PROJECTS = "projects";
export const STORE_META = "meta";
export const STORE_SNAPSHOTS = "snapshots"; // 👈 استور جدید

export interface AppDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { "by-updatedAt": number };
  };
  meta: {
    key: string;
    value: unknown;
  };
  snapshots: {
    key: string;
    value: Snapshot;
    indexes: { "by-projectId": string };
  };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          const store = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
          store.createIndex("by-updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
        // 👇 ساخت استور اسنپ‌شات‌ها
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          const snapStore = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "id" });
          snapStore.createIndex("by-projectId", "projectId");
        }
      },
    });
  }
  return dbPromise;
}