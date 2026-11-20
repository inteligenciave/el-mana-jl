/* Quién fríe: solo operadores de planta, sin supervisores; primero quien marcó entrada, luego Fritura. Prueba pura, sin servidor. */
import assert from 'node:assert/strict';
import {operadoresPlanta, esSupervisor} from '../produccion/servicio.js';
const e = (id, n, area, cargo, extra = {}) => ({id, n, area, cargo, ...extra});
const emps = [e('A', 'Ana Gerente', 'Directiva', 'Gerente'), e('B', 'Beto Admin', 'Administración', 'Administrador'), e('C', 'Carlos Chofer', 'Despacho / Choferes', ''), e('D', 'Dora Sup', 'Fritura', 'Supervisor de Producción'),
  e('F', 'Fabio Fríe', 'Fritura', 'Cocineros'), e('G', 'Gil Cocina', 'Cocina', 'Cocineros'), e('H', 'Hugo Almacén', 'Almacén', 'Almacén'), e('V', 'Vera Ventas', 'Ventas', 'Vendedor'), e('R', 'Rosa RRHH', 'Recursos humanos', ''), e('M', 'Mario Mant', 'Mantenimiento', 'Mecánicos Industriales'), e('Z', 'Zoe Empaque', 'Empaque', 'Supervisor de Empaque')];
let r = operadoresPlanta(emps);

assert.equal(r[0].id, 'F', 'Fritura primero');
for (const x of ['A', 'B', 'C', 'D', 'V', 'R', 'Z']) assert.ok(!r.some(y => y.id === x), x + ' no debe salir');
assert.deepEqual(r.map(x => x.id).sort(), ['F', 'G', 'H', 'M']);
r = operadoresPlanta(emps, new Set(['H']));
assert.equal(r[0].id, 'H'); assert.equal(r[1].id, 'F'); assert.ok(r[0].con_entrada);
assert.ok(esSupervisor({cargo: 'Supervisor de Cocina'}) && !esSupervisor({cargo: 'Cocineros'}));
console.log('ok operadores-fritura');
