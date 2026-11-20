/* Inventario general · casos de uso. Cada compra verificada suma, cada consumo de planta y cada merma resta.
   Los movimientos se devuelven como sentencias para viajar en el MISMO lote que la operación que los causa (todo o nada).
   Antes del conteo inicial se anotan igual, pero no cuentan en el saldo (el conteo físico manda). No conoce HTTP. */
import * as D from './dominio.js';
import * as R from './repo.js';
import * as VS from '../ventas/servicio.js';
import {nomRol} from '../ventas/permisos.js';

export const err = VS.err;
export const codigoBolsa = D.codigoBolsa, esBolsa = D.esBolsa;
const auditar = (ctx, ref, nom, accion, detalle) => VS.audit(ctx, 'inventario', ref, nom, accion, detalle);
const exigir = (ok, msg) => { if (!ok) throw err(403, msg); };
const refNuevo = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* Sentencias para sumar una compra recibida. lineas = [{articulo:{codigo,nombre,unidad}, cantidad, ref?}] */
export function sentenciasEntradaCompra(ctx, {ref, lineas, id_turno}) {
  const out = [];
  for (const l of lineas) {
    if (!(l.cantidad > 0)) continue;
    out.push(R.stArticulo(ctx.db, l.articulo), R.stMov(ctx.db, {articulo: l.articulo.codigo, tipo: 'ENTRADA', cantidad: l.cantidad, origen: 'compra', ref: l.ref || ref, id_turno: id_turno ?? null, nota: 'Compra ' + ref, rol: ctx.rol}));
  }
  return out;
}
/* Sentencias para restar un consumo o una merma ya validados. origen: 'consumo' | 'merma'. Si el artículo no existe se rechaza. */
async function sentenciasSalida(ctx, {articulo, cantidad, origen, ref, id_turno = null, nota = ''}) {
  const a = await R.articulo(ctx.db, articulo);
  if (!a || !a.activo) throw err(400, 'Ese artículo no está en el inventario general.');
  return {articulo: a, st: [R.stMov(ctx.db, {articulo: a.codigo, tipo: 'SALIDA', cantidad, origen, ref, id_turno, nota, rol: ctx.rol})]};
}

/* Consumo registrado en planta (aceite, agua, sal, químicos, empaque...). Resta del inventario general. */
export async function registrarConsumo(ctx, b, {id_turno = null} = {}) {
  exigir(D.ROLES_CONSUMO.includes(ctx.rol), D.MSG_SIN_CONSUMO);
  const v = D.validarSalida(b); if (v.error) throw err(400, v.error);
  const s = await sentenciasSalida(ctx, {...v.datos, origen: 'consumo', ref: refNuevo('CO'), id_turno});
  await VS.enLote(ctx.db, [...s.st, ...auditar(ctx, 'consumo', s.articulo.nombre, 'anotó un consumo de planta', {articulo: s.articulo.nombre, cantidad: v.datos.cantidad, unidad: s.articulo.unidad, id_turno})]);
  return resumen(ctx.db);
}
/* Merma de un artículo del inventario (se pierde en almacén o planta): con motivo escrito. Resta del inventario general. */
export async function registrarMerma(ctx, b, {id_turno = null} = {}) {
  exigir(D.ROLES_CONSUMO.includes(ctx.rol), D.MSG_SIN_CONSUMO);
  const v = D.validarSalida(b, {pideMotivo: true}); if (v.error) throw err(400, v.error);
  /* Fase 5 (5.3 bis): la merma de papa del proceso es UNA sola, consolidada al cierre: no se resta dos veces del inventario */
  if (v.datos.articulo === 'papa') {
    const mc = await R.one(ctx.db, "SELECT m.id FROM merma_consolidada m JOIN turnos t ON t.id_turno = m.id_turno WHERE t.estado = 'ABIERTO' LIMIT 1");
    if (mc) throw err(409, 'La merma de papa de este turno ya se anotó en la merma consolidada del proceso. No se descuenta dos veces del inventario.', {codigo: 'MERMA_YA_CONSOLIDADA'});
  }
  const s = await sentenciasSalida(ctx, {...v.datos, origen: 'merma', ref: refNuevo('ME'), id_turno});
  await VS.enLote(ctx.db, [...s.st, ...auditar(ctx, 'merma', s.articulo.nombre, 'anotó una merma de inventario', {articulo: s.articulo.nombre, cantidad: v.datos.cantidad, unidad: s.articulo.unidad, motivo: v.datos.nota})]);
  return resumen(ctx.db);
}
/* Papa tomada por el turno: una salida del inventario por la misma cantidad que se anota en el turno (la merma de proceso ya va incluida: no se resta dos veces) */
export const salidaPapaTurno = (ctx, {id_turno, id_recepcion, kilos, ref}) => R.stMov(ctx.db, {articulo: 'papa', tipo: 'SALIDA', cantidad: kilos, origen: 'consumo', ref, id_turno, nota: 'Papa tomada de ' + id_recepcion, rol: ctx.rol});

/* Bolsones de un turno (los pone Producción al producir granel) y bolsas de presentación (las pone Logística al empacar): una salida «consumo» con referencia propia */
export const salidaArticulo = (ctx, {articulo, cantidad, ref, id_turno = null, nota}) => R.stMov(ctx.db, {articulo, tipo: 'SALIDA', cantidad, origen: 'consumo', ref, id_turno, nota, rol: ctx.rol});
/* «Repartir bolsas sin presentación» (Gerencia y Administración): pasa existencia del artículo «empaque» (bolsas sin presentación) a las bolsas de cada presentación.
   reparto = [{articulo: 'bolsa-<id>', cantidad}], con nota. No cambia el total de bolsas: sale de «sin presentación» y entra a cada presentación. */
export async function repartirBolsas(ctx, b = {}) {
  exigir(D.ROLES_CONTEO.includes(ctx.rol), 'Solo Gerencia y Administración reparten las bolsas sin presentación.');
  const nota = String((b && b.nota) ?? '').trim().slice(0, 200); if (nota.length < 3) throw err(400, 'Escribe una nota: por qué o de dónde vienen estas bolsas.');
  const filas = Array.isArray(b.reparto) ? b.reparto.filter(x => x && x.cantidad !== '' && x.cantidad != null && Number(String(x.cantidad).replace(',', '.')) !== 0) : [];
  if (!filas.length) throw err(400, 'Escribe cuántas bolsas van a cada presentación.');
  const vistos = new Set(), mov = []; let total = 0; const ts = Date.now(), ref = refNuevo('REP');
  for (const x of filas) {
    const cod = String(x.articulo || '').trim(), c = Number(String(x.cantidad).replace(',', '.'));
    if (!D.esBolsa(cod)) throw err(400, 'Solo se reparten bolsas hacia una presentación.');
    if (vistos.has(cod)) throw err(400, 'Una presentación está repetida en el reparto.'); vistos.add(cod);
    if (!(c > 0) || !Number.isInteger(c) || c > 1e7) throw err(400, 'Las bolsas a repartir deben ser un número entero mayor que cero.');
    const a = await R.articulo(ctx.db, cod); if (!a || !a.activo) throw err(404, 'Una de las presentaciones no existe o está archivada.');
    total += c; mov.push({a, c});
  }
  const sin = (await resumen(ctx.db)).articulos.find(a => a.codigo === 'empaque');
  if (!(sin && sin.saldo >= total - 1e-9)) throw err(409, `Solo hay ${sin ? sin.saldo : 0} bolsas sin presentación y quieres repartir ${total}.`, {codigo: 'MAS_DE_LAS_BOLSAS', disponibles: sin ? sin.saldo : 0});
  await VS.enLote(ctx.db, [R.stMov(ctx.db, {articulo: 'empaque', tipo: 'SALIDA', cantidad: total, origen: 'reparto', ref, nota, rol: ctx.rol}, ts), ...mov.map(m => R.stMov(ctx.db, {articulo: m.a.codigo, tipo: 'ENTRADA', cantidad: m.c, origen: 'reparto', ref, nota, rol: ctx.rol}, ts)),
    ...auditar(ctx, 'inventario', 'Bolsas sin presentación', 'repartió bolsas sin presentación entre presentaciones', {total, nota, reparto: Object.fromEntries(mov.map(m => [m.a.nombre, m.c]))})]);
  return ver(ctx);
}
/* Kilos de papa que caben en un bolsón (Gerencia y Administración); 0 = sin cargar */
export async function kgPorBolson(db) { const r = await R.one(db, "SELECT valor FROM config WHERE clave = 'kg_por_bolson'"); return r ? (+r.valor || 0) : 0; }
export async function fijarKgPorBolson(ctx, b) {
  exigir(D.ROLES_CONTEO.includes(ctx.rol), D.MSG_SIN_CONTEO);
  const v = Number(String((b && b.kg_por_bolson) ?? '').replace(',', '.')); if (!(v >= 0) || v > 100000) throw err(400, 'Escribe cuántos kilos caben en un bolsón (0 si no quieres descontar bolsones por kilos).');
  const prev = await kgPorBolson(ctx.db);
  await VS.enLote(ctx.db, [R.stConfigInv(ctx.db, 'kg_por_bolson', D.r3(v)), ...auditar(ctx, 'inventario', 'Kilos por bolsón', 'cambió los kilos por bolsón', {antes: prev || null, despues: D.r3(v)})]);
  return {kg_por_bolson: D.r3(v)};
}
export async function resumen(db) {
  const inicio = await R.inicioTs(db), [arts, sal] = await Promise.all([R.articulos(db), R.saldos(db, inicio || 9e15)]);
  const por = Object.fromEntries(sal.map(s => [s.articulo, s]));
  const filas = arts.map(a => { const s = por[a.codigo] || {}, saldo = D.r3(+s.saldo || 0); return {codigo: a.codigo, nombre: a.nombre, unidad: a.unidad, minimo: a.minimo, saldo, compras: D.r3(+s.compras || 0), consumos: D.r3(+s.consumos || 0), mermas: D.r3(+s.mermas || 0), estado: inicio ? D.estadoSaldo(saldo, a.minimo) : 'SIN_CONTEO', nivel: inicio ? D.nivelInsumo(saldo, a.minimo) : 'sin_conteo'}; });
  return {conteo_inicial_hecho: inicio > 0, inicio_ts: inicio || null, articulos: filas};
}
export async function ver(ctx) {
  exigir(D.ROLES_VER.includes(ctx.rol), D.MSG_SIN_VER);
  const r = await resumen(ctx.db), inicio = r.inicio_ts || 9e15;
  return {...r, kg_por_bolson: (await kgPorBolson(ctx.db)) || null, movimientos: (await R.movimientos(ctx.db, inicio, 60)).map(m => ({id: m.id, articulo: m.articulo_nombre || m.articulo, unidad: m.unidad, tipo: m.tipo, cantidad: m.cantidad, origen: m.origen, ref: m.ref, id_turno: m.id_turno, nota: m.nota, rol: nomRol(m.rol), ts: m.ts})), conteo: r.conteo_inicial_hecho ? await R.conteos(ctx.db) : []};
}
export async function consumosDeTurno(ctx, idTurno) { exigir(D.ROLES_CONSUMO.includes(ctx.rol), D.MSG_SIN_CONSUMO); return (await R.consumosDeTurno(ctx.db, idTurno)).map(m => ({id: m.id, articulo: m.articulo_nombre || m.articulo, unidad: m.unidad, cantidad: m.cantidad, nota: m.nota, ts: m.ts})); }

/* Conteo físico inicial: una sola vez. Deja el saldo exactamente en lo contado; desde ese instante cuenta todo lo que entra y sale. */
export async function conteoInicial(ctx, b) {
  exigir(D.ROLES_CONTEO.includes(ctx.rol), D.MSG_SIN_CONTEO);
  if (await R.inicioTs(ctx.db)) throw err(409, 'El conteo inicial ya se cargó. A partir de ahí el saldo cambia solo con compras, consumos y mermas.');
  const v = D.validarConteo(b); if (v.error) throw err(400, v.error);
  const arts = new Map((await R.articulos(ctx.db)).map(a => [a.codigo, a])), ts = Date.now(), st = [], resumenTxt = {};
  for (const c of v.conteos) {
    const a = arts.get(c.articulo); if (!a) throw err(404, 'Un artículo del conteo no existe en el inventario general.');
    st.push(R.stConteo(ctx.db, a.codigo, c.cantidad, ctx.rol, ts));
    if (c.cantidad > 0) st.push(R.stMov(ctx.db, {articulo: a.codigo, tipo: 'ENTRADA', cantidad: c.cantidad, origen: 'conteo_inicial', ref: 'INICIAL', nota: 'Conteo físico inicial', rol: ctx.rol}, ts));
    resumenTxt[a.nombre] = c.cantidad;
  }
  /* los artículos que no vinieron en el conteo quedan contados en 0 (el conteo es la foto completa) */
  for (const a of arts.values()) if (!v.conteos.some(c => c.articulo === a.codigo)) { st.push(R.stConteo(ctx.db, a.codigo, 0, ctx.rol, ts)); resumenTxt[a.nombre] = 0; }
  await VS.enLote(ctx.db, [...st, R.stInicio(ctx.db, ts), ...auditar(ctx, 'inventario', 'Conteo inicial', 'cargó el conteo físico inicial del inventario general', {conteo: resumenTxt})]);
  return ver(ctx);
}
/* Mínimo de aviso por artículo (Gerencia y Administración) */
export async function fijarMinimo(ctx, codigo, b) {
  exigir(D.ROLES_CONTEO.includes(ctx.rol), D.MSG_SIN_CONTEO);
  const a = await R.articulo(ctx.db, codigo); if (!a) throw err(404, 'No encontré ese artículo.');
  const m = Number(b && b.minimo); if (!(m >= 0) || m > 1e9) throw err(400, 'El mínimo debe ser 0 o más.');
  await VS.enLote(ctx.db, [R.stMinimo(ctx.db, codigo, D.r3(m)), ...auditar(ctx, 'inventario', a.nombre, 'cambió el mínimo de aviso', {antes: a.minimo, despues: D.r3(m)})]);
  return ver(ctx);
}
