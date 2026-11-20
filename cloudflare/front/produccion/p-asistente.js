/* Producir: UNA pantalla, siempre sobre el turno activo (Diurno o Nocturno, según la hora; no se abre ni se continúa a mano).
   1) Se ven SIEMPRE los requisitos (papa, aceite, agua, sal, químicos, almidón y personal del turno) en verde o rojo.
   2) «Iniciar producción» solo se enciende con todos en verde (el servidor lo vuelve a comprobar).
   3) Las etapas se hacen UNA A LA VEZ, en orden, con «Terminar etapa». 4) Al final se anota una sola merma y se cierra el turno.
   Todas las reglas las decide el servidor; aquí solo se ordena lo que se ve. Comparte el ámbito de p-prod.js. */
Object.assign(PR, {arr: null, res: null, mc: null, v: {}, fri: false, mcd: null, mf: {}, mfNota: '', mfEdit: false, mfCargado: false});

/* Requisitos para producir: una fila por requisito (verde con «Hay X» si se cumple, rojo con lo que falta). a = respuesta de /arranque */
function prCondHTML(a) {
  const fila = (ok, nom, txt) => `<li class="${ok ? 'ok' : 'mal'}"><span class="pr-ic" aria-hidden="true">${ok ? '✓' : '✗'}</span><span class="pr-cn"><b>${prT(nom)}</b><span>${prT(txt)}</span></span><span class="pr-sr">${ok ? 'Cumplido' : 'Falta'}</span></li>`;
  const filas = a.insumos.map(x => fila(x.ok, x.nombre, x.ok ? 'Hay ' + prN(x.saldo, x.unidad === 'und' ? 0 : 1) + ' ' + (x.unidad === 'und' ? 'unidades' : x.unidad) : x.motivo)).join('');
  const pe = a.personal || {};
  const pers = fila(!!pe.ok, 'Personal del turno', pe.ok ? prT(pe.nombre) + ' · ' + pe.miembros.length + (pe.miembros.length === 1 ? ' persona' : ' personas') : pe.motivo);
  const nf = a.faltan.length;
  const res = a.ok ? '<p class="pr-cres ok"><b>Todo listo para producir.</b></p>' : `<p class="pr-cres mal" role="alert"><b>${nf === 1 ? 'Falta 1 requisito.' : 'Faltan ' + nf + ' requisitos.'}</b> No se puede iniciar hasta cumplirlos.</p>`;
  return `${res}<ul class="pr-cond">${filas}${pers}</ul>`;
}
const prNum = v => { let x = String(v == null ? '' : v).trim().replace(/\s/g, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); const n = Number(x); return Number.isFinite(n) && n > 0 ? n : 0; };
const prR3 = n => Math.round(n * 1000) / 1000, prIn = n => n > 0 ? String(prR3(n)).replace('.', ',') : '';

/* Cabecera: turno activo (nombre, fecha, grupo) y estado */
function prCabTurno(t, a) {
  const pe = a && a.personal && a.personal.ok ? a.personal.nombre : null, grupo = pe || (t.grupo_nombre || '');
  return `<div class="pr-cabt"><span class="chip pr-turn">Turno ${prT(t.jornada || '')}</span><span>${prT(prFe(t.fecha))}</span>${grupo ? `<span class="muted">${prT(grupo)}</span>` : ''}<span class="chip ${t.iniciada ? 'c-ok' : ''}">${t.iniciada ? 'En producción' : 'Sin iniciar'}</span></div>
    ${t.vencido ? '<p class="pr-venc" role="status">Este turno ya pasó de su hora, pero sigue abierto hasta que lo cierres. Al cerrarlo empieza el siguiente.</p>' : ''}`;
}
/* Antes de iniciar: requisitos + datos + botón */
function prAntesDeIniciar(t, ok) {
  if (!PR.arr) { prCargar('arr', '/arranque', 'arr'); return card('', emptyState('Revisando los requisitos…', 'Un momento.')); }
  if (PR.arr.error) return card('', emptyState('No se pudo revisar', prT(PR.arr.error)));
  const a = PR.arr, pe = a.personal || {}, nombres = pe.ok ? pe.miembros.map(m => prT(m.nombre)).join(', ') : 'Sin personal cargado';
  const dat = `<ul class="pr-lin pr-dt"><li><span>Turno</span><b>${prT(a.jornada)}</b></li><li><span>Fecha</span><b>${prFe(a.fecha)}</b></li><li><span>Grupo</span><b>${pe.ok ? prT(pe.nombre) : 'Sin grupo'}</b></li><li class="pr-dt-p"><span>Personal</span><b>${nombres}</b></li></ul>
    ${ok ? `<div class="pr-abrir"><button type="button" class="btn pri pr-gran" data-act="prIniciar" ${a.ok ? '' : 'disabled aria-disabled="true"'}>Iniciar producción</button></div>${a.ok ? '' : '<p class="muted">El botón se enciende cuando todos los requisitos estén en verde.</p>'}` : '<p class="muted">Lo inicia Producción o el Gerente.</p>'}`;
  return `<div class="pr-asist pr-p1">${card('Requisitos para producir', prCondHTML(a), {cls: 'pr-condcard'})}${card('Datos del turno', dat)}</div>`;
}
/* Etapas: lista a la izquierda (hecha / en curso / pendiente) y la etapa de ahora a la derecha */
function prListaEtapas(t) {
  return `<ol class="pr-ets">${t.proceso.filter(e => e.k !== 'almacen_despacho').map(e => `<li class="pr-et ${e.estado === 'HECHA' ? 'hecha' : e.estado === 'EN_CURSO' ? 'ahora' : ''}"><span class="pr-n">${e.estado === 'HECHA' ? '✓' : e.orden}</span><span class="pr-en">${prT(e.nombre)}</span><span class="chip ${e.estado === 'HECHA' ? 'c-ok' : ''}">${e.estado === 'HECHA' ? 'Hecha' : e.estado === 'EN_CURSO' ? 'Ahora' : 'Pendiente'}</span></li>`).join('')}</ol>`;
}
function prEtapaAhora(t, ok) {
  const e = t.proceso.find(x => x.estado === 'EN_CURSO'); if (!e) return '';
  const kg = t.etapas.find(x => x.k === e.k), kils = t.etapas.map(x => x.k), i = kils.indexOf(e.k), ult = i === kils.length - 1;
  let campo = '', info = '';
  if (kg && i === 0) {
    const pa = PR.res && PR.res.insumos ? PR.res.insumos.find(x => /papa/i.test(x.nombre)) : null, hay = pa && pa.saldo > 0 ? pa.saldo : 0, ya = PR.res ? PR.res.papa_tomada_kg : 0;
    info = `<p class="pr-sub">Papa en el inventario: <b>${prKg(hay)}</b>${ya > 0 ? ' · ya tomada en este turno: <b>' + prKg(ya) + '</b>' : ''}. Lo que tomas baja del inventario general.</p>`;
    campo = `<label class="fld">Kilos de papa que entran al turno<input type="text" inputmode="decimal" id="pr-k" value="${prT(PR.v.k != null ? PR.v.k : ya > 0 ? '' : prIn(hay))}" placeholder="${ya > 0 ? 'Vacío: se usan los ' + prIn(ya) + ' ya tomados' : ''}" ${ok ? '' : 'disabled'} data-act-change="prEdit"></label>`;
  } else if (kg && !ult) {
    const entra = kg.entra_kg > 0 ? kg.entra_kg : kg.llego_kg, falta = Math.max(0, prR3(entra - kg.sale_kg));
    info = `<p class="pr-sub">Entran a esta etapa: <b>${prKg(entra)}</b>. Lo que no salga se anota como merma al cerrar el turno.</p>`;
    campo = `<label class="fld">Kilos que salen de ${prT(e.nombre)}<input type="text" inputmode="decimal" id="pr-k" value="${prT(PR.v.k != null ? PR.v.k : prIn(falta))}" ${ok ? '' : 'disabled'} data-act-change="prEdit"></label>`;
  } else if (kg && ult) {
    info = `<p class="pr-sub">Pasaron a esta etapa <b>${prKg(kg.entra_kg > 0 ? kg.entra_kg : kg.llego_kg)}</b>. Sus pasos (control de calidad, pesaje, sellado y armado) se cierran con la etapa. Los bultos los anota Logística.</p>`;
  } else info = '<p class="pr-sub">Cuando esté lista, márcala como terminada.</p>';
  const fri = e.k === 'fritado' && ok ? `<div class="pr-fri-b"><button type="button" class="btn" data-act="prFri">${PR.fri ? 'Ocultar' : '¿Quién fríe en este turno?'}</button></div>${PR.fri ? prFrituraHTML(t, ok) : ''}` : '';
  return card('Ahora: ' + prT(e.nombre), `${info}${campo}<p class="err" id="pr-e" role="alert" hidden></p>${ok ? `<div class="btnrow"><button type="button" class="btn pri pr-gran" data-act="prTerminar" data-e="${prT(e.k)}">Terminar etapa</button></div>` : '<p class="muted">Lo termina Producción.</p>'}${fri}`);
}
/* Cuando ya no quedan etapas: la merma se anota POR ETAPA (una fila por etapa entre la papa tomada y Empaque) y se cierra el turno */
const prMfTol = M => M.tolerancia_kg > 0 ? M.tolerancia_kg : 1;
function prMfFila(e, M, ok) {
  const s = PR.mf[e.k] || {}, on = prNum(s.kilos) > 0, mo = M.motivos.find(x => x.id === s.mot), otra = !!(mo && mo.es_otra), nom = prT(e.nombre);
  return `<li class="pr-mf-row ${on ? 'con' : ''}" data-e="${prT(e.k)}"><div class="pr-mf-h"><label for="pr-mf-${prT(e.k)}"><b>${nom}</b></label>
    <span class="pr-mf-in"><input type="text" inputmode="decimal" class="pr-mf-k" id="pr-mf-${prT(e.k)}" data-e="${prT(e.k)}" value="${prT(s.kilos || '')}" placeholder="0" aria-label="Kilos perdidos en ${nom}" ${ok ? '' : 'disabled'}><span class="muted">kg</span></span>
    ${ok ? `<button type="button" class="btn pr-mf-todo" data-act="prMfTodo" data-e="${prT(e.k)}" aria-label="Poner todo lo que falta del tramo en ${nom}">Poner todo aquí</button>` : ''}</div>
    <div class="pr-mf-m"><div class="pr-mots" role="group" aria-label="Motivo principal en ${nom}">${M.motivos.map(x => `<button type="button" class="btn pr-tog ${s.mot === x.id ? 'on' : ''}" data-act="prMfMot" data-e="${prT(e.k)}" data-id="${x.id}" aria-pressed="${s.mot === x.id}">${prT(x.nombre)}</button>`).join('')}</div>
    <input type="text" class="pr-mf-n" data-e="${prT(e.k)}" maxlength="120" placeholder="¿Qué fue?" aria-label="Qué fue la merma en ${nom}" value="${prT(s.nota || '')}" ${otra ? '' : 'hidden'}></div></li>`;
}
/* Lo que hay escrito en pantalla: {filas, nota} (kilos con coma o punto; fila vacía = sin pérdida) */
function prMfLeer() {
  document.querySelectorAll('.pr-mf-row').forEach(r => { const k = r.dataset.e, s = PR.mf[k] = PR.mf[k] || {}; s.kilos = r.querySelector('.pr-mf-k').value; s.nota = r.querySelector('.pr-mf-n').value; });
  const M = PR.mc, filas = [];
  for (const e of M.etapas) { const s = PR.mf[e.k]; if (s && prNum(s.kilos) > 0) filas.push({etapa: e.k, kilos: String(prNum(s.kilos)), id_motivo: s.mot || '', texto: s.nota || ''}); }
  const n = $('#pr-mf-nota'); if (n) PR.mfNota = n.value;
  return {filas, nota: PR.mfNota || ''};
}
/* Total en vivo: solo se actualiza la barra (no se vuelve a dibujar la lista) */
function prMfActualizar() {
  const M = PR.mc, barra = $('#pr-mf-tot'); if (!M || !barra) return;
  const d = prMfLeer(), S = prR3(d.filas.reduce((a, f) => a + Number(f.kilos), 0)), dif = prR3(M.calculada_kg - S), tol = prMfTol(M), cuadra = Math.abs(dif) <= tol && (S > 0 || M.calculada_kg <= tol);
  document.querySelectorAll('.pr-mf-row').forEach(r => { const s = PR.mf[r.dataset.e], mo = M.motivos.find(x => x.id === s.mot); r.classList.toggle('con', prNum(s.kilos) > 0); r.querySelector('.pr-mf-n').hidden = !(mo && mo.es_otra); });
  const txt = S === 0 && M.calculada_kg > tol ? 'Anota en qué etapa se perdió la papa.' : cuadra ? 'Cuadra' : dif > 0 ? `Faltan ${prKg(dif)} por explicar` : `Sobran ${prKg(-dif)}`;
  barra.className = 'pr-mf-tot ' + (cuadra ? 'ok' : 'warn');
  barra.innerHTML = `<span>Total anotado: <b>${prKg(S)}</b> de ${prKg(M.calculada_kg)}</span><b class="pr-mf-st">${cuadra ? '✓ ' : ''}${prT(txt)}</b>`;
  const nw = $('#pr-mf-notaw'); if (nw) nw.hidden = cuadra || S === 0;
}
document.addEventListener('input', ev => { const t = ev.target; if (t && t.classList && (t.classList.contains('pr-mf-k') || t.classList.contains('pr-mf-n') || t.id === 'pr-mf-nota')) prMfActualizar(); });
function prMfLista(M, ok) {
  const por = new Map(M.etapas.map(e => [e.k, e]));
  const grupos = M.tramos.length ? M.tramos : [{k: '', nombre: '', medido_kg: null, etapas: M.etapas.map(e => e.k)}];
  return grupos.map(g => { const fs = g.etapas.map(k => por.get(k)).filter(Boolean); if (!fs.length) return '';
    const a = fs[0].nombre, b = fs[fs.length - 1].nombre;
    return `<div class="pr-mf-g"><p class="pr-sub pr-mf-tr">${g.medido_kg != null ? `De ${prT(a)} a ${prT(b)} se perdieron <b>${prKg(g.medido_kg)}</b> (medido en ${prT(g.nombre)}). Repártelos entre las etapas.` : ''}</p><ul class="pr-mf-l">${fs.map(e => prMfFila(e, M, ok)).join('')}</ul></div>`; }).join('');
}
function prCierre(t, ok) {
  if (!PR.mc) { prCargar('mc', '/turno/merma', 'mc'); return card('', emptyState('Calculando la merma…', 'Un momento.')); }
  const M = PR.mc; if (M.error) return card('', emptyState('No se pudo cargar', prT(M.error)));
  const calc = `<p>Tomaste <b>${prKg(M.tomados_kg)}</b> de papa y pasaron <b>${prKg(M.a_empaque_kg)}</b> a Empaque. La merma calculada es <b class="pr-big">${prKg(M.calculada_kg)}</b>.</p>`;
  const R = M.registrada, editando = R && PR.mfEdit && ok;
  if (editando && !PR.mfCargado) { PR.mf = {}; for (const f of R.filas || []) PR.mf[f.etapa] = {kilos: prIn(f.kilos), mot: f.id_motivo, nota: f.texto || ''}; PR.mfNota = R.nota || ''; PR.mfCargado = true; }
  let cuerpo;
  if (R && !editando) {
    const filas = R.por_etapas ? R.filas.map(f => { const e = M.etapas.find(x => x.k === f.etapa); return `<li><span>${prT(e ? e.nombre : f.etapa)} · ${prT(f.motivo || '')}${f.texto ? ' (' + prT(f.texto) + ')' : ''}</span><b>${prKg(f.kilos)}</b></li>`; }).join('')
      : R.desglose.map(d => `<li><span>Todo el proceso · ${prT(d.motivo)}${d.texto ? ' (' + prT(d.texto) + ')' : ''}</span><b>${prKg(d.kilos)}</b></li>`).join('');
    cuerpo = `${calc}<p class="chip c-ok">Merma anotada: ${prKg(R.kilos)}</p>${filas ? `<ul class="pr-lin">${filas}</ul>` : ''}${Math.abs(R.sin_explicar_kg) > 0.0004 ? `<p class="pr-sub"><b>Sin explicar: ${prKg(R.sin_explicar_kg)}</b></p>` : ''}${R.nota ? `<p class="pr-sub">${prT(R.nota)}</p>` : ''}`
      + (ok && R.por_etapas !== undefined ? `<div class="btnrow"><button type="button" class="btn" data-act="prMfCorregir">Corregir</button></div>` : '');
  } else if ((M.a_empaque_kg > 0 && ok) || editando) {
    cuerpo = `${calc}<p class="hint">Anota cuántos kilos se perdieron en cada etapa y el motivo principal. Deja vacía la etapa donde no se perdió nada. No se descuenta otra vez del inventario.</p>${prMfLista(M, ok)}
      <div class="pr-mf-tot" id="pr-mf-tot" role="status" aria-live="polite"></div>
      <label class="fld" id="pr-mf-notaw" hidden>Por qué no cuadra (obligatorio)<input type="text" id="pr-mf-nota" maxlength="200" value="${prT(PR.mfNota || '')}"></label>
      <p class="err" id="pr-e" role="alert" hidden></p>${editando ? `<div class="btnrow"><button type="button" class="btn pri pr-gran" data-act="prMfGuardar">Guardar corrección</button><button type="button" class="btn pr-gran" data-act="prMfCancelar">Cancelar</button></div>` : ''}`;
    setTimeout(prMfActualizar, 0);
  } else cuerpo = `${calc}<p class="muted">${ok ? '' : 'Lo anota Producción.'}</p>`;
  const bt = t.bultos_por_producto || [];
  const emp = bt.length ? `<ul class="pr-lin">${t.empaque.map(x => `<li><span>${prT(x.nombre)}</span><span class="muted">${prN(x.bultos)} bultos</span></li>`).join('')}</ul>` : '<p class="muted">Todavía no se anotó nada empacado (lo anota Logística).</p>';
  return `<div class="pr-asist pr-p1">${card('Merma del proceso', cuerpo)}${card('Empacado y cierre', emp + (ok && !editando ? `<div class="btnrow pr-cierre"><button type="button" class="btn pri pr-gran" data-act="prCerrarPaso">${M.registrada ? 'Cerrar turno' : 'Anotar merma y cerrar turno'}</button></div>` : ''))}</div>`;
}
/* La pestaña «Producir» (la vista del turno activo) */
function scrAsistente() {
  const w = prEspera('Producir', 'turno', '/turno', 'turno'); if (w) return w;
  const D = PR.turno, t = D.turno, ok = prTurnoOk();
  if (!t) { const a = PR.arr; return (a && !a.error ? `<div class="pr-cabt"><span class="chip pr-turn">Turno ${prT(a.jornada || '')}</span><span>${prT(prFe(a.fecha))}</span><span class="chip">Sin iniciar</span></div>` : '') + prAntesDeIniciar(null, ok); }
  if (!PR.res) prCargar('res', '/turno/resumen', 'res');
  if (!t.iniciada) return prCabTurno(t, PR.arr) + prAntesDeIniciar(t, ok);
  PR.arr = null;
  if (t.todas_terminadas) return prCabTurno(t) + prCierre(t, ok);
  return `${prCabTurno(t)}<div class="pr-asist pr-p1">${card('Etapas del proceso', prListaEtapas(t))}<div>${prEtapaAhora(t, ok)}</div></div>`;
}
/* Un solo botón: pide confirmar con el resumen y luego anota la merma (si falta) y cierra el turno */
function prCerrarPaso() {
  const M = PR.mc, t = PR.turno && PR.turno.turno; if (!M || !t) return;
  PR.mcd = M.registrada ? null : prMfLeer();
  const bt = (t.bultos_por_producto || []).reduce((a, x) => a + x.bultos, 0), S = PR.mcd ? prR3(PR.mcd.filas.reduce((a, f) => a + Number(f.kilos), 0)) : 0, ne = PR.mcd ? PR.mcd.filas.length : 0;
  const kg = M.registrada ? M.registrada.kilos : S, en = M.registrada ? (M.registrada.filas || []).length : ne;
  modal('Cerrar el turno', `<div class="form"><p>${M.registrada || M.tomados_kg > 0 ? `Merma del proceso: <b>${prKg(kg)}</b>${en ? ' en ' + en + (en === 1 ? ' etapa' : ' etapas') : ''}. ` : ''}Se cierra el turno y los <b>${prN(bt)} bultos</b> empacados se suman al inventario.</p><p class="err" id="pr-e2" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri pr-gran" data-act="prCerrarYa">Sí, cerrar el turno</button><button type="button" class="btn pr-gran" data-act="closeModal">Todavía no</button></div></div>`);
}
async function prCerrarYa() {
  if (PR.busy) return; PR.busy = true; const e = () => $('#pr-e2') || $('#pr-e'), M = PR.mc, t = PR.turno.turno;
  const etapas = {}; for (const x of t.etapas) etapas[x.k] = String(x.saldo_kg); const bultos = {}; for (const b of t.bultos_por_producto || []) bultos[b.id_producto] = b.bultos;
  try {
    if (!M.registrada && M.tomados_kg > 0) { try { await prApi('POST', '/turno/merma', PR.mcd || {filas: []}); } catch (er) { const x = e(); x.textContent = er.message; x.hidden = false; return; } }
    await prCerrarEnviar({etapas, bultos}); PR.v = {}; PR.mf = {}; PR.mfNota = ''; PR.mfEdit = false; PR.mfCargado = false; PR.res = null; PR.mc = null; PR.rs = {}; render();
  } catch (er) {
    if (er.codigo === 'FALTAN_MOTIVOS' && er.datos && er.datos.faltan) { PR.busy = false; PR.mc = null; prCzIniciar({etapas, bultos}, er.datos); }
    else { PR.mc = null; const x = e(); if (x) { x.textContent = er.message; x.hidden = false; } else toast(esc(er.message), 'err'); }
  } finally { PR.busy = false; }
}
/* «Terminar etapa»: manda los kilos (si la etapa los lleva) y el servidor decide */
async function prTerminar(k) {
  if (PR.busy) return; PR.busy = true;
  try {
    const campo = $('#pr-k'), base = {etapa: k}; if (campo) base.kilos = String(prNum(campo.value) || '').replace(',', '.');
    try { const r = await prApi('POST', '/turno/etapa/terminar', base); PR.v = {}; PR.res = null; PR.mc = null; if (r.mensaje) toast(esc(r.mensaje)); prRefrescar('turno', 'proc', 'por'); }
    catch (er) {
      if (er.codigo === 'EXCEDE_HEREDADO') { PR.busy = false; prExcesoModal('/turno/etapa/terminar', base, Object.assign({error: er.message}, er.datos || {})); }
      else { const x = $('#pr-e'); if (x) { x.textContent = er.message; x.hidden = false; } else toast(esc(er.message), 'err'); }
    }
  } finally { PR.busy = false; }
}
Object.assign(ACT_REQ, {prIniciar: ['pr-turno', 2], prTerminar: ['pr-turno', 2], prMfMot: ['pr-turno', 2], prMfTodo: ['pr-turno', 2], prMfCorregir: ['pr-turno', 2], prMfGuardar: ['pr-turno', 2], prMfCancelar: ['pr-turno', 2], prCerrarPaso: ['pr-turno', 2], prCerrarYa: ['pr-turno', 2]});
Object.assign(ACT_LBL, {prIniciar: 'iniciar la producción', prTerminar: 'terminar etapas', prCerrarPaso: 'cerrar el turno', prCerrarYa: 'cerrar el turno', prMfGuardar: 'corregir la merma'});
['prIniciar', 'prTerminar', 'prCerrarPaso', 'prCerrarYa', 'prMfGuardar'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  prIniciar: () => prAccion(async () => { await prApi('POST', '/turno/iniciar', {}); PR.arr = null; PR.res = null; prRefrescar('turno', 'proc'); }, 'Producción iniciada.'),
  prTerminar: el => prTerminar(el.dataset.e), prEdit: el => { PR.v.k = el.value; },
  prFri: () => { PR.fri = !PR.fri; render(); },
  prCerrarPaso: () => prCerrarPaso(), prCerrarYa: () => prCerrarYa(),
  prMfMot: el => { prMfLeer(); const k = el.dataset.e, id = +el.dataset.id, s = PR.mf[k] = PR.mf[k] || {}; s.mot = s.mot === id ? null : id; render(); },
  prMfTodo: el => { prMfLeer(); const k = el.dataset.e, M = PR.mc, g = M.tramos.find(x => x.etapas.includes(k)); if (!g) return;
    const otros = g.etapas.filter(x => x !== k).reduce((a, x) => a + prNum((PR.mf[x] || {}).kilos), 0), falta = prR3(g.medido_kg - otros); (PR.mf[k] = PR.mf[k] || {}).kilos = falta > 0 ? prIn(falta) : ''; render(); },
  prMfCorregir: () => { PR.mfEdit = true; PR.mfCargado = false; render(); },
  prMfCancelar: () => { PR.mfEdit = false; PR.mfCargado = false; render(); },
  prMfGuardar: async () => {
    if (PR.busy) return; PR.busy = true; const d = prMfLeer();
    try { await prApi('POST', '/turno/merma/corregir', d); PR.mfEdit = false; PR.mfCargado = false; PR.mc = null; PR.res = null; toast('Merma corregida.'); render(); }
    catch (er) { const x = $('#pr-e'); if (x) { x.textContent = er.message; x.hidden = false; } else toast(esc(er.message), 'err'); } finally { PR.busy = false; }
  }
});
