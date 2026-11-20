/* Aviso «Revisa estas personas»: quienes pasaron de «Administración y ventas» a Administración («¿son de Ventas?») y quienes eran de Producción y quedaron con el área «Sin definir».
   Lo ven Gerencia y Recursos humanos (en Personal y en En planta hoy). Aquí solo se muestra y se pide; lo decide el servidor (/api/h/areas/*). Usa hpApi de h-planta.js. */
const HAV = {d: null, rol: null, cargando: false, ts: 0, busy: false};
const haVe = () => S.rol === 'dueno' || S.rol === 'rrhh';
function haCargar() {
  if (HAV.cargando) return; HAV.cargando = true;
  hpApi('GET', '/areas/revision').then(d => { HAV.d = d; }).catch(() => { HAV.d = {total: 0, personas: []}; }).finally(() => { HAV.cargando = false; HAV.ts = Date.now(); render(); });
}
function haCard() {
  if (!window.__EM_HTTP || !haVe()) return '';
  if (HAV.rol !== S.rol) { HAV.rol = S.rol; HAV.d = null; }
  if (!HAV.d) { haCargar(); return ''; }
  if (!HAV.cargando && Date.now() - HAV.ts > 30000) haCargar();
  const d = HAV.d; if (!d.total) return '';
  const fila = p => `<div class="ha-fila"><div class="ha-q"><b>${esc(p.nombre)}</b><span>${esc(p.cargo || '—')} · ${esc(p.puesto)} · ${esc(p.area)}</span></div>
    <div class="ha-bts">${p.motivo === 'ventas'
      ? `<button type="button" class="btn pri" data-act="haRevisar" data-id="${esc(p.id)}" data-a="ventas">Es de Ventas</button><button type="button" class="btn" data-act="haRevisar" data-id="${esc(p.id)}" data-a="quedarse">Se queda en Administración</button>`
      : `<select class="ha-sel" id="ha-s-${esc(p.id)}" aria-label="Área de ${esc(p.nombre)}"><option value="">Elige el área…</option>${['Cocina', 'Fritura', 'Mantenimiento', 'Línea salsera'].map(a => `<option>${a}</option>`).join('')}</select><button type="button" class="btn pri" data-act="haRevisar" data-id="${esc(p.id)}" data-a="asignar">Guardar área</button>`}</div></div>`;
  return `<section class="card ha-aviso" role="status"><div class="card-b"><h2>Revisa estas personas <span class="hp-n">${d.total}</span></h2>
    <p class="hint">Separamos «Administración y ventas» en Administración y Ventas, y Producción en Cocina, Fritura, Mantenimiento y Línea salsera. No adivinamos: indica dónde va cada persona.</p>${d.personas.map(fila).join('')}</div></section>`;
}
async function haRevisar(el) {
  if (HAV.busy) return; const id = el.dataset.id, a = el.dataset.a, cuerpo = {empleado_id: id, accion: a};
  if (a === 'asignar') { const v = (document.getElementById('ha-s-' + id) || {}).value; if (!v) return toast('Elige el área de la persona.', 'err'); cuerpo.puesto = 'Producción'; cuerpo.area = v; }
  HAV.busy = true;
  try { HAV.d = await hpApi('POST', '/areas/revisar', cuerpo); HAV.ts = Date.now(); toast('Listo.'); if (typeof B !== 'undefined' && B && B.refresh) B.refresh(); }
  catch (e) { toast(esc(e.message), 'err'); }
  finally { HAV.busy = false; render(); }
}
window.EM_areasAviso = haCard;
Object.assign(ACT_REQ, {haRevisar: ['rh-planta', 2]});
Object.assign(ACT_LBL, {haRevisar: 'cambiar el área de una persona'});
WRITE_ACTS.add('haRevisar');
Object.assign(ACT, {haRevisar: el => haRevisar(el)});
