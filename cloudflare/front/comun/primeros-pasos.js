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
    h: 'Pulsa «Agregar banco». Escribe el nombre del banco, la moneda de la cuenta, el número de cuenta, el titular y pulsa «Guardar». Además son obligatorios el teléfono (Pago Móvil), la cédula y el RIF. Si quieres ir más rápido, pulsa un banco de «Bancos sugeridos»: se abre el formulario con su nombre.',
    p: 'Así cada cobro y cada pago dice en qué banco se hizo. Toda cuenta bancaria es obligatoria para cobrar o pagar por banco: sin cuenta registrada no se puede elegir. La tasa del dólar no se escribe: se lee sola del BCV y sale arriba, en «Tasa BCV USD → Bs».'},
  {id: 'a-personal', s: 1, k: 'personal', n: 2, t: 'Agrega a las personas que trabajan',
    h: 'En «Personas», tarjeta «Agregar persona»: escribe nombre y apellido, cédula, cargo, puesto (Gerencia, Administración, Ventas, Recursos humanos, Producción o Logística) y su área (si el puesto tiene una sola, se llena sola), fecha de ingreso y teléfono. Elige «Se le paga por» (Día u Hora), la tarifa en $ y, solo si es de planta (Producción o Logística), el «Turno de trabajo» (Diurno o Nocturno; quien rota va en «Grupos y turnos»). Al abrir «En planta hoy» o «Personas», si aparece «Revisa estas personas», indica si son de Ventas o su área de Producción. Pulsa «Agregar persona».',
    p: 'Sin turno no se puede marcar la entrada («Falta el turno en Personal»). Si maneja un vehículo, activa «Es chofer».'},
  {id: 'a-params', s: 1, k: 'rh-params', r: ['dueno'], t: 'Define los horarios y las reglas de pago',
    h: 'En Ajustes › «Horarios y reglas de pago», en «Horario por turno» pon cuándo entran y salen el turno Diurno y el Nocturno (el nocturno termina al día siguiente). En «Reglas de pago de nómina» pon la jornada completa (horas), el recargo de hora extra (%) y las deducciones de ley (%). Pulsa «Guardar parámetros». Los bonos se definen en la pantalla «Bonos».',
    p: 'Con esto el sistema calcula solo las horas extra, las deducciones y los bonos de la nómina.'},
  {id: 'a-params-nom', s: 1, k: 'rh-grupos', r: ['rrhh'], t: 'Cambia los horarios de los turnos',
    h: 'En «Grupos y turnos», al final, en la tarjeta «Horario de cada turno» elige cuándo entran y salen el Diurno y el Nocturno, y desde qué día vale el cambio. Los días que ya pasaron no cambian, y no se puede empezar en días ya pagados o con bono aplicado. Pulsa «Guardar horarios». Cada cambio queda en Auditoría y le llega un aviso a Gerencia. Las reglas de pago las cambia solo Gerencia.',
    p: 'Así el sistema sabe a qué turno pertenece cada marca de entrada y salida.'},
  {id: 'a-params-ver', s: 1, k: 'rh-params', r: ['adm'], t: 'Mira los parámetros de turnos y bonos',
    h: 'Aquí ves el horario por turno, las reglas de pago de nómina y el bono de producción. Solo Gerencia los cambia. Si hace falta un cambio, pulsa «Pedir autorización».',
    p: 'Así sabes con qué reglas se calculan la nómina y los bonos.'},
  {id: 'a-producto', s: 1, k: 'v-clientes', r: ['dueno'], clic: {sel: '[data-act="vAdmTab"][data-v="productos"]'}, t: 'Crea los productos',
    h: 'En la pestaña de productos e inventario pulsa «Producto nuevo». Escribe SKU, nombre, gramaje, categoría (Papas o Salsas) e IVA (%), y pulsa «Guardar». En cada fila hay «Editar», «Peso de bulto» y «Entrada».',
    p: 'Sin productos no se puede vender ni empacar.'},
  {id: 'a-inicial', s: 1, k: 'pr-inv', r: ['dueno'], t: 'Carga el conteo inicial de producto terminado',
    h: 'Pulsa «Cargar el conteo inicial», llena el conteo y pulsa «Guardar el conteo». Solo se hace una vez.',
    p: 'Desde ese día las existencias empiezan con la cifra real.'},
  {id: 'a-precios', s: 1, k: 'p-precios', t: 'Pon los precios por categoría',
    h: 'En «Por categoría» elige «Minorista», «Mayorista» o «Gran Mayor» y toca el precio que quieres cambiar. Si un producto no tiene precio en esa categoría, pulsa «Cargar precios» y escribe el de contado y el de crédito. Si eres Gerente se aplica al momento; si eres de Administración se envía para aprobar. Las listas viejas por zona quedan archivadas y se pueden consultar.',
    p: 'Cada cliente paga según su categoría, que se elige en su ficha. Un precio especial del cliente manda sobre la categoría.'},
  {id: 'a-aprobar', s: 1, k: 'p-aprobar', r: ['dueno'], t: 'Aprueba los precios que te piden',
    h: 'Revisa cada cambio y pulsa «Aprobar» o «Rechazar». Si quieres, escribe un motivo.',
    p: 'Un precio nuevo solo vale cuando Gerencia lo aprueba.'},
  {id: 'a-cliente', s: 1, k: 'v-clientes', n: 2, clic: {sel: '[data-act="vAdmTab"][data-v="clientes"]'}, t: 'Registra a tus clientes',
    h: 'En «Clientes» pulsa «Cliente nuevo». Escribe razón social o nombre y RIF o identificación. El estado del cliente es obligatorio: de él sale la zona de entrega. Elige también su categoría de precio (Minorista, Mayorista o Gran Mayor). Agrega dirección de entrega, vendedor (de la lista de vendedores o del personal con cargo Vendedor), modalidad habitual y teléfono, y pulsa «Guardar».',
    p: 'Sin cliente no se puede hacer una venta. También puedes crearlo con «Cliente nuevo» al hacer la venta.'},
  {id: 'a-prov', s: 1, k: 'catalogos', n: 2, t: 'Registra a tus proveedores',
    h: 'En «Proveedores» pulsa «Nuevo proveedor». Escribe nombre, RIF, qué vende y condición de pago, y pulsa «Guardar».',
    p: 'Los proveedores se eligen después al hacer compras.'},
  {id: 'a-flota', s: 1, k: 'fl-flota', r: ['dueno', 'adm'], t: 'Agrega los vehículos',
    h: 'Pulsa «Agregar vehículo». Escribe placa, tipo, marca y modelo, capacidades, estado, chofer habitual y cuándo vencen el seguro y los documentos. Pulsa «Guardar».',
    p: 'Al despachar eliges el vehículo y el chofer de esta lista.'},
  {id: 'a-equipo', s: 1, k: 'catprod', n: 2, r: ['dueno', 'produccion'], t: 'Agrega a quien recibe la mercancía',
    h: 'En «Equipo», tarjeta «Quién recibe», pulsa «Agregar persona» y luego «Agregar».',
    p: 'Recibir pide elegir «Quién recibe». Si no hay nadie, dice «Sin personal: agrégalo en Equipo y flota».'},
  {id: 'a-pin', s: 1, k: 'v-clientes', r: ['dueno'], clic: {sel: '[data-act="vAdmTab"][data-v="ajustes"]'}, t: 'Crea el PIN de gerencia',
    h: 'En «Ajustes», en «PIN de gerencia», pulsa «Crear PIN» (de 4 a 12 números). Ahí mismo puedes llenar el «Membrete de los documentos» y pulsar «Guardar ajustes».',
    p: 'El PIN se pide para anotar un pago con fecha pasada y para perdonar mora.'},
  {id: 'a-pol', s: 1, k: 'politicas', n: 2, r: ['dueno', 'adm'], t: 'Revisa las reglas de caja y nómina',
    h: 'Revisa el «Fondo fijo ($)», el «Umbral de compra de contado ($)», «Reponer cuando quede menos de (%)» y la «Tolerancia de peso en recepción (%)». En préstamos mira los días de entrega en el mes, el tope por empleado ($) y las cuotas máximas. Pulsa «Guardar políticas».',
    p: 'Son las reglas que usa el sistema para caja, compras y préstamos.'},

  /* ---------- 2 · El día a día ---------- */
  {id: 'd-recibir', s: 2, k: 'c-recibir', n: 2, r: ['dueno', 'produccion'], t: 'Recibe lo que llegó',
    h: 'En «Recibir» arriba está «Pedidas por recibir», en grande: cada compra que Administración ya hizo y todavía no llegó. Cuando llegue, pulsa «Recibir» en esa compra y escribe lo que llegó de cada producto. Los bolsones y las bolsas de presentación se reciben igual que cualquier compra. La papa cruda llega por sacos: cuenta los sacos y pesa 5 de muestra (la referencia es 43 kg por saco). Si llegó distinto a lo pedido, el sistema te avisa: confirma y escribe el motivo. Más abajo ves solo lo recibido hoy, una línea por cosa (por ejemplo «Aceite vegetal · 200 kg · En almacén»); si llegó menos, sale resaltado con el motivo.',
    p: 'Una compra pasa por tres estados: Pedida, Recibida y En almacén. Al recibir queda lista: lo que llegó entra al inventario, se anota lo que se debe al proveedor (solo lo que llegó) y Administración lo ve en «Diferencias de compras». Administración no recibe: solo hace la compra.'},
  {id: 'd-compra', s: 2, k: 'c-pedido', n: 2, t: 'Haz una compra',
    h: 'En «Hacer compra» (o con el botón «Nueva compra» del Resumen de Administración) elige el proveedor (o «Nuevo proveedor») y agrega los productos (también «Bolsones» y «Bolsas de presentación», que salen en la lista de insumos del inventario). Escribe el número y la fecha de la factura del proveedor, elige «¿Cómo se paga?» (banco o cuenta, plazo en días) y pulsa «HACER LA COMPRA».',
    p: 'La compra se hace en un solo paso: no hay que validarla después. Producción la ve en «Pedidas por recibir» y, cuando la recibe, la compra queda lista.'},
  {id: 'd-difcompras', s: 2, k: 'c-dif', r: ['dueno', 'adm'], t: 'Mira las diferencias de compras',
    h: 'En «Diferencias de compras» aparece cada compra que llegó distinta a lo pedido, con el motivo que escribió Producción. Es solo para leer: úsalo para reclamar al proveedor y marca cada una como vista.',
    p: 'Se paga solo lo que llegó, y aquí queda a la vista lo que faltó o sobró.'},
  {id: 'd-otras', s: 2, k: 'compras-gen', n: 2, t: 'Anota otras compras',
    h: 'Escribe qué se compró, el proveedor, el monto y la partida contable. El «Motivo de la compra» es obligatorio. Pulsa «Registrar compra».',
    p: 'Así toda compra queda con su motivo.'},
  {id: 'd-turno', s: 2, k: 'pr-turno', n: 2, r: ['dueno', 'produccion'], t: 'Produce el turno',
    h: 'En «Producir» ves los requisitos para producir, siempre a la vista: papa, aceite, agua, sal, químicos, almidón, bolsones y el personal del turno. Los bolsones son las bolsas grandes donde va la papa a granel: sin bolsones disponibles no se puede iniciar (ni el Gerente lo salta). Cada uno sale en verde con «Hay …» si alcanza, o en rojo si falta. Si falta alguno, o no hay personal marcado en el grupo del turno, el botón «Iniciar producción» queda apagado: Administración compra (por ejemplo los bolsones) y Producción recibe en «Recibir», o Recursos humanos arma el grupo y marca la asistencia. Con todo en verde pulsa «Iniciar producción»: ahí nace el turno (Diurno o Nocturno, según la hora); mirar la pantalla no lo crea. Las etapas se hacen una a la vez, en orden: escribe los kilos si los pide y pulsa «Terminar etapa». Si no hay papa recibida pero el inventario general tiene, se descuenta de ahí. Al final anota la merma y pulsa «Anotar merma y cerrar turno». El turno dura hasta que termina su hora; si a alguien se le registraron horas extra, sigue activo hasta que lo cierres. En «Resumen» ves el Turno, el Día, la Semana y el Mes, y un bloque «Avisos» con lo que requiere atención. Lo empacado lo anota Logística.',
    p: 'Al cerrar el turno, los bultos empacados se suman al inventario y lo ves en «Inventario disponible». La pantalla vieja «Planta → Producir» ya no existe: todo se hace aquí.'},
  {id: 'd-invdisp', s: 2, k: 'inv-general', r: ['dueno', 'adm', 'produccion'], t: 'Mira el inventario disponible',
    h: 'En «Inventario disponible» cada insumo trae una barra: verde si alcanza, amarillo si se acerca al mínimo y rojo si está en el mínimo o por debajo. Entre los insumos también están «Bolsones» (para la papa a granel) y «Bolsas de presentación» (para empacar). Producción solo lo mira. Gerencia y Administración pulsan «Definir mínimo» (o «Cambiar mínimo») en «Inventario de producción» y escriben cuánto es lo mínimo de cada insumo. Debajo de las barras también cargan los «Kilos de papa por bolsón»: con ese número, al cerrar el turno se descuentan los bolsones usados.',
    p: 'Hay un solo mínimo por insumo: es el mismo para las barras, para los requisitos de «Iniciar producción» y para los avisos del Resumen.'},
  {id: 'd-empacar', s: 2, k: 'lg-empacar', n: 2, t: 'Anota lo empacado',
    h: 'En «Empacar» mira arriba los requisitos: bolsas de presentación en el inventario y personal de planta que ya marcó entrada; cada uno sale en verde o en rojo, y si falta alguno el botón «Anotar empaque» queda apagado (pide a Administración que compre las bolsas y a Recursos humanos que marque la asistencia). Luego mira cuánta papa a granel hay disponible, escribe los bultos de cada presentación (y la merma de empaque si hubo) y pulsa «Anotar empaque».',
    p: 'No hace falta turno abierto. El sistema calcula los kilos, los resta del granel, descuenta las bolsas de presentación (bultos por las bolsas de cada bulto, y no deja pasarte de las que hay) y suma al inventario: Ventas lo puede vender enseguida.'},
  {id: 'd-zonas', s: 2, k: 'pr-zonas', n: 2, t: 'Arma y despacha por zona',
    h: 'Abre la tarjeta de una zona, marca los pedidos y los bultos y pulsa «Armar salida». Si partes un pedido, escribe el motivo. Luego pulsa «Despachar» y elige vehículo y chofer. «Pausar la zona» pide un motivo.',
    p: 'Al despachar se emiten las notas de entrega o facturas.'},
  {id: 'd-tablero', s: 2, k: 'em-tablero', t: 'Mira las líneas del día',
    h: 'Cada tarjeta es una línea: suma los kilos de sus zonas y dice qué tan lleno va el camión. Toca una línea para marcar los pedidos que salen y pulsar «Armar salida». Si sale con menos del 100 %, puedes contar por qué con tus palabras.',
    p: 'Es el punto de partida de Logística. Si la línea pasa del 100 %, decide Gerencia.'},
  {id: 'd-despachos', s: 2, k: 'despachos', n: 2, t: 'Cuenta la carga y entrega',
    h: 'Pulsa «Contar la carga» y luego «Guardar la carga». Pulsa «Marcar en ruta» al salir y «Marcar entregada» al llegar. «Ver nota» abre la nota de entrega.',
    p: 'Queda registrado qué salió y qué se entregó.'},
  {id: 'd-resumen-adm', s: 2, k: 'adm-resumen', r: ['dueno', 'adm'], t: 'Empieza por el Resumen de Administración',
    h: 'Arriba del Resumen hay dos botones: «Cobranza» (para ir a cobrar a quien debe) y «Nueva compra» (para hacer una compra al proveedor). Abajo ves las cifras del mes y lo que está pendiente.',
    p: 'Es el punto de partida del día para Administración.'},
  {id: 'd-atras', s: 2, acc: 'atras', t: 'Usa el botón atrás del celular',
    h: 'En el celular, el botón «atrás» te devuelve a la pantalla anterior dentro del sistema; no te saca de él. Si estás en el inicio, te pregunta antes de salir.',
    p: 'Así puedes ir y volver entre pantallas sin perder el lugar.'},
  {id: 'd-vender', s: 2, k: 'v-pedido', n: 2, t: 'Haz una venta',
    h: 'Busca al cliente (o pulsa «Cliente nuevo»). Pon los bultos de cada producto con + y −. Elige «¿Cómo paga?»: «A crédito» o «Pagó ahora» (este pide banco y «Nº de referencia»). Pulsa «REGISTRAR PEDIDO · NOTA DE ENTREGA» (o «· FACTURA») y luego «Descargar PDF».',
    p: 'La venta queda registrada y sale el documento para el cliente.'},
  {id: 'd-deuda', s: 2, k: 'v-deuda', t: 'Mira quién debe',
    h: 'En cada cliente que debe puedes pulsar «WhatsApp», «Llamar» o «Registrar cobro».',
    p: 'Para recordar el pago a quien debe.'},
  {id: 'd-cobrar', s: 2, k: 'v-cobro', n: 2, t: 'Registra un cobro',
    h: 'Entra en «Cobranza» y abre «Registrar cobro» (o pulsa «Registrar cobro» en «Quién debe»). Paso 1: elige al cliente. Paso 2: marca las notas y facturas pendientes (o usa «Repartir el pago (más antigua primero)»). Paso 3: escribe fecha, monto recibido (Bs), banco y número de referencia. Pulsa «Registrar pago» y luego «Confirmar». Después puedes pulsar «Ver e imprimir el recibo».',
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
    h: 'En «Marcar entrada y salida» busca a la persona y pulsa «Marcar entrada» al llegar y «Marcar salida» al irse. Para todo el turno de una vez usa «Marcar entrada a todo el grupo» y, si alguien faltó, pulsa «Quitar entrada» en su fila. Si el botón está apagado, a esa persona le falta el turno en Personal.',
    p: 'Con las marcas se llena la asistencia.'},
  {id: 'd-grupos', s: 2, k: 'rh-grupos', r: ['dueno', 'rrhh'], t: 'Arma los grupos de turno',
    h: 'En «Grupos y turnos» › «Grupos» elige quién integra el Grupo 1 y el Grupo 2 y qué turno tiene cada uno esta semana (Diurno o Nocturno). Los turnos, los grupos y los bonos son solo de planta (Producción y Logística): no incluyen a Administración, Ventas ni choferes.',
    p: 'Producción solo puede iniciar si el grupo del turno tiene personal con entrada marcada.'},
  {id: 'd-lector', s: 2, k: 'rh-lector', n: 2, r: ['dueno', 'rrhh'], t: 'Importa las marcas del lector de huellas',
    h: 'En «En planta hoy» toca «Lector de huellas», sube el archivo del lector (Hikvision), revisa lo que el sistema entendió, asocia los códigos nuevos a su persona, resuelve lo dudoso y guarda. La asistencia se llena sola con esas marcas.',
    p: 'Así no hay que marcar a mano a cada persona.'},
  {id: 'd-turnos', s: 2, k: 'rh-turnos', t: 'Mira quiénes estuvieron en cada turno',
    h: 'Abre «Quiénes estuvieron» (en «Grupos y turnos»; en Administración, «Bonos › Turnos»). Elige el día y el turno (Diurno o Nocturno) y mira «Quiénes estuvieron».',
    p: 'Así sabes quién trabajó cada turno.'},
  {id: 'd-bono', s: 2, k: 'rh-bonos', r: ['dueno', 'adm', 'rrhh'], t: 'Mira si el equipo gana el bono',
    h: 'En «Bonos», «Turno en vivo» muestra el turno que corre ahora: cuánto llevan y si califican o cuánto falta. Los bonos se aplican solos al cerrar el turno de Producción. Si algo no cuadra, pulsa «Deshacer»: queda en revisión y no se paga.',
    p: 'Gerencia y Administración cambian metas y montos en «Bonos y metas». Todo es en dólares. El «Bono nocturno» se suma a los otros bonos y es para quien marcó asistencia en el turno Nocturno; mientras diga «Sin monto definido» no se paga: Gerencia escribe el monto con «Cambiar metas y montos».'},
  {id: 'd-fritura', s: 2, k: 'pr-turno', r: ['dueno', 'produccion'], t: 'Marca quién fríe',
    h: 'En el turno, en la tarjeta de Fritado, elige a la persona y pulsa «Marcar». Cada persona marcada gana el Bono Fritura de su jornada.',
    p: 'Si te equivocas, pulsa «Quitar».'},
  {id: 'd-asist', s: 2, k: 'asistencia', t: 'Revisa la asistencia',
    h: 'En «En planta hoy» toca «Asistencia». Se llena sola con las marcas de entrada y salida. Cambia de quincena con «Anterior», «Siguiente» y «Esta quincena».',
    p: 'Para ver quién vino y quién faltó.'},

  /* ---------- 3 · Cierre de quincena y mes ---------- */
  {id: 'c-periodo', s: 3, k: 'rh-pagar', n: 2, t: 'Elige el periodo de la nómina',
    h: 'En «Pagar nómina» › «Pagar» escoge «Semana», «Quincena» o «Mes» y muévete con «Anterior», «Siguiente» y «Hoy». La tabla muestra por persona lo trabajado, el valor de la hora, las horas extra, los bonos, el préstamo y el total a pagar.',
    p: 'Revisa los números antes de pagar.'},
  {id: 'c-pagar', s: 3, k: 'rh-pagar', n: 2, t: 'Paga a cada persona',
    h: 'En «Pagar nómina» › «Pagar», pulsa «Registrar pago» en su fila. Revisa base, extra, bonos y deducciones de ley. Si tiene préstamo, marca «Descontar la cuota del préstamo» y escribe el «Monto a descontar ($)». Elige la fecha y la forma de pago (Efectivo, Transferencia o Pago móvil) y pulsa «Confirmar pago».',
    p: 'La fila queda como «Pagado».'},
  {id: 'c-nomusd', s: 3, k: 'rh-pagar', n: 2, r: ['dueno', 'rrhh'], t: 'Entiende en qué moneda se paga',
    h: 'La nómina se calcula en dólares (base, extras, bonos y deducciones). Al pagar, el sistema muestra el equivalente en bolívares a la tasa BCV del día de pago, no la del día que se calculó.',
    p: 'Así cada persona recibe en Bs lo que corresponde ese día.'},
  {id: 'c-recibo', s: 3, k: 'rh-pagar', n: 2, t: 'Saca el recibo de pago',
    h: 'En «Pagar nómina» › «Pagar», cuando la fila diga «Pagado», pulsa «Recibo» para imprimirlo o guardarlo en PDF.',
    p: 'Cada persona queda con su comprobante.'},
  {id: 'c-portal', s: 3, k: 'c-pagos', r: ['dueno', 'adm'], t: 'Revisa los pagos del portal',
    h: 'En cada pago pulsa «Confirmar y aplicar» o «Rechazar». Si la fecha es anterior, el sistema pide el PIN de gerencia.',
    p: 'Así solo cuenta el pago que alguien revisó.'},
  {id: 'c-enlace', s: 3, k: 'c-ficha', r: ['dueno', 'adm', 'ventas'], t: 'Comparte su enlace al cliente',
    h: 'En «Fichas» elige al cliente y pulsa «Copiar enlace del portal» (si no tiene, «Generar enlace»). Envíaselo por WhatsApp: al tocarlo entra sin escribir ningún código. «Generar enlace nuevo» anula el anterior.',
    p: 'Cada cliente ve solo su cuenta. No reenvíes su enlace a otras personas.'},
  {id: 'c-hechos', s: 3, k: 'v-pagos', t: 'Repasa los cobros hechos',
    h: 'Mira la tabla de cobros y, si la necesitas, pulsa «Descargar CSV».',
    p: 'Sirve para revisar lo cobrado.'},
  {id: 'c-repventas', s: 3, k: 'ventas', r: ['dueno', 'adm', 'ventas'], t: 'Mira los reportes de ventas',
    h: 'En «Registro de ventas», tarjeta «Reportes de ventas», hay 4 pestañas: «Por rubro», «Por vendedor», «Por zona» y «Por producto». Elige el periodo (Hoy, Esta semana, Quincena, Este mes o Mes pasado).',
    p: 'Para ver qué se vende, quién vende y dónde.'},
  {id: 'c-arqueo', s: 3, k: 'caja', n: 2, t: 'Cuenta la caja chica',
    h: 'En «Arqueo» escribe el «Efectivo contado ahora ($)» y pulsa «Guardar arqueo».',
    p: 'Queda anotado cuánto efectivo había al contar.'},
  {id: 'c-difer', s: 3, k: 'pr-dif', r: ['dueno'], t: 'Resuelve las diferencias',
    h: 'Revisa cada diferencia y pulsa «Aprobar» o «Rechazar». Para rechazar debes escribir el motivo.',
    p: 'Así ninguna diferencia queda sin respuesta.'},
  {id: 'c-lineas', s: 3, k: 'em-tablero', r: ['dueno'], t: 'Arma tus líneas de despacho',
    h: 'Toca «Organizar líneas», crea una línea, ponle nombre y mete sus zonas (cada zona va en una sola línea). Las capacidades del camión (papa y salsas) se cambian en Ajustes.',
    p: 'Así Logística ve qué tan lleno va cada camión.'},
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
  {id: 'm-faltan', s: 4, k: 'pr-turno', n: 2, t: 'Anota la merma del proceso',
    h: 'Cuando todo pasó a Empaque, el sistema calcula la merma (papa tomada menos lo que pasó a Empaque) y te muestra una lista con una fila por etapa. En cada etapa donde se perdió papa escribe los kilos y toca el motivo principal (Cáscara, Tierra, Aceite, Derrame u Otra; con «Otra» escribe qué fue). Deja vacía la etapa sin pérdida; «Poner todo aquí» llena lo que falta del tramo. Abajo ves el total en vivo. Si el total no cuadra, escribe por qué y la diferencia queda como «Sin explicar». Pulsa «Anotar merma y cerrar turno». Es una sola vez por turno y no descuenta otra vez del inventario; antes de cerrar la puedes corregir con «Corregir» y, ya cerrado el turno, solo el Gerente (con nota).',
    p: 'Sabes en qué etapa se perdió la papa. El Gerente puede agregar el motivo «Agua evaporada» en Ajustes › Motivos de merma.'},
  {id: 'm-aguaev', s: 4, k: 'pr-mot', r: ['dueno'], t: 'Agrega el motivo «Agua evaporada»',
    h: 'Entra en Ajustes › Zonas y mermas › «Motivos de merma», escribe «Agua evaporada» y pulsa para agregarlo. Desde ese momento sale como botón en la merma por etapas.',
    p: 'Así Producción puede explicar la pérdida de agua al freír sin escribir «Otra».'},
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
const PUESTOS = ['dueno', 'adm', 'produccion', 'empaque', 'ventas', 'rrhh'];
const nom = r => (ROLES && ROLES[r]) || r;
const ve = (rol, st) => {
  if (st.r && !st.r.includes(rol)) return false;
  if (st.acc === 'atras') return true;
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
        (st.acc === 'atras' ? '' : '<button type="button" class="btn sm pri pp-ir" data-act="ppIr" data-id="' + st.id + '">Ir aquí</button>') + '</article>'; }).join('') + '</section>'; }).join('');
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
    if (st.acc === 'atras') return;
    if (st.acc === 'autorizar') { if (S.rol === 'dueno') { location.hash = '#g-solic'; return; } if (ACT.autorizar) ACT.autorizar(); return; }
    location.hash = '#' + st.k; if (st.clic) tocar(st.clic);
  }
});
window.ppDatos = {PASOS, lista, SEC};
})();
