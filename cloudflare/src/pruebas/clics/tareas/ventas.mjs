import {opcion} from '../ayudas.mjs';
const CLI = pas => pas;
const NUEVO = [{puesto: 'ventas', pasos: [{clic: 'Cliente nuevo'}, {escribe: [{css: '#vc-rs'}, 'Bodega Venta Prueba']}, {escribe: [{css: '#vc-rif'}, 'J-111222333']}, {elige: [{css: '#vc-zona'}, 'Aragua']}, {elige: [{css: '#vc-cat'}, 'Minorista']}, {elige: [{css: '#vc-vend'}, '']}, {clic: 'Guardar'}, {aviso: 'guardado'}]}];
export default [
  {id: 'ven-vender', puesto: 'ventas', nombre: 'Hacer una venta (pedido con nota de entrega)', frecuencia: 'diaria', previo: NUEVO, ideal: {abrir: 0, elecciones: 1, teclas: 1},
   pasos: [{escribe: [{css: 'input[type=search]'}, 'Venta Prueba']}, {clic: 'Bodega Venta Prueba'}, {escribe: ['Bultos de Papas Doraditas Cabello de Ángel 400 g', '2']}, {elige: ['Método de pago', 'Banesco']}, {clic: 'REGISTRAR PEDIDO · NOTA DE ENTREGA'}, {aviso: 'Pedido PED'}]},
  {id: 'ven-cliente-nuevo', puesto: 'ventas', nombre: 'Crear un cliente nuevo', frecuencia: 'semanal', ideal: {abrir: 1, elecciones: 2, teclas: 20},
   pasos: [{clic: 'Cliente nuevo'}, {escribe: [{css: '#vc-rs'}, 'Bodega Prueba Clics']}, {escribe: [{css: '#vc-rif'}, 'J-987654321']}, {elige: [{css: '#vc-zona'}, 'Aragua']}, {escribe: [{css: '#vc-dir'}, 'Calle 1']}, {escribe: [{css: '#vc-tel'}, '04141234567']}, {elige: [{css: '#vc-cat'}, 'Minorista']}, {elige: [{css: '#vc-vend'}, '']}, {clic: 'Guardar'}, {aviso: 'Cliente guardado'}]},
];
