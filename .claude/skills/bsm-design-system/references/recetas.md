# Recetas visuales firma de Buleje

Ingredientes para combinar, no plantillas para copiar enteras. Rutas verificadas el 2026-10-22; si algo se movió, `rg` el nombre del componente (sin números de línea a propósito).

## Hero premium turquesa
`components/socio-buleje/SocioHero.tsx`: `background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, <tinte profundo> 100%)`. El tinte profundo (verde azulado casi negro) es el único hex permitido, y solo como cierre de un gradiente firma. El título va en sans (`font-black`), no en `.font-display`.

## Carnet / tarjeta premium
Mismo archivo, bloque del carnet: gradiente a 125° con los mismos dos tokens + greca amazónica en SVG (`<pattern id="socio-greca" width="26" height="26">`) + brillo diagonal `absolute -inset-y-10 -left-1/4 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent` + chip metálico `bg-gradient-to-br from-amber-200 to-amber-400 ring-1 ring-inset ring-amber-500/40` (sale dorado-coral por el remap de `amber`). Decorativos con `aria-hidden`.

## Gauge semicircular
`components/socio-buleje/SocioCalculadora.tsx`: SVG `viewBox="0 0 240 138"`; pista `stroke="var(--surface-sunken)" strokeWidth="16" strokeLinecap="round"`; relleno con `<linearGradient>`; remate circular con borde `var(--accent)`. `role="img"` + `aria-label` con la cifra.

## Card de categoría con impacto
`components/store/RecetarioClient.tsx`: gradiente a 135° por categoría (`CATEGORIA_GRADIENTS` en `lib/recipe-gradients.ts`) + ícono Lucide gigante `h-20 w-20 sm:h-24 sm:w-24 text-white/95 drop-shadow-lg group-hover:scale-110` + orbes decorativos `rounded-full bg-white/15 blur-xl` (`aria-hidden`).

## Filtros de tienda
`components/marketplace/store-detail/StoreCatalog.tsx`: `h-12 text-base font-medium rounded-2xl max-md:rounded-none border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]`; ícono `h-5 w-5`; toggles de vista cuadrados `h-12 w-12` separados con `border-l-2`. Variante editorial (`StoreHero.tsx`, misma carpeta): `rounded-none`, el hover invierte a `--text-primary`.

## Escalera de tiers
`components/customer/socio-buleje/SocioTierBadge.tsx`: bronce, plata, oro y diamante según el gasto acumulado.

## Espaciado y tablas
`px-4 sm:px-6 lg:px-8`, contenedor `max-w-7xl`, separaciones `gap-3`/`gap-4`/`gap-6` (convención dominante: 307 y 201 usos medidos el 2026-10-22). Tablas: `DataTable` del DS en el panel (ADR-489); de cara al cliente, `<table>` en escritorio (`hidden sm:block`) y tarjetas en móvil (`sm:hidden`).

## Modo creativo (innovar sin romper)
Cuando Brandon pida «modo creativo», «premium» o «sorpréndeme»: combinar los ingredientes de arriba en formas nuevas; no importar estéticas ajenas.

1. Elegir 2-3 ingredientes (gradiente turquesa profundo, greca, `num-flip-in`, ícono gigante) y componerlos distinto; nunca los seis juntos (ruido).
2. Un elemento héroe por vista (gauge, carnet o ícono gigante); el resto respira con espacio y `--surface-sunken`.
3. Gradientes anclados en tokens (`--accent` a `--accent-dark` a tinte profundo) o en `lib/recipe-gradients.ts`; jamás un arcoíris arbitrario.
4. Salida: claro y oscuro · contraste AA (no bajar de `--text-tertiary`) · táctil 44 px · tipografía en mínimos (`.claude/rules/ui-components.md`) · curva canónica y reduced-motion (`references/motion.md`) · `node scripts/qa-capturas.mjs` como evidencia.
