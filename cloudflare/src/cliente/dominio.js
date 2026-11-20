/* Dominio puro del portal del cliente: códigos, límites y validaciones. Sin base de datos ni HTTP. */
import * as D from '../ventas/dominio.js';

export const MAX_INTENTOS = 10;               // códigos inválidos permitidos por IP en cada ventana
export const VENTANA_MS = 15 * 60e3;          // 15 minutos
export const MAX_LINEAS = 60, MAX_CANT = 100000;
export const MAX_PEDIDOS_ABIERTOS = 10, MAX_PAGOS_ABIERTOS = 10;   // topes técnicos contra abuso (no son reglas del negocio)
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const ESTADOS_PEDIDO = {POR_CONFIRMAR: 'Por confirmar', APROBANDO: 'Por confirmar', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado', CANCELADO: 'Cancelado'};
export const ESTADOS_PAGO = {POR_VERIFICAR: 'Por verificar', VERIFICANDO: 'Por verificar', CONFIRMADO: 'Confirmado', RECHAZADO: 'Rechazado'};

const pad = (n, w = 5) => String(n).padStart(w, '0');
export const codigoPedido = id => 'PP-' + pad(id);
export const codigoReporte = id => 'PR-' + pad(id);
export const recibo = id => 'RC-' + pad(id);

/* Código personal: 32 bytes al azar en base64url (43 caracteres, 256 bits). En la base solo se guarda su SHA-256. */
export function nuevoCodigo() {
  const u = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const rutaEnlace = codigo => '/cliente.html#t=' + codigo;
export async function huella(codigo) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(codigo)));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const ventanaDe = (ahora = Date.now()) => Math.floor(ahora / VENTANA_MS);

/* Líneas de un pedido del portal: {id_producto, cantidad} enteros, sin repetir */
export function validarLineasPortal(lineas) {
  if (!Array.isArray(lineas) || !lineas.length) return 'Elige al menos un producto.';
  if (lineas.length > MAX_LINEAS) return 'El pedido tiene demasiados productos distintos.';
  const ls = lineas.map(l => ({id_producto: Number(l && l.id_producto), cantidad: Number(l && l.cantidad)}));
  if (ls.some(l => !Number.isInteger(l.cantidad) || l.cantidad > MAX_CANT)) return 'Las cantidades deben ser números enteros mayores que cero.';
  return D.validarPedido(ls);
}

/* Datos de un pago reportado. Devuelve {error} o {ok: {...}} ya normalizado */
export function validarPagoReportado(b, hoy) {
  const banco = String((b && b.banco) || '').trim().slice(0, 40), referencia = String((b && b.referencia) || '').trim().slice(0, 40);
  const nota = String((b && b.nota) || '').trim().slice(0, 200), fecha = String((b && b.fecha_pago) || hoy), monto = Number(b && b.monto_bs);
  if (!D.normBanco(banco)) return {error: 'Escribe el banco.'};
  if (!D.normRef(referencia)) return {error: 'Escribe el número de referencia.'};
  if (!(monto > 0) || monto > 1e12) return {error: 'Escribe el monto en bolívares.'};
  if (Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6) return {error: 'El monto puede tener máximo dos decimales.'};
  if (!D.fechaValida(fecha)) return {error: 'La fecha del pago no es válida.'};
  if (fecha > hoy) return {error: 'La fecha del pago no puede ser futura.'};
  return {ok: {banco, referencia, nota, fecha_pago: fecha, monto_bs_cents: D.aCents(monto)}};
}

/* ---------- Ganchos (aún no se construyen) ---------- */
/* Kilos por bulto, bultos y prioridad por kilos: cuando existan, se agregan aquí los datos extra de cada producto del catálogo. */
export const extraProducto = (_producto) => ({});
/* Zonas: cuando existan, devuelve un texto si el cliente no puede pedir ahora (por ejemplo, ruta cerrada). Hoy nunca restringe. */
export const restriccionZona = (_cliente) => null;
