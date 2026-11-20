/* Recursos humanos (puesto rrhh). Pantalla de inicio: «En planta hoy».
   Hasta la simplificación de RRHH la barra tenía 11 pestañas: con RRHH_ANTES=1 se miden los nombres viejos (línea base).
   Ahora son 5 pestañas y, adentro, botones pequeños: «Asistencia» y «Lector de huellas» (En planta hoy), «Préstamos» y «Nómina anterior» (Pagar nómina), «Quiénes estuvieron» (Grupos y turnos). */
const ANTES = !!process.env.RRHH_ANTES;
const sub = t => [{clic: {css: '.v-tabs a.v-tab', t}}]; /* pestaña o botón pequeño con ese nombre */
const T = ANTES
  ? {lector: 'Importar del lector', pagar: 'Pagar nómina', prest: 'Préstamos', ant: 'Nómina anterior (solo consulta)', grupos: 'Grupos de turno', quienes: 'Turnos', horario: 'Parámetros'}
  : {lector: 'Lector de huellas', pagar: 'Pagar nómina', prest: 'Préstamos', ant: 'Nómina anterior', grupos: 'Grupos y turnos', quienes: 'Quiénes estuvieron', horario: 'Grupos y turnos'};
/* desde la pestaña madre hasta el botón pequeño (solo en la versión nueva) */
const hasta = (madre, boton) => ANTES ? sub(boton) : [...sub(madre), ...sub(boton)];
const desdeInicio = (madre, boton) => ANTES ? sub(boton) : (madre === 'En planta hoy' ? sub(boton) : [...sub(madre), ...sub(boton)]);
export default [
  {id: 'rrhh-marcar-entrada', puesto: 'rrhh', nombre: 'Marcar la entrada de una persona', frecuencia: 'diaria', ideal: {abrir: 0},
   pasos: [{clic: {css: '[data-act=hpMarcar][data-t=entrada]'}}, {aviso: 'entrada marcada'}]},
  {id: 'rrhh-marcar-grupo', puesto: 'rrhh', nombre: 'Marcar la entrada de todo el grupo', frecuencia: 'diaria', ideal: {abrir: 0, elecciones: 1},
   pasos: [{clic: {css: '[data-act=hpGrupo]'}}, {clic: 'Sí, marcar a'}, {aviso: 'Entrada marcada a'}]},
  {id: 'rrhh-ver-asistencia', puesto: 'rrhh', nombre: 'Ver la asistencia de la quincena', frecuencia: 'semanal', ideal: {abrir: 1, confirmar: 0},
   pasos: [...desdeInicio('En planta hoy', 'Asistencia'), {ver: 'Asistencia'}]},
  {id: 'rrhh-abrir-lector', puesto: 'rrhh', nombre: 'Abrir el lector de huellas', frecuencia: 'diaria', ideal: {abrir: 1, confirmar: 0},
   pasos: [...desdeInicio('En planta hoy', T.lector), {ver: 'Importar archivo'}]},
  {id: 'rrhh-ver-prestamos', puesto: 'rrhh', nombre: 'Ver los préstamos activos', frecuencia: 'semanal', ideal: {abrir: 1, confirmar: 0},
   pasos: [...hasta('Pagar nómina', T.prest), {ver: 'Préstamos activos'}]},
  {id: 'rrhh-nomina-anterior', puesto: 'rrhh', nombre: 'Consultar una nómina anterior', frecuencia: 'ocasional', ideal: {abrir: 1, confirmar: 0},
   pasos: [...hasta('Pagar nómina', T.ant), {ver: 'quincena'}]},
  {id: 'rrhh-ver-quienes', puesto: 'rrhh', nombre: 'Ver quiénes estuvieron en un turno', frecuencia: 'diaria', ideal: {abrir: 1, confirmar: 0},
   pasos: [...hasta(T.grupos, T.quienes), {espera: 'Quiénes estuvieron'}]},
  {id: 'rrhh-ver-bonos', puesto: 'rrhh', nombre: 'Ver los bonos del turno', frecuencia: 'diaria', ideal: {abrir: 1, confirmar: 0},
   pasos: [...sub('Bonos'), {ver: 'Turno en vivo'}]},
  {id: 'rrhh-grupo-turno', puesto: 'rrhh', nombre: 'Asignar el turno de la semana siguiente a un grupo', frecuencia: 'semanal', ideal: {abrir: 1, confirmar: 0},
   pasos: [...sub(T.grupos), {clic: 'Semana siguiente'}, {baja: '[data-act=hgAsignar][data-g="2"][data-t=Nocturno]'}, {clic: {css: '[data-act=hgAsignar][data-g="2"][data-t=Nocturno]'}}, {pausa: 700} /* el servidor puede negar el cambio si hay pagos esa semana (dato local): se cuentan los toques igual */]},
  {id: 'rrhh-cambiar-horario', puesto: 'rrhh', nombre: 'Cambiar el horario de un turno', frecuencia: 'ocasional', ideal: {abrir: 1, elecciones: 1},
   pasos: [...sub(T.horario), {clic: {css: '[data-act=hrPreset][data-t=Diurno][data-i="06:00"]'}}, {clic: 'Guardar horarios'}, {aviso: 'Horarios guardados'}]},
  {id: 'rrhh-pagar-nomina', puesto: 'rrhh', nombre: 'Registrar un pago de nómina', frecuencia: 'semanal', ideal: {abrir: 1, elecciones: 0},
   pasos: [...sub(T.pagar), {clic: {css: '[data-act=hpPagoAbrir]'}}, {clic: 'Confirmar pago'}, {aviso: 'Pago registrado'}]}
];

