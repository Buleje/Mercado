# ADR-458 — «Página propia»: la página pública de UN negocio con su propio código

**Fecha:** 2026-10-01 · **Estado:** aceptado · **Extiende:** ADR-457 (enchufes y piezas) · **Pedido de Brandon:**
*«en la página pública de cada negocio poder modificar desde código personalizando sin afectar a los demás
tenants… que un tenant trabaje con código directo y evitar que se aplique o duplique a los demás»* — eligió
**código en archivos (lo escribe Claude a pedido)** y **la página entera**.

## Contexto (medido el 01-10)
- La página pública `/t/<negocio>` es UN archivo para los 14 negocios (`app/t/[slug]/page.tsx`, ~1.500 líneas):
  no hay `layout.tsx` en `app/t/[slug]/`; encabezado, portada, secciones y pie viven ahí. Cambiarlo para
  un negocio lo cambia para todos.
- ADR-457 ya da piezas reutilizables con enchufes; falta una pieza que sea **de un solo negocio** y que
  reemplace **la página entera**.

## Decisión
1. **Enchufe nuevo `tienda.pagina`** (página entera de `/t/<negocio>`). Una pieza de este enchufe es una
   «página propia»: **exclusiva** — la asignación a un segundo negocio se rechaza (409) aunque la del
   primero esté apagada. La exclusividad se hace cumplir en el servidor (PUT de asignación, en
   transacción); el manifiesto NO lleva el id del negocio (regla de ADR-457).
2. **La página general se extrae a un componente** (`PaginaGeneral`) sin cambiar su HTML: la ruta pasa a
   ser «¿este negocio tiene página propia prendida? → la suya (con la general como respaldo) : la general».
3. **La página propia arranca idéntica**: un script (`scripts/pagina-propia.mjs`) crea
   `extensiones/<id>/` con su manifiesto y un `Pagina` que dibuja `PaginaGeneral`; desde ahí se cambia lo
   que el negocio pida — sección por sección, o copiando la general entera a su carpeta si el cambio es
   profundo. **Se crea en el código, no desde el panel**: el superadmin sólo la prende o apaga en la ficha
   del negocio.
4. **Si la página propia falla, se ve la general** (mismo `BordeDePieza` + tope de ADR-457).
5. **Alcance**: la portada pública `/t/<negocio>`. El catálogo (`/t/<negocio>/tienda`), el seguimiento y la
   portada por subdominio siguen generales (la del subdominio ya tiene el enchufe `tienda.portada`).

## Consecuencias
- Una página propia que **copia** la general deja de recibir sus mejoras futuras: por eso el punto de
  partida es un envoltorio sobre `PaginaGeneral` y la copia entera se hace sólo cuando el cambio lo pide.
- El código de cada página propia pasa por las mismas reglas (DB classes, tokens del DS, ESLint de
  `extensiones/**`, tests) y por revisión antes de publicarse.

## Alternativas descartadas
- **Editar `app/t/[slug]/page.tsx` con `if (negocio === …)`**: es exactamente la excepción a mano que
  ADR-457 sacó del código, y el guard de literales la rechaza.
- **Editor de código en el panel**: Brandon eligió archivos; además, JS del dueño en el dominio de la
  plataforma expone las sesiones de los clientes.
- **Índice único parcial en la base** para la exclusividad: Prisma no lo modela y dejaría drift en cada
  `migrate diff`; con un superadmin escribiendo, la validación en transacción alcanza.
