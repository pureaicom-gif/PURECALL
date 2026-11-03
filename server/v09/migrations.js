// Versioned, idempotent migrations for PURE 0.9+. Each step runs once inside a transaction.
export const MIGRATIONS=[
 {version:1,name:'v0.9 push, e2e keys, stories',sql:`
  CREATE TABLE IF NOT EXISTS push_subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('web','fcm')),endpoint TEXT NOT NULL UNIQUE,keys TEXT,created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions(user_id);
  CREATE TABLE IF NOT EXISTS e2e_keys(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,jwk TEXT NOT NULL,fingerprint TEXT NOT NULL,updated INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS stories(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('text','image','video')),text TEXT NOT NULL DEFAULT '',bg TEXT NOT NULL DEFAULT '#000000',path TEXT,mime TEXT,size INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,expires INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS stories_owner ON stories(owner,expires);
  CREATE TABLE IF NOT EXISTS story_views(story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,viewer TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,viewed INTEGER NOT NULL,PRIMARY KEY(story_id,viewer));`},
 {version:2,name:'encrypted message flag',up:db=>{const cols=db.prepare('PRAGMA table_info(messages)').all().map(c=>c.name);if(!cols.includes('encrypted'))db.exec('ALTER TABLE messages ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0');}},
];
export function migrate(db){
 db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied INTEGER NOT NULL)');
 const done=new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r=>r.version));
 const applied=[];
 for(const m of MIGRATIONS){if(done.has(m.version))continue;db.exec('BEGIN');try{if(m.sql)db.exec(m.sql);if(m.up)m.up(db);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(m.version,m.name,Date.now());db.exec('COMMIT');applied.push(m.version);}catch(e){db.exec('ROLLBACK');throw e;}}
 return applied;
}
