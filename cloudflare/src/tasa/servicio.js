/* Tasa BCV · casos de uso: consultar una vez al día, guardar, respaldo con aviso y entregar la tasa vigente a Ventas. No conoce HTTP. */
import * as D from './dominio.js';
import * as R from './repo.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const hoyVE = (ahora = Date.now()) => new Date(ahora - 4 * 3600e3).toISOString().slice(0, 10);
const TIMEOUT_MS = 8000;

/* Consulta la fuente y guarda. Nunca lanza: si falla, deja el estado FALLO y el error (la tasa guardada sigue sirviendo). */
export async function consultar(db, {fetchFn = fetch, ahora = Date.now()} = {}) {
  const cfg = await R.leerConfig(db), hoy = hoyVE(ahora), iso = new Date(ahora).toISOString();
  try {
    if (!cfg.tasa_fuente_url) throw new Error('No hay dirección de la fuente de la tasa configurada.');
    const r = await fetchFn(cfg.tasa_fuente_url, {headers: {'user-agent': 'Mozilla/5.0 (compatible; ElManaJL-tasa)', accept: 'text/html'}, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow'});
    if (!r.ok) throw new Error('La fuente respondió con error ' + r.status + '.');
    const {valor, fecha} = D.leerTasaBCV(await r.text());
    const dia = fecha || hoy;
    if (D.esFuturo(dia, hoy)) {   // una tasa con fecha de mañana no se guarda ni se usa: sigue rigiendo la vigente hasta que llegue su día
      await R.fijarEstado(db, {ultimo_estado: 'OK', ultimo_intento: iso, ultimo_dia: hoy, ultimo_error: ''});
      return {ok: false, error: 'La tasa publicada trae fecha futura (' + dia + '): no se guardó; sigue la vigente.'};
    }
    await R.guardarTasa(db, {fecha: dia, valor, fuente: new URL(cfg.tasa_fuente_url).host, obtenida_en: iso, origen: 'AUTO'});
    await R.fijarEstado(db, {ultimo_estado: 'OK', ultimo_intento: iso, ultimo_dia: hoy, ultimo_error: ''});
    return {ok: true, fecha: dia, valor};
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 200);
    console.error('Tasa BCV: falló la consulta · ' + msg);
    try { await R.fijarEstado(db, {ultimo_estado: 'FALLO', ultimo_intento: iso, ultimo_dia: hoy, ultimo_error: msg}); } catch (e2) { console.error(e2); }
    return {ok: false, error: msg};
  }
}
/* Mantiene la tasa al día sola: vuelve a consultar al BCV si la última consulta tiene más de REFRESCO_MIN minutos (o nunca hubo).
   Respaldo de la tarea programada; sirve también en local, donde no corre el cron. Así una tasa publicada más tarde se recoge sin que nadie haga nada. */
const REFRESCO_MIN = 30;
export async function asegurarDelDia(db, opts = {}) {
  const cfg = await R.leerConfig(db), ahora = opts.ahora == null ? Date.now() : opts.ahora;
  const ultimo = Date.parse(cfg.tasa_ultimo_intento || '');
  if (Number.isFinite(ultimo) && ahora - ultimo < REFRESCO_MIN * 60e3) return null;
  return consultar(db, opts);
}

/* Tasa vigente para una fecha, con estado para mostrar. null si no hay ninguna guardada hasta esa fecha. */
export async function vigente(db, fecha) {
  const f = fecha || hoyVE(); if (!D.fechaValida(f)) throw err(400, 'Fecha no válida.');
  const [fila, cfg] = await Promise.all([R.filaVigente(db, f), R.leerConfig(db)]);
  return D.armarEstado(fila, hoyVE(), cfg.tasa_ultimo_estado, cfg.tasa_ultimo_error);
}
/* La que usa Ventas para cobrar: lanza un mensaje claro si no hay tasa. */
export async function tasaPara(db, fecha) {
  if (fecha && D.esFuturo(fecha, hoyVE())) throw err(400, 'No se puede usar una tasa de una fecha futura (' + fecha + ').');
  if (!fecha || fecha === hoyVE()) await asegurarDelDia(db);
  const t = await vigente(db, fecha);
  if (!t) throw err(409, 'No hay tasa BCV guardada para el ' + (fecha || hoyVE()) + '. Pide al Gerente o a Administración que consulten la tasa antes de cobrar.', {codigo: 'SIN_TASA'});
  return t;
}
export async function estado(db) {
  const cfg = await R.leerConfig(db), hoy = hoyVE();
  return {hoy, ultimo_estado: cfg.tasa_ultimo_estado || null, ultimo_intento: cfg.tasa_ultimo_intento || null, ultimo_error: cfg.tasa_ultimo_error || null};
}

/* SOLO DESARROLLO LOCAL: carga una tasa de prueba (origen DEV). La ruta lo bloquea fuera de localhost. */
export async function cargarTasaDev(db, {fecha, valor}) {
  const v = Number(valor); if (D.fechaValida(fecha) && D.esFuturo(fecha, hoyVE())) throw err(400, 'No se aceptan tasas con fecha futura.'); if (!D.fechaValida(fecha) || !(v > 0)) throw err(400, 'Indica una fecha válida y un valor mayor que cero.');
  await R.guardarTasa(db, {fecha, valor: v, fuente: 'DESARROLLO LOCAL (no es una tasa real)', obtenida_en: new Date().toISOString(), origen: 'DEV'});
  return {ok: true, fecha, valor: v};
}
