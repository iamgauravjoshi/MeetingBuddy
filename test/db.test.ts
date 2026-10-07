import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'

// The schema exactly as v0.1 created it, before migrations existed (user_version 0).
const V01_SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE stakeholders (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '');
CREATE TABLE items (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', owner TEXT NOT NULL DEFAULT '', due_date TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE item_history (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  summary TEXT NOT NULL, speaker TEXT NOT NULL DEFAULT '', quote TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
CREATE TABLE meetings (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL, source_app TEXT NOT NULL DEFAULT '');
CREATE TABLE segments (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, speaker TEXT NOT NULL, t_start REAL NOT NULL, t_end REAL NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL);
CREATE INDEX segments_meeting ON segments(meeting_id, t_start);
CREATE TABLE marks (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, t REAL NOT NULL, kind TEXT NOT NULL);
CREATE TABLE reports (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, model TEXT NOT NULL, summary TEXT NOT NULL, dropped_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE proposals (id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  meeting_id TEXT NOT NULL, category TEXT NOT NULL, op TEXT NOT NULL, target_item_id TEXT,
  item_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '', speaker TEXT NOT NULL DEFAULT '', strength TEXT NOT NULL DEFAULT 'firm',
  confidence REAL NOT NULL DEFAULT 0.5, impact TEXT NOT NULL DEFAULT 'medium', rationale TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE state_versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL, created_at TEXT NOT NULL, changes TEXT NOT NULL);
`

let dir = ''
let file = ''

const raw = <T>(path: string, fn: (d: DatabaseSync) => T): T => {
  const d = new DatabaseSync(path)
  try {
    return fn(d)
  } finally {
    d.close()
  }
}
const userVersion = (d: DatabaseSync): number => (d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
const backups = (): string[] => readdirSync(dir).filter((f) => f.startsWith('meetingbuddy.db.bak')).sort()

// a v0.1 database with a project and an item in it
const legacyDb = (version = 0): void =>
  raw(file, (d) => {
    d.exec(V01_SCHEMA)
    d.exec(`INSERT INTO projects VALUES ('p1', 'Phoenix', 'Clinic app', '2026-01-01T00:00:00Z')`)
    d.exec(`INSERT INTO items (id, project_id, type, title, created_at, updated_at) VALUES ('i1', 'p1', 'decision', 'Use Postgres', 'x', 'x')`)
    d.exec(`PRAGMA user_version = ${version}`)
  })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mb-db-'))
  file = join(dir, 'meetingbuddy.db')
})
afterEach(() => {
  db.closeDb()
  rmSync(dir, { recursive: true, force: true })
})

describe('migrations', () => {
  it('brings a new database to the latest version without a backup', () => {
    db.openDb(file)
    db.closeDb()
    expect(raw(file, userVersion)).toBe(db.MIGRATIONS.length)
    expect(backups()).toEqual([])
  })

  it('upgrades a v0.1 database without losing data', () => {
    legacyDb()
    db.openDb(file)
    expect(db.listProjects().map((p) => p.name)).toEqual(['Phoenix'])
    expect(db.getItem('i1')?.title).toBe('Use Postgres')
    db.closeDb()
    raw(file, (d) => {
      expect(userVersion(d)).toBe(db.MIGRATIONS.length)
      const indexes = (d.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as { name: string }[]).map((r) => r.name)
      expect(indexes).toEqual(expect.arrayContaining(['items_project', 'meetings_project', 'proposals_report', 'item_history_item']))
    })
  })

  it('backs up the database before migrating it', () => {
    legacyDb()
    db.openDb(file)
    expect(backups()).toEqual(['meetingbuddy.db.bak-v0'])
    raw(join(dir, 'meetingbuddy.db.bak-v0'), (d) => {
      expect(userVersion(d)).toBe(0)
      expect(d.prepare('SELECT name FROM projects').all()).toEqual([{ name: 'Phoenix' }])
    })
  })

  it('keeps only the latest backup', () => {
    legacyDb(1)
    writeFileSync(join(dir, 'meetingbuddy.db.bak-v0'), 'older backup')
    db.openDb(file)
    expect(backups()).toEqual(['meetingbuddy.db.bak-v1'])
  })

  it('does not back up a database that is already up to date', () => {
    db.openDb(file)
    db.closeDb()
    db.openDb(file)
    expect(backups()).toEqual([])
  })

  it('refuses a database from a newer version of the app', () => {
    raw(file, (d) => d.exec('PRAGMA user_version = 999'))
    expect(() => db.openDb(file)).toThrow(/newer/)
  })

  it('rolls back a failing migration and keeps the previous version', () => {
    db.openDb(file)
    db.closeDb()
    db.MIGRATIONS.push(`CREATE TABLE half_done (a); INSERT INTO no_such_table VALUES (1);`)
    try {
      expect(() => db.openDb(file)).toThrow()
    } finally {
      db.MIGRATIONS.pop()
      db.closeDb()
    }
    raw(file, (d) => {
      expect(userVersion(d)).toBe(db.MIGRATIONS.length)
      expect(d.prepare(`SELECT name FROM sqlite_master WHERE name = 'half_done'`).all()).toEqual([])
    })
    expect(existsSync(file)).toBe(true)
  })
})

describe('tx', () => {
  beforeEach(() => db.openDb(':memory:'))

  it('rolls back only the inner part when a nested transaction fails', () => {
    db.tx(() => {
      db.createProject('Outer', '')
      try {
        db.tx(() => {
          db.createProject('Inner', '')
          throw new Error('inner failed')
        })
      } catch {
        // the outer transaction carries on
      }
    })
    expect(db.listProjects().map((p) => p.name)).toEqual(['Outer'])
  })

  it('rolls back everything when the outer transaction fails', () => {
    const p = db.createProject('P', '')
    const m = db.createMeeting(p.id, 'M', 'ready')
    expect(() =>
      db.tx(() => {
        // addSegments opens its own transaction, which now nests
        db.addSegments(m.id, [{ speaker: 'A', tStart: 0, tEnd: 1, text: 'hello there everyone', source: 'manual' }])
        throw new Error('outer failed')
      })
    ).toThrow('outer failed')
    expect(db.listSegments(m.id)).toEqual([])
  })

  it('can start a new transaction after one failed', () => {
    expect(() => db.tx(() => { throw new Error('x') })).toThrow()
    db.tx(() => db.createProject('After', ''))
    expect(db.listProjects().map((p) => p.name)).toEqual(['After'])
  })
})
