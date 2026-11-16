/* Flota · casos de uso. No conoce HTTP. Todos los puestos válidos ven los vehículos ACTIVOS y los choferes (para elegir al despachar);
   solo el Gerente y Administración agregan, editan o cambian el estado, y solo ellos ven los que no están activos. */
import * as F from './dominio.js';
import * as R from './repo.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'flota', ref, nom, accion, detalle});
const exigir = ctx => { if (!F.puedeGestionar(ctx.rol)) throw err(403, F.MSG_SIN_PERMISO); };
const exigirUbic = ctx => { if (!F.puedeUbicar(ctx.rol)) throw err(403, F.MSG_SIN_PERMISO_UBIC); };
/* Dónde está y qué lleva. La carga sale de la salida de despacho vinculada (si sigue vigente) o de los kilos anotados a mano; no se inventa nada. */
function ubicacionDe(v, salida) {
  const donde = F.dondeDe(v), enRuta = donde === 'RUTA';
  let carga;
  if (v.tipo === 'AUTOBUS') carga = {tipo: 'personal'};
  else if (enRuta && salida && salida.estado !== 'ANULADA') carga = {tipo: 'salida', nro: salida.nro, kilos: salida.kilos, bultos: salida.bultos};
  else if (enRuta && v.carga_kg > 0) carga = {tipo: 'manual', kilos: v.carga_kg};
  else carga = {tipo: 'ninguna'};
  return {donde, donde_txt: F.DONDE[donde], destino: enRuta ? v.destino : null, desde_ts: v.ubicacion_ts || null, por_rol: v.ubicacion_rol || null, carga};
}
const fila = (v, hoy, salida) => ({id: v.id, placa: v.placa, tipo: v.tipo, tipo_txt: F.TIPOS[v.tipo], marca_modelo: v.marca_modelo, capacidad_bultos: v.capacidad_bultos, capacidad_kg: v.capacidad_kg, capacidad_pasajeros: v.capacidad_pasajeros, estado: v.estado, estado_txt: F.ESTADOS[v.estado], seguro_vence: v.seguro_vence, documentos_vence: v.documentos_vence, chofer_id: v.chofer_id, avisos: F.avisosVencimiento(v, hoy), ...ubicacionDe(v, salida)});
const filaDe = async (db, v) => fila(v, hoyVE(), v.salida_id ? (await R.salidasPorId(db, [v.salida_id])).get(v.salida_id) : null);

export async function choferes(db) {
  return (await R.empleados(db)).filter(F.esChofer).map(e => ({id: e.id, nombre: e.n || e.id, cargo: e.cargo || ''})).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
export async function listar(ctx, todos) {
  const hoy = hoyVE(), ver = F.puedeUbicar(ctx.rol) && todos;
  const nombres = new Map((await choferes(ctx.db)).map(c => [c.id, c.nombre]));
  const vs = await R.listar(ctx.db, ver), sal = await R.salidasPorId(ctx.db, vs.filter(v => v.salida_id).map(v => v.salida_id));
  return {vehiculos: vs.map(v => ({...fila(v, hoy, sal.get(v.salida_id)), chofer_nombre: v.chofer_id ? nombres.get(v.chofer_id) || null : null})), puede_gestionar: F.puedeGestionar(ctx.rol), puede_ubicar: F.puedeUbicar(ctx.rol)};
}
async function choferValido(db, id) {
  if (!id) return;
  if (!(await choferes(db)).some(c => c.id === id)) throw err(400, 'Ese chofer ya no está activo en Personal. Elige otro.');
}
async function placaLibre(db, placa, idPropio) {
  const otro = await R.porPlaca(db, placa);
  if (otro && otro.id !== idPropio) throw err(409, 'Ya existe un vehículo con esa placa.', {codigo: 'PLACA_REPETIDA'});
}
const repetida = e => /UNIQUE/i.test(String((e && e.message) || e));
export async function crear(ctx, datos) {
  exigir(ctx);
  const v = F.validarVehiculo(datos); if (v.error) throw err(400, v.error);
  await placaLibre(ctx.db, v.vehiculo.placa); await choferValido(ctx.db, v.vehiculo.chofer_id);
  try { await R.lote(ctx.db, [R.stInsertar(ctx.db, v.vehiculo), ...audit(ctx, v.vehiculo.placa, v.vehiculo.placa, 'agregó un vehículo', v.vehiculo)]); }
  catch (e) { if (repetida(e)) throw err(409, 'Ya existe un vehículo con esa placa.', {codigo: 'PLACA_REPETIDA'}); throw e; }
  return filaDe(ctx.db, await R.porPlaca(ctx.db, v.vehiculo.placa));
}
export async function editar(ctx, id, datos) {
  exigir(ctx);
  const prev = await R.get(ctx.db, id); if (!prev) throw err(404, 'Vehículo no encontrado.');
  const v = F.validarVehiculo({...prev, ...datos}); if (v.error) throw err(400, v.error);
  await placaLibre(ctx.db, v.vehiculo.placa, id); if (v.vehiculo.chofer_id !== prev.chofer_id) await choferValido(ctx.db, v.vehiculo.chofer_id);
  const reinicia = v.vehiculo.estado !== prev.estado ? [R.stUbicacion(ctx.db, id, {estado: v.vehiculo.estado, ubicacion: 'PLANTA', destino: null, carga_kg: null, salida_id: null, rol: ctx.rol})] : [];
  try { await R.lote(ctx.db, [R.stActualizar(ctx.db, id, v.vehiculo), ...reinicia, ...audit(ctx, id, v.vehiculo.placa, 'editó un vehículo', {antes: prev, despues: v.vehiculo})]); }
  catch (e) { if (repetida(e)) throw err(409, 'Ya existe un vehículo con esa placa.', {codigo: 'PLACA_REPETIDA'}); throw e; }
  return filaDe(ctx.db, await R.get(ctx.db, id));
}
export async function cambiarEstado(ctx, id, estado) {
  exigir(ctx);
  if (!F.ESTADOS[estado]) throw err(400, 'Elige el estado del vehículo.');
  const prev = await R.get(ctx.db, id); if (!prev) throw err(404, 'Vehículo no encontrado.');
  await R.lote(ctx.db, [R.stUbicacion(ctx.db, id, {estado, ubicacion: 'PLANTA', destino: null, carga_kg: null, salida_id: null, rol: ctx.rol}), ...audit(ctx, id, prev.placa, 'cambió el estado de un vehículo', {antes: prev.estado, despues: estado})]);
  return filaDe(ctx.db, await R.get(ctx.db, id));
}
/* Anota dónde está el vehículo: En la planta, En ruta (con destino y, si hay, carga), En taller o Fuera de servicio. Sin GPS: lo escribe una persona. */
export async function cambiarUbicacion(ctx, id, datos) {
  exigirUbic(ctx);
  const prev = await R.get(ctx.db, id); if (!prev) throw err(404, 'Vehículo no encontrado.');
  const r = F.validarUbicacion(datos, prev.tipo); if (r.error) throw err(400, r.error);
  const u = r.u, estado = u.donde === 'TALLER' ? 'EN_TALLER' : u.donde === 'FUERA_SERVICIO' ? 'FUERA_SERVICIO' : 'ACTIVO';
  let salida = null;
  if (u.donde === 'RUTA' && prev.tipo !== 'AUTOBUS') { const s = await R.salidaReciente(ctx.db, id); if (s) salida = s.id_salida; }
  const antes = {donde: F.dondeDe(prev), destino: prev.destino, carga_kg: prev.carga_kg, salida_id: prev.salida_id};
  const despues = {donde: u.donde, destino: u.destino, carga_kg: u.carga_kg, salida_id: salida};
  await R.lote(ctx.db, [R.stUbicacion(ctx.db, id, {estado, ubicacion: u.donde === 'RUTA' ? 'RUTA' : 'PLANTA', destino: u.destino, carga_kg: u.carga_kg, salida_id: salida, rol: ctx.rol}),
    ...audit(ctx, id, prev.placa, 'cambió la ubicación de un vehículo', {antes, despues})]);
  return filaDe(ctx.db, await R.get(ctx.db, id));
}
/* Para despachar: devuelve el vehículo y el chofer elegidos con sus textos de respaldo y los avisos (capacidad y vencimientos). No bloquea por avisos. */
export async function elegirParaSalida(db, {vehiculo_id, chofer_id}, {kilos, bultos}) {
  const out = {vehiculo_id: null, chofer_id: null, vehiculo_txt: null, chofer_txt: null, avisos: []};
  if (vehiculo_id != null && vehiculo_id !== '') {
    const v = await R.get(db, +vehiculo_id); if (!v) throw err(400, 'El vehículo elegido ya no existe.');
    if (v.estado !== 'ACTIVO') throw err(409, 'El vehículo ' + v.placa + ' está ' + F.ESTADOS[v.estado].toLowerCase() + ': elige otro.');
    out.vehiculo_id = v.id; out.vehiculo_txt = [v.placa, F.TIPOS[v.tipo], v.marca_modelo].filter(Boolean).join(' · ');
    out.avisos.push(...F.avisoCapacidad(v, kilos, bultos), ...F.avisosVencimiento(v, hoyVE()).map(a => 'Vehículo ' + v.placa + ': ' + a.texto));
  }
  if (chofer_id != null && chofer_id !== '') {
    const c = (await choferes(db)).find(x => x.id === String(chofer_id)); if (!c) throw err(400, 'El chofer elegido ya no está activo en Personal.');
    out.chofer_id = c.id; out.chofer_txt = c.nombre;
  }
  return out;
}
