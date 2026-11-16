/* Logística · «Empacar por turno»: Logística anota los bultos empacados sobre el turno que abrió Producción.
   Usa el mismo turno (/api/p/turno); al cerrarlo Producción, lo empacado suma al inventario único. Sin precios ni dinero. */
function scrEmpacar() {
  const w = prEspera('Empacar por turno', 'turno', '/turno', 'turno'); if (w) return w;
  const D = PR.turno, t = D.turno, ok = prEmpacaOk();
  if (!t) return `${ph('Logística', 'Empacar por turno', 'Aquí se anotan los bultos empacados del turno.', '')}${card('', '<p>Todavía no hay un turno abierto.</p><p class="muted">Lo abre Producción. Cuando esté abierto, vuelve aquí para anotar lo empacado.</p>')}`;
  const prods = D.productos.map(p => `<option value="${p.id_producto}">${prT(p.nombre)}</option>`).join('');
  return `${ph('Logística', 'Empacar por turno', 'Turno del ' + prT(t.fecha) + '. Anota los bultos que se empacan; al cerrar el turno suman al inventario.', '')}
    ${card('Anotar lo empacado', ok ? `<div class="pr-mov"><select id="pr-prod" aria-label="Producto">${prods}</select><input type="text" inputmode="numeric" id="pr-b" placeholder="Bultos" aria-label="Bultos empacados"><button type="button" class="btn sm pri" data-act="prEmp">Anotar</button></div>` : '<p class="muted">Tu puesto solo consulta lo empacado.</p>')}
    ${card('Empacado en este turno', t.bultos_por_producto.length ? `<ul class="pr-lin">${t.empaque.map(x => `<li><span>${prT(x.nombre)}</span><span class="muted">${prN(x.bultos)} bultos</span></li>`).join('')}</ul>` : '<p class="muted">Todavía no se anotó nada empacado.</p>')}`;
}
Object.assign(PERM_DEF, {'lg-empacar': 'empaque:2'});
Object.assign(SCREENS, {'lg-empacar': {mod: 'prod', g: 'Logística', t: 'Empacar por turno', s: 'Empacar', ic: 'pack', r: scrEmpacar}});
S.perm = permInit();
