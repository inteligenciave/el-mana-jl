/* Permisos del módulo de Ventas. Niveles: 0 sin acceso · 1 ver · 2 registrar · 3 aprobar.
   Misma matriz que el resto del sistema (docs ajustes/matriz); si la matriz guardada no trae estas pantallas, valen estos valores por defecto.
   Se inlinea también en la página (build.js quita `export`). */
export const PERM_VENTAS = {
  'v-pedido': 'ventas:2 adm:2 cobranza:1',
  'v-cobro': 'adm:2 cobranza:2',
  'v-pagos': 'adm:2 cobranza:2 ventas:1',
  'v-deuda': 'adm:1 cobranza:1 ventas:1',
  'v-reportes': 'adm:1 cobranza:1',
  'v-clientes': 'ventas:2 adm:2 cobranza:1',
  'v-importar': 'adm:2'
};
export const MODS_ADM = ['adm', 'custodio', 'ventas', 'cobranza', 'rrhh']; // roles con el módulo Administración por defecto
export const ROL_TXT = {dueno: 'Dueño', adm: 'Administración y compras', custodio: 'Custodio de caja chica', recep: 'Recepción', jefeprod: 'Jefe de producción', empaque: 'Empaque y despacho', produccion: 'Producción', ventas: 'Ventas (vendedor)', cobranza: 'Cobranza', rrhh: 'Nómina y RRHH'};

/* Inventario a mano (entradas, peso/unidades por bulto, correcciones, crear o editar productos): solo Gerencia, Jefe de producción y Producción.
   Ventas y Administración NO: las existencias solo bajan al vender (pedidos). El servidor lo comprueba con el rol. */
export const ROLES_INVENTARIO = ['dueno', 'jefeprod', 'produccion'];
export const puedeInventario = rol => ROLES_INVENTARIO.includes(rol);
export const puedePesoBulto = puedeInventario;
export const MSG_SIN_INVENTARIO = 'Tu puesto no puede cambiar el inventario; solo se descuenta al vender.';

/* Qué exige cada acción: [pantalla, nivel] */
export const ACCIONES = {
  ver: ['v-pedido', 1], verPagos: ['v-pagos', 1], verDeuda: ['v-deuda', 1], verClientes: ['v-clientes', 1], verReportes: ['v-reportes', 1],
  vender: ['v-pedido', 2], cobrar: ['v-cobro', 2], editarCliente: ['v-clientes', 2], entradaStock: ['v-clientes', 2], importar: ['v-importar', 2],
  anularPago: ['v-pagos', 3], condiciones: ['v-clientes', 3], catalogo: ['v-clientes', 3], config: ['v-clientes', 3], ejemplo: ['v-clientes', 3]
};
const parse = s => Object.fromEntries(String(s).split(' ').filter(Boolean).map(x => { const [r, l] = x.split(':'); return [r, +l]; }));

export function nivel(rol, pantalla, matriz) {
  if (rol === 'dueno') return 3;
  if (!ROL_TXT[rol]) return 0;
  const mods = (matriz && matriz.mods && matriz.mods[rol]) || (MODS_ADM.includes(rol) ? ['adm'] : []);
  if (!mods.includes('adm')) return 0;
  const guardado = matriz && matriz.perm && matriz.perm[pantalla];
  const tabla = guardado || parse(PERM_VENTAS[pantalla] || '');
  return tabla[rol] || 0;
}
export const puede = (rol, accion, matriz) => { const a = ACCIONES[accion]; return !!a && nivel(rol, a[0], matriz) >= a[1]; };
