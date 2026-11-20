/* Tiempo real: las vistas que se leen del servidor se repiden solas. Comprueba que lo necesario quedó armado en public/index.html
   y que el estado de «Existencias consolidadas» distingue sin existencia / sin mínimo. Uso: node src/pruebas/tiempo-real.prueba.mjs */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const h = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(/const Vivo = window\.Vivo/.test(h), 'existe el registro de vistas vivas');
ok((h.match(/Vivo\.reg\(/g) || []).length >= 3, 'Producción, Recibir y Gerencia se registran');
ok(/Vivo\.tick\(\)/.test(h) && (h.match(/Vivo\.tick\(\)/g) || []).length >= 3, 'el sondeo y los cambios propios disparan el refresco');
ok(/setInterval\(\(\) => \{ if \(!document\.hidden\) pull\(false\); \}, 5000\)/.test(h), 'sondeo cada 5 s');
ok(/'Sin existencia', 'crit'/.test(h) && /'Sin mínimo definido', 'n'/.test(h), 'estado de existencias sin «Suficiente» falso');
/* El refresco no debe quitar el foco: usa softRender, que espera si alguien escribe */
ok(/set\(n\); softRender\(\)/.test(h), 'redibuja con softRender');
console.log(n + ' pruebas de tiempo real pasaron.');
