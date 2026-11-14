/* Registro del módulo en la aplicación: pantallas, permisos por rol, acciones y entradas del teclado. */
Object.assign(PERM_DEF, VP.PERM_VENTAS);
Object.assign(SCREENS, {
  'v-pedido':   {mod: 'adm', g: 'Ventas y liquidación', t: 'Nueva venta', s: 'Venta', ic: 'cart', r: scrPedido},
  'v-cobro':    {mod: 'adm', g: 'Ventas y liquidación', t: 'Cobrar y liquidar', s: 'Cobrar', ic: 'coins', r: scrCobro},
  'v-pagos':    {mod: 'adm', g: 'Ventas y liquidación', t: 'Pagos recibidos', s: 'Pagos', ic: 'receipt', r: scrPagos},
  'v-deuda':    {mod: 'adm', g: 'Ventas y liquidación', t: 'Quién debe y desde cuándo', s: 'Deuda', ic: 'calendar', r: scrDeuda},
  'v-reportes': {mod: 'adm', g: 'Ventas y liquidación', t: 'Comisiones, asientos e inventario', s: 'Reportes', ic: 'chart', r: scrReportes},
  'v-clientes': {mod: 'adm', g: 'Ventas y liquidación', t: 'Clientes, catálogo y ajustes', s: 'Clientes', ic: 'users', r: scrClientes},
  'v-importar': {mod: 'adm', g: 'Ventas y liquidación', t: 'Importar del Excel', s: 'Importar', ic: 'download', r: scrImportar}
});
S.perm = permInit();
Object.assign(ROLE_HOME, {ventas: 'v-pedido', cobranza: 'v-cobro'});

/* Qué permiso exige cada acción: [pantalla, nivel] (el servidor lo vuelve a comprobar) */
const VACT_REQ = {vGenerar: ['v-pedido', 2], vCobrar: ['v-cobro', 2], vAnular: ['v-pagos', 3], vNuevoCliente: ['v-clientes', 2], vEditarCliente: ['v-clientes', 2], vClienteGuardar: ['v-clientes', 2], vReglas: ['v-clientes', 3], vReglasGuardar: ['v-clientes', 3],
  vProductoGuardar: ['v-clientes', 3], vNuevoProducto: ['v-clientes', 3], vEditarProducto: ['v-clientes', 3], vEntrada: ['v-clientes', 2], vEntradaGuardar: ['v-clientes', 2], vVendedorGuardar: ['v-clientes', 3], vNuevoVendedor: ['v-clientes', 3], vEditarVendedor: ['v-clientes', 3],
  vAjustesGuardar: ['v-clientes', 3], vPinGuardar: ['v-clientes', 3], vEjemploCargar: ['v-clientes', 3], vEjemploBorrarOk: ['v-clientes', 3], vImpEnviar: ['v-importar', 2]};
const VACT_LBL = {vGenerar: 'generar notas de entrega o facturas', vCobrar: 'registrar pagos', vAnular: 'anular pagos', vNuevoCliente: 'crear clientes', vEditarCliente: 'editar clientes', vClienteGuardar: 'guardar clientes', vReglas: 'cambiar precios por cliente', vReglasGuardar: 'guardar precios por cliente',
  vProductoGuardar: 'cambiar el catálogo', vNuevoProducto: 'crear productos', vEditarProducto: 'editar productos', vEntrada: 'registrar entradas de inventario', vEntradaGuardar: 'registrar entradas de inventario', vVendedorGuardar: 'cambiar vendedores y comisiones', vNuevoVendedor: 'crear vendedores', vEditarVendedor: 'editar vendedores',
  vAjustesGuardar: 'cambiar los ajustes de ventas', vPinGuardar: 'cambiar el PIN de gerencia', vEjemploCargar: 'cargar datos de ejemplo', vEjemploBorrarOk: 'borrar datos de ejemplo', vImpEnviar: 'importar datos'};
Object.assign(ACT_REQ, VACT_REQ); Object.assign(ACT_LBL, VACT_LBL); Object.keys(VACT_REQ).forEach(k => WRITE_ACTS.add(k)); WRITE_ACTS.add('vPesoGuardar');

const vElId = el => +el.dataset.id;
const vRecargarTodo = async () => { V.clientes = null; V.adm.clientes = null; V.deuda.data = null; V.pagos.filas = null; V.rep.data = null; await vBoot(true); };
const VACT = {
  vReintentar: () => { V.boot = null; render(); },
  vElegirCliente: el => el.dataset.pk === 'ped' ? vPedElegir(vElId(el)) : vCobElegir(vElId(el)),
  vCambiarCliente: () => { const P = vPed(); Object.assign(P, {cid: null, cli: null, precios: {}, cant: {}, q: ''}); render(); },
  vVista: el => { try { localStorage.setItem('elmana:vista', el.dataset.v); } catch (e) { /* sin almacenamiento */ } vPed().pag = 0; render(); },
  vCond: el => { vPed().cond = el.dataset.v; vPedRefrescar(); const g = $('#v-grid-w'); if (g) g.innerHTML = vPedGrid(); },
  vCat: el => { vPed().cat = el.dataset.v; vPed().pag = 0; render(); },
  vPag: el => { if (el.getAttribute('aria-disabled')) return; vPed().pag += +el.dataset.d; const g = $('#v-grid-w'); if (g) g.innerHTML = vPedGrid(); },
  vQty: el => { const id = vElId(el); vPedPonerCantidad(id, (vPed().cant[id] || 0) + (+el.dataset.d), +el.dataset.d); },
  vGenerar: el => vPedGenerar(el.dataset.t),
  vIrPedido: () => { const e = $('#vp3'); e && e.scrollIntoView({behavior: 'smooth', block: 'start'}); },
  vVerDoc: el => vDocModal(vElId(el)), vVerPago: el => vReciboModal(vElId(el)),
  vNuevoCliente: () => vClienteModal(null),
  vEditarCliente: el => { const c = (V.adm.clientes || []).find(x => x.id_cliente === vElId(el)); c && vClienteModal(c); },
  vClienteGuardar: el => vClienteGuardar(el.dataset.id ? vElId(el) : null),
  vReglas: el => vReglasModal(vElId(el)), vReglasGuardar: el => vReglasGuardar(vElId(el)),
  vNuevoProducto: () => vProductoModal(null), vEditarProducto: el => vProductoModal(V.productos.find(p => p.id_producto === vElId(el))),
  vProductoGuardar: el => vProductoGuardar(el.dataset.id ? vElId(el) : null),
  vPeso: el => { if (!VP.puedePesoBulto(S.rol)) return toast('Solo el Dueño y Administración cargan el peso del bulto.', 'warn'); vPesoModal(V.productos.find(p => p.id_producto === vElId(el))); },
  vPesoGuardar: el => vPesoGuardar(vElId(el)),
  vEntrada: el => vEntradaModal(V.productos.find(p => p.id_producto === vElId(el))), vEntradaGuardar: el => vEntradaGuardar(vElId(el)),
  vNuevoVendedor: () => vVendedorModal(null), vEditarVendedor: el => vVendedorModal(V.vendedores.find(v => v.id === vElId(el))), vVendedorGuardar: el => vVendedorGuardar(el.dataset.id ? vElId(el) : null),
  vAjustesGuardar: () => vAjustesGuardar(), vPinGuardar: () => vPinGuardar(),
  vEjemploCargar: async () => { await vRun('ej', () => vApi('POST', '/ejemplo'), 'Datos de ejemplo cargados.'); await vRecargarTodo(); },
  vEjemploBorrar: () => vEjemploBorrar(),
  vEjemploBorrarOk: async () => { closeModal(); await vRun('ej', () => vApi('POST', '/ejemplo/borrar'), 'Datos de ejemplo borrados.'); await vRecargarTodo(); },
  vAdmTab: el => { V.adm.tab = el.dataset.v; render(); }, vAdmQ: el => { V.adm.q = el.value; render(); },
  /* cobro */
  vCobOtro: () => { V.cob = null; render(); },
  vCobFecha: el => { const C = vCob(); C.fecha = el.value || vHoy(); C.apl = {}; C.prev = null; render(); vCobCargar(); },
  vCobExo: el => { const C = vCob(); C.exonerar = el.checked; C.apl = {}; C.prev = null; render(); vCobCargar(); },
  vAplTodo: el => {
    const C = vCob(), d = C.prev.documentos.find(x => x.id_documento === vElId(el)), usd = vCobUsd(), otros = Object.entries(C.apl).filter(([k]) => +k !== d.id_documento).reduce((t, [, v]) => t + (vNum(v) > 0 ? vNum(v) : 0), 0);
    const tope = usd > 0 ? Math.max(0, Math.round((usd - otros) * 100) / 100) : d.restante; C.apl[d.id_documento] = String(Math.min(d.restante, tope || d.restante)); render();
  },
  vAplRepartir: () => {
    const C = vCob(), usd = vCobUsd(); if (!(usd > 0)) return toast('Escribe primero el monto en bolívares (y que haya tasa BCV para la fecha).', 'warn');
    const r = VD.repartirAntiguoPrimero(Math.round(usd * 100), C.prev.documentos.filter(d => !d.error && d.restante_cents > 0).map(d => ({id_documento: d.id_documento, fecha_emision: d.fecha_emision, pendiente_cents: d.restante_cents})));
    C.apl = Object.fromEntries(r.aplicaciones.map(a => [a.id_documento, String(a.usd_cents / 100)])); render();
  },
  vAplLimpiar: () => { vCob().apl = {}; render(); },
  vCobrar: () => {
    const C = vCob(), b = vCobArmar(); if (V.busy.cobrar) return;
    if (!(b.monto_bs > 0)) return toast('Escribe el monto en bolívares.', 'warn'); if (!(vCobTasa() > 0)) return toast('No hay tasa BCV para esa fecha: pide que la consulten antes de cobrar.', 'warn');
    if (!vBancoListo(C) || !C.ref.trim()) return toast('Escribe el banco y el número de referencia.', 'warn');
    const retro = b.fecha_pago < vHoy();
    if (retro || b.exonerar_mora) vCobPedirPin(retro && b.exonerar_mora ? 'La fecha del pago es anterior a hoy y se exonera el recargo por mora.' : retro ? 'La fecha del pago es anterior a hoy.' : 'Se exonera el recargo por mora.', p => vCobEnviar(p));
    else vCobEnviar(null);
  },
  vIrCobrar: el => { const C = vCob(); Object.assign(C, {cid: null, cli: null, prev: null, apl: {}}); enter('v-cobro'); vCobElegir(vElId(el)); },
  /* listas */
  vPagosFiltro: el => { V.pagos.f[el.dataset.vf] = el.value; vPagosCargar(); },
  vPagosRango: el => {
    const f = V.pagos.f, h = vHoy(), k = el.dataset.v; V.pagos.init = true;
    if (k === 'hoy') Object.assign(f, {desde: h, hasta: h}); else if (k === 'semana') Object.assign(f, {desde: vLunes(h), hasta: h}); else if (k === 'mes') Object.assign(f, {desde: h.slice(0, 8) + '01', hasta: h}); else Object.assign(f, {desde: '', hasta: ''});
    vPagosCargar();
  },
  vPagosCSV: () => vPagosCSV(), vAnular: el => vAnular(vElId(el)),
  vDeudaFiltro: el => { V.deuda.f[el.dataset.vf] = el.value; vDeudaCargar(); }, vDeudaCSV: () => vDeudaCSV(),
  vRepTab: el => { V.rep.tab = el.dataset.v; V.rep.data = null; V.rep.csv = ''; render(); },
  vRepFiltro: el => { V.rep.f[el.dataset.vf] = el.value; V.rep.data = null; render(); },
  vRepCSV: () => { const c = V.rep.csv; c && vCSV(c[0] + '-' + vHoy() + '.csv', c[1], c[2]); },
  /* importación */
  vImpArchivo: el => vImpArchivo(el), vImpEnviar: () => vImpEnviar(), vImpOtro: () => { V.imp = null; render(); },
  vGrupoCanon: el => { vImp().gsel[el.dataset.g].canon = el.dataset.n; render(); },
  vGrupoUnificar: el => { vImp().gsel[el.dataset.g].unificar = el.checked; render(); },
  vImpEjemplo: el => { vImp().ejemplo = el.checked; }
};
Object.assign(ACT, VACT);

/* ---------- Entradas de teclado propias del módulo ---------- */
document.addEventListener('input', e => {
  const t = e.target; if (!t || !t.classList) return;
  if (t.classList.contains('v-q')) { vPedPonerCantidad(+t.dataset.id, vSoloDigitos(t)); return; }
  if (t.classList.contains('v-int')) { vSoloDigitos(t); return; }
  if (t.dataset.apl) { vCob().apl[t.dataset.apl] = t.value; vCobRefrescarRes(); return; }
  if (t.dataset.vk) { vSet(V, t.dataset.vk, t.value); if (/^cob\.monto$/.test(t.dataset.vk)) vCobRefrescarRes(); }
});

/* Altura disponible para la pantalla de Nueva venta (sin deslizar la página) */
function vAjustar() {
  const el = document.querySelector('.v-3'); if (!el) return;
  if (innerWidth < 1000) { el.style.removeProperty('--v-alto'); return; }
  const nuevo = Math.max(460, Math.floor(innerHeight - el.getBoundingClientRect().top - 56)) + 'px';
  if (el.style.getPropertyValue('--v-alto') === nuevo) return;
  el.style.setProperty('--v-alto', nuevo);
  const g = document.getElementById('v-grid-w'); if (g && V.ped) g.innerHTML = vPedGrid();
}
window.addEventListener('resize', vAjustar);
window.vAjustar = vAjustar;

/* ---------- Barras de búsqueda de Ventas (cada una busca SOLO en los datos de su pantalla) ---------- */
/* Nueva venta y Cobrar: buscador de cliente (nombre o RIF) */
Busca.registrar('v-cli', {
  sugerir: (q) => vCliFiltrar(q, 6).map(c => ({t: c.razon_social, d: (c.rif_id || 'sin RIF') + ' · debe ' + vusd(c.deuda), id: c.id_cliente})),
  elegir: (it, el) => el.dataset.bqk === 'ped' ? vPedElegir(it.id) : vCobElegir(it.id),
  vivo: (q, el) => { const clave = el.dataset.bqk, ctx = clave === 'ped' ? vPed() : vCob(); ctx.q = q; const ul = $('#v-pk-' + clave); if (ul) ul.innerHTML = vPickerItems(clave, vCliFiltrar(q, clave === 'ped' ? 5 : 12)); }
});
/* Nueva venta: catálogo de productos (nombre, gramaje o código SKU) */
const V_DEF_PROD = [{tipo: 'Producto', valores: p => (p.nombre + ' ' + (p.gramaje || '')).trim(), detalle: p => p.codigo_sku}, {tipo: 'Código', valores: p => p.codigo_sku, detalle: p => p.nombre}];
Busca.registrar('v-prod', {
  sugerir: q => Busca.sugerir(q, V.productos, V_DEF_PROD),
  vivo: q => { vPed().bq = q; vPed().pag = 0; const g = $('#v-grid-w'); if (g) g.innerHTML = vPedGrid(); }
});
/* Clientes, catálogo y ajustes: pestañas Clientes y Productos */
Busca.registrar('adm-cli', {
  sugerir: q => Busca.sugerir(q, V.adm.clientes || [], V_DEF_CLI),
  vivo: q => { V.adm.q = q; render(); }, espera: 150
});
Busca.registrar('adm-prod', {
  sugerir: q => Busca.sugerir(q, V.productos, V_DEF_PROD),
  vivo: q => { V.adm.qp = q; render(); }, espera: 150
});
/* Pagos recibidos: cliente, RIF, recibo, nota o factura, banco y referencia (solo pagos) */
Busca.registrar('v-pagos', {
  sugerir: q => Busca.sugerir(q, V.pagos.filas || [], V_DEF_PAGO),
  vivo: q => { V.pagos.f.q = q; render(); }, espera: 150
});
/* Quién debe: cliente, RIF y número de nota o factura pendiente. Filtra en el servidor (los totales cambian); las sugerencias salen de la lista completa. */
Busca.registrar('v-deuda', {
  sugerir: q => Busca.sugerir(q, (V.deuda.base || {clientes: []}).clientes, V_DEF_DEUDA),
  vivo: q => { V.deuda.f.q = q; vDeudaCargar(); }, espera: 250
});
