/* Revisión de puestos y áreas de Personal (después de la migración 0035). Gerencia y Recursos humanos reasignan; no se adivina a nadie.
   Quedan por revisar: (1) quienes eran de «Administración y ventas» y pasaron a Administración («¿son de Ventas?») y (2) quienes eran de Producción y quedaron con el área «Sin definir» (Cocina, Fritura, Mantenimiento o Línea salsera). */
import * as D from './dominio.js';
import * as R from './repo.js';
import {err} from './turnos-servicio.js';
import {nomRol} from '../ventas/permisos.js';

const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'emp', ref, nom, accion, detalle});
const respaldo = async db => { try { return await R.all(db, 'SELECT empleado_id, motivo, revisada FROM areas_respaldo'); } catch (e) { return []; } }; /* sin la tabla (migración no aplicada) = nada que revisar */
const fila = (e, motivo) => { const pa = D.puestoAreaDe(e); return {id: e.id, nombre: e.n || e.id, cargo: e.cargo || '', puesto: pa.puesto || '', area: pa.area || '', motivo,
  pregunta: motivo === 'ventas' ? '¿Es de Ventas?' : 'Elige su área: ' + D.areasDe('Producción').join(', ') + '.'}; };

export async function revision(ctx) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  const [emps, resp] = await Promise.all([R.empleados(ctx.db), respaldo(ctx.db)]), pend = [];
  const ventas = new Set(resp.filter(r => r.motivo === 'ventas' && !r.revisada).map(r => r.empleado_id));
  for (const e of emps.filter(D.activo)) {
    const pa = D.puestoAreaDe(e);
    if (pa.puesto === 'Producción' && pa.area === D.AREA_SIN_DEFINIR) pend.push(fila(e, 'sin_area'));
    else if (ventas.has(e.id) && pa.puesto === 'Administración') pend.push(fila(e, 'ventas'));
  }
  pend.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return {total: pend.length, personas: pend, puede_reasignar: D.puedeMarcar(ctx.rol)};
}

/* accion: 'ventas' (pasa a Ventas) · 'quedarse' (se queda donde está) · 'asignar' {puesto, area} */
export async function revisar(ctx, b) {
  if (!D.puedeMarcar(ctx.rol)) throw err(403, 'Solo Gerencia y Recursos humanos reasignan el área.');
  const id = String((b && b.empleado_id) || '').trim(), e = id ? await R.empleado(ctx.db, id) : null; if (!e) throw err(404, 'Elige a la persona.');
  const accion = String((b && b.accion) || ''), nom = e.n || id, antes = D.puestoAreaDe(e); let puesto = antes.puesto, area = antes.area;
  if (accion === 'ventas') { puesto = 'Ventas'; area = 'Ventas'; }
  else if (accion === 'asignar') { puesto = D.puestoReal(b.puesto); area = String(b.area || ''); if (!puesto || !D.areasDe(puesto).includes(area)) throw err(400, D.MSG_AREA); }
  else if (accion !== 'quedarse') throw err(400, 'Elige qué hacer con esta persona.');
  else if (antes.area === D.AREA_SIN_DEFINIR) throw err(400, 'Elige el área de esta persona.');
  const ts = Date.now(), planta = D.esPlanta({puesto, area}), st = [];
  if (accion !== 'quedarse') st.push(R.stPuestoArea(ctx.db, id, puesto, area, planta ? null : '', ts));
  st.push(R.stAreaRevisada(ctx.db, id), R.stVer(ctx.db), ...audit(ctx, id, nom, accion === 'quedarse' ? 'confirmó el área de ' + nom : 'cambió el área de ' + nom, accion === 'quedarse' ? {} : {puesto: [antes.puesto || '', puesto], area: [antes.area || '', area]}));
  await R.lote(ctx.db, st);
  return revision(ctx);
}
