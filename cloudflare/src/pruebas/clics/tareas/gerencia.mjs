import {opcion, pestana} from '../ayudas.mjs';
const PRECIO_PEDIDO = [{puesto: 'adm', pasos: [...opcion('#p-precios'), {clic: {css: '[data-act=pEditar]'}}, {escribe: [{css: '#p-nuevo'}, '13']}, {clic: 'Enviar para aprobar'}, {aviso: 'enviado'}]}];
const SOLIC = [{puesto: 'adm', pasos: [{clic: 'Autorización'}, {clic: 'Pedir autorización'}, {escribe: [{css: '#so-tx'}, 'Meta de ventas']}, {escribe: [{css: '#so-mo'}, 'Subió el mercado']}, {clic: 'Enviar solicitud'}]}];
export default [
  {id: 'ger-ver-resumen', puesto: 'dueno', nombre: 'Ver el resumen del mes (ventas, compras, producción)', frecuencia: 'diaria', ideal: {abrir: 0, confirmar: 0},
   pasos: [{ver: 'Punto de equilibrio'}]},
  {id: 'ger-aprobar-precio', puesto: 'dueno', nombre: 'Aprobar un cambio de precio', frecuencia: 'diaria', previo: PRECIO_PEDIDO, ideal: {abrir: 1, confirmar: 1},
   pasos: [...opcion('#p-aprobar'), {clic: 'Aprobar'}, {aviso: 'aprob'}]},
  {id: 'ger-fijar-meta', puesto: 'dueno', nombre: 'Fijar la meta de ventas del mes', frecuencia: 'mensual', ideal: {abrir: 1, elecciones: 0, teclas: 6},
   pasos: [{clic: 'Fijar meta'}, {escribe: [{css: '#meta-v'}, '250000']}, {clic: 'Guardar meta'}, {aviso: 'meta'}]},
  {id: 'ger-minimo-inventario', puesto: 'dueno', nombre: 'Definir el mínimo de un insumo (inventario)', frecuencia: 'ocasional', ideal: {abrir: 1, teclas: 3},
   pasos: [{clic: 'Definir mínimo'}, {escribe: [{css: '#inv-min'}, '500']}, {clic: 'Guardar mínimo'}, {aviso: 'mínimo'}]},
  {id: 'ger-agregar-banco', puesto: 'dueno', nombre: 'Agregar una cuenta bancaria de la empresa', frecuencia: 'ocasional', ideal: {abrir: 1, elecciones: 1, teclas: 60},
   pasos: [...opcion('#politicas'), {clic: 'Bancos'}, {clic: 'Agregar banco'}, {escribe: [{css: '#bk-n'}, 'Banco Prueba']}, {escribe: [{css: '#bk-c'}, '01020000000000000001']}, {escribe: [{css: '#bk-t'}, 'Empresa Prueba']}, {escribe: [{css: '#bk-tel'}, '04141234567']}, {escribe: [{css: '#bk-ced'}, 'V-12345678']}, {escribe: [{css: '#bk-rif'}, 'J-123456789']}, {clic: 'Guardar'}, {aviso: 'banco'}]},
  {id: 'ger-aprobar-solicitud', puesto: 'dueno', nombre: 'Responder una solicitud de autorización de un puesto', frecuencia: 'semanal', previo: SOLIC, ideal: {abrir: 1, confirmar: 1},
   pasos: [{clic: 'Solicitudes'}, {ver: '§§'}]},
  {id: 'ger-ver-auditoria', puesto: 'dueno', nombre: 'Revisar la auditoría (quién hizo qué)', frecuencia: 'semanal', ideal: {abrir: 1, confirmar: 0},
   pasos: [...opcion('#g-audit'), {ver: 'uditor'}]},
  {id: 'ger-cambiar-puesto', puesto: 'dueno', nombre: 'Pasar a mirar otro puesto (ej. Producción)', frecuencia: 'diaria', ideal: {abrir: 1, confirmar: 0},
   pasos: [{clic: {css: '#side a[href="#pr-turno"]'}}, {ver: 'Producir'}]},
];
