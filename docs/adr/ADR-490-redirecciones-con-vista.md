# ADR-490 — Redirecciones con vista

- **Estado:** aceptado (2026-10-09). Ola 1 del plan «panel unificado» (`docs/panel/plan-unificacion-2026-10.md`, carril O1-K1a). No mueve pantallas: deja la plomería para que las olas 2-6 junten pestañas sin romper un solo enlace.
- **Pedido por:** Brandon (09-10) aprobó juntar pestañas (18 → 13 renglones, 34 → 23 pestañas) con la regla R3: **ningún id se retira**.
- **Hermano:** ADR-489 (contrato de diseño del panel, misma ola).

## 1. Contexto (medido, sólo lectura)

- `Notification.actionUrl` guarda **271 avisos** con `tab=` en un enlace `/admin?…`, en 9 ids (09-10): `cacao-acopio` 85, `cobranza` 74 (alias desde el 09-10), `ordenes` **60 rotos** en 5 negocios (el aviso «Nuevo pedido marketplace» usa el formato viejo `/admin?module=marketplace&tab=ordenes`: `tab` no va primero y nadie lee `module`), `demand-prediction` **30 rotos** (el cron `app/api/cron/demand-forecast` escribe un id que nunca fue pestaña: caían en Inicio), `camaras` 9, `ctp-libro-operaciones` 5, `documentos` 5, `plata` 2, `forestal-herramientas` 1. Fuera de la base: links de WhatsApp ya enviados, favoritos, recientes, atajos y `admin_active_tab` en cada navegador.
- En el código, `lib/billing/alerts/templates.ts` manda el correo de límite del plan a `?tab=subscription` (no existe: caía en Inicio). Los push de stock bajo y de productos sin ventas (`app/api/cron/stock-alerts-notify`, `dead-stock-report`) mandan a `/admin?module=inventario&tab=stock`, que tampoco abría nada. El guardián de enlaces sólo miraba `components/admin` y `app/admin/_components`, no `app/api` ni `lib`, donde se arman los avisos, y buscaba `/admin?tab=`: veía `tab` sólo cuando iba primero.
- **Dos órdenes distintos**: la URL migraba el alias ANTES de validar contra `VALID_TABS`; `navigateTab` validaba primero. Hoy da lo mismo (0 ids están en las dos listas con destinos distintos), pero una fusión deja el id viejo en `VALID_TABS` (receta del plan §6.2) y con el orden de `navigateTab` el alias nunca se aplicaba.
- `TAB_MIGRATION` sólo sabía decir «otra pestaña»: no había cómo decir «la vista *a* de la pestaña *B*». Y `TAB_MIGRATION[id]` a secas devolvía `Object.prototype` (`?tab=constructor` dejaba el panel en blanco); `navigateTab` con un id inexistente, también.

## 2. Decisión

1. **Contrato** (`lib/admin/destino-tab.ts`): `DestinoTab = { tab, vista?, sub? }`. `TAB_MIGRATION: Record<string, Tab | DestinoTab>` (un `Tab` = nombre nuevo del mismo módulo; un `DestinoTab` = el contenido se mudó a una vista de otra pestaña). `VISTA_MIGRATION: Record<"tab:vista", DestinoTab>` para vistas que se mudan (vacío; lo llenan los integradores de cada ola).
2. **Una sola receta, `resolverDestino(id, vista?)`**, para la URL (`?tab=` y `#`), `admin_active_tab`, `navigateTab`, `popstate` y los atajos de la barra. En carriles hermanos: el filtro por rol (`lib/module-permissions.ts`) y, en `lib/admin/permiso-vista.ts`, los rótulos de la plantilla y favoritos y recientes (`normalizarGuardadas`: al leerlos, sin reescribir el navegador; sólo un id que ya no es pestaña sigue el alias). Los ocultos **no** siguen alias, a propósito (`normalizarOcultas`): ocultar un pedazo viejo escondería la pestaña entera que lo absorbió. Orden: par `(tab, vista)` → alias (si trae vista, la suya gana y el `sub` viejo no viaja; si es sólo un nombre nuevo, la vista del link viaja) → se repite hasta que nada cambie (cadenas: `demand-prediction → forecasting → …`) → tiene que quedar una pestaña conocida (`VALID_TABS` o destino de un alias). Ciclo o id desconocido → `null`. Claves con `Object.hasOwn`, id con `trim` + minúsculas.
3. **La URL se corrige** con `replaceState`: sólo cambian `tab`, `vista` y `sub`; `?lote=`, `?cliente=` y el resto se conservan (mudar = montar el MISMO componente, R5). El hash, si repetía el id viejo, pasa al nuevo. Un id que no existe hace `logger.warn` (una vez por id) y cae en Inicio sin tocar la URL.
4. **Momento de la escritura (Next 16):** el destino se escribe en la URL al dibujar el panel, con `history.state` tal cual (así el `useVistaModulo` del módulo lee la vista del alias en su primer render, sin parpadeo, y el parche de Next no despacha nada durante el render), y se reafirma una vuelta después con `replaceState(estado propio)`: Next reescribe la entrada inicial con SU url (la del alias) en el primer commit y recién después parchea `history`; con el parche puesto, el `replaceState` sincroniza `useSearchParams`.
5. **Alias nuevos de esta ola:** `demand-prediction → forecasting`, `subscription → plan` y, del formato viejo `?module=x&tab=y`, `ordenes → marketplace` (sin vista: Marketplace elige su sección con estado local hasta la ola 4) y `stock → inventario › Stock`. Guardián: el 2.º caso de `enlaces-panel-sin-recargar-guard` recorre también `app/api` y `lib`, encuentra `tab=` en cualquier lugar de la query de un `/admin?…` y exige que resuelva a una rama de `TabRouter`.

## 3. Consecuencias

- **Positivas:** los 30 avisos de predicción abren Predicción; el correo del plan abre Plan; una fusión es una línea en `TAB_MIGRATION` y todo lo guardado la sigue; `navigateTab` ya no deja el panel en blanco; un alias viejo en la URL queda como el id de hoy (link copiable).
- **Negativas:** una escritura de `history` durante el render (idempotente: la segunda pasada de StrictMode ya ve la URL corregida) y dependencia de cómo Next 16 maneja la entrada inicial (`app-router.js`, `HistoryUpdater`); si Next cambia, el síntoma es que la URL vuelve a mostrar el alias, no que se abra otra pantalla.
- **Comportamiento que cambia:** `?tab=inicio`, `?tab=kardex` y demás alias dejan de quedarse en la barra de direcciones: pasan al id de hoy. `admin_active_tab` con un id que ya no existe avisa en la consola.
- **Vuelta atrás:** revertir el commit; los alias son aditivos y ningún dato de la base cambia.

## 4. Alternativas evaluadas

| Opción | Por qué se descartó |
|---|---|
| Redirigir en `proxy.ts` / `redirects` de `next.config` | El hash y `localStorage` no llegan al servidor; `proxy.ts` es zona de peligro; recargaría el panel entero |
| Reescribir los `actionUrl` guardados en la base | Los WhatsApp enviados y los favoritos no están en la base; es un cambio de datos para algo que el panel resuelve solo (R3) |
| Escribir la URL sólo en un efecto | El módulo ya dibujó su vista por defecto: parpadeo y una carga de más |
| Escribir la URL sólo al dibujar | Next la devuelve al alias en el primer commit |
| Mantener dos órdenes | Con el de `navigateTab`, un id fusionado que sigue en `VALID_TABS` nunca llegaba a su casa nueva |

## 5. Verificación

- [x] `__tests__/destino-tab.test.ts`: alias, pares, cadenas, ciclos, id desconocido, prototipo, URL que conserva parámetros (también con `tab` después de `module`), los 9 ids de los avisos, `useAdminTabs` con `renderHook` (carga, `admin_active_tab`, `navigateTab`, `popstate`) y atajos guardados.
- [x] `__tests__/enlaces-panel-sin-recargar-guard.test.ts` con `app/api` y `lib`.
- [x] El caso Next en `jsdom`: la entrada inicial devuelta al alias (lo que hace `HistoryUpdater`) se reafirma una vuelta después y conserva la vista que puso el módulo.
- [x] Guardián con `tab` en cualquier lugar de la query: 168 enlaces (antes veía 161); los 7 nuevos (`ordenes` ×5, `stock` ×2) resuelven con sus alias.
- [ ] Capturas de `?tab=fiados`, `?tab=demand-prediction`, `?tab=zzz`, `?module=marketplace&tab=ordenes` y `?module=inventario&tab=stock` en `main`: pendientes al cerrar la ola 1. El servidor de desarrollo no contestó `/login` (09-10: su log quedó mudo desde las 18:47; reintentos 18:58-19:29).

## 6. Referencias

- Plan: `docs/panel/plan-unificacion-2026-10.md` §1 (R3, R5), §2.3 (alias finales), §6.1-6.2.
- Código: `lib/admin/destino-tab.ts`, `app/admin/_lib/tab-migration.ts`, `app/admin/_hooks/useAdminTabs.ts`, `app/admin/_hooks/useSidebarShortcuts.ts`.
- Memorias: `historial-marca-y-navigation-api` (parche de `history` en Next 16), `enlace-a-tab-inexistente-panel-en-blanco`.
