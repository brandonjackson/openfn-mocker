import { randomUUID } from 'node:crypto';

/**
 * In-memory data store, namespaced by collection. Every system server owns one
 * DataStore instance. Records are arbitrary objects stored as-is; each
 * collection is a `Map<id, record>` that preserves insertion order.
 *
 * The store is intentionally id-agnostic: the id is only the Map key. Plugins
 * that want the id echoed inside the record should set it themselves (the
 * route-registrar's default `makeRecord` does this via `record[idField]`).
 */
export class DataStore {
  private readonly store = new Map<string, Map<string, any>>();

  /** Get (creating if absent) the raw Map backing a collection. */
  collection(name: string): Map<string, any> {
    let c = this.store.get(name);
    if (!c) {
      c = new Map<string, any>();
      this.store.set(name, c);
    }
    return c;
  }

  /**
   * Store a record. If `id` is undefined/empty a `crypto.randomUUID()` is
   * generated and used as the Map key. Returns the stored record unchanged.
   */
  create(collection: string, id: string | undefined, record: any): any {
    const key = id !== undefined && id !== null && String(id).length > 0 ? String(id) : randomUUID();
    this.collection(collection).set(key, record);
    return record;
  }

  /** Fetch a single record by id, or undefined if absent. */
  get(collection: string, id: string): any | undefined {
    return this.collection(collection).get(String(id));
  }

  /** List all records in a collection, optionally filtered. Insertion order. */
  list(collection: string, filter?: (item: any) => boolean): any[] {
    const items = [...this.collection(collection).values()];
    return filter ? items.filter(filter) : items;
  }

  /** Shallow-merge `patch` into an existing record. Returns undefined if missing. */
  update(collection: string, id: string, patch: any): any | undefined {
    const c = this.collection(collection);
    const key = String(id);
    const existing = c.get(key);
    if (existing === undefined) return undefined;
    const merged =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...existing, ...patch }
        : patch;
    c.set(key, merged);
    return merged;
  }

  /** Full replace (creates the record if it does not already exist). */
  replace(collection: string, id: string, record: any): any {
    this.collection(collection).set(String(id), record);
    return record;
  }

  /** Insert or overwrite; reports whether the record was newly created. */
  upsert(collection: string, id: string, record: any): { created: boolean; record: any } {
    const c = this.collection(collection);
    const key = String(id);
    const created = !c.has(key);
    c.set(key, record);
    return { created, record };
  }

  /** Delete a record. Returns true if it existed. */
  destroy(collection: string, id: string): boolean {
    return this.collection(collection).delete(String(id));
  }

  /** Number of records in a collection. */
  count(collection: string): number {
    const c = this.store.get(collection);
    return c ? c.size : 0;
  }

  /** Names of all collections that currently exist. */
  collections(): string[] {
    return [...this.store.keys()];
  }

  /** Clear ALL collections (used by /_admin/reset before re-seeding). */
  reset(): void {
    this.store.clear();
  }

  /** Full dump: `{ collectionName: [records...] }`. */
  dump(): Record<string, any[]> {
    const out: Record<string, any[]> = {};
    for (const [name, c] of this.store) {
      out[name] = [...c.values()];
    }
    return out;
  }
}
