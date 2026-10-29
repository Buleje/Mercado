# ADR-523 — MCP «buleje»: Claude Code como cliente HTTP del panel con usuario propio y OK humano en una ventana de Windows

- **Estado:** aceptado (2026-10-29). Sin schema. Reemplaza a ADR-030 (`tools/mcp-bodega`, base directa).
- **Pedido por:** Brandon (29-10): «quiero que hagas un MCP para que te conectes a mi sistema Buleje admin para que ejecutes tareas y controles, un MCP maduro y completo». Eligió: el panel de su PC, un usuario propio «Claude», «ver todo, y en plata te pregunta».
- **Relacionados:** ADR-030 (MCP viejo con pg directo, retirado), ADR-307 (llaves `sk_` solo para `/api/sync`), ADR-448 (`idempotencyKey` de adelantos), ADR-522 (la cubicación guardada toca el saldo de la cuenta).

## Contexto

Claude operaba el panel con `curl`, cookies sueltas o Playwright. `tools/mcp-bodega` (ADR-030) consultaba Postgres directo, así que se saltaba RBAC, `tenantId`, auditoría y caché. Las llaves `sk_` solo autentican `/api/sync/*` y no llevan usuario ni rol. El dev de localhost escribe en la base compartida (= producción). Brandon corre sus sesiones con «bypass permissions», así que `permissions.ask` de Claude Code nunca pregunta.

## Decisión

1. Servidor MCP stdio en `tools/mcp-buleje/` (`.mjs`, SDK `@modelcontextprotocol/sdk` 1.32.2, `node_modules` propio). Es **solo un cliente HTTP** de `http://localhost:3000`: nunca importa `lib/**` ni Prisma.
2. Entra con el login normal (`/api/auth/login` + refresh + CSRF) como el usuario **`claude`** (rol `admin`, nombre «Claude», uno por negocio), creado por `POST /api/admin-users`. La clave está en `~/.config/buleje-mcp/credenciales.json` (600). Las cookies quedan **solo en memoria**. El historial lo firma como `claude`. Para quitarle el acceso, Brandon lo desactiva en Equipo (≤15 min).
3. Catálogo de 70 herramientas fijas (lectura / escritura normal / **confirmar**). Lo único genérico es `leer_get`, que normaliza con `new URL().pathname`, rechaza `?`, `#` y `%`, y usa lista blanca + lista negra. No hay escritura genérica.
4. Plata, stock, borrar y envíos van en dos pasos. Primero se crea la propuesta con un token de un solo uso (120 s), atado al negocio, a la herramienta, al hash de los pedidos y al hash del resumen. Después, `confirmar` abre una **ventana de Windows encima de todo** («Claude pide tu OK»). La ventana muestra el resumen guardado por el MCP, con los nombres leídos del panel por `previa`; si no pudo leerlos dice «NO PUDE VERIFICAR A QUIÉN». Tiene 3 botones en orden al azar: el valor real y 2 señuelos. Solo aprueba un clic de mouse en el correcto, después de 2 s. Se muestra una ventana a la vez.
5. desktop-control tiene prohibido actuar sobre esa ventana (`ventanasProhibidas`), y `app_launch` niega los intérpretes (powershell, cmd, wscript…) y `-EncodedCommand`.
6. Modo a seco encendido por defecto; solo la configuración lo apaga. DNI, celulares y sueldos se tapan en las respuestas (Ley 29733). Cada llamada queda en un registro jsonl con los datos sensibles tapados.

## Alternativas descartadas

- **Token de servicio aceptado por `requireAdmin`:** cambia `lib/require-admin.ts` (~230 rutas, zona de peligro) y se pierde el autor.
- **Reusar las llaves `sk_` de `/api/sync`:** no llevan usuario ni rol, y habría que abrir las rutas admin al Bearer.
- **Acceso directo a Prisma (como `mcp-bodega`):** rompe la regla 1 y la auditoría.
- **Confirmar con `permissions.ask`:** con bypass no pregunta. Se deja como capa extra para sesiones sin bypass.
- **Un solo botón «Sí»:** en las pruebas Brandon aprobó 3 ventanas de prueba en 4-12 s sin leerlas (lo confirmó él).

## Consecuencias

- Cero cambios en auth, middleware, schema y en las rutas del panel.
- La ventana frena los errores de Claude, pero no a un Claude manipulado con Bash en bypass: la barrera de fondo es el rol del usuario `claude` y los `deny` de lectura sobre `~/.config/buleje-mcp/**` y `~/.local/state/buleje-mcp/**`.
- Si Brandon está solo en el celular, la ventana vence (`sin_respuesta`). La v2 sería mandar un código al celular.
- El usuario de Blas real lo crea Brandon (no hay clave de admin de Blas en la PC), con `node tools/mcp-buleje/configurar.mjs`.
- Las rutas que auditan con `"admin"` literal en vez de `auth.username` se van viendo en `actividad_ver` y se corrigen de a una.
