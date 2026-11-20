import {opcion, pestana} from '../ayudas.mjs';
/* Administración. ideal = camino mínimo teórico: 1 entrar al puesto + abrir (1 botón en el inicio) + elecciones + 1 confirmar. */
export default [
  {id: 'adm-hacer-compra', puesto: 'adm', nombre: 'Hacer una compra (pedido a proveedor)', frecuencia: 'diaria', ideal: {abrir: 1, elecciones: 1, teclas: 3},
   pasos: [{clic: 'Nueva compra'}, {clic: 'Agrícola Páramo'}, {escribe: [{css: '#main input[type=text]'}, '10']}, {escribe: [{css: '#main input[type=text]', nth: 1}, '5']}, {escribe: ['Nº de factura', 'F-001']}, {clic: 'HACER LA COMPRA'}, {aviso: 'hecha'}]},
  {id: 'adm-pagar-proveedor', puesto: 'adm', nombre: 'Pagar una factura a un proveedor', frecuencia: 'diaria', ideal: {abrir: 1, elecciones: 1},
   pasos: [...opcion('#cxp'), {clic: {css: '[data-act=pagar]'}}, {aviso: 'registrado'}]},
  {id: 'adm-gasto-caja', puesto: 'adm', nombre: 'Anotar un gasto de caja chica', frecuencia: 'diaria', ideal: {abrir: 1, elecciones: 1, teclas: 8},
   pasos: [...opcion('#cxp'), {clic: 'Caja chica'}, {escribe: [{css: '#cc-num'}, 'G-1']}, {escribe: [{css: '#cc-prov'}, 'Ferretería']}, {escribe: [{css: '#cc-rif'}, 'J-123456789']}, {escribe: [{css: '#cc-monto'}, '15']}, {escribe: [{css: '#cc-just'}, 'Compra de repuestos']}, {clic: 'Registrar gasto'}, {aviso: 'gasto'}]},
  {id: 'adm-cobrar-cliente', puesto: 'adm', nombre: 'Registrar el cobro a un cliente', frecuencia: 'diaria', ideal: {abrir: 1, elecciones: 3, teclas: 11},
   pasos: [{clic: 'Cobranza'}, {clic: 'Registrar cobro'}, {clic: 'Abasto El Puente'}, {clic: 'Todo', nth: 0}, {escribe: ['Monto recibido', '52500']}, {elige: ['Banco', 'Banesco']}, {escribe: ['Número de referencia', '123456']}, {clic: 'Registrar pago'}, {aviso: 'pago'}]},
  {id: 'adm-pedir-cambio-precio', puesto: 'adm', nombre: 'Pedir un cambio de precio (para aprobar)', frecuencia: 'semanal', ideal: {abrir: 1, elecciones: 1, teclas: 2},
   pasos: [...opcion('#p-precios'), {clic: {css: '[data-act=pEditar]'}}, {escribe: [{css: '#p-nuevo'}, '13']}, {clic: 'Enviar para aprobar'}, {aviso: 'enviado'}]},
  {id: 'adm-vehiculo-nuevo', puesto: 'adm', nombre: 'Agregar un vehículo a la flota', frecuencia: 'ocasional', ideal: {abrir: 1, elecciones: 1, teclas: 8},
   pasos: [...opcion('#fl-flota'), {clic: 'Agregar vehículo'}, {escribe: [{css: '#fl-placa'}, 'AB123CD']}, {escribe: [{css: '#fl-marca'}, 'Ford']}, {clic: 'Guardar'}, {aviso: 'Vehículo agregado'}]},
  {id: 'adm-bonos-aplicar', puesto: 'adm', nombre: 'Aplicar un bono', frecuencia: 'semanal', ideal: {abrir: 1, elecciones: 1},
   pasos: [...opcion('#rh-bonos'), {clic: 'Bonos y metas'}, {clic: 'Aplicar ahora'}, {aviso: 'Bono aplicado'}]},
];
