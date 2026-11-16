/* PRIMEROS PASOS (dentro de «Ayuda»): guía con casillas, barra de avance y botón «Ir aquí».
   Cada puesto ve SOLO los pasos cuya pantalla puede ver. Todo lo escrito aquí sale de los nombres reales de botones y campos del sistema. */
(function () {
"use strict";
const SEC = [
  ['Para empezar desde cero', 'Lo que se prepara una sola vez, antes de trabajar.'],
  ['El día a día', 'Lo que se hace todos los días.'],
  ['Cierre de quincena y mes', 'Para pagar, revisar y dejar todo en orden.'],
  ['Qué hacer cuando algo sale mal', 'Nada se pierde: lo que se quita queda anulado, con su motivo.']
];
/* s: sección (1 a 4) · k: pantalla a la que lleva «Ir aquí» · n: nivel mínimo en esa pantalla (por defecto 1) · r: solo estos puestos
   clic: botón de dentro que se toca al llegar ({sel} o {tab}) · acc: acción sin pantalla · t: título · h: qué hacer · p: para qué sirve */
const PASOS = [
  /* ---------- 1 · Para empezar desde cero ---------- */
  {id: 'a-banco', s: 1, k: 'p-bancos', r: ['dueno'], t: 'Anota los bancos de la empresa',
    h: 'Pulsa «Agregar banco». Escribe el nombre del banco, la moneda de la cuenta, el número de cuenta y el titular, y pulsa «Guardar». Para ir más rápido usa «Bancos sugeridos» y pulsa «Agregar todos».',
    p: 'Así cada cobro y cada pago dice en qué banco se hizo. La tasa del dólar no se escribe: se lee sola del BCV y sale arriba, en «Tasa BCV USD → Bs».'},
  {id: 'a-personal', s: 1, k: 'personal', n: 2, t: 'Agrega a las personas que trabajan',
    h: 'En «Personas», tarjeta «Agregar persona»: escribe nombre y apellido, cédula, cargo, área, fecha de ingreso y teléfono. Elige «Se le paga por» (Día u Hora), la tarifa en Bs y el «Turno de trabajo» (Mañana o Tarde). Pulsa «Agregar persona».',
    p: 'Sin turno no se puede marcar la entrada («Falta el turno en Personal»). Si maneja un vehículo, activa «Es chofer».'},
  {id: 'a-params', s: 1, k: 'rh-params', r: ['dueno'], t: 'Define los horarios, las reglas de pago y el bono',
    h: 'En «Horario por turno» pon cuándo entran y salen la Mañana y la Tarde. En «Reglas de pago de nómina» pon la jornada completa (horas), el recargo de hora extra (%) y las deducciones de ley (%). En «Bono de producción» elige «Por kilo» o «Monto fijo» y la meta de kilos por turno. Pulsa «Guardar parámetros».',
    p: 'Con esto el sistema calcula solo las horas extra, las deducciones y los bonos de la nómina.'},
  {id: 'a-params-ver', s: 1, k: 'rh-params', r: ['adm', 'rrhh'], t: 'Mira los parámetros de turnos y bonos',
    h: 'Aquí ves el horario por turno, las reglas de pago de nómina y el bono de producción. Solo Gerencia los cambia. Si hace falta un cambio, pulsa «Pedir autorización».',
    p: 'Así sabes con qué reglas se calculan la nómina y los bonos.'},
  {id: 'a-producto', s: 1, k: 'v-clientes', r: ['dueno'], clic: {sel: '[data-act="vAdmTab"][data-v="productos"]'}, t: 'Crea los productos',
    h: 'En la pestaña de productos e inventario pulsa «Producto nuevo». Escribe SKU, nombre, gramaje, categoría (Papas o Salsas) e IVA (%), y pulsa «Guardar». En cada fila hay «Editar», «Peso de bulto» y «Entrada».',
    p: 'Sin productos no se puede vender ni empacar.'},
  {id: 'a-inicial', s: 1, k: 'pr-inv', r: ['dueno'], t: 'Carga el conteo inicial de producto terminado',
    h: 'Pulsa «Cargar el conteo inicial», llena el conteo y pulsa «Guardar el conteo». Solo se hace una vez.',
    p: 'Desde ese día las existencias empiezan con la cifra real.'},
  {id: 'a-precios', s: 1, k: 'p-precios', t: 'Pon los precios por lista',
    h: 'En «Por lista» elige «Lista A» o «Lista B» y toca el precio que quieres cambiar. Si eres Gerente pulsa «Cambiar precio»; si eres de Administración pulsa «Enviar para aprobar». En «Estados y listas» ves qué lista usa cada estado.',
    p: 'Cada cliente paga según la lista de su estado.'},
  {id: 'a-aprobar', s: 1, k: 'p-aprobar', r: ['dueno'], t: 'Aprueba los precios que te piden',
    h: 'Revisa cada cambio y pulsa «Aprobar» o «Rechazar». Si quieres, escribe un motivo.',
    p: 'Un precio nuevo solo vale cuando Gerencia lo aprueba.'},
  {id: 'a-cliente', s: 1, k: 'v-clientes', n: 2, clic: {sel: '[data-act="vAdmTab"][data-v="clientes"]'}, t: 'Registra a tus clientes',
    h: 'En «Clientes» pulsa «Cliente nuevo». Escribe razón social o nombre y RIF o identificación. El estado del cliente es obligatorio: de él salen la zona y la lista de precios. Agrega dirección de entrega, vendedor, modalidad habitual y teléfono, y pulsa «Guardar».',
    p: 'Sin cliente no se puede hacer una venta. También puedes crearlo con «Cliente nuevo» al hacer la venta.'},
  {id: 'a-prov', s: 1, k: 'catalogos', n: 2, t: 'Registra a tus proveedores',
    h: 'En «Proveedores» pulsa «Nuevo proveedor». Escribe nombre, RIF, qué vende y condición de pago, y pulsa «Guardar».',
    p: 'Los proveedores se eligen después al recibir mercancía y al hacer compras.'},
  {id: 'a-flota', s: 1, k: 'fl-flota', r: ['dueno', 'adm'], t: 'Agrega los vehículos',
    h: 'Pulsa «Agregar vehículo». Escribe placa, tipo, marca y modelo, capacidades, estado, chofer habitual y cuándo vencen el seguro y los documentos. Pulsa «Guardar».',
    p: 'Al despachar eliges el vehículo y el chofer de esta lista.'},
  {id: 'a-equipo', s: 1, k: 'catprod', n: 2, r: ['dueno', 'jefeprod', 'recep'], t: 'Agrega a quien recibe la mercancía',
    h: 'En «Equipo», tarjeta «Quién recibe», pulsa «Agregar persona» y luego «Agregar».',
    p: 'Recibir pide elegir «Quién recibe». Si no hay nadie, dice «Sin personal: agrégalo en Equipo y flota».'},
  {id: 'a-pin', s: 1, k: 'v-clientes', r: ['dueno'], clic: {sel: '[data-act="vAdmTab"][data-v="ajustes"]'}, t: 'Crea el PIN de gerencia',
    h: 'En «Ajustes», en «PIN de gerencia», pulsa «Crear PIN» (de 4 a 12 números). Ahí mismo puedes llenar el «Membrete de los documentos» y pulsar «Guardar ajustes».',
    p: 'El PIN se pide para anotar un pago con fecha pasada y para perdonar mora.'},
  {id: 'a-pol', s: 1, k: 'politicas', n: 2, r: ['dueno', 'custodio'], t: 'Revisa las reglas de caja y nómina',
    h: 'Revisa el «Fondo fijo ($)», el «Umbral de compra de contado ($)», «Reponer cuando quede menos de (%)» y la «Tolerancia de peso en recepción (%)». En préstamos mira los días de entrega en el mes, el tope por empleado ($) y las cuotas máximas. Pulsa «Guardar políticas».',
    p: 'Son las reglas que usa el sistema para caja, compras y préstamos.'},

  /* ---------- 2 · El día a día ---------- */
  {id: 'd-recibir', s: 2, k: 'recepcion', n: 2, t: 'Recibe la mercancía',
    h: 'Elige «¿Qué llegó?» (Materia prima o Insumo). Escoge producto, proveedor y «Quién recibe», y marca la calidad (A, B, C o Rechazo parcial). Anota los sacos o bultos y las pesadas de «Pesaje por muestra». Pulsa «Guardar y enviar a Administración».',
    p: 'Administración valida lo que llegó antes de volverlo compra.'},
  {id: 'd-validar', s: 2, k: 'compras-mp', n: 3, t: 'Valida lo que llegó',
    h: 'En «Por validar» revisa la recepción, escribe el «Precio unitario» y la «Condición», y pulsa «Validar y generar compra efectiva».',
    p: 'Si la compra es a crédito, pasa a «Por pagar».'},
  {id: 'd-compra', s: 2, k: 'c-pedido', n: 2, t: 'Haz una compra',
    h: 'Elige el proveedor (o «Nuevo proveedor») y agrega los productos. Escribe el número y la fecha de la factura del proveedor, elige «¿Cómo se paga?» (banco o cuenta, plazo en días) y pulsa «HACER LA COMPRA».',
    p: 'La compra queda anotada con su proveedor y su forma de pago.'},
  {id: 'd-otras', s: 2, k: 'compras-gen', n: 2, t: 'Anota otras compras',
    h: 'Escribe qué se compró, el proveedor, el monto y la partida contable. El «Motivo de la compra» es obligatorio. Pulsa «Registrar compra».',
    p: 'Así toda compra queda con su motivo.'},
  {id: 'd-turno', s: 2, k: 'pr-turno', n: 2, t: 'Abre y llena el turno',
    h: 'Pulsa «Abrir turno de hoy». En cada tarjeta (Recepción, Lavado, Fritado, Empacado) escribe los kilos y pulsa «Entra» o «Sale». En Empacado elige el producto, los «Bultos» y pulsa «Anotar».',
    p: 'Al cerrar el turno, los bultos empacados se suman al inventario.'},
  {id: 'd-lote', s: 2, k: 'produccion', n: 2, t: 'Abre un lote de producción',
    h: 'Pulsa «+ Abrir lote nuevo». Elige la compra de papa que alimenta el lote, escribe los kilos de papa cruda y pulsa «Abrir lote». En cada etapa (Lavado y pelado, Corte, Freído, Enfriado y reposo) pulsa «Terminé esta etapa». Al final pulsa «Cerrar lote y pasar a empaque».',
    p: 'Así se sabe cuánta papa entró y cuánta pasó por cada etapa.'},
  {id: 'd-empacar', s: 2, k: 'empaque', n: 2, t: 'Anota lo empacado',
    h: 'Pulsa «Anotar lo empacado»: te lleva al turno con «Ir al turno». Si hace falta producto, pulsa «Pedir reposición» y elige presentación, unidades y motivo.',
    p: 'Lo empacado queda escrito en el turno de hoy.'},
  {id: 'd-zonas', s: 2, k: 'pr-zonas', n: 2, t: 'Arma y despacha por zona',
    h: 'Abre la tarjeta de una zona, marca los pedidos y los bultos y pulsa «Armar salida». Si quedas por debajo de la meta o partes un pedido, escribe el motivo. Luego pulsa «Despachar» y elige vehículo y chofer. «Pausar la zona» pide un motivo.',
    p: 'Al despachar se emiten las notas de entrega o facturas.'},
  {id: 'd-tablero', s: 2, k: 'em-tablero', t: 'Mira las zonas del día',
    h: 'Toca la tarjeta de una zona para abrir sus despachos.',
    p: 'Es el punto de partida de Empaque y despacho.'},
  {id: 'd-despachos', s: 2, k: 'despachos', n: 2, t: 'Cuenta la carga y entrega',
    h: 'Pulsa «Contar la carga» y luego «Guardar la carga». Pulsa «Marcar en ruta» al salir y «Marcar entregada» al llegar. «Ver nota» abre la nota de entrega.',
    p: 'Queda registrado qué salió y qué se entregó.'},
  {id: 'd-vender', s: 2, k: 'v-pedido', n: 2, t: 'Haz una venta',
    h: 'Busca al cliente (o pulsa «Cliente nuevo»). Pon los bultos de cada producto con + y −. Elige «¿Cómo paga?»: «A crédito» o «Pagó ahora» (este pide banco y «Nº de referencia»). Pulsa «REGISTRAR PEDIDO · NOTA DE ENTREGA» (o «· FACTURA») y luego «Descargar PDF».',
    p: 'La venta queda registrada y sale el documento para el cliente.'},
  {id: 'd-deuda', s: 2, k: 'v-deuda', t: 'Mira quién debe',
    h: 'En cada cliente que debe puedes pulsar «WhatsApp», «Llamar» o «Registrar cobro».',
    p: 'Para recordar el pago a quien debe.'},
  {id: 'd-cobrar', s: 2, k: 'v-cobro', n: 2, t: 'Registra un cobro',
    h: 'Paso 1: elige al cliente. Paso 2: marca las notas y facturas pendientes (o usa «Repartir el pago (más antigua primero)»). Paso 3: escribe fecha, monto recibido (Bs), banco y número de referencia. Pulsa «Registrar pago» y luego «Confirmar». Después puedes pulsar «Ver e imprimir el recibo».',
    p: 'El cobro baja lo que el cliente debe y deja su recibo.'},
  {id: 'd-cxp', s: 2, k: 'cxp', n: 2, t: 'Paga a los proveedores',
    h: 'En «Por pagar» pulsa «Registrar pago» o «Registrar abono» en la fila de la compra.',
    p: 'La deuda con el proveedor baja y queda anotada.'},
  {id: 'd-caja', s: 2, k: 'caja', n: 2, t: 'Anota los gastos de caja chica',
    h: 'Pulsa «Registrar gasto» y llena número, fecha, proveedor, RIF, monto, categoría, justificación y foto del comprobante.',
    p: 'Cada gasto de la caja queda con su comprobante.'},
  {id: 'd-prest', s: 2, k: 'prestamos', n: 2, t: 'Entrega un préstamo',
    h: 'Elige al empleado y escribe monto, cuotas, fecha de entrega y motivo. Pulsa «Entregar préstamo y generar recibo».',
    p: 'La cuota se puede descontar después al pagar la nómina.'},
  {id: 'd-marcar', s: 2, k: 'rh-planta', n: 2, t: 'Marca la entrada y la salida',
    h: 'En «Marcar entrada y salida» busca a la persona y pulsa «Marcó entrada» al llegar y «Marcó salida» al irse. Si el botón está apagado, a esa persona le falta el turno en Personal.',
    p: 'Con las marcas se llena la asistencia.'},
  {id: 'd-turnos', s: 2, k: 'rh-turnos', t: 'Mira quiénes estuvieron en cada turno',
    h: 'Elige el día y el turno (Mañana o Tarde) y mira «Quiénes estuvieron».',
    p: 'Así sabes quién trabajó cada turno.'},
  {id: 'd-bono', s: 2, k: 'rh-turnos', r: ['dueno', 'adm'], t: 'Aplica el bono del turno',
    h: 'Pulsa «Aplicar bono» y elige «Turno completo» o «Empleado por empleado». Si te equivocas, pulsa «Deshacer».',
    p: 'El bono se suma después al pago de la nómina.'},
  {id: 'd-asist', s: 2, k: 'asistencia', t: 'Revisa la asistencia',
    h: 'Se llena sola con las marcas de entrada y salida. Cambia de quincena con «Anterior», «Siguiente» y «Esta quincena».',
    p: 'Para ver quién vino y quién faltó.'},

  /* ---------- 3 · Cierre de quincena y mes ---------- */
  {id: 'c-periodo', s: 3, k: 'rh-pagar', n: 2, t: 'Elige el periodo de la nómina',
    h: 'Escoge «Semana», «Quincena» o «Mes» y muévete con «Anterior», «Siguiente» y «Hoy». La tabla muestra por persona lo trabajado, el valor de la hora, las horas extra, los bonos, el préstamo y el total a pagar.',
    p: 'Revisa los números antes de pagar.'},
  {id: 'c-pagar', s: 3, k: 'rh-pagar', n: 2, t: 'Paga a cada persona',
    h: 'Pulsa «Registrar pago» en su fila. Revisa base, extra, bonos y deducciones de ley. Si tiene préstamo, marca «Descontar la cuota del préstamo» y escribe el «Monto a descontar (Bs)». Elige la fecha y la forma de pago (Efectivo, Transferencia o Pago móvil) y pulsa «Confirmar pago».',
    p: 'La fila queda como «Pagado».'},
  {id: 'c-recibo', s: 3, k: 'rh-pagar', n: 2, t: 'Saca el recibo de pago',
    h: 'Cuando la fila diga «Pagado», pulsa «Recibo» para imprimirlo o guardarlo en PDF.',
    p: 'Cada persona queda con su comprobante.'},
  {id: 'c-portal', s: 3, k: 'c-pagos', r: ['dueno', 'adm'], t: 'Revisa los pagos del portal',
    h: 'En cada pago pulsa «Confirmar y aplicar» o «Rechazar». Si la fecha es anterior, el sistema pide el PIN de gerencia.',
    p: 'Así solo cuenta el pago que alguien revisó.'},
  {id: 'c-hechos', s: 3, k: 'v-pagos', t: 'Repasa los cobros hechos',
    h: 'Mira la tabla de cobros y, si la necesitas, pulsa «Descargar CSV».',
    p: 'Sirve para revisar lo cobrado.'},
  {id: 'c-arqueo', s: 3, k: 'caja', n: 2, t: 'Cuenta la caja chica',
    h: 'En «Arqueo» escribe el «Efectivo contado ahora ($)» y pulsa «Guardar arqueo».',
    p: 'Queda anotado cuánto efectivo había al contar.'},
  {id: 'c-difer', s: 3, k: 'pr-dif', r: ['dueno', 'jefeprod'], t: 'Resuelve las diferencias',
    h: 'Revisa cada diferencia y pulsa «Aprobar» o «Rechazar». Para rechazar debes escribir el motivo.',
    p: 'Así ninguna diferencia queda sin respuesta.'},
  {id: 'c-audit', s: 3, k: 'g-audit', r: ['dueno'], t: 'Revisa la auditoría',
    h: 'Aquí se consulta lo que se hizo en el sistema. Solo se mira: no se puede cambiar. Si quieres guardarla, pulsa «Descargar CSV».',
    p: 'Para estar tranquilo de que todo quedó en orden.'},

  /* ---------- 4 · Qué hacer cuando algo sale mal ---------- */
  {id: 'm-pago', s: 4, k: 'v-pagos', r: ['dueno'], t: 'Anula un cobro mal puesto',
    h: 'En «Cobros hechos» pulsa «Anular» en la fila y escribe el «Motivo de la anulación». El cobro no se borra: queda marcado como anulado.',
    p: 'Nada se pierde y queda el motivo.'},
  {id: 'm-salida', s: 4, k: 'pr-zonas', n: 2, t: 'Anula una salida equivocada',
    h: 'En la zona busca la salida y pulsa «Anular». Escribe un motivo corto (al menos 3 letras).',
    p: 'La salida queda anulada, no borrada.'},
  {id: 'm-repetido', s: 4, k: 'v-cobro', n: 2, t: 'Si el pago ya estaba anotado',
    h: 'Si sale «Referencia repetida: no se guardó», pulsa «Ver el pago existente» antes de intentar otra vez. Un pago con fecha pasada pide el «PIN de gerencia».',
    p: 'Evita cobrar dos veces el mismo pago.'},
  {id: 'm-venta', s: 4, k: 'v-pedido', n: 2, t: 'Si no deja registrar la venta',
    h: 'El sistema no deja registrar la venta si no hay existencias, si falta el precio o si el cliente pasa su límite de crédito. Arregla ese punto y vuelve a pulsar el botón.',
    p: 'Así no se vende lo que no hay ni a quien no puede pagar.'},
  {id: 'm-faltan', s: 4, k: 'pr-turno', n: 2, t: 'Si faltan kilos al cerrar el turno',
    h: 'Al pulsar «Cerrar turno», si sale «Faltan kilos por explicar», elige: «Todavía está en la etapa anterior», «Fue merma» o «Es parte de un lote: lo resuelvo después».',
    p: 'Cada kilo queda explicado.'},
  {id: 'm-merma', s: 4, k: 'mermas', n: 2, clic: {tab: 'Registrar merma'}, t: 'Anota una merma',
    h: 'En «Registrar merma» elige la etapa donde se perdió, el origen, los kilos o unidades perdidas y la causa.',
    p: 'Lo que se pierde queda anotado con su causa.'},
  {id: 'm-pedir', s: 4, acc: 'autorizar', t: 'Pide autorización para lo que no puedes cambiar',
    h: 'Pulsa «Autorización» arriba y luego «Pedir autorización». Elige «¿Qué quieres cambiar?», escribe el «Motivo (obligatorio)» y pulsa «Enviar solicitud».',
    p: 'Gerencia la responde.'},
  {id: 'm-mis', s: 4, k: 'mis-solic', t: 'Mira la respuesta a tus solicitudes',
    h: 'Abre «Mis solicitudes».',
    p: 'Ahí ves tus solicitudes y lo que respondió Gerencia.'},
  {id: 'm-solic', s: 4, k: 'g-solic', r: ['dueno'], t: 'Responde las solicitudes de los puestos',
    h: 'En cada solicitud pulsa «Aprobar» (puedes dejar un comentario) o «Rechazar» (el motivo es obligatorio).',
    p: 'Los puestos piden aquí lo que no pueden cambiar solos.'}
];
const PUESTOS = ['dueno', 'adm', 'rrhh', 'ventas', 'custodio', 'recep', 'jefeprod', 'produccion', 'empaque'];
const nom = r => (ROLES && ROLES[r]) || r;
const ve = (rol, st) => {
  if (st.r && !st.r.includes(rol)) return false;
  if (st.acc === 'autorizar') return rol !== 'dueno';
  if (st.k === 'mis-solic') return rol !== 'dueno';
  return !!(window.pantVe && window.pantVe(rol, st.k)) && lvlOf(rol, st.k) >= (st.n || 1);
};
const lista = rol => PASOS.filter(st => ve(rol, st));
const llave = ver => 'elmana:pp:' + S.rol + ':' + ver;
const leer = ver => { try { const v = JSON.parse(localStorage.getItem(llave(ver)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const guardar = (ver, ids) => { try { localStorage.setItem(llave(ver), JSON.stringify(ids)); } catch (e) { /* sin guardado: la guía funciona igual */ } };
const verRol = () => (S.rol === 'dueno' && PUESTOS.includes(S.ppRol) ? S.ppRol : S.rol);

window.ppPend = () => { try { const ls = lista(S.rol), h = new Set(leer(S.rol)); return ls.filter(st => !h.has(st.id)).length; } catch (e) { return 0; } };

function vistaPasos() {
  const ver = verRol(), ls = lista(ver), hechos = new Set(leer(ver)), n = ls.filter(st => hechos.has(st.id)).length, tot = ls.length, pct = tot ? Math.round(n * 100 / tot) : 0;
  const sel = S.rol === 'dueno'
    ? '<label class="pp-sel">Ver los pasos de: <select data-act-change="ppRol" aria-label="Ver los pasos de">' + PUESTOS.map(r => '<option value="' + r + '"' + (r === ver ? ' selected' : '') + '>' + esc(nom(r)) + '</option>').join('') + '</select></label>' : '';
  const aviso = ver !== S.rol ? '<p class="pp-aviso">Estás viendo la guía de «' + esc(nom(ver)) + '». Las casillas que marques aquí son aparte y no cambian las de ese puesto.</p>' : '';
  const sections = SEC.map((sc, i) => { const xs = ls.filter(st => st.s === i + 1); if (!xs.length) return '';
    return '<section class="pp-sec"><h3>' + esc(sc[0]) + '</h3><p class="pp-sub">' + esc(sc[1]) + '</p>' + xs.map(st => {
      const ok = hechos.has(st.id);
      return '<article class="pp-paso' + (ok ? ' hecho' : '') + '"><label class="pp-chk"><input type="checkbox" data-act-change="ppMarca" data-id="' + st.id + '"' + (ok ? ' checked' : '') + ' aria-label="Hecho: ' + esc(st.t) + '"></label>' +
        '<div class="pp-txt"><h4>' + esc(st.t) + '</h4><p>' + esc(st.h) + '</p><p class="pp-para"><b>Para qué sirve:</b> ' + esc(st.p) + '</p></div>' +
        '<button type="button" class="btn sm pri pp-ir" data-act="ppIr" data-id="' + st.id + '">Ir aquí</button></article>'; }).join('') + '</section>'; }).join('');
  return '<div class="pp"><div class="pp-cab"><div class="pp-prog"><b>' + n + ' de ' + tot + ' pasos</b><div class="pp-barra" role="progressbar" aria-valuemin="0" aria-valuemax="' + tot + '" aria-valuenow="' + n + '"><span style="width:' + pct + '%"></span></div></div>' + sel + '</div>' + aviso +
    (tot ? sections : '<p class="pp-aviso">Este puesto todavía no tiene pasos.</p>') + '</div>';
}

window.scrAyuda = function () {
  const rol = S.rol, tm = !!(window.pantVe && window.pantVe(rol, 'manual')), tp = !!(window.pantVe && window.pantVe(rol, 'mapa'));
  let tab = S.ayTab || 'pp'; if ((tab === 'man' && !tm) || (tab === 'mapa' && !tp)) tab = 'pp';
  const tabs = [['pp', 'Primeros pasos'], tm ? ['man', 'Manual'] : null, tp ? ['mapa', 'Mapa de procesos'] : null].filter(Boolean);
  const cuerpo = tab === 'man' ? SCREENS.manual.r() : tab === 'mapa' ? SCREENS.mapa.r() : vistaPasos();
  return '<nav class="v-tabs un-tabs" aria-label="Ayuda">' + tabs.map(t => '<button type="button" class="v-tab" data-act="ayTab" data-t="' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + esc(t[1]) + '</button>').join('') + '</nav><div class="un-panel">' + cuerpo + '</div>';
};

function rerender() {
  const pn = document.querySelector('#main .un-panel'), top = pn ? pn.scrollTop : 0;
  render(); try { renderTop(); } catch (e) { /* sin barra de arriba */ }
  const n2 = document.querySelector('#main .un-panel'); if (n2) { n2.scrollTop = top; requestAnimationFrame(() => { n2.scrollTop = top; }); }
}
function tocar(c) {
  let intentos = 0;
  const t = setInterval(() => {
    intentos++;
    const el = c.sel ? document.querySelector(c.sel) : [...document.querySelectorAll('[data-cp-tab]')].find(b => b.textContent.trim() === c.tab);
    if (el) { clearInterval(t); el.click(); } else if (intentos > 20) clearInterval(t);
  }, 100);
}
Object.assign(ACT, {
  ppRol: el => { S.ppRol = el.value; rerender(); },
  ppMarca: el => { const ver = verRol(), s = new Set(leer(ver)); if (el.checked) s.add(el.dataset.id); else s.delete(el.dataset.id); guardar(ver, [...s]); rerender(); },
  ppIr: el => {
    const st = PASOS.find(x => x.id === el.dataset.id); if (!st) return;
    if (st.acc === 'autorizar') { if (S.rol === 'dueno') { location.hash = '#g-solic'; return; } if (ACT.autorizar) ACT.autorizar(); return; }
    location.hash = '#' + st.k; if (st.clic) tocar(st.clic);
  }
});
window.ppDatos = {PASOS, lista, SEC};
})();
