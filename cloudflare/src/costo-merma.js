/* Costo de una merma, calculado en el servidor para Producción y Logística (esos puestos no ven precios ni costos).
   Misma regla que el navegador de Gerencia: salsa = costo fijo por kg; materia prima = costo de la compra / kg recibidos;
   producto con lote a granel = costo del lote / kg a granel. */
const MR_RAW = ['recepcion', 'almmp', 'pelado', 'corte', 'freido'];
const doc = async (db, col, id) => { const r = await db.prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2').bind(col, id).first(); return r ? JSON.parse(r.data) : null; };
const total = c => c && c.pu != null ? c.pu * (c.qf || 0) : null;
export async function costoMerma(db, d) {
  const kg = +d.kg > 0 ? +d.kg : (d.un === 'und' ? 0 : +d.cant || 0);
  if (!(kg > 0)) return 0;
  const pol = (await doc(db, 'ajustes', 'politicas')) || {};
  const et = d.etapa;
  let cost = 0;
  if (et === 'salsa_mezcla' || et === 'salsa_env') cost = +pol.mrCostoSalsa || 1.2;
  else {
    const l = d.lote ? await doc(db, 'lotes', d.lote) : null;
    let c = null;
    if (l && l.compra) c = await doc(db, 'compras', l.compra);
    else if (d.rec) { const r = await db.prepare("SELECT data FROM docs WHERE col = 'compras'").all(); c = r.results.map(x => JSON.parse(x.data)).find(x => x.rec === d.rec) || null; }
    const raw = c && c.kgRec && c.pu != null ? total(c) / c.kgRec : 0;
    if (MR_RAW.includes(et)) cost = raw;
    else if (l && l.granel && c && c.kgRec && total(c)) cost = total(c) * (l.cruda / c.kgRec) / l.granel;
    else cost = raw;
  }
  return Math.round(kg * cost * 100) / 100;
}

/* Costo por kg de la papa que tomó un turno: promedio ponderado del precio de las compras de las recepciones tomadas (pu × qf ÷ kgRec). null = sin precio. Solo se usa en el servidor. */
export async function costoKgPapaTurno(db, idTurno) {
  const tom = (await db.prepare('SELECT id_recepcion, SUM(kilos) AS kg FROM turno_recepciones WHERE id_turno = ?1 GROUP BY id_recepcion').bind(idTurno).all()).results;
  if (!tom.length) return null;
  const compras = (await db.prepare("SELECT data FROM docs WHERE col = 'compras'").all()).results.map(x => { try { return JSON.parse(x.data); } catch (e) { return null; } }).filter(Boolean);
  let kg = 0, usd = 0;
  for (const r of tom) { const c = compras.find(x => x.rec === r.id_recepcion); if (c && c.kgRec && c.pu != null && total(c)) { kg += r.kg; usd += r.kg * total(c) / c.kgRec; } }
  return kg > 0 ? usd / kg : null;
}
