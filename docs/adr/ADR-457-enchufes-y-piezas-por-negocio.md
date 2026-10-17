# ADR-457 — Enchufes y piezas: código a medida por negocio, asignado desde el panel

**Fecha:** 2026-10-01 · **Estado:** aceptado · **Relacionados:** ADR-100 (rubros), ADR-101 (cross-tenant
explícito), ADR-300 (orden de la portada) · **Pedido de Brandon:** *«cada tenant tiene un formato similar que
se personaliza desde el panel, pero quiero aplicar a tenants escogidos excepciones con código reutilizable y
código desde los archivos»*

## Contexto (medido el 01-10)

| Hecho | Medición |
|---|---|
| Interruptores por negocio | 7 sistemas distintos; el vivo es `TenantFeatureFlag` (27 filas, 7 de 14 negocios, todas `spec:*`) — **ninguno guarda opciones** |
| Excepciones escritas a mano | 30 comparaciones `=== / !== "main"` + 68 respaldos `?? / \|\| "main"`; 0 ids de Blas en código |
| Una de esas excepciones era un agujero | `payment-proof`: un admin de `main` leía comprobantes de cualquier negocio (arreglado en `20b59b1f0`) |
| CMS de bloques (`Page`/`PageBlock`/`BlockTemplate`) | construido (renderer, editor, API) y **0 filas**: sin entrada en el panel |
| `main` | cumple tres papeles a la vez: marketplace, el negocio que ve `localhost` y la bodega de prueba |

## Decisión

Cuatro capas, de menos a más a medida: **ajustes** (panel) → **plantilla por rubro** (ADR-100) → **páginas por
bloques** (CMS, se estrena) → **piezas** (nuevo).

### Piezas
- Código en archivos: `extensiones/<id>/` con un `manifest.ts` (id, nombre, versión, enchufes que llena,
  opciones con Zod `.strict()`, rubros sugeridos). Registro **estático** (`registro.servidor.ts` server-only +
  `registro.cliente.ts` con `next/dynamic`): el bundler ve todo y sólo se carga lo que un negocio usa.
- **Enchufes** con nombre, no «cualquier cosa en cualquier lado». Piloto: `tienda.portada` (agrega o
  reemplaza), `forestal.guia-impresa` (**sólo agrega** hojas/pie/CSS: las 3 copias oficiales de la GTF no se
  tocan) y `panel.pestana` (una pestaña «A medida» gateada como un módulo).
- **Si una pieza falla, se ve la versión normal** (`BordeDePieza` sobre el error boundary existente + Sentry;
  `cargar()` con tope de 2 s).
- La asignación vive en una tabla nueva **`TenantPieza`** (tenant × pieza × enchufe × prendida × opciones ×
  versión × quién): una fila por asignación, con historial. Migración **sólo expand** (tabla nueva y vacía).
  La asignación **nunca** va en el manifiesto: eso volvería a escribir ids de negocio en el código.
- Sólo el **superadmin** asigna (`requirePlatformAPI` + CSRF). El negocio sólo lee lo suyo. El `tenantId` sale
  de la sesión/host, nunca de las opciones.
- ESLint prohíbe en `extensiones/**` importar `prisma`, `pg`, `fs`, `child_process`: una pieza lee por DB
  classes como cualquier pantalla.

### Excepciones
Los `=== "main"` se reemplazan por helpers con nombre en `lib/tenancy/` según el papel que cumplen
(`esMarketplace`, `esTenantPorDefecto`, `esTenantProtegido`). Las excepciones de negocio reales (teléfonos de
aviso en crons, una siembra) pasan a opciones del dueño o a una pieza. Un test cuenta los literales por archivo
y **sólo puede bajar**; un literal de negocio distinto de `main` fuera de `lib/tenancy/` = 0. Lo que toca zona
de peligro (`cart-context`, middleware) se renombra con la misma semántica, en commit aparte y con `security`.

### Páginas por bloques
Se estrena el CMS existente: entrada en el panel, su acceso a datos pasa a `lib/db/` con `tenantId` primero, y
una pieza `pagina-por-bloques` puede llenar el enchufe de la portada: **el código vive en archivos, el
contenido lo edita el dueño**.

## Consecuencias
- Cambiar qué pieza tiene un negocio es instantáneo (panel); cambiar el código de una pieza pide publicar.
- Una pieza mal hecha no tumba al negocio, pero sí puede ser lenta: medir el tiempo de la portada antes y
  después.
- El rubro de Blas figura como `bodega`: corregirlo (dato del negocio, lo decide Brandon) antes de que la
  pantalla de negocios lo muestre.

## Alternativas descartadas
- **Código escrito o ejecutado desde el panel**: cualquiera con usuario admin ejecutaría lo que quiera en el
  servidor y vería datos de otros negocios.
- **Módulos cargados en caliente** (ADR-100 alternativa C): el bundler no los ve, sin tipos ni tests.
- **Interruptor + PlatformSetting para las opciones**: el mismo dato partido en dos tablas que se desincronizan,
  sin quién ni cuándo.
