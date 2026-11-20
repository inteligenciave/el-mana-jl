/* Grupos de turno rotativo (Grupo 1 y Grupo 2): quién integra cada grupo, a qué turno va cada semana (Diurno o Nocturno), excepciones de una persona y el historial.
   Todo lo decide el servidor (/api/h/grupos*); aquí solo se muestra y se pide. Asignan Gerencia y Nómina; Administración y Producción solo ven.
   Usa hpApi, hpFecha, hpArea de h-planta.js. */
const HG = {d: null, sem: '', cargando: false, rol: null, err: '', busy: false, ts: 0};
const hgPuede = () => !!(HG.d && HG.d.puede_asignar);
function hgCargar(sem) {
  if (HG.cargando) return; HG.cargando = true;
  hpApi('GET', '/grupos' + (sem ? '?semana=' + sem : '')).then(d => { HG.d = d; HG.sem = d.semana; HG.err = ''; }).catch(e => { console.error(e); HG.err = e.message; HG.d = null; })
    .finally(() => { HG.cargando = false; HG.ts = Date.now(); if (S.route === 'rh-grupos') render(); });
}
const hgTurnoChip = t => t ? `<span class="chip ${t === 'Diurno' ? 'c-info' : 'c-warn'}">${t}</span>` : '<span class="chip">Sin asignar</span>';
/* Lo ya pagado o con bono aplicado no se cambia: en cada persona solo un candado pequeño con la explicación; el aviso y el botón de autorización van una sola vez arriba */
const hgCandado = texto => `<span class="hg-lock" title="${esc(texto)}" aria-label="${esc(texto)}" tabindex="0">${ic('lock', 14)}</span>`;
function hgGrupo(g, d) {
  const cierra = d.bloquea && g.bloqueado, lk = cierra ? ' disabled title="Hay personas de este grupo con pago de nómina o bono aplicado esta semana"' : '';
  const otro = g.id === 1 ? 2 : 1;
  const botones = d.puede_asignar ? `<div class="hg-bts"><button type="button" class="btn sm" data-act="hgMiembros" data-g="${g.id}">Quiénes son</button>
    <button type="button" class="btn sm ${g.turno === 'Diurno' ? 'pri' : ''}" data-act="hgAsignar" data-g="${g.id}" data-t="Diurno" aria-pressed="${g.turno === 'Diurno'}"${lk}>Diurno esta semana</button>
    <button type="button" class="btn sm ${g.turno === 'Nocturno' ? 'pri' : ''}" data-act="hgAsignar" data-g="${g.id}" data-t="Nocturno" aria-pressed="${g.turno === 'Nocturno'}"${lk}>Nocturno esta semana</button></div>` : '';
  const filas = g.miembros.map(m => { const cer = d.bloquea && m.bloqueo; return `<div class="hg-p"><div class="hg-quien"><b>${esc(m.nombre)}${m.bloqueo && d.bloquea ? ' ' + hgCandado(m.bloqueo.texto) : ''}</b><span>${esc(m.cargo || '—')} · ${esc(hpArea(m.area))}${m.excepcion ? ' · <em>solo esta semana</em> (su grupo es el ' + m.grupo_origen + ')' : ''}</span></div>
    ${d.puede_asignar ? `<button type="button" class="btn sm" data-act="hgExcepcion" data-id="${esc(m.id)}" data-g="${m.excepcion ? '' : otro}"${cer ? ' disabled title="' + esc(m.bloqueo.texto) + '"' : ''}>${m.excepcion ? 'Volver a su grupo' : 'Pasar al Grupo ' + otro + ' esta semana'}</button>` : ''}</div>`; }).join('');
  const cuantos = g.miembros.length + (g.miembros.length === 1 ? ' persona' : ' personas');
  return `<section class="card hg-grupo"><div class="card-b"><div class="hg-cab"><h2>${esc(g.nombre)}</h2>${hgTurnoChip(g.turno)}<span class="hp-n">${cuantos}</span></div>${botones}<div class="hg-lista-p">${filas || '<p class="hp-vacio">Nadie en este grupo todavía.</p>'}</div></div></section>`;
}
function hgHistorial(d) {
  if (!d.historial.length) return '';
  const h8 = d.historial.slice(0, 8);
  const fila = h => `<tr><td>${hpFecha(h.semana)}</td>${h.grupos.map(g => `<td>${hgTurnoChip(g.turno)} <span class="muted">${g.miembros.length} ${g.miembros.length === 1 ? 'persona' : 'personas'}</span>${g.miembros.length ? `<br><span class="muted hg-nom">${esc(g.miembros.join(', '))}</span>` : ''}</td>`).join('')}</tr>`;
  return `<details class="card hg-plega"><summary>Historial por semana <span class="muted">· ${h8.length === 1 ? 'última semana' : 'últimas ' + h8.length + ' semanas'}, toca para abrir</span></summary><div class="card-b"><p class="hint">Cada semana guarda quién estaba en cada grupo y a qué turno iba.</p><div class="tabla-w"><table class="tbl hg-tbl"><thead><tr><th>Semana del</th>${d.grupos.map(g => `<th>${esc(g.nombre)}</th>`).join('')}</tr></thead><tbody>${h8.map(fila).join('')}</tbody></table></div></div></details>`;
}
function hgSinGrupo(d) {
  if (!d.sin_grupo.length) return '';
  const chip = p => `<span class="chip hg-chip">${esc(p.nombre)} <span class="muted">· ${esc(p.turno_ficha || 'turno fijo sin definir')}</span></span>`;
  return `<details class="card hg-plega"><summary>Sin grupo (turno fijo) <span class="hp-n">${d.sin_grupo.length}</span> <span class="muted">· toca para ver</span></summary><div class="card-b"><p class="hint">Estas personas no rotan: mantienen el turno fijo de «Personas».</p><div class="hg-chips">${d.sin_grupo.map(chip).join('')}</div></div></details>`;
}
function scrGrupos() {
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (HG.rol !== S.rol) { HG.rol = S.rol; HG.d = null; HG.sem = ''; HG.err = ''; }
  if (!HG.d) { if (HG.err) return `<p class="err" role="alert">${esc(HG.err)}</p>`; hgCargar(HG.sem); return card('', emptyState('Cargando…', 'Un momento.')); }
  const d = HG.d, esta = d.semana === d.semana_actual;
  const barra = `<div class="hg-sem"><button type="button" class="btn" data-act="hgSem" data-s="${d.anterior}">‹ Semana anterior</button><h2 class="hg-tit">Semana del ${hpFecha(d.semana)}${esta ? ' <span class="chip c-info">esta semana</span>' : ''}</h2><button type="button" class="btn" data-act="hgSem" data-s="${d.siguiente}">Semana siguiente ›</button>${esta ? '' : `<button type="button" class="btn" data-act="hgSem" data-s="${d.semana_actual}">Volver a hoy</button>`}</div>`;
  const lock = d.bloquea && d.grupos.some(g => g.bloqueado) ? `<div class="hg-aviso">${ic('lock', 16)}<span>Hay personas ya pagadas o con bono aplicado esta semana: no se pueden mover (lo marca el candado).</span>${typeof solBtn === 'function' ? solBtn('Corregir algo ya pagado o con bono aplicado') : ''}</div>` : '';
  const sinAsig = !d.asignada ? `<p class="hint">${d.puede_asignar ? 'Esta semana todavía no tiene turno asignado: elige Diurno o Nocturno para un grupo y el otro toma el turno contrario.' : 'Esta semana todavía no tiene turno asignado.'}</p>` : '';
  return (HG.err ? `<p class="err" role="alert">${esc(HG.err)}</p>` : '') + barra + lock + sinAsig + `<div class="hg-grid">${d.grupos.map(g => hgGrupo(g, d)).join('')}</div>` + hgSinGrupo(d) + hgHistorial(d) + (window.hrTarjetaGrupos ? window.hrTarjetaGrupos() : '');
}
async function hgAccion(m, ruta, cuerpo, ok) {
  if (HG.busy) return; HG.busy = true;
  try { HG.d = await hpApi(m, ruta, cuerpo); HG.sem = HG.d.semana; HG.err = ''; if (ok) toast(ok); closeModal(); }
  catch (e) {
    if (e.datos && e.datos.bloqueado) { HG.err = ''; modal('Esto ya no se puede cambiar', `<div class="form"><p>${esc(e.message)}</p><div class="btnrow">${typeof solBtn === 'function' ? solBtn('Corregir algo ya pagado o con bono aplicado', 'pri') : ''}<button type="button" class="btn" data-act="closeModal">Entendido</button></div></div>`); }
    else { HG.err = e.message; toast(esc(e.message), 'err'); }
  }
  finally { HG.busy = false; render(); }
}
function hgMiembros(gid) {
  const d = HG.d, g = d.grupos.find(x => x.id === gid), otro = d.grupos.find(x => x.id !== gid);
  const casa = new Map(); for (const x of d.grupos) for (const m of x.miembros) if (!m.excepcion) casa.set(m.id, x.id);
  const todos = [...d.sin_grupo, ...d.grupos.flatMap(x => x.miembros.filter(m => !m.excepcion && m.activo))].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  modal('Quiénes integran el ' + esc(g.nombre), `<div class="form"><p class="hint">Marca a las personas de este grupo. Si alguien estaba en el ${esc(otro.nombre)}, pasa a este. Los cambios valen desde esta semana; las semanas pasadas no se tocan.</p>
    <div class="hg-lista">${todos.map(p => `<label class="toggle"><input type="checkbox" class="hg-ck" value="${esc(p.id)}" ${casa.get(p.id) === gid ? 'checked' : ''}>${esc(p.nombre)}${casa.get(p.id) === otro.id ? ' <span class="muted">(ahora en el ' + esc(otro.nombre) + ')</span>' : ''}</label>`).join('')}</div>
    <div class="btnrow"><button type="button" class="btn pri" data-act="hgGuardarMiembros" data-g="${gid}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
Object.assign(PERM_DEF, {'rh-grupos': 'rrhh:2'});
Object.assign(SCREENS, {'rh-grupos': {mod: 'adm', g: 'En planta', t: 'Grupos y turnos', s: 'Grupos y turnos', ic: 'users', r: scrGrupos}});
/* El nivel de la matriz guardada por Gerencia puede ser viejo: el servidor decide quién asigna (Gerencia y Nómina); aquí solo se exige poder ver la pantalla */
Object.assign(ACT_REQ, {hgMiembros: ['rh-grupos', 1], hgGuardarMiembros: ['rh-grupos', 1], hgAsignar: ['rh-grupos', 1], hgExcepcion: ['rh-grupos', 1]});
Object.assign(ACT_LBL, {hgMiembros: 'cambiar los integrantes de un grupo', hgGuardarMiembros: 'cambiar los integrantes de un grupo', hgAsignar: 'asignar el turno de un grupo', hgExcepcion: 'mover a una persona de grupo por una semana'});
['hgGuardarMiembros', 'hgAsignar', 'hgExcepcion'].forEach(k => WRITE_ACTS.add(k));
S.perm = permInit();
Object.assign(ACT, {
  hgSem: el => { HG.d = null; HG.sem = el.dataset.s; render(); },
  hgMiembros: el => hgMiembros(+el.dataset.g),
  hgGuardarMiembros: el => hgAccion('PUT', '/grupos/miembros', {grupo_id: +el.dataset.g, empleados: [...document.querySelectorAll('.hg-ck:checked')].map(x => x.value)}, 'Integrantes guardados.'),
  hgAsignar: el => hgAccion('POST', '/grupos/semana', {semana: HG.sem, grupo_id: +el.dataset.g, turno: el.dataset.t, ambos: true}, 'Turno de la semana guardado.'),
  hgExcepcion: el => hgAccion('POST', '/grupos/excepcion', {semana: HG.sem, empleado_id: el.dataset.id, grupo_id: el.dataset.g ? +el.dataset.g : null}, 'Listo.')
});
