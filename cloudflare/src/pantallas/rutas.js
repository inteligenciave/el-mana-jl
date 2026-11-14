/* Funciones extra por rol · rutas HTTP (/api/v/pantallas/*). El rol llega en x-rol.
   GET /extras               Dueño: todas · otro rol: solo las suyas
   PUT /extras/:rol {claves} solo el Dueño (403 al resto) */
import * as S from './servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';
const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
export async function rutasPantallas(req, env, url) {
  const p = url.pathname.replace(/^\/api\/v\/pantallas/, '') || '/', m = req.method;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db: env.DB, rol};
  try {
    let r;
    if (p === '/extras' && m === 'GET') return json(await S.leer(ctx));
    if ((r = p.match(/^\/extras\/([a-z]{2,20})$/)) && m === 'PUT') {
      const t = await req.text(); if (t.length > 20000) throw S.err(413, 'La petición es demasiado grande.');
      let b; try { b = JSON.parse(t || '{}'); } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
      return json(await S.asignar(ctx, r[1], b && b.claves));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
