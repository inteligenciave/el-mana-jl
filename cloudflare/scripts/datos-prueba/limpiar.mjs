/* Limpia SOLO los datos de prueba creados por cargar.mjs (lee estado.json). Local únicamente.
   Uso: node scripts/datos-prueba/limpiar.mjs
   Borra: personas de prueba (y sus marcas/grupos), devuelve la categoría de los clientes tocados y quita los precios cargados. No toca nada más. */
import {readFileSync, existsSync, unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const BASE = process.env.BASE || 'http://localhost:8800';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error('Solo local.'); process.exit(1); }
const EST = fileURLToPath(new URL('./estado.json', import.meta.url));
if (!existsSync(EST)) { console.log('No hay estado.json: nada que limpiar.'); process.exit(0); }
const e = JSON.parse(readFileSync(EST, 'utf8')), H = {'x-rol': 'dueno', 'content-type': 'application/json'};
const api = async (m, p, b, x = {}) => { const r = await fetch(BASE + p, {method: m, headers: {...H, ...x}, body: b ? JSON.stringify(b) : undefined}); const t = await r.text(); try { return {s: r.status, j: JSON.parse(t)}; } catch { return {s: r.status, j: t}; } };
const ids = (e.empleados || []).filter(i => /^[A-Za-z0-9]+$/.test(i)), q = ids.map(i => "'" + i + "'").join(',');
const sql = [];
if (ids.length) sql.push(`DELETE FROM marcas WHERE empleado_id IN (${q})`, `DELETE FROM grupo_miembros WHERE empleado_id IN (${q})`, `DELETE FROM grupo_semana_miembros WHERE empleado_id IN (${q})`);
for (const [p, l] of e.precios || []) sql.push(`DELETE FROM precios_lista WHERE id_producto = ${+p} AND lista = '${String(l).replace(/[^A-Za-z ]/g, '')}'`);
if (sql.length) execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--command', '"' + sql.join('; ') + '"'], {stdio: 'inherit', shell: true, cwd: fileURLToPath(new URL('../..', import.meta.url))});
for (const i of ids) console.log('persona', i, (await api('DELETE', '/api/c/empleados/' + i, null, {'x-purga': '1'})).s);
const cli = (await api('GET', '/api/v/clientes?limite=500')).j;
for (const [id, cat] of Object.entries(e.clientes || {})) {
  const c = cli.find(x => x.id_cliente === +id); if (!c) continue;
  console.log('cliente', id, (await api('PUT', '/api/v/clientes/' + id, {rif_id: c.rif_id, razon_social: c.razon_social, modalidad_despacho_pref: c.modalidad_despacho_pref, id_vendedor: c.id_vendedor, zona: c.zona, telefono: c.telefono, direccion_entrega: c.direccion_entrega, id_lista_base: c.id_lista_base, descuento_fijo_pct: c.descuento_fijo_pct, dias_pronto_pago: c.dias_pronto_pago, dias_credito_normal: c.dias_credito_normal, limite_credito_usd: c.limite_credito_cents == null ? null : c.limite_credito_cents / 100, categoria_precio: cat || ''})).s);
}
unlinkSync(EST); console.log('Listo: datos de prueba retirados.');
