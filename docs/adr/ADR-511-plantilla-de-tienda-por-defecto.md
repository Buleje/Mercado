# ADR-511 — La tienda de cada negocio usa por defecto la plantilla nacida de Musa

- **Estado:** aceptado (2026-10-20). Sin schema: usa `Settings.storeThemeJson` (`tiendaPlantilla`).
- **Pedido por:** Brandon (20-10): «que sea como base el formato, diseño, estructura como la de Musa en general para todos».
- **Relacionados:** ADR-457 (piezas), ADR-458 (página propia, una por negocio), ADR-460 (la página propia viste toda la tienda).

## Contexto

De los 10 negocios activos (medido 20-10), 2 tienen página propia prendida (`musa` = `pagina-musa`, `main` = Buleje Beauty). Los otros 8 ven la página general (`components/store/pagina-publica/PaginaGeneral.tsx`, 1.154 líneas más sus datos), armada para la bodega: el diseño de Musa (portada, círculos de categoría, catálogo, ficha y bolsa) sólo lo tenía Musa.

La página propia es de UN negocio (`guardarPaginaPropia` lo hace cumplir): no sirve para dársela a todos. Y la elección de página estaba repartida: la portada (`/t/[slug]` + `EnchufePagina`) consultaba las piezas por su lado y el resto de la tienda (marco, catálogo, ficha, metadatos) por `paginaPropiaDeLaTienda`.

## Decisión

1. **El orden, en un solo punto** (`lib/extensiones/elegir-pagina.ts`, `elegirPaginaDeLaTienda(tenantId)`):
   1. la página propia prendida del negocio (ADR-458);
   2. la plantilla `extensiones/pagina-tienda/` (nacida de `pagina-musa`, con los datos de cada negocio), salvo que el dueño eligió «Clásico»;
   3. la página general de siempre.
   La usan `/t/[slug]` (portada) y `EnchufePagina`; `paginaPropiaDeLaTienda` (marco del layout, catálogo `/tienda`, ficha y metadatos) pasa por ella y expone `origen: "propia" | "plantilla"`.
2. **La plantilla no se asigna negocio por negocio.** Se registra en `extensiones/registro.servidor.ts` como `PLANTILLA_TIENDA`, FUERA de `PIEZAS_SERVIDOR`: no sale en el catálogo del superadmin ni pasa por `guardarPaginaPropia`.
3. **El interruptor del dueño**: Mi Tienda › Apariencia › Identidad › «Formato de tu tienda»: Nuevo (como Musa) / Clásico, y en el nuevo «Pedidos por»: checkout / WhatsApp. Se guarda en `storeTheme.tiendaPlantilla` por `PUT /api/settings` (merge por clave, `requireAdmin`), que lo valida con el Zod de la plantilla (`PlantillaSchema`); se lee con `leerPlantilla` (`safeParse`, por defecto Nuevo + checkout).
4. **Metadatos**: canónica y `og:url` con el dominio de la petición (`origenDeLaPeticion`); imagen `ogImageUrl` → `heroImageUrl` → `/api/og` con el nombre del negocio; ícono = el logo del negocio. Si la plantilla no trae `metadatosPagina`, los arma `lib/extensiones/metadatos-plantilla.ts`. Las URL completas (logo en el almacenamiento) quedan tal cual; las `data:` se saltan.
5. **Respaldo intacto**: `?sinPiezas=1` = la general pura; si el código de la plantilla tira o pasa el tope de 2 s, la general (ADR-457); si no se pueden leer los ajustes, la general (sin saber si eligió «Clásico», no se le cambia la tienda).

## Alternativas descartadas

- **Asignar la plantilla negocio por negocio** (una fila de `TenantPieza` por negocio): choca con la exclusividad de la página propia, obliga al superadmin a prenderla en cada alta y un negocio nuevo nacería con la vieja.
- **Rehacer la página general**: 1.154 líneas con ventanas emergentes, cuenta regresiva y bloques del editor que algunos negocios usan; cambiarla rompía a todos a la vez y sin vuelta atrás. «Clásico» la conserva entera.

## Consecuencias

- Los 8 negocios sin página propia ven la plantilla desde el primer pedido después del cambio, sin que nadie toque nada; el que no la quiera elige «Clásico».
- Las ventanas emergentes (bienvenida, salida) y la cuenta regresiva del editor sólo se ven en «Clásico».
- v1 sin kits (Musa los arma a mano en su página propia).
- Un negocio con una pieza de `tienda.portada` prendida (madera disponible, por bloques) se queda con la página general: sólo la general dibuja esas piezas y la plantilla las escondería sin aviso (revisión 20-10; hoy 0 filas).
- `returnPolicyDays` vale 7 por defecto de la columna y ningún editor lo toca: la plantilla no lo promete; sólo `storeTheme.devolucionDias` si el dueño lo guarda.
- Con página propia prendida (main, Musa) el formato no se ve: el editor lo avisa arriba con el nombre de la pieza (`GET /api/admin/store-customizer/pagina-propia`, sólo dueño, tenant de la sesión, misma regla que `elegir-pagina.ts`) y deja las opciones atenuadas pero elegibles.
- Musa y main siguen con su página propia: la plantilla no las toca.
- **Pendiente**: la raíz por subdominio o dominio propio (`app/(store)/page.tsx` → `TenantStoreHome`) no monta `tienda.pagina` — ni la propia ni la plantilla —; hoy sólo `/t/<negocio>` y `…/tienda` (por el proxy, `/t/<x>/tienda` → `/tienda`).
- `PUT /api/settings` deja pasar a encargado (management tier de `requireAdmin`), igual que el resto de Apariencia.
