import type { ImageJobErrorCode, ProjectDocumentSnapshot } from "./image-jobs/types.ts";
import { referenceImageUrlsFrom, type Project, type ProjectDocument } from "./project/schema.ts";

export type SyncSnapshot = ProjectDocumentSnapshot;

export type SyncResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ImageJobErrorCode; current?: SyncSnapshot };

export type SyncApi = {
  load: (projectId: string) => Promise<SyncResult<SyncSnapshot>>;
  save: (
    projectId: string,
    document: ProjectDocument,
    expectedVersion: number,
  ) => Promise<SyncResult<{ version: number; updatedAt: number }>>;
};

export type SyncEvent =
  | { type: "conflict"; projectId: string }
  | { type: "deleted"; projectId: string }
  | { type: "rejected"; projectId: string; code: ImageJobErrorCode };

export type SyncHost = {
  getProject: (id: string) => Project | undefined;
  /** Replace (or add) the local copy with the server document, keeping UI state. */
  applyServerDocument: (document: ProjectDocument) => void;
  dropProject: (id: string) => void;
  notify: (event: SyncEvent) => void;
  /** Last server version each project was synced at; persisted so a reload does not look like a conflict. */
  versions: {
    get: (id: string) => number | undefined;
    set: (id: string, version: number) => void;
    delete: (id: string) => void;
  };
  schedule: (fn: () => void, ms: number) => () => void;
  debounceMs: number;
};

export type OpenResult = { ok: true; snapshot: SyncSnapshot } | { ok: false; code: ImageJobErrorCode };

/** The persisted shape of a Project: everything except UI state such as `mode`. */
export function toDocument(project: Project): ProjectDocument {
  const { mode: _mode, ...document } = project;
  return {
    ...document,
    // Wireframes are stored as server images; a legacy inline data: URL would make the whole save invalid.
    prototypeDataUrl: document.prototypeDataUrl?.toLowerCase().startsWith("data:")
      ? null
      : document.prototypeDataUrl,
    referenceImageUrls: referenceImageUrlsFrom(document.referenceImageUrls),
  };
}

// Key order is not stable across jsonb round trips, so compare with sorted keys.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

export function createProjectSync(api: SyncApi, host: SyncHost) {
  const timers = new Map<string, () => void>();
  const chains = new Map<string, Promise<void>>();
  const synced = new Map<string, string>();

  function cancelTimer(id: string): void {
    timers.get(id)?.();
    timers.delete(id);
  }

  function adopt(id: string, snapshot: SyncSnapshot): void {
    if (!snapshot.document) return;
    cancelTimer(id);
    host.applyServerDocument(snapshot.document);
    host.versions.set(id, snapshot.version);
    const local = host.getProject(id);
    if (local) synced.set(id, stableStringify(toDocument(local)));
  }

  function forget(id: string): void {
    cancelTimer(id);
    host.versions.delete(id);
    synced.delete(id);
  }

  function handleDeleted(id: string): void {
    forget(id);
    host.dropProject(id);
    host.notify({ type: "deleted", projectId: id });
  }

  function handleFailure(
    id: string,
    failure: { code: ImageJobErrorCode; current?: SyncSnapshot },
  ): void {
    switch (failure.code) {
      case "version_conflict": {
        const current = failure.current;
        if (!current) return;
        if (current.document) {
          adopt(id, current);
          host.notify({ type: "conflict", projectId: id });
        } else {
          // The server has nothing newer to offer, so keep the local copy and retry from its version.
          host.versions.set(id, current.version);
          touch(id);
        }
        return;
      }
      case "project_deleted":
        handleDeleted(id);
        return;
      case "document_too_large":
      case "invalid_document":
        host.notify({ type: "rejected", projectId: id, code: failure.code });
        return;
      default:
        // Signed out, not found or not ours: nothing to do here; the next edit tries again.
        return;
    }
  }

  async function saveNow(id: string): Promise<void> {
    const project = host.getProject(id);
    if (!project) return;
    // A legacy inline wireframe would be saved as null; local migration uploads it and swaps in the address first.
    if (project.prototypeDataUrl?.toLowerCase().startsWith("data:")) return;
    const document = toDocument(project);
    const fingerprint = stableStringify(document);
    if (fingerprint === synced.get(id)) return;

    let version = host.versions.get(id);
    if (version === undefined) {
      const loaded = await api.load(id);
      if (!loaded.ok) return handleFailure(id, loaded);
      if (loaded.value.document) {
        // A server copy exists that this device never synced with; server wins.
        adopt(id, loaded.value);
        host.notify({ type: "conflict", projectId: id });
        return;
      }
      version = loaded.value.version;
      host.versions.set(id, version);
    }

    const saved = await api.save(id, document, version);
    if (!saved.ok) return handleFailure(id, saved);
    host.versions.set(id, saved.value.version);
    synced.set(id, fingerprint);
  }

  function enqueue(id: string): Promise<void> {
    const previous = chains.get(id) ?? Promise.resolve();
    const next = previous
      .then(() => saveNow(id))
      .catch(() => {
        // Network or server failure: leave the project unsynced so the next edit retries.
      })
      .finally(() => {
        if (chains.get(id) === next) chains.delete(id);
      });
    chains.set(id, next);
    return next;
  }

  function touch(id: string): void {
    cancelTimer(id);
    timers.set(
      id,
      host.schedule(() => {
        timers.delete(id);
        void enqueue(id);
      }, host.debounceMs),
    );
  }

  /** Save right away, skipping the debounce (for example when the tab is being hidden). */
  function flush(id: string): Promise<void> {
    if (!timers.has(id)) return chains.get(id) ?? Promise.resolve();
    cancelTimer(id);
    return enqueue(id);
  }

  async function open(id: string): Promise<OpenResult> {
    let loaded: SyncResult<SyncSnapshot>;
    try {
      loaded = await api.load(id);
    } catch {
      return { ok: false, code: "upstream_failed" };
    }
    if (!loaded.ok) {
      if (loaded.code === "project_deleted") handleDeleted(id);
      return { ok: false, code: loaded.code };
    }
    const snapshot = loaded.value;
    if (snapshot.document) {
      const local = host.getProject(id);
      if (!local || host.versions.get(id) !== snapshot.version) {
        adopt(id, snapshot);
      } else if (stableStringify(toDocument(local)) === stableStringify(snapshot.document)) {
        // Same version and same content: a reload alone should not cost a save.
        synced.set(id, stableStringify(snapshot.document));
      }
    } else {
      host.versions.set(id, snapshot.version);
      // The server has a row but never received a document: upload what this device has.
      if (host.getProject(id)) touch(id);
    }
    return { ok: true, snapshot };
  }

  return {
    touch,
    flush,
    open,
    forget,
    /** Resolves once every save that has started has settled. */
    async idle(): Promise<void> {
      while (chains.size > 0) await Promise.all([...chains.values()]);
    },
    flushAll(): Promise<void[]> {
      return Promise.all([...timers.keys()].map(flush));
    },
  };
}

export type ProjectSync = ReturnType<typeof createProjectSync>;
