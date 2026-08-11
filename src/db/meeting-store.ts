import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { MeetingAnalysisFull } from '../extract/schema.js';

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'meetings.db');

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id        TEXT PRIMARY KEY,
      title     TEXT NOT NULL,
      file_name TEXT,
      mode      TEXT NOT NULL DEFAULT 'hybrid',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      id         TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      text       TEXT NOT NULL,
      duration_sec REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    );
    CREATE TABLE IF NOT EXISTS summaries (
      meeting_id TEXT PRIMARY KEY,
      status     TEXT NOT NULL DEFAULT 'pending',
      result     TEXT,
      error      TEXT,
      model_used TEXT,
      cost_usd   REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    );
  `);
}

function nowIso(): string { return new Date().toISOString(); }

export function createMeeting(id: string, fileName: string, mode: string): void {
  getDb().prepare(`INSERT OR IGNORE INTO meetings (id, title, file_name, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`) .run(id, fileName, fileName, mode, nowIso(), nowIso());
}
export function saveMeetingTitle(id: string, title: string): void {
  getDb().prepare(`UPDATE meetings SET title=?, updated_at=? WHERE id=?`).run(title, nowIso(), id);
}
export function saveTranscript(meetingId: string, text: string, durationSec: number): void {
  getDb().prepare(`INSERT OR REPLACE INTO transcripts (id, meeting_id, text, duration_sec, created_at) VALUES (?, ?, ?, ?, ?)`) .run(`${meetingId}-tr`, meetingId, text, durationSec, nowIso());
}
export function startSummary(meetingId: string): void {
  getDb().prepare(`INSERT OR REPLACE INTO summaries (meeting_id, status, created_at, updated_at) VALUES (?, 'processing', ?, ?)`) .run(meetingId, nowIso(), nowIso());
}
export function completeSummary(meetingId: string, result: MeetingAnalysisFull, modelUsed: string, costUsd: number): void {
  getDb().prepare(`UPDATE summaries SET status='completed', result=?, model_used=?, cost_usd=?, updated_at=? WHERE meeting_id=?`) .run(JSON.stringify(result), modelUsed, costUsd, nowIso(), meetingId);
}
export function failSummary(meetingId: string, error: string): void {
  getDb().prepare(`UPDATE summaries SET status='failed', error=?, updated_at=? WHERE meeting_id=?`).run(error, nowIso(), meetingId);
}
export function getMeetings(): unknown[] {
  return getDb().prepare(`SELECT m.id, m.title, m.mode, m.created_at, s.status, s.cost_usd FROM meetings m LEFT JOIN summaries s ON s.meeting_id = m.id ORDER BY m.created_at DESC`).all();
}
export function getSummary(meetingId: string): { status: string; result?: MeetingAnalysisFull; error?: string } | null {
  const row = getDb().prepare(`SELECT * FROM summaries WHERE meeting_id=?`).get(meetingId) as any;
  if (!row) return null;
  return { status: row.status, result: row.result ? JSON.parse(row.result) : undefined, error: row.error ?? undefined };
}
