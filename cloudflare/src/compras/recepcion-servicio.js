/* Compras · recepción en UN solo paso, conectada con la orden de compra:
   Pedida (aparece en «Recibir» apenas se registra) → Recibida (Producción pesa y cuenta; si difiere de lo comprado hay que confirmar con motivo).
   Al recibir, todo en el mismo lote (todo o nada): la papa queda disponible para producir, se suma al inventario general y al almacén,
   nace la compra efectiva y, si es a crédito, la cuenta por pagar, SOBRE LO REALMENTE RECIBIDO. Lo que nunca llega no genera deuda ni inventario.
   Si llegó distinto, Administración recibe un aviso (con el motivo). No hay paso de validación. No conoce HTTP. */
import * as C from './dominio.js';
import * as R from './repo.js';
import * as VS from '../ventas/servicio.js';
import * as INV from '../inventario/servicio.js';
import * as ID from '../inventario/dominio.js';
import {nomRol} from '../ventas/permisos.js';
import {fila, resolverProducto} from './servicio.js';
import {turnoActivo} from '../produccion/turno-activo.js';

export const err = VS.err;
const hoyVE = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const sumaDias = (f, d) => { const t = new Date(f + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const auditar = (ctx, ref, nom, accion, detalle) => VS.audit(ctx, 'compra', ref, nom, accion, detalle);

/* Lo que se puede recibir: pedidos sin recibir (Producción y Gerente) y su configuración */
export async function porRecibir(ctx) {
  if (!C.ROLES_RECIBIR.includes(ctx.rol) && ctx.rol !== 'adm') throw err(403, C.MSG_SIN_RECIBIR);   // Administración la ve (sin precios) pero no recibe
  const ps = await R.listar(ctx.db, 'PEDIDA'), ls = await R.lineasDe(ctx.db, ps.map(p => p.id));
  const fh = hoyVE(), dh = await R.diferenciasDesde(ctx.db, Date.parse(fh + 'T04:00:00Z')), docs = await R.recepcionesHoy(ctx.db, fh);
  const hoy = docs.map(d => { const f = dh.find(x => x.nro === d.pedido && x.producto_id === d.producto_id); return {id: d.id, nro: d.pedido, producto: d.item, cantidad: +d.kgRec || 0, unidad: d.unidad || 'kg', estado: 'En almacén', diferencia: f ? f.diferencia : 0, motivo: f ? f.motivo : ''}; });
  for (const f of dh) if (!(+f.recibido > 0) && !docs.some(d => d.pedido === f.nro && d.producto_id === f.producto_id)) hoy.push({id: 'DIF-' + f.id, nro: f.nro, producto: f.producto_nombre, cantidad: 0, unidad: f.unidad, estado: 'Pedida', diferencia: f.diferencia, motivo: f.motivo});   // no llegó nada
  return {kg_saco_referencia: C.KG_SACO_REF, sacos_de_muestra: C.MUESTRA_SACOS, hoy, pedidos: ps.map(p => { const f = fila(p, ls); return {id: f.id, nro: f.nro, proveedor: f.proveedor, fecha: f.fecha, factura: f.factura, lineas: f.lineas.map(l => ({producto_id: l.producto_id, producto: l.producto, unidad: l.unidad, cantidad: l.cantidad, papa: l.unidad === 'saco', kg_referencia: l.kg_referencia || null}))}; })};
}

/* Recibir (verificación física). Cuerpo: {nro, lineas:[{producto_id, recibido, pesadas?}], confirmar_diferencia?, motivo?, obs?} */
export async function recibir(ctx, b) {
  if (!C.ROLES_RECIBIR.includes(ctx.rol)) throw err(403, C.MSG_SIN_RECIBIR);
  const nro = String((b && b.nro) || '').trim(); if (!nro) throw err(400, 'Elige la compra que llegó.');
  const ped = await R.pedidoPorNro(ctx.db, nro); if (!ped) throw err(404, 'No encontré esa compra.');
  if (ped.estado !== 'PEDIDA') throw err(409, ped.estado === 'RECIBIDA' ? 'Esa compra ya se recibió.' : 'Esa compra está anulada.', {codigo: 'YA_RECIBIDA'});
  const ls = await R.lineasDePedido(ctx.db, ped.id);
  const prods = {}; for (const l of ls) prods[l.producto_id] = await resolverProducto(ctx.db, l.producto_id);
  const lp = ls.map(l => ({producto_id: l.producto_id, producto_nombre: l.producto_nombre, unidad: l.unidad, cantidad: l.cantidad, papa: l.unidad === 'saco' && C.esPapaCruda(prods[l.producto_id]), precio_usd: l.precio_usd}));
  const v = C.validarRecepcion(b, lp); if (v.error) throw err(400, v.error);
  const d = v.datos, rec = Object.fromEntries(d.lineas.map(l => [l.producto_id, l.recibido]));
  const difs = C.diferenciasDe(lp, rec);
  if (difs.length) {   // ALARMA: lo recibido no es lo comprado → hay que confirmar y escribir el motivo
    if (!d.confirmar) throw err(409, 'Lo que llegó no es lo que se compró. Revisa las diferencias, confirma y escribe el motivo.', {codigo: 'DIFERENCIA', diferencias: difs});
    if (d.motivo.length < 3) throw err(400, 'Escribe el motivo de la diferencia (por qué llegó distinto a lo comprado).', {codigo: 'FALTA_MOTIVO', diferencias: difs});
  }
  const base = 'REC-' + nro, ts = Date.now(), fecha = hoyVE(), st = [], fin = [], invLineas = [], recs = [], compras = [];
  const prov = (await R.proveedor(ctx.db, ped.proveedor_id)) || {}, credito = ped.condicion === 'CREDITO';
  let i = 0;
  for (const l of lp) {
    i++; const x = d.lineas.find(y => y.producto_id === l.producto_id), pr = prods[l.producto_id] || {};
    if (!(x.recibido > 0)) continue;   // no llegó nada de este producto: queda solo la diferencia
    const id = base + '-' + i, papa = l.papa;
    const doc = {fecha, prov: ped.proveedor_id, sub: pr.tipo === 'papa' ? 'Propia' : 'Insumo', cat: pr.cat, item: pr.n, sk: pr.sk, unidad: papa ? 'kg' : (pr.unidad || 'kg'),
      sacos: papa ? x.recibido : null, kgSaco: papa ? x.muestra.prom : null, qf: papa ? C.kilosDelLote(C.KG_SACO_REF, l.cantidad) : l.cantidad,
      kgRec: papa ? x.kg : x.recibido, muestra: papa ? {n: x.muestra.n, prom: x.muestra.prom, desv: x.muestra.desv, pesadas: x.pesadas} : null,
      producto_id: l.producto_id, comprado: l.cantidad, comprado_unidad: l.unidad, recibido: x.recibido, calidad: 'A', recibe: nomRol(ctx.rol), fact: ped.factura, obs: d.obs, motivo: 'Pedido ' + nro,
      entProm: ped.fecha, entReal: fecha, estado: 'almacen', pedido: nro, ts};
    // compra efectiva + deuda (o pago) sobre lo REALMENTE recibido (en sacos para la papa cruda)
    const cid = 'C-' + id.replace(/^REC-/, ''), cant = x.recibido, tot = Math.round(C.subtotalCents(cant, l.precio_usd)) / 100;
    const cond = credito ? 'Crédito' : 'Contado', plazo = credito ? ped.plazo_dias + ' días' : 'Contado';
    doc.compraId = cid; doc.validacion = {pu: l.precio_usd, cond, plazo, qfPago: cant, por: ctx.rol, ts};
    recs.push({id, doc, linea: l});
    st.push(R.stDoc(ctx.db, 'recepciones', id, doc));
    fin.push(R.stDoc(ctx.db, 'compras', cid, {fam: 'MP', recId: id, prov: ped.proveedor_id, sub: doc.sub, cat: pr.cat, item: pr.n, sk: pr.sk, unidad: l.unidad, qf: cant, pu: l.precio_usd, cond, plazo, motivo: doc.motivo, fecha, entProm: ped.fecha, entReal: fecha, pedido: nro, fact: ped.factura}));
    if (credito) fin.push(R.stDoc(ctx.db, 'cxp', 'CXP-' + cid, {compraId: cid, prov: ped.proveedor_id, total: tot, cuota: prov.abonos ? Math.round(tot / prov.abonos * 100) / 100 : null, vence: sumaDias(fecha, ped.plazo_dias || 0), fecha}));
    if (!pr.inv) fin.push(R.stDoc(ctx.db, 'movimientos', 'MV-ENT-' + id, {almacen: 'MP', item: pr.sk, tipo: 'entrada', cant: doc.kgRec, fecha, ref: id + ' / ' + cid}));   // el almacén de materia prima también sube (los insumos directos suben solo en el inventario general)
    compras.push({id: cid, producto: pr.n, cantidad: cant, unidad: l.unidad, total_usd: tot, credito});
    const art = ID.articuloDe(pr);
    invLineas.push({articulo: art, cantidad: papa ? x.kg : x.recibido, ref: id});
  }
  for (const df of difs) st.push(R.stDiferencia(ctx.db, {nro, recepcion_id: (recs.find(r => r.linea.producto_id === df.producto_id) || {}).id || base, ...df, producto_nombre: df.producto, motivo: d.motivo, rol: ctx.rol}));
  const total = lp.reduce((a, l) => a + C.subtotalCents(rec[l.producto_id] ?? 0, l.precio_usd), 0);
  st.push(R.stRecibido(ctx.db, nro, {recepcion_id: base, rol: ctx.rol, con_diferencia: difs.length > 0}),
    ...INV.sentenciasEntradaCompra(ctx, {ref: nro, lineas: invLineas, id_turno: ((await turnoActivo(ctx.db)) || {}).id_turno ?? null}), ...fin);
  if (difs.length) st.push(R.stAlerta(ctx.db, {tipo: 'RECEPCION_CON_DIFERENCIA', ref: nro, rol: ctx.rol, titulo: 'Compra ' + nro + ' de ' + ped.proveedor_nombre + ': llegó distinto a lo comprado',
    detalle: {nro, proveedor: ped.proveedor_nombre, recibe: nomRol(ctx.rol), motivo: d.motivo, total_recibido_usd: total / 100}}));
  st.push(R.stVer(ctx.db),
    ...auditar(ctx, nro, ped.proveedor_nombre, difs.length ? 'recibió la compra CON DIFERENCIA y la confirmó' : 'recibió la compra (verificación física)',
      {recepciones: recs.map(r => r.id), compras: compras.map(c => c.id), total_usd: total / 100, condicion: ped.condicion, diferencias: difs, motivo: d.motivo || null, kg_papa: recs.filter(r => r.linea.papa).map(r => r.doc.kgRec)}));
  await VS.enLote(ctx.db, st);
  return {nro, estado: 'RECIBIDA', recepciones: recs.map(r => ({id: r.id, producto: r.doc.item, recibido: r.doc.recibido, kg: r.doc.kgRec})), con_diferencia: difs.length > 0, diferencias: difs, ...(C.ROLES_VER_DIF.includes(ctx.rol) ? {compras, total_usd: total / 100} : {compras: compras.map(c => ({id: c.id, producto: c.producto, cantidad: c.cantidad, unidad: c.unidad}))}), aviso: compras.length ? 'La compra quedó lista' + (credito ? ' y se anotó lo que se debe al proveedor.' : '.') : 'No llegó nada: no se anota deuda ni inventario.'};
}

/* Avisos de diferencia para Administración: lo que llegó distinto a lo comprado, con su motivo, y los avisos sin ver */
export async function diferencias(ctx) {
  if (!C.ROLES_VER_DIF.includes(ctx.rol)) throw err(403, C.MSG_SIN_VER_DIF);
  const avisos = await R.alertas(ctx.db, 'PENDIENTE');
  return {sin_ver: avisos.length, diferencias: (await R.listarDiferencias(ctx.db)).map(d => ({nro: d.nro, recepcion: d.recepcion_id, producto: d.producto_nombre, unidad: d.unidad, comprado: d.comprado, recibido: d.recibido, diferencia: d.diferencia, motivo: d.motivo, rol: nomRol(d.rol), ts: d.ts, sin_ver: avisos.some(a => a.ref === d.nro)}))};
}
export async function contadorDiferencias(ctx) {
  if (!C.ROLES_VER_DIF.includes(ctx.rol)) throw err(403, C.MSG_SIN_VER_DIF);
  return {sin_ver: (await R.alertas(ctx.db, 'PENDIENTE')).length};
}
/* Administración marca el aviso como visto. Cuerpo: {nro} */
export async function verDiferencia(ctx, b) {
  if (!C.ROLES_VER_DIF.includes(ctx.rol)) throw err(403, C.MSG_SIN_VER_DIF);
  const nro = String((b && b.nro) || '').trim(); if (!nro) throw err(400, 'Elige la compra.');
  await VS.enLote(ctx.db, [R.stAtenderAlerta(ctx.db, 'RECEPCION_CON_DIFERENCIA', nro, ctx.rol), R.stVer(ctx.db)]);
  return {nro, visto: true};
}
