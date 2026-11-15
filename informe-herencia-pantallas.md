# Herencia · pantallas (H7 y H8) y ventana Opciones

Solo copia local. Archivos: `front/produccion/p-herencia.js` (nuevo), `p-prod.js`, `produccion.css`, `front/pantallas/pantallas.js`, `build.js` (suma p-herencia.js al bloque de Producción).

## Qué hay
- **Turno:** al anotar «Entra» con menos de lo que salió sale la ventana «Falta X kg» con dos botones grandes (anterior / merma → motivos del servidor; «Otra» exige texto; opción «es parte de un lote»). Exceso: ventana con motivo, queda en espera del Jefe. Tarjeta «Faltan kilos por explicar» y el cierre queda bloqueado mientras haya faltantes; al cerrar, las diferencias de la declaración se piden una por una.
- **Diferencias** (Jefe y Dueño): Por aprobar / Aprobadas / Rechazadas (+ Automáticas y Todas solo Dueño), Aprobar y Rechazar (pide nota), «Espera al Dueño» si la anotó el Jefe, punto de aviso en Opciones.
- **Carga del camión:** tarjeta «Contar la carga de las salidas» en Despachos (Empaque, Jefe, Dueño): cuenta por línea; si faltan bultos pide el mismo «anterior/merma».
- **Recepción:** en el Turno, elegir recepción validada y kilos («Tomar papa»).
- **Motivos de merma** (solo Dueño): renombrar, ocultar/mostrar, agregar; «Otra» fija.
- **Gerencia:** merma real % por etapa, merma por motivo (kg) y diferencias por aprobar/aprobadas; «Sin datos» si no hay; sin metas.
- **Opciones:** ya no se cierra por repintados ni por cambios de foco, y conserva su desplazamiento; cierra con clic fuera, Esc (foco vuelve al botón) y al elegir tarjeta. Sin botón nuevo (orden del Dueño).

## Verificado (Playwright, local)
100→99 resolver anterior y merma; exceso con motivo; cierre bloqueado y luego permitido (faltante en el cierre resuelto por pantalla); Jefe rechaza (sin nota = error) y aprueba; Dueño ve 5 filtros; KPI con datos reales; motivos agregar/renombrar; tomar papa; Opciones en 10 roles (abrir, refresco, clic fuera, Esc, foco, tarjeta); scrollHeight 768 en Turno, Diferencias, Gerencia y Motivos a 1366x768; sin desborde horizontal a 375 px; Ventas sin acceso a Diferencias.

## No verificado
Contar la carga (no había salida armada), «Espera al Dueño» (el Jefe no anota turno), aprobar como Dueño por clic (mismo código que el Jefe), cierre con bultos faltantes. Nota: un exceso en espera deja mostrando «Falta X kg» en la etapa (lo calcula el servidor).

Datos de prueba: limpiados (turno 8 devuelto a abierto y vacío; motivos UATP- borrados; quedan filas de auditoría).
