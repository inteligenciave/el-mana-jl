/* Tasa BCV · único archivo que toca la base de datos de la tasa. */
/* La más reciente publicada hasta esa fecha; si no hay ninguna anterior (p. ej. la primera publicación, que rige desde el lunes), la más cercana posterior. */
export const filaVigente = async (db, fecha) =>
  (await db.prepare('SELECT fecha, valor, fuente, obtenida_en, origen FROM tasas_bcv WHERE fecha <= ?1 ORDER BY fecha DESC LIMIT 1').bind(fecha).first())
  || (await db.prepare('SELECT fecha, valor, fuente, obtenida_en, origen FROM tasas_bcv WHERE fecha > ?1 ORDER BY fecha ASC LIMIT 1').bind(fecha).first());
export const guardarTasa = (db, t) => db.prepare('INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(fecha) DO UPDATE SET valor = ?2, fuente = ?3, obtenida_en = ?4, origen = ?5').bind(t.fecha, t.valor, t.fuente, t.obtenida_en, t.origen).run();
export async function leerConfig(db) { const r = await db.prepare("SELECT clave, valor FROM config WHERE clave LIKE 'tasa_%'").all(); return Object.fromEntries(r.results.map(x => [x.clave, x.valor])); }
export const fijarEstado = (db, e) => db.batch(Object.entries(e).map(([k, v]) => db.prepare('INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor = ?2').bind('tasa_' + k, v == null ? '' : String(v))));
