# Informe: rediseño de pantallas largas (1366x768, computador)

Cambio: cada pantalla larga se reparte en pestañas dentro de la misma pantalla (una visible a la vez; las tarjetas de totales quedan arriba), los formularios de Recepción y Registrar merma van en 2-3 columnas, las gráficas se hacen más bajas (tres por fila) y las listas de recepciones por validar van en dos columnas. Lo que sobra se desplaza dentro de la pestaña, nunca la página. Textos, datos, botones (data-act) y permisos sin cambios; sin textos nuevos. En celular (<1024 px) nada cambia (verificado a 375 px, sin desborde).
Archivos: `front/comun/compacto.js` (nuevo), `front/comun/compacto.css`, `build.js`, `app-source.html` (gancho + columnas de 2 formularios).

Medición: `scrollHeight` de la página a 1366x768, rol Dueño, cada pestaña pulsada.

| Pantalla | Antes (px) | Después (px) | Pestañas |
|---|---|---|---|
| Recepción | 2036 | 768 | Nueva recepción, Recientes, Mermas, Gráficas, Exportar |
| Empaque | 1558 | 768 | Empaque de hoy, Mermas, Gráficas, Exportar, Reposición controlada |
| Despachos | 1667 | 768 | Notas de entrega, Mermas, Gráficas, Exportar |
| Compras de papa e insumos | 3469 | 768 | Por validar, Compras efectivas, Gráficas, Exportar |
| Control de gestión | 5013 | 768 | Atención hoy, Ventas, Deudas y gastos, Gráficas, Exportar |
| Análisis de compras | 4396 | 768 | Proveedores, Qué se compró, Rendimiento, Gráficas |
| Mermas | ~4732 | 768 | Alertas, Registrar merma, Por etapa y causa, Tolerancias, Gráficas, Exportar |
| Nómina | 2631 | 768 | Nómina, Recibos de pago, Gastos fijos, Gráficas, Exportar |
| Asistencia | 1967 | 768 | Asistencia, Exportar |
| Plazos y reclamos | 785 | 768 | sin pestañas (avisos más bajos) |

Capturas: antes `antes-recepcion.png`; después `desp-recepcion-0.png`, `desp-recepcion-3.png`, `desp-mermas-1.png`, `desp-analisis-0.png` (carpeta temporal de la sesión). Clic de prueba en todas las pestañas de las 10 pantallas, y en Recepción «Materia prima» mantiene la pestaña: sin errores de consola.

## Pendientes
- Dentro de la pestaña, algunas listas largas aún se desplazan por dentro (Gráficas de Gestión, Recepciones por validar, Qué se compró); es la lista, no la página.
- Mermas «Por etapa y causa» y gráficas con muchas filas se ven cortadas hasta desplazar el panel.
- Solo probado con rol Dueño; los otros puestos usan las mismas pantallas y pestañas pero no se midieron.
- Análisis de compras: «Lote por lote» quedó dentro de la pestaña «Qué se compró»; confirmar con el dueño si prefiere pestaña propia.
- Sin commit ni deploy.
