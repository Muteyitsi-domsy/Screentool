/**
 * Reliability tests — IndexedDB (db.ts)
 * Uses fake-indexeddb (polyfilled in vitest.setup.ts) so no real browser is needed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, saveProjectToDB, getAllProjectsFromDB, deleteProjectFromDB } from '../db';
import type { Project } from '../types';

// Replace the global indexedDB with a brand-new in-memory instance before
// each test. This avoids the "blocked" state that occurs when deleteDatabase
// is called on a database that still has open connections.
beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
});

const makeProject = (id: string, name = `Project ${id}`): Project => ({
  id,
  name,
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
  version: 1,
  tray: Array(8).fill(null),
});

// ─── openDB ───────────────────────────────────────────────────────────────
describe('openDB', () => {
  it('resolves with a valid IDBDatabase', async () => {
    const db = await openDB();
    expect(db).toBeDefined();
    expect(db.name).toBe('ScreenFrameDB');
    db.close();
  });

  it('creates the "projects" object store on first open', async () => {
    const db = await openDB();
    expect(db.objectStoreNames.contains('projects')).toBe(true);
    db.close();
  });

  it('opening the same DB twice does not throw', async () => {
    await expect(Promise.all([openDB(), openDB()])).resolves.toBeDefined();
  });
});

// ─── saveProjectToDB ──────────────────────────────────────────────────────
describe('saveProjectToDB', () => {
  it('saves a project without throwing', async () => {
    await expect(saveProjectToDB(makeProject('p1'))).resolves.toBeUndefined();
  });

  it('persists data that getAllProjectsFromDB can read back', async () => {
    const p = makeProject('p-persist', 'My Project');
    await saveProjectToDB(p);
    const all = await getAllProjectsFromDB();
    const found = all.find((x) => x.id === 'p-persist');
    expect(found).toBeDefined();
    expect(found?.name).toBe('My Project');
  });

  it('overwrites an existing project with the same id (put semantics)', async () => {
    const p = makeProject('p-dup');
    await saveProjectToDB(p);
    await saveProjectToDB({ ...p, name: 'Updated Name' });
    const all = await getAllProjectsFromDB();
    const matches = all.filter((x) => x.id === 'p-dup');
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Updated Name');
  });

  it('preserves all project fields', async () => {
    const p = makeProject('p-fields', 'Field Test');
    p.createdAt = 123456;
    p.updatedAt = 654321;
    p.version = 3;
    await saveProjectToDB(p);
    const all = await getAllProjectsFromDB();
    const found = all.find((x) => x.id === 'p-fields')!;
    expect(found.createdAt).toBe(123456);
    expect(found.updatedAt).toBe(654321);
    expect(found.version).toBe(3);
  });
});

// ─── getAllProjectsFromDB ─────────────────────────────────────────────────
describe('getAllProjectsFromDB', () => {
  it('returns an empty array when no projects exist', async () => {
    await expect(getAllProjectsFromDB()).resolves.toEqual([]);
  });

  it('returns all saved projects', async () => {
    await saveProjectToDB(makeProject('a'));
    await saveProjectToDB(makeProject('b'));
    await saveProjectToDB(makeProject('c'));
    const all = await getAllProjectsFromDB();
    expect(all).toHaveLength(3);
    expect(all.map((p) => p.id)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('does not return deleted projects', async () => {
    await saveProjectToDB(makeProject('keep'));
    await saveProjectToDB(makeProject('del'));
    await deleteProjectFromDB('del');
    const all = await getAllProjectsFromDB();
    expect(all.find((p) => p.id === 'del')).toBeUndefined();
    expect(all.find((p) => p.id === 'keep')).toBeDefined();
  });
});

// ─── deleteProjectFromDB ──────────────────────────────────────────────────
describe('deleteProjectFromDB', () => {
  it('removes the specified project', async () => {
    await saveProjectToDB(makeProject('to-del'));
    await deleteProjectFromDB('to-del');
    const all = await getAllProjectsFromDB();
    expect(all.find((p) => p.id === 'to-del')).toBeUndefined();
  });

  it('does not affect other projects', async () => {
    await saveProjectToDB(makeProject('keep-me'));
    await saveProjectToDB(makeProject('del-me'));
    await deleteProjectFromDB('del-me');
    const all = await getAllProjectsFromDB();
    expect(all.find((p) => p.id === 'keep-me')).toBeDefined();
  });

  it('resolves without throwing when deleting a non-existent id', async () => {
    await expect(deleteProjectFromDB('ghost-id')).resolves.toBeUndefined();
  });
});
