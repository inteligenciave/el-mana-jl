import {opcion} from '../ayudas.mjs';
/* Una compra hecha por Administración (para que Producción tenga algo que recibir). No se cuenta. */
const COMPRA = [{puesto: 'adm', pasos: [{clic: 'Nueva compra'}, {clic: 'Agrícola Páramo'}, {escribe: [{css: '#main input[type=text]'}, '10']}, {escribe: [{css: '#main input[type=text]', nth: 1}, '5']}, {escribe: ['Nº de factura', 'F-001']}, {clic: 'HACER LA COMPRA'}, {aviso: 'hecha'}]}];
const PASOS_RECIBIR = [{clic: 'Recibir'}, {clic: {css: '[data-act=crElegir]'}}, {escribe: [{css: '#main input[type=text]'}, '10']}, ...[1, 2, 3, 4, 5].map(n => ({escribe: ['Saco ' + n, '43']})), {clicHasta: 'RECIBIR', aviso: 'recibida'}];
const RECIBIR = [{puesto: 'produccion', pasos: PASOS_RECIBIR}];
export default [
  {id: 'prod-recibir-compra', puesto: 'produccion', nombre: 'Recibir una compra de papa (sacos y 5 de muestra)', frecuencia: 'diaria', previo: COMPRA, ideal: {abrir: 1, elecciones: 1, teclas: 12},
   pasos: PASOS_RECIBIR},
  {id: 'prod-turno-completo', puesto: 'produccion', nombre: 'Turno de producción completo (abrir, tomar papa, etapas, merma y cerrar)', frecuencia: 'diaria', previo: [...COMPRA, ...RECIBIR], ideal: {abrir: 0, elecciones: 3, confirmar: 2, teclas: 5},
   pasos: [{clic: 'Abrir turno'}, {clic: 'Abrir turno N'}, {hito: 'abrir turno'}, {escribe: [{css: '#pr-rec-k'}, '300']}, {clic: 'Tomar papa'}, {hito: 'tomar papa'}, {clic: 'Marcar todas hechas'}, {aviso: 'todas las etapas'}, {hito: 'etapas'}, {pausa: 1500}, {clic: 'Anotar merma y cerrar turno'}, {clic: 'Sí, cerrar el turno'}, {aviso: 'cerrado'}]},
];
