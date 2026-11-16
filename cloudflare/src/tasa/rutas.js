/* Tasa BCV · rutas HTTP (/api/v/tasa*). Leer la tasa: cualquier rol conocido. Consultar de nuevo: Gerente o Administración. */
import * as S from './servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
const esLocal = url => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);

export async function rutasTasa(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/v\/tasa/, '') || '/', m = req.method;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  try {
    if (m === 'GET' && p === '/') {
      await S.asegurarDelDia(db);
      const f = url.searchParams.get('fecha') || undefined;
      return json({...(await S.estado(db)), tasa: await S.vigente(db, f)});
    }
    if (m === 'POST' && p === '/consultar') {
      if (rol !== 'dueno' && rol !== 'adm') return json({error: 'Solo el Gerente o Administración consultan la tasa de nuevo.'}, 403);
      return json({consulta: await S.consultar(db), ...(await S.estado(db)), tasa: await S.vigente(db)});
    }
    /* SOLO PRUEBAS LOCALES: tasa de desarrollo (no es real). Fuera de localhost responde 404 como si no existiera. */
    if (m === 'POST' && p === '/dev') {
      if (!esLocal(url)) return json({error: 'Ruta no encontrada.'}, 404);
      if (rol !== 'dueno') return json({error: 'Solo el Gerente.'}, 403);
      return json(await S.cargarTasaDev(db, await req.json()));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e); return json({error: 'Error interno.'}, 500);
  }
}
