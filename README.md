# El Maná JL — sistema de producción, ventas y cobranza

Sistema interno de El Maná JL (papas): recepción, producción, empaque, inventario, ventas por bultos, precios por lista, cobranza y entregas. Funciona sobre Cloudflare (Worker + base D1). Repositorio **privado**.

Estado: solo corre en local; no está desplegado.

## Correr en la computadora

```
cd cloudflare
npm install
npx wrangler dev --local --port 8799
```

Abrir http://localhost:8799. Si se cambian los archivos de `front/` o `src/*/dominio.js`, regenerar la pantalla con:

```
node build.js
```

## Carpetas

- `cloudflare/src/` — servidor (Worker) por módulos: ventas, precios, tasa, bancos, pantallas, cliente, entregas.
- `cloudflare/front/` — piezas de las pantallas; `build.js` las une con `app-source.html` en `public/index.html`.
- `cloudflare/migrations/` — cambios de la base de datos, en orden.
- `cloudflare/public/` — páginas y recursos publicados.
- `assets/`, `cloudflare/brand-src/` — logo y marca.
- Raíz — planes y acuerdos (abajo).

## Documentos

- [CAMBIOS.md](CAMBIOS.md) — bitácora de lo hecho y lo pendiente
- [plan-recorrido.md](plan-recorrido.md) — recorrido de 8 pasos y decisiones
- [plan-produccion-zonas.md](plan-produccion-zonas.md) — producción por zonas
- [plan-ventas.md](plan-ventas.md), [plan-portal-cliente.md](plan-portal-cliente.md), [plan.md](plan.md)
- [acuerdos.md](acuerdos.md), [marca.md](marca.md), [handoff.md](handoff.md)

No se sube a Cloudflare sin autorización del Dueño.
