# Examen de clics

Mide cuántos clics, teclas y cambios de pantalla cuesta cada tarea, desde la entrada del puesto hasta terminarla, y los compara con el camino mínimo ideal.

## Cómo correrlo (desde la carpeta `cloudflare`)

    node src/pruebas/clics/examen-clics.mjs --aislado

- `--aislado`: usa una copia de la base local; no ensucia tus datos. Recomendado.
- `--tareas id1,id2`: solo esas tareas.
- `--puesto produccion`: solo un puesto.
- `--vista 375x812`: medir en tamaño celular.
- `--bitacora`: muestra cada paso.
- `--depurar`: imprime la pantalla y guarda una foto si una tarea falla.

Necesita Playwright instalado (lo busca en la instalación global de npm).

## Resultados

En `resultados/`: `ultimo.json`, y un `.json` y `.md` con fecha (tabla ordenada de más a menos clics).

## Agregar una tarea

Crear un archivo en `tareas/` con una lista de tareas: nombre, puesto, `ideal` (abrir, elecciones, confirmar, teclas) y `pasos` (clic, escribe, elige, aviso...). Ver los ejemplos existentes.

## Cómo se cuenta

Clic o toque = 1. Entrar al puesto = 1. Elegir de una lista desplegable = 2. Tecla escrita = 1 tecla. Pantalla nueva = 1. Desplazamiento necesario = 1. Ideal = entrar (1) + abrir la pantalla (1) + elecciones + confirmar (1).
