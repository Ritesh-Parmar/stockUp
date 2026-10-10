import { DatabaseSync } from 'node:sqlite';
import { DB_FILE, ensureDirs } from './paths.js';

/**
 * One SQLite connection, shared by every module that stores something.
 *
 * Two DatabaseSync handles on the same file fight over locks, so the activity
 * log, accounts and billing all go through here.
 */
let db = null;

export const openDb = () => {
  if (db) return db;
  ensureDirs();
  db = new DatabaseSync(DB_FILE);
  // WAL lets reads continue while a write is in flight — worth having now that
  // more than one feature writes to this file.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
};
