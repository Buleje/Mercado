# Página propia «Página propia de Bodega Buleje Test» (`pagina-bodega-buleje-test`)

La página pública **entera** (`/t/<negocio>`) de **un solo negocio** (ADR-458). Arranca idéntica a
la general: `servidor.tsx` dibuja `<PaginaGeneral>`. Lo que cambies acá lo ve sólo ese negocio.

## Prenderla
1. Publica el código (revisión + deploy, como cualquier cambio).
2. Superadmin → «Qué tiene cada negocio» → la fila del negocio → «Página propia» → prender.
   Es de un solo negocio: asignarla a otro da «Esta página es de …».

## Cambiarla, de menos a más
1. **Agregar arriba o abajo** (un aviso, una franja, una sección nueva): envuelve la general.
   ```tsx
   Pagina({ ctx, searchParams }) {
     return (
       <>
         <AvisoDeTemporada />
         <PaginaGeneral slug={ctx.slug} searchParams={searchParams} />
       </>
     );
   }
   ```
   Sigue recibiendo las mejoras de la general. Datos: por `lib/db/*.db.ts` con `ctx.tenantId`.
2. **Ajustar una sección** (sección por sección): cada una lleva `data-pb` (`announcement`, `trust`,
   `promos`, `featured`, `info`, `custom:<id>`). Envuelve la general en un `<div data-pagina="pagina-bodega-buleje-test">`
   y escribe estilos sólo para `[data-pagina="pagina-bodega-buleje-test"] [data-pb="featured"]`, con tokens del DS.
   Ocultar o reordenar secciones NO es código: el dueño lo hace en Mi Tienda.
3. **Cambio profundo**: copia `components/store/pagina-publica/PaginaGeneral.tsx` a esta carpeta y
   dibuja la copia. **La copia deja de recibir las mejoras de la general**: hazlo sólo si 1 y 2 no
   alcanzan. Las reglas de piezas valen para la copia (sin `process.env`, sin `prisma`): los
   `process.env.NEXT_PUBLIC_*` que trae van como constantes de un módulo fuera de `extensiones/`.

## Reglas
- Qué cubre el respaldo, exacto: si `Pagina` tira o tarda más de 2 s en **devolver** (sus `await` de
  arriba), se ve la general y avisa a Sentry. Lo que se dibuja **adentro** (componentes hijos) no tiene
  tope: si uno falla, el navegador recarga la general (`?sinPiezas=1`); si uno tarda, tarda la página.
  Lee los datos lentos arriba, en `Pagina`, para que el tope los cubra. Pruébala en `main`.
- Nada de ids ni slugs de negocios en el código; el negocio llega en `ctx`.
- Tokens del DS, sin hex; tuteo; misma revisión y tests que el resto.
