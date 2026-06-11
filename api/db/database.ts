import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, '../../storage/db');
const DB_PATH = path.join(DB_DIR, 'app.db');

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables(db);

  return db;
}

function createTables(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('video', 'image', 'audio')),
      size INTEGER NOT NULL,
      duration REAL,
      width INTEGER,
      height INTEGER,
      fps REAL,
      format TEXT NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      status TEXT NOT NULL DEFAULT 'processing',
      ai_analysis TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
    CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
    CREATE INDEX IF NOT EXISTS idx_materials_created_at ON materials(created_at);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS render_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paused', 'completed', 'failed', 'cancelled')),
      progress REAL NOT NULL DEFAULT 0,
      stage TEXT,
      timeline TEXT NOT NULL,
      output_settings TEXT NOT NULL,
      output_path TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_render_tasks_status ON render_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_render_tasks_created_at ON render_tasks(created_at);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      total_size INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      uploaded_chunks INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
  `);
}

export function getDb(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export default db;
