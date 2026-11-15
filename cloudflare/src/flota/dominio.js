/* Flota · reglas puras (sin base de datos ni HTTP). */
import {FLOTA_GESTIONA} from '../acceso.js';
import {diasEntre} from '../ventas/dominio.js';

export const puedeGestionar = rol => FLOTA_GESTIONA.includes(rol);
export const MSG_SIN_PERMISO = 'Solo el Dueño y Administración agregan o editan vehículos.';
export const TIPOS = {CAMION: 'Camión', FURGONETA: 'Furgoneta', MONTACARGAS: 'Montacargas', OTRO: 'Otro'};
export const ESTADOS = {ACTIVO: 'Activo', EN_TALLER: 'En taller', FUERA_SERVICIO: 'Fuera de servicio'};
export const AVISO_DIAS = 30;

/* Persona de nómina que puede manejar: activa y con cargo de chofer o conductor, o marcada como chofer en su ficha */
export const esChofer = e => !!e && !e.arch && e.estado !== 'retirado' && (e.es_chofer === true || e.es_chofer === 1 || /\b(chofer|choferes|conductor|conductores)\b/i.test(String(e.cargo || '')));

const t = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
const fechaOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const num = v => v === '' || v == null ? null : Number(String(v).trim().replace(',', '.'));

/* Datos de un vehículo como llegan de la pantalla. Devuelve {vehiculo} o {error} */
export function validarVehiculo(b) {
  const x = b || {}, placa = t(x.placa, 12).toUpperCase().replace(/\s/g, '');
  if (!placa) return {error: 'Escribe la placa.'};
  if (!/^[A-Z0-9-]{3,12}$/.test(placa)) return {error: 'La placa solo puede llevar letras, números y guiones.'};
  const tipo = String(x.tipo || '').toUpperCase(); if (!TIPOS[tipo]) return {error: 'Elige el tipo de vehículo.'};
  const estado = x.estado ? String(x.estado).toUpperCase() : 'ACTIVO'; if (!ESTADOS[estado]) return {error: 'Elige el estado del vehículo.'};
  if (String(x.marca_modelo || '').trim().length > 60) return {error: 'La marca y modelo es muy largo: usa 60 letras o menos.'};
  const cb = num(x.capacidad_bultos), ck = num(x.capacidad_kg);
  if (cb != null && (!Number.isInteger(cb) || cb <= 0 || cb > 9999999)) return {error: 'La capacidad en bultos debe ser un número entero mayor que cero.'};
  if (ck != null && (!Number.isFinite(ck) || ck <= 0 || ck > 10000000)) return {error: 'La capacidad en kilos debe ser un número mayor que cero.'};
  const sv = t(x.seguro_vence, 10), dv = t(x.documentos_vence, 10);
  if (sv && !fechaOk(sv)) return {error: 'La fecha de vencimiento del seguro no es válida.'};
  if (dv && !fechaOk(dv)) return {error: 'La fecha de vencimiento de los documentos no es válida.'};
  const chofer_id = t(x.chofer_id, 40) || null;
  return {vehiculo: {placa, tipo, estado, marca_modelo: t(x.marca_modelo, 60) || null, capacidad_bultos: cb, capacidad_kg: ck == null ? null : Math.round(ck * 1000) / 1000, seguro_vence: sv || null, documentos_vence: dv || null, chofer_id}};
}

/* Avisos de vencimiento: «venció» o «vence en N días» (hasta AVISO_DIAS). Devuelve [] si todo está al día. */
export function avisosVencimiento(v, hoy) {
  const out = [];
  for (const [campo, txt] of [['seguro_vence', 'El seguro'], ['documentos_vence', 'Los documentos']]) {
    if (!v[campo]) continue;
    const d = diasEntre(hoy, v[campo]);
    if (d < 0) out.push({campo, dias: d, nivel: 'vencido', texto: txt + (txt === 'El seguro' ? ' venció' : ' vencieron') + ' hace ' + (-d) + (d === -1 ? ' día.' : ' días.')});
    else if (d <= AVISO_DIAS) out.push({campo, dias: d, nivel: 'pronto', texto: txt + (txt === 'El seguro' ? (d === 0 ? ' vence hoy.' : d === 1 ? ' vence mañana.' : ' vence en ' + d + ' días.') : (d === 0 ? ' vencen hoy.' : d === 1 ? ' vencen mañana.' : ' vencen en ' + d + ' días.'))});
  }
  return out;
}
/* Aviso (no bloqueo) si la salida supera la capacidad del vehículo */
export function avisoCapacidad(v, kilos, bultos) {
  const out = [];
  if (v.capacidad_kg && kilos > v.capacidad_kg) out.push('La salida pesa ' + Math.round(kilos * 100) / 100 + ' kg y el vehículo carga ' + v.capacidad_kg + ' kg.');
  if (v.capacidad_bultos && bultos > v.capacidad_bultos) out.push('La salida lleva ' + bultos + ' bultos y el vehículo carga ' + v.capacidad_bultos + '.');
  return out;
}
