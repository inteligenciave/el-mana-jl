/* D1 de mentira sobre node:sqlite (solo para pruebas locales): mismas llamadas que usa el Worker. batch() = una transacción (todo o nada). */
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function crearDB() {
  const raw = new DatabaseSync(':memory:');
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
  for (const f of readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) raw.exec(readFileSync(path.join(dir, f), 'utf8'));
  const mk = (sql, a = []) => ({
    bind: (...b) => mk(sql, b),
    first: async () => { const r = raw.prepare(sql).get(...a); return r ? {...r} : null; },
    all: async () => ({results: raw.prepare(sql).all(...a).map(x => ({...x}))}),
    run: async () => { const r = raw.prepare(sql).run(...a); return {meta: {changes: Number(r.changes)}}; },
    _run: () => { const r = raw.prepare(sql).run(...a); return {meta: {changes: Number(r.changes)}, results: []}; },
    _sql: sql, _a: a
  });
  return {
    prepare: sql => mk(sql),
    batch: async stmts => {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(/^\s*SELECT|RETURNING/i.test(s._sql) ? {results: raw.prepare(s._sql).all(...s._a)} : s._run());
        raw.exec('COMMIT'); return out;
      } catch (e) { try { raw.exec('ROLLBACK'); } catch (x) { /* ya cerrada */ } throw e; }
    },
    raw
  };
}
