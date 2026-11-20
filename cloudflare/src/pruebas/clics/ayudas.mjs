/* Atajos para escribir las tareas. Cada uno devuelve pasos (todos se cuentan, como si los hiciera una persona). */
/* Menú lateral: elegir una pantalla del puesto (ej. «#pr-turno») */
export const lateral = h => [{clic: {css: `#side a[href="${h}"]`}}];
/* «Opciones»: abrir el lanzador y tocar una opción (ej. «#c-recibir»). Son 2 clics. */
export const opcion = h => [{clic: '#ptBtn'}, {clic: {css: `#ptPan .pt-op[href="${h}"]`}}];
/* Pestaña dentro de una pantalla unida (ej. «Compras» → «Recibir») */
export const pestana = t => [{clic: {css: '.un-tabs a.v-tab', t}}];
/* Aprobar un cuadro de confirmación del sistema (si lo hubiera) */
export const confirma = t => [{clic: t}];
