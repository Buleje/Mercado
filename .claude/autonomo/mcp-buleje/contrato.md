# Contrato — MCP «buleje» (Claude Code ↔ panel en localhost:3000)

> Architect, 29-10-2026. SOLO diseño. Decisiones de Brandon (29-10): panel de su PC, usuario propio «Claude» por negocio, ver todo / crear-editar / plata-stock-borrar con OK previo.
> Marcado «sin verificar» = no medido en esta pasada (mem-guard bloqueó parte de la exploración).

## 0. Mapa del estado real (qué se reusa, qué es nuevo)

| Pieza | Existe | Dónde | Decisión |
|---|---|---|---|
| Login HTTP admin | Sí | `app/api/auth/login/route.ts:84-304` (body `{username,password,tenantSlug}`, cookies `buleje-admin-sess` 15 min + `buleje-admin-refresh` 7 d, `lib/session.ts:12-15`) | **Reusar** tal cual |
| Refresh | Sí | `app/api/auth/refresh/route.ts:26` (rechaza usuario inactivo, `:143-145`) | Reusar |
| CSRF | Sí | `proxy.ts:83-87` + `lib/csrf.ts` (double-submit: cookie `csrf-token` de cualquier GET, header `x-csrf-token` en POST/PATCH/PUT/DELETE; el login no lo exige) | Reusar, igual que `scripts/qa-capturas.mjs:904-927` |
| Rate limit login | Sí | `lib/rate-limit.ts:393` LOGIN 20/h prod (100 dev) + lockout por usuario 15 min (`login/route.ts:~122`) | El MCP nunca reintenta un login fallido más de 1 vez |
| API keys `sk_` | Sí, pero NO sirven | `prisma/schema.prisma:2756` `ApiKey`, `lib/api-keys.ts`; solo las acepta `lib/sync/auth-agente.ts` (`/api/sync/*`, da `tenantId` sin usuario ni rol) | **No usar**: para que las rutas admin las acepten hay que tocar `lib/require-admin.ts` (~230 rutas, peligro) y se pierde el autor |
| Alta de usuarios | Sí | `app/api/admin-users/route.ts:12-17` (`role: admin|cajero|almacenero`, `newPasswordSchema`), `[id]/route.ts` PATCH `active`/`role` | **Reusar** desde la UI de Equipo |
| Autoría | Sí | `ActivityLog.user` (`schema.prisma:1497`), `GET /api/activity-log?user=&entity=&action=&cursor=&limit=` | Reusar; el usuario `claude` aparece como autor |
| MCP viejo | Sí, **obsoleto** | `tools/mcp-bodega/` (commit 483212c08): SDK ^1.0, habla **pg/Prisma directo** (sin RBAC ni auditoría), no registrado | **No reusar**; borrarlo en la fase 0 (podar > agregar) |
| Patrón carpeta propia | Sí | `tools/buleje-sync/`, `tools/mcp-bodega/` (fuera de `workspaces: packages/*`) | Mismo patrón: `tools/mcp-buleje/` |
| SDK MCP | No en el repo | solo en cache npx (`~/.npm/_npx/.../sdk` 1.18.0) | Nuevo: `@modelcontextprotocol/sdk` 1.x vigente (fijar con `npm view` al construir) |
| Prender el panel | Sí | `~/.local/bin/panel` (prende solo si :3000 está libre) → `panel-desarrollo` (mata el puerto y lanza `npm run dev`) | Reusar la lógica de `panel`, nunca `panel-desarrollo` con el puerto ocupado |

## 1. Decisiones

1. **Autenticación = login usuario+clave del usuario «claude»** (uno por negocio), credenciales en `~/.config/buleje-mcp/credenciales.json` (chmod 600, fuera del repo). Cero cambios en `lib/auth/**`, `proxy.ts`, `lib/middleware/**`. Token de servicio descartado (ver ADR §9).
2. **Rol `admin`** creado por Brandon en *Ajustes › Equipo* de cada negocio (`POST /api/admin-users`, `name: "Claude"`, `username: "claude"`). `manager` no: no está en el enum de la ruta (`route.ts:15`) y además es del mismo «management tier» que admin (`lib/require-admin.ts:80`), así que no restringiría nada. `cajero/almacenero` darían 403 en lo forestal (`ctp` POST pide `["admin","owner"]`).
   - **Quitarle permisos**: `PATCH /api/admin-users/[id] {active:false}` → el login lo rechaza (`login/route.ts:145`) y el refresh también (`refresh/route.ts:144`); la sesión viva muere en ≤15 min. O bajarlo a `cajero`.
3. **El MCP es un cliente HTTP** de `http://localhost:3000`. Nunca importa `lib/**`, nunca Prisma/pg.
4. **Confirmación humana la impone Claude Code, no el modelo**: la herramienta `confirmar` va en `permissions.ask` del settings de usuario (todas las de lectura en `allow`). El aviso de permiso de Claude Code le muestra a Brandon el `resumen` que viaja como argumento; el MCP verifica que ese resumen sea el mismo que generó (hash), así el modelo no puede mostrar otro texto.
5. **Sin herramienta genérica de escritura.** Solo `leer_get` genérico, con lista blanca.
6. **Ubicación**: `tools/mcp-buleje/` en `.mjs` con JSDoc (como `scripts/*.mjs`): sin build, sin entrar al `tsc` del repo. Lógica pura sin importar el SDK (testeable con el vitest raíz); el SDK solo en `servidor.mjs`.

## 2. Configuración local (fuera del repo)

```jsonc
// ~/.config/buleje-mcp/credenciales.json  (chmod 600; lo escribe `node tools/mcp-buleje/configurar.mjs`, pide la clave sin eco)
{
  "base": "http://localhost:3000",
  "porDefecto": "bodega",
  "negocios": {
    "bodega": { "slug": "main", "usuario": "claude", "clave": "…" },
    "blas":   { "slug": "<slug exacto de id cmpxiv6p4000bohvzwl6bnfpv>", "tenantId": "cmpxiv6p4000bohvzwl6bnfpv", "usuario": "claude", "clave": "…" },
    "qa-forestal": { "slug": "inversiones-agroforestales-blas-sociedad-op-qa-ui", "usuario": "claude", "clave": "…" }
  }
}
```
- Slug de Blas: **sin verificar** (el hook dice `inversiones-agroforestales-blas-sociedad-anonima`); `configurar.mjs` lo confirma con `node scripts/sql-lectura.mjs 'select slug from "Tenant" where id = $1' cmpxiv6p4000bohvzwl6bnfpv`.
- Claves distintas por negocio (el login global ADR-120 con la misma clave en 2 tiendas pide «elegir tienda»; igual el MCP manda siempre `tenantSlug`).
- Estado: `~/.local/state/buleje-mcp/sesion-<negocio>.json` (chmod 600, solo cookie de refresh + csrf; evita un login —y un `login_success` + aviso de dispositivo nuevo— por cada arranque de Claude Code) y `~/.local/state/buleje-mcp/llamadas-AAAA-MM.jsonl`.
- `~/.claude/settings.json`: `permissions.allow: ["mcp__buleje__*_ver","mcp__buleje__*_listar",…]` (todas las de lectura y escritura normal), `permissions.ask: ["mcp__buleje__confirmar"]`, `permissions.deny: ["Read(~/.config/buleje-mcp/**)","Bash(*buleje-mcp/credenciales*)"]`.
- Registro: `claude mcp add buleje --scope user -- /home/usuario/.local/bin/node-default /home/usuario/proyectos/Mercado/tools/mcp-buleje/servidor.mjs` (transporte stdio).

## 3. Contrato de código (`tools/mcp-buleje/`)

```
tools/mcp-buleje/
  package.json            # deps: @modelcontextprotocol/sdk (1.x vigente), zod (la que pida el SDK; si acepta v4, v4 como el repo — sin verificar)
  servidor.mjs            # McpServer + StdioServerTransport; registra catálogo, recursos, prompts
  configurar.mjs          # alta de credenciales (sin eco) + prueba de login por negocio
  src/credenciales.mjs    # leerCredenciales(): Config  (valida con safeParse; nunca loguea la clave)
  src/sesion.mjs          # class Sesion { negocio; jar; csrf; asegurar(); refrescar(); entrar() }
  src/cliente.mjs         # pedir(negocio, {metodo, ruta, query?, cuerpo?, archivo?}): Respuesta
  src/lista-blanca.mjs    # rutaLecturaPermitida(ruta): {ok, motivo}
  src/confirmaciones.mjs  # proponer() / confirmar() / pendientes() / cancelar()
  src/registro.mjs        # anotar(evento) → jsonl, con redacción
  src/panel-local.mjs     # estadoPanel(), prenderPanel()
  src/formato.mjs         # S/ 1.234,50 · PT primero, después m³ y piezas · recorte a N filas
  src/herramientas/<dominio>.mjs   # un archivo por grupo (§4)
  README.md
__tests__/mcp-buleje/*.test.ts     # vitest raíz (include `__tests__/**/*.test.ts`)
```

### 3.1 Tipos (JSDoc en `src/tipos.mjs`)

```ts
type Negocio = "bodega" | "blas" | "qa-forestal" | string;          // clave de credenciales.json
type Pedido = { metodo: "GET"|"POST"|"PATCH"|"PUT"|"DELETE"; ruta: string; query?: Record<string,string|number|boolean>; cuerpo?: unknown; archivo?: { ruta: string; campo: string } };
type Respuesta = { ok: boolean; status: number; datos?: unknown; error?: { codigo: ErrorMcp; mensaje: string; detalle?: unknown }; ms: number; truncado?: boolean };
type ErrorMcp = "panel_apagado" | "compilando" | "sin_sesion" | "sin_permiso" | "no_existe" | "datos_invalidos"
              | "limite" | "ruta_no_permitida" | "token_vencido" | "token_usado" | "token_otro_negocio" | "resumen_distinto" | "servidor";
type Tipo = "lectura" | "escritura" | "confirmar";
type DefHerramienta<A> = {
  nombre: string; grupo: string; tipo: Tipo; descripcion: string;          // descripción en español, dice la unidad
  entrada: ZodRawShape;                                                     // SIEMPRE incluye negocio?: string
  pedido: (args: A) => Pedido | Pedido[];                                   // puro, sin red
  previa?: (args: A, leer: (p: Pedido) => Promise<Respuesta>) => Promise<unknown>; // GET opcional para mostrar «antes → después»
  resumen?: (args: A, previa: unknown) => string;                           // OBLIGATORIO si tipo = "confirmar"
  formatear?: (datos: unknown, args: A) => string;
};
type Propuesta = { token: string; negocio: Negocio; herramienta: string; pedidos: Pedido[]; resumen: string; hashResumen: string; creada: number; vence: number; usada: boolean };
```

### 3.2 Reglas del cliente (`cliente.mjs` + `sesion.mjs`)
- Primer pedido: `GET /api/health` (tope 20 s; si no, `/login` 60 s) para la cookie `csrf-token`; `POST /api/auth/login` con `x-tenant-id: <slug>` y body `{username,password,tenantSlug}` (calco de `qa-capturas.mjs:917-927`).
- Escrituras: header `x-csrf-token`. `User-Agent: BulejeMCP/1.0 (Claude)` fijo (huella estable para `AdminLoginDevice`; que no choque con `lib/middleware/threat-detection.ts:85-89` = **sin verificar**).
- `401 session expired` → 1 `POST /api/auth/refresh` → reintento 1 vez → si no, 1 login → si falla, `sin_sesion` (jamás bucle: lockout por usuario).
- `403` → `sin_permiso` con el `message` del servidor («Brandon le quitó permisos» se lee así). `400` → `datos_invalidos` con `issues` de Zod. `404` → `no_existe`. `429` → espera `Retry-After` (≤10 s) 1 vez, si no `limite`. `500` con HTML → `compilando` (nombra el archivo, como `qa-capturas.mjs:928-935`).
- Puerto cerrado: chequeo con `ss -ltnH` / socket con tope 1,5 s (WSL mirrored cuelga en vez de rechazar) → `panel_apagado` con «prender: `panel` o la herramienta `panel_prender`».
- Primer pedido a una ruta: tope 90 s (Turbopack compila); el resto 30 s.
- Límite propio: 60 pedidos/min por negocio (cubeta), 5 escrituras/min.
- Salida: máx. 50 filas y ~20 KB por respuesta; si recorta, `truncado: true` + cómo pedir la página siguiente (`page`/`cursor`/`limit` de cada ruta).
- Todos los args pasan por `safeParse` antes de armar el pedido (además del schema del SDK).

### 3.3 Lista blanca de `leer_get` (`lista-blanca.mjs`)
- Normalizar antes de comparar: `decodeURIComponent` repetido hasta estable, rechazar `..`, `%2e`, `\`, `//`, `;` (memoria `filtro-rutas-lista-negra-se-evade`: `%252e%252e` evadió un filtro el 23-10).
- **Permitido** (prefijos): `/api/admin/(today-summary|inicio|dashboard|overview|ventas-overview|por-cobrar|agenda/hoy|agenda/calendario|forestal/(ctp|gtf|lotes|lotes-aserrio|lotes-mixtos|wood-entries|cubicaciones|anexos|distribuciones|reportes-diarios|especies|directorio|fletes|tramites|plan|loth|contratos|salidas-por-registrar|cuenta|operaciones)|documents)`, `/api/(sales|orders|inventory|inventory-movements|products|purchases|compras|suppliers|customers|fiados|adelantos|rrhh|treasury|cash-registers|cierre-diario/preview|daily-report|daily-digest|tasks|notes|search|activity-log|audit-trail|stats)`.
- **Prohibido aunque calce** (gana siempre): `/api/(auth|admin-users|api-keys|superadmin|cron|sync|backup|backups|debug-tenant-leak|internal|dev|webhooks)`, `/api/admin/(security|export-all|clear-data|seed-data|demo-products|backup|2fa|n8n)`, y cualquier ruta que contenga `/export`, `/csv`, `/ics`, `/purga`, `/anular-dia`, `/statement-link`, `/shares`.
- **Riesgo**: hay GET con efectos (p. ej. `ctp/purga GET`, `ctp/anular-dia GET` se excluyen por nombre); antes de ampliar la lista, leer el handler.

### 3.4 Confirmación (`confirmaciones.mjs`)
1. Herramienta `tipo:"confirmar"` → valida args → corre `previa` (solo GET) → arma `pedidos` → `proponer()` guarda `Propuesta` en memoria (no en disco) → responde **sin tocar la red de escritura**: `{token, resumen, vence}` y el texto «Para hacerlo, llamá `confirmar` con este token y este resumen».
2. Token: 128 bits base32 (`crypto.randomBytes(16)`), vence a los **120 s**, **un solo uso**, atado a `negocio` + `herramienta` + `sha256(JSON canónico de pedidos)` + `sha256(resumen)`.
3. `confirmar({token, resumen})` (en `permissions.ask` → Claude Code le pregunta a Brandon mostrando ambos) → rechaza `token_vencido` / `token_usado` / `resumen_distinto` / `token_otro_negocio` → marca usado ANTES de enviar → ejecuta los pedidos en orden; si uno falla, corta y lo dice (no hay deshacer automático).
4. Idempotencia: si la ruta la acepta, `proponer()` genera la clave y la mete en el cuerpo (`idempotencyKey` en `POST /api/sales` `sales/route.ts:71` y `POST /api/adelantos` `adelantos/route.ts:45`, `adelantos/entregar` `:82`): un reintento de red no duplica plata.
5. `pendientes()` lista propuestas vivas (recurso); `cancelar({token})`.
6. Modo a seco: `BULEJE_MCP_SECO=1` (o `seco:true` en la llamada) → toda escritura y todo `confirmar` devuelven el `Pedido` que mandarían, sin red. **Por defecto encendido** hasta pasar la fase 4 en `qa-forestal`.

### 3.5 Registro (`registro.mjs`)
Una línea JSON por llamada: `{ts, herramienta, tipo, negocio, metodo, ruta, status, ms, seco, token?: "<6 primeros>", confirmado?: true, error?}`. Redacta `clave|password|token|cookie|authorization|dni|telefono` → `"***"`. Rotación mensual. Recurso `buleje://registro/hoy`.

## 4. Catálogo (38 herramientas)

L = lectura · E = escritura normal (sin OK) · C = pide confirmación (plata, stock, borrar, envío afuera). Todas aceptan `negocio`.

| # | Grupo | Herramienta | Tipo | Ruta real | Entrada / schema del servidor |
|---|---|---|---|---|---|
| 1 | Sistema | `panel_estado` | L | socket :3000 + `GET /api/health` | — |
| 2 | Sistema | `panel_prender` | E local | `panel` si :3000 libre (nunca mata `node`); se niega con <8 GB libres (`free -g`) | — |
| 3 | Sistema | `negocios` | L | credenciales + `GET /api/auth/me` (sin verificar forma) | — |
| 4 | Sistema | `leer_get` | L | lista blanca §3.3 | `{ruta, query?}` |
| 5 | Sistema | `confirmar` | **ask** | ejecuta la propuesta | `{token, resumen}` |
| 6 | Sistema | `pendientes` / `cancelar` | L/E | memoria del MCP | `{token?}` |
| 7 | Hoy | `hoy_resumen` | L | `GET /api/admin/today-summary` (roles admin,cajero) · Blas: `GET /api/admin/inicio/forestal` | — |
| 8 | Hoy | `tablero` | L | `GET /api/admin/dashboard`, `/api/admin/overview`, `/api/admin/ventas-overview` | `{desde?, hasta?}` |
| 9 | Hoy | `reporte_diario` | L | `GET /api/daily-report`, `GET /api/cierre-diario/preview` | `{fecha?}` |
| 10 | Hoy | `buscar` | L | `GET /api/search?q=` (`QuerySchema`, `ROLES_BUSCADOR`) | `{q}` |
| 11 | Ventas | `ventas_listar` | L | `GET /api/sales?from&to&today&page&limit&cashierId` | |
| 12 | Ventas | `venta_ver` | L | `GET /api/sales/[id]` · `GET /api/sales/resumen-hoy` | `{id?}` |
| 13 | Ventas | `venta_registrar` | **C** | `POST /api/sales` (`SaleSchema`, `idempotencyKey`) | ítems, pago |
| 14 | Ventas | `venta_devolver` | **C** | `POST /api/sales/devolucion` | |
| 15 | Caja | `caja_ver` | L | `GET /api/cash-registers`, `/movements`, `/por-dia`, `/historial`; `GET /api/treasury/resumen` | |
| 16 | Caja | `caja_movimiento` | **C** | `POST /api/cash-registers/movements` · `POST /api/treasury/movimientos` · `POST /api/treasury/transferencias` | |
| 17 | Caja | `caja_cerrar_turno` | **C** | `POST /api/cash-registers/close-shift` · `POST /api/cierre-diario` | |
| 18 | Pedidos | `pedidos_listar` / `pedido_ver` | L | `GET /api/orders`, `/api/orders/[id]`, `/api/orders/historial` | |
| 19 | Pedidos | `pedido_estado` | **C** | `PATCH /api/orders/[id]` (máquina de estados de `orders.db.ts`; mueve stock/pago) | `{id, estado}` |
| 20 | Inventario | `stock_ver` | L | `GET /api/inventory/stock-alerts`, `/kardex`, `/expiry`, `GET /api/products` | |
| 21 | Inventario | `stock_mover` | **C** | `POST /api/inventory-movements` · `POST /api/inventory/conteo` | |
| 22 | Compras | `compras_listar` | L | `GET /api/purchases`, `/api/compras/buscar`, `/api/compras/cxp-calendar`, `GET /api/suppliers` | |
| 23 | Compras | `compra_registrar` | **C** | `POST /api/purchases` · `POST /api/compras/recepciones` (plata + stock) | |
| 24 | Compras | `proveedor_guardar` | E | `POST /api/suppliers`, `PATCH /api/suppliers/[id]` | |
| 25 | Clientes | `clientes_ver` | L | `GET /api/customers` (RUTAS_PANEL: admin), `/api/customers/[phone]` | |
| 26 | Clientes | `fiados_ver` | L | `GET /api/fiados`, `/api/admin/por-cobrar` | |
| 27 | Clientes | `fiado_cobrar` | **C** | `POST /api/fiados/cobrar` · `/api/fiados/cobro-masivo` | |
| 28 | Clientes | `cliente_guardar` | E | `POST /api/customers`, `PATCH /api/customers/[phone]` | |
| 29 | Adelantos | `adelantos_ver` | L | `GET /api/adelantos` (`ListSchema` `adelantos/route.ts:83`: status, beneficiarioId, modalidad, search, direccion), `/resumen`, `/cuentas`, `/analisis` | |
| 30 | Adelantos | `adelanto_dar` | **C** | `POST /api/adelantos` (`CreateSchema`, `idempotencyKey` ADR-448) · `POST /api/adelantos/entregar` | |
| 31 | Adelantos | `adelanto_cambiar` | **C** | `PATCH`/`DELETE /api/adelantos/[id]` | |
| 32 | CTP | `ctp_ver` | L | `GET /api/admin/forestal/ctp?…` (params `disponibles, especie, historial, dias, conciliacion…`), `/ctp/movimiento`, `/ctp/rendimiento`, `/ctp/reportes`, `/ctp/cierre` GET; ingresos `GET /wood-entries`, `/wood-entries/aggregate`, `/wood-entries/recepcion`; producción `GET /lotes`, `/lotes-aserrio` | PT primero, después m³ y piezas |
| 33 | CTP | `ctp_registrar` | **C** | `POST /api/admin/forestal/ctp` (roles admin,owner), `POST /wood-entries` (madera = stock) | |
| 34 | GTF | `gtf_ver` | L | `GET /api/admin/forestal/gtf?estado&permiso&sinIngresar&titular&gtfNumber&id`, `/gtf/resumen-interno`, `/gtf/serfor`; Anexo 04: `GET /api/admin/forestal/anexos?id`, `/anexos/a-despacho` | |
| 35 | Cubicación | `cubicaciones_ver` / `cubicacion_guardar` | L / **C** | `GET`/`POST /api/admin/forestal/cubicaciones?despachoId&enLibro` (desde ADR-522 el guardado toca el saldo de la cuenta → plata) | |
| 36 | Documentos | `docs_buscar` · `doc_subir` · `doc_papelera` | L · E · **C** | `GET /api/admin/documents` (params sin verificar), `/[id]`; `POST /api/admin/documents` (multipart; solo archivos bajo `Semana actual/` o `~/Descargas`, ≤25 MB); `POST /api/admin/documents/trash` | |
| 37 | RRHH | `rrhh_ver` · `asistencia_marcar` · `pago_semana` | L · E · **C** | `GET /api/rrhh/resumen`, `/colaboradores`, `/asistencia`; `PUT /api/rrhh/asistencia`; `POST /api/rrhh/pago-semana` | |
| 38 | Tareas | `tareas` · `notas` · `agenda_hoy` · `actividad` · `reporte_diario_enviar` | L/E · E · L · L · **C** | `GET/POST /api/tasks`, `PATCH /api/tasks/[id]` (DELETE = C); `GET/POST/PATCH /api/notes` (DELETE = C); `GET /api/admin/agenda/hoy`; `GET /api/activity-log?user=claude`; `POST /api/admin/forestal/reportes-diarios/[id]/enviar` (sale por correo) | |

Conteo: Sistema 6 · Hoy/búsqueda 4 · Ventas+caja 7 · Pedidos 2 · Inventario 2 · Compras 3 · Clientes/fiados 4 · Adelantos 3 · CTP 2 · GTF/Anexo 1 · Cubicación 1 · Documentos 1 (3 acciones) · RRHH 1 (3 acciones) · Tareas/agenda 1 (5 acciones) → **38 filas, 15 de tipo C**. Si el SDK lista mejor herramientas chicas, las filas 36-38 se parten (≈46).

Bodega-only o Blas-only: el MCP oculta lo forestal en `bodega` y avisa (no 404 mudo).

## 5. Recursos y prompts
- Recursos: `buleje://negocios` (negocios + sesión viva + modo a seco) · `buleje://{negocio}/hoy` (= `hoy_resumen` formateado) · `buleje://pendientes` (propuestas vivas) · `buleje://registro/hoy` (últimas 50 llamadas).
- Prompts: `hoy_en_tu_negocio` (bodega + Blas: ventas, caja, por cobrar, adelantos abiertos, saldo CTP en PT/m³/piezas, GTF sin ingresar, tareas de hoy) · `cierre_del_dia` (preview del cierre, sin cerrar) · `adelantos_abiertos` · `cuadre_ctp` (el cuadro tiene que cerrar `A+B+D−C−E = final` antes de decir «cuadra»).

## 6. Plan por fases (archivos disjuntos)

| Fase | Quién | Archivos | Hecho cuando |
|---|---|---|---|
| 0 | hilo principal | `git rm -r tools/mcp-bodega` (o marcarlo obsoleto si Brandon prefiere); Brandon crea `claude` (admin, «Claude») en Equipo de `main`, Blas y QA forestal | 3 usuarios activos (`GET /api/admin-users`) |
| 1 (paralelo) | **Carril A** backend sonnet | `src/credenciales.mjs`, `sesion.mjs`, `cliente.mjs`, `lista-blanca.mjs`, `registro.mjs`, `panel-local.mjs`, `formato.mjs`, `configurar.mjs` + `__tests__/mcp-buleje/{cliente,lista-blanca,registro}.test.ts` | tests verdes |
| 1 (paralelo) | **Carril B** backend opus | `src/confirmaciones.mjs`, `src/tipos.mjs`, `servidor.mjs`, `src/recursos.mjs`, `src/prompts.mjs`, `package.json`, `README.md` + `__tests__/mcp-buleje/confirmaciones.test.ts` | tests verdes |
| 1 (paralelo) | **Carril C** backend sonnet | `src/herramientas/*.mjs` (1 por grupo) + `__tests__/mcp-buleje/catalogo.test.ts` | cada def mapea a una ruta que existe (`fs.existsSync(app/api/…/route.ts)`) |
| 2 | hilo principal | `npm --prefix tools/mcp-buleje ci`, `claude mcp add …`, settings (allow/ask/deny) | `claude mcp list` = buleje ✓ |
| 3 | tester opus | verificación real en `qa-forestal` con SECO=1 y luego SECO=0 | tabla §7 |
| 4 | `security` | revisión del diff + settings (tope 40 llamadas, reporte en texto) | sin hallazgos altos |
| 5 | hilo principal | commits por carril (`scripts/commit-carril.sh -F msg -- <archivos>`) después de que cierren los 3; ADR-523 con `/adr` | |

Contrato compartido = §3.1: el hilo principal escribe `src/tipos.mjs` ANTES de lanzar los carriles. Cada carril corre `npm run test:guardianes` antes de reportar.

### Tests (vitest)
- `cliente`: siembra csrf de `/api/health`; manda `x-csrf-token` solo en escrituras; 401 → refresh → reintento 1 vez; login fallido no se repite; 429 con `Retry-After`; 500 HTML → `compilando`; puerto cerrado → `panel_apagado` en <2 s (fetch falso).
- `confirmaciones`: token de un uso; vence a 120 s (`vi.useFakeTimers`); `resumen_distinto`; `token_otro_negocio`; `pedidos` distintos → hash distinto; se marca usado antes de enviar (dos `confirmar` en paralelo → uno solo llega a `fetch`); modo a seco no llama a `fetch`.
- `lista-blanca`: permitidas; prohibidas que ganan; `%2e%2e`, `%252e%252e`, `..%2f`, `//`, `\` → rechazadas.
- `registro`: redacta clave/token/cookie/dni.
- `catalogo`: ninguna herramienta E/C es genérica (ruta fija o con `[id]` validado `^[\w-]{1,40}$`); toda C tiene `resumen`; ninguna C llama a red de escritura antes de `confirmar` (cliente espía).

## 7. Verificación real (camino del usuario)
1. `panel_estado` con el dev apagado → mensaje con `panel`; `panel_prender` → 200 en `/api/health`.
2. `hoy_resumen negocio:qa-forestal` → mismos números que *Inicio* en el navegador (1 captura `qa-capturas`).
3. `adelanto_dar` en QA con SECO=1 → `Pedido` exacto; SECO=0 → propuesta → Claude Code pregunta → OK → `GET /api/adelantos` lo muestra; `GET /api/activity-log?user=claude` lo atribuye a `claude` (si sale `admin`, esa ruta no pasa `auth.username`: anotar y arreglar en la ruta).
4. Mismo token dos veces → `token_usado`; esperar 121 s → `token_vencido`.
5. Brandon desactiva a `claude` en Equipo → ≤15 min después `sin_permiso`/`sin_sesion`.
6. `leer_get ruta:"/api/%252e%252e/admin-users"` → `ruta_no_permitida`.

## 8. Riesgos y bloqueos
- **Base compartida = producción**: el dev de localhost escribe en los datos reales de `main` y Blas. Por eso SECO=1 por defecto y la fase 3 solo en `qa-forestal`.
- **El OK depende del modo de permisos de Claude Code**: con `--dangerously-skip-permissions`/`bypassPermissions` o una sesión de fondo con todo permitido, `ask` no pregunta. Mitigación v2: elicitation del protocolo MCP (soporte en Claude Code **sin verificar**) o código de 6 dígitos al celular/Telegram (`/api/admin/agenda/telegram`) que solo Brandon ve. Mientras tanto, el MCP no es una barrera contra el propio Claude con Bash: la barrera real es el rol del usuario `claude` + `deny` de lectura de las credenciales.
- **Rol admin** = puede todo lo que la API permite; el MCP no expone `admin-users`, `api-keys`, `export`, `clear-data`.
- **GET con efectos**: alguna ruta de la lista blanca podría escribir en un GET (sin auditar una por una) → revisar el handler antes de sumar prefijos.
- **Autoría incompleta**: rutas que llaman `logActivity` con `"admin"` literal o no auditan (`ActivityLog.user` default `"admin"`) → se descubren en §7.3.
- **Aviso de dispositivo nuevo** (`alertNewDeviceLogin`, `login/route.ts:335-342`): el 1.er login de `claude` en cada negocio le avisa a Brandon; esperado.
- **2FA forzado para admin** (si algún negocio lo exige): **sin verificar**; con TOTP el login devuelve `pending-totp` (`login/route.ts:204-243`) y el MCP no puede entrar.
- **RAM**: `panel_prender` levanta ~6 GB; se niega con <8 GB libres y nunca mata `node` (CLAUDE.md §8.2).
- **Zona de peligro**: **ninguna tocada en v1**. `pedido_estado` pasa por `orders.db.ts` solo vía HTTP (sin cambiar código) y es C.

## 9. Borrador ADR-523 (lo escribe el hilo principal con `/adr`)

**Título**: ADR-523 — MCP «buleje»: Claude Code como cliente HTTP del panel con usuario propio y confirmación humana

**Contexto**: Brandon quiere que Claude Code consulte y opere el panel (bodega y Blas) con trazabilidad «lo hizo Claude» y poder quitarle permisos. Existía `tools/mcp-bodega` (2026-05), que consulta la base directo con pg: salta RBAC, `tenantId`, auditoría y caché. Las API keys `sk_` (`ApiKey`, ADR-307) solo autentican `/api/sync/*` y no llevan usuario ni rol.

**Decisión**: servidor MCP stdio en `tools/mcp-buleje/` que solo habla HTTP con `localhost:3000`, entrando con el login normal (`/api/auth/login` + refresh + CSRF) como el usuario `claude` (rol admin, uno por negocio). Lectura libre (herramientas fijas + `leer_get` con lista blanca); escritura normal directa; plata/stock/borrar/envíos en dos pasos: propuesta con token de un uso (120 s, atado a pedido y resumen) y `confirmar`, que va en `permissions.ask` de Claude Code. Registro local jsonl y modo a seco. Se retira `tools/mcp-bodega`.

**Alternativas**: (1) Token de servicio aceptado por `requireAdmin` — descartada: cambia `lib/require-admin.ts` (~230 rutas, zona de peligro) y pierde el autor. (2) Reusar las API keys de `/api/sync` — descartada: sin usuario ni rol, y habría que abrir rutas admin al Bearer. (3) MCP con acceso directo a Prisma (como `mcp-bodega`) — descartada: rompe la regla 1 y la auditoría. (4) Rol `manager` — descartada en v1: no está en el alta de Equipo y tiene el mismo bypass que admin. (5) Confirmación solo en el texto del modelo — descartada: el modelo podría confirmarse solo; el `ask` lo impone el harness.

**Consecuencias**: cero cambios en auth/middleware/schema; el OK humano depende del modo de permisos de Claude Code (v2: elicitation o código al celular); las rutas que no pasan `auth.username` al auditar quedan a la vista y se corrigen de a una.

## 10. Cambios del hilo principal (29-10, antes de construir)

1. **El OK de plata NO puede depender de `permissions.ask`**: Brandon corre sus sesiones con «bypass permissions on» (se ve en su barra), así que `ask` no pregunta nunca. En v1 `confirmar` muestra una **ventana de Windows encima de todo** (`src/dialogo-windows.mjs`, carril B): título «Claude pide tu OK», negocio, el `resumen` y botones **Sí / No**; vence a los 120 s (= `sin_respuesta`). Solo con «Sí» se ejecutan los pedidos. Se lanza con `powershell.exe -NoProfile -STA` desde WSL (WinForms, `TopMost`, `ShowInTaskbar`), devuelve `si|no|vencio` por stdout; si `powershell.exe` no existe (tests/CI) → `no_confirmado`. Inyectable para los tests (`crearConfirmador({ preguntar })`). `permissions.ask` se deja igual (sirve si algún día corre sin bypass).
2. La descripción de `confirmar` y la ventana dicen que **Claude nunca la contesta por su cuenta** (ni con desktop-control). El hilo principal agrega en desktop-control un candado para la ventana «Claude pide tu OK».
3. `tipos.mjs` ya está escrito (§3.1 + errores `no_confirmado` y `sin_respuesta` + `soloEn`).
4. Modo a seco: encendido por defecto SOLO hasta pasar la fase 3 en `qa-forestal`; después se apaga en la config (`"seco": false`), porque la ventana de OK ya protege.
5. Nada de commits en los carriles: los hace el hilo principal en la fase 5.
