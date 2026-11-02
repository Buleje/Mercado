# Buleje IA (ADR-528) — contrato de construcción · 01-11-2026

**Pedido de Brandon (literal):** «una app tipo IA donde se pondrá el api del modelo que sea (ChatGPT, Claude, Gemini, DeepSeek y otros modelos chinos); con esa app se podrá dar comandos que se vinculan vía MCP con mi sistema de admin del negocio; por ejemplo: "anótame tanqueé 12 gal de petróleo para mi camión blanco N12 y me costó total 200 soles, el recibo que me dieron es E242 y te envío foto" y con eso registra en el sistema y guarda eso en memoria; le devolverá según lo pedido liquidación, boletas, facturas, cotizaciones, reuniones y todo lo anotará en el sistema. Innovar: lo que antes se registraba a mano en cualquier ERP, ahora se anota a través de una IA configurada con el modelo que más agrade».

## Lo que YA existe (no rehacer — leer antes de tocar)

| Pieza | Dónde |
|---|---|
| Motor de conversación con herramientas, memoria RAM 30 min, varias rondas, tarjetas por confirmar | `lib/asistente/conversar.ts` (+ `memoria.ts`, `contexto.ts`) |
| 65 herramientas en 15 dominios (plata ESCRIBE gastos/ingresos/adelantos/cobros/liquidar/compras/tesorería/fletes; agenda; documentos; mandar-papel…) | `lib/agents/domains/*`, `lib/agents/tool-definitions.ts`, ruteo por vocabulario `lib/agents/tool-routing.ts` |
| Agregar un dominio = 6 lugares; el test que atrapa al que falta | `types.ts`, `permissions.ts`, `tool-definitions.ts`, `index.ts`, `tool-routing.ts` + `__tests__/agentes-cableado-completo.test.ts` |
| Confirmaciones (store en RAM, 10 min) | `lib/agents/pending-approvals.ts` · `POST /api/ai-assistant/approvals` · Telegram `app/api/integrations/telegram/webhook/route.ts:328` |
| Proveedores con clave del entorno (Groq, Anthropic, xAI) | `lib/llm-providers/*`, `lib/llm-router.ts` (`callLLM(tier, opts)`) |
| Cifrado de secretos de terceros (AES-GCM, `v1:iv:tag:datos`) | `lib/cripto-secretos.ts` |
| Lectura de fotos con Claude (documentos) | `lib/ai/vision-extract.ts`, códigos de fallo `lib/ai/aviso-clave-ia.ts` |
| Chat actual del panel (SSE, legado) | `app/api/ai-assistant/route.ts` (3 llamadas a `callLLM`) · UI `components/admin/chat-ia/*` |
| Historial de conversaciones (tablas, sin DB class) | `AIConversation` / `AIMessage` (+ `extra Json?` nuevo) |

Claves en `.env.local` hoy: solo `GROQ_API_KEY` y `XAI_API_KEY` (xAI sin crédito). **Ningún modelo con visión disponible en la plataforma** → las fotos solo funcionan con la clave propia del negocio (Claude, ChatGPT, Gemini, Qwen-VL, GLM-V).

## Base de datos (YA aplicada, no tocar `schema.prisma`)

Migración `prisma/migrations/20261101a_buleje_ia_adr528` aplicada + `prisma generate` hecho: `TenantIaProveedor`, `AsistenteMemoria`, `AsistenteConexion`, `AIMessage.extra`. Prisma solo desde `lib/db/*.db.ts`.

## Tipos compartidos (YA escritos)

`lib/ia-proveedores/tipos.ts`: `ProveedorIaId`, `ProveedorCatalogo`, `ProveedorConfigurado`, `ResultadoPrueba`, `ModeloUsado`, `ImagenTurno`, `PapelDevuelto`, `MemoriaItem`, `MensajeApp`, `ConversacionResumen`, `ConexionMcp`, límites de fotos. Un campo nuevo → se agrega ahí y se reporta.

## Carriles (archivos DISJUNTOS — no tocar los de otro carril)

### Carril 1 · Modelos con la clave del negocio + motor
Archivos: `lib/ia-proveedores/{catalogo,adaptador,router-negocio,errores}.ts`, `lib/db/ia-proveedores.db.ts`, `app/api/admin/ia/proveedores/**`, `lib/llm-providers/types.ts` (+ los adaptadores que haya que ajustar por el contenido multimodal), `lib/asistente/conversar.ts`, `app/api/ai-assistant/route.ts` (solo cambiar las 3 llamadas), tests `__tests__/ia-proveedores*.test.ts`.
- `callLLMDelNegocio(tenantId, tier, opts, { imagenes? })` → usa el proveedor `principal && activo` del negocio; con fotos usa `modeloVision ?? modelo` (si el modelo no ve fotos y no hay `modeloVision`, contesta claro «tu modelo no lee fotos: elige uno que sí en Modelos»); sin proveedor propio cae a `callLLM` de la plataforma. Devuelve `LLMResponse` + `ModeloUsado`.
- `ChatMessage.content: string | ParteContenido[]` (texto / imagen base64). OpenAI-compatible → `image_url` con `data:`; Anthropic → bloque `image` base64.
- `conversar()`: `Turno.imagenes?: ImagenTurno[]`; `RespuestaAsistente.papeles?: PapelDevuelto[]` (junta `data.papel`/`data.papeles` de cada herramienta) y `.modelo?: ModeloUsado`; pasa `texto` a `contextoDelNegocio(tenantId, texto)` (carril 2 agrega ese 2.º parámetro opcional); al texto del usuario le agrega «[foto adjunta: <nombre> · documentoId <id>]» por foto para que el modelo pase `documentoId` a la herramienta; en el `SISTEMA` 2-3 líneas: leer el recibo de la foto (galones, total, n.º), si lo dictado y lo de la foto no cuadran preguntar; si la persona enseña algo del negocio guardarlo con `memoria_recordar`. El tope de 2000 letras sigue.
- Rutas (roles `["admin","owner"]`, Zod `safeParse`, la clave jamás vuelve):
  - `GET /api/admin/ia/proveedores` → `{ catalogo: ProveedorCatalogo[], configurados: ProveedorConfigurado[], plataforma: { disponible, proveedor?, modelo? } }`
  - `POST /api/admin/ia/proveedores/probar` `{ proveedor, clave?, configId?, baseUrl? }` → `ResultadoPrueba` (lista los modelos REALES del proveedor con `/models`; no guarda)
  - `POST /api/admin/ia/proveedores` `{ proveedor, nombre?, modelo, modeloVision?, baseUrl?, clave, principal? }` → `{ proveedor: ProveedorConfigurado }` (prueba antes; con `clave_invalida` no guarda; el primero queda principal)
  - `PATCH /api/admin/ia/proveedores/[id]` `{ nombre?, modelo?, modeloVision?, baseUrl?, clave?, principal?, activo? }` · `DELETE /api/admin/ia/proveedores/[id]`
- Catálogo con 12 proveedores; los nombres de modelo sugeridos se verifican contra la doc oficial o se marcan «sugerido»: la lista real sale de `/models` al probar (lección Groq: modelos dados de baja = falla callada). `personalizado` = cualquier URL compatible con OpenAI (Ollama, LM Studio, vLLM).
- `baseUrl` de `personalizado`: solo `https://` (o `http://localhost`/`127.0.0.1` en desarrollo), nunca IPs privadas en producción (SSRF).

### Carril 2 · Memoria del negocio + papeles + el recibo en el gasto
Archivos: `lib/db/asistente-memoria.db.ts`, `lib/agents/domains/memoria.agent.ts`, `lib/agents/domains/papeles.agent.ts`, los 5 archivos compartidos de agentes (`types.ts`, `permissions.ts`, `tool-definitions.ts`, `index.ts`, `tool-routing.ts`), `lib/agents/domains/plata/*` + `plata.agent.ts`, `lib/asistente/contexto.ts`, `app/api/admin/ia/memoria/**`, tests (incl. `agentes-cableado-completo`).
- Dominio `memoria`: `memoria_recordar` (sin aprobación: no es plata), `memoria_buscar`, `memoria_olvidar` (con aprobación). Dedup por título normalizado (actualiza en vez de duplicar).
- `contextoDelNegocio(tenantId, mensaje?)`: suma «Lo que recuerdas» con ≤8 memorias que comparten palabras con el mensaje (+ las 3 más usadas), y marca `usos/ultimoUso`.
- Dominio `papeles`: cotización PDF (sobre `lib/cotizaciones/*`), liquidación (adelantos de una persona o fletes, PDF), comprobantes (boleta/factura: lo que el sistema YA puede emitir; lo que va a SUNAT con efecto legal → con aprobación y diciendo claramente si se emite de verdad o queda como borrador), reunión → crea en agenda (reusar dominio `agenda`). Cada herramienta devuelve `data.papel: PapelDevuelto` con una `url` del panel que abre/baja el PDF con la sesión.
- `registrar-gasto` acepta `comprobante?` (n.º de recibo, «E242») y `documentoId?` (la foto ya guardada): van a `notes`/`description` como «Recibo E242 · foto: Documentos <id>» (sin migración). Si `documentoId` no es del negocio → error.
- Memoria API (roles admin/owner): `GET /api/admin/ia/memoria?q=` → `{ items: MemoriaItem[] }` · `POST` `{ tipo, titulo, texto }` · `PATCH /[id]` · `DELETE /[id]`.

### Carril 3 · Chat de la app (servidor)
Archivos: `lib/db/ia-conversaciones.db.ts`, `app/api/admin/ia/chat/route.ts`, `app/api/admin/ia/conversaciones/**`, `app/api/admin/ia/confirmar/route.ts`, `lib/asistente/fotos-chat.ts`, tests.
- `POST /api/admin/ia/chat` (multipart: `texto`, `conversacionId?`, `fotos` ×≤4, jpeg/png/webp, ≤8 MB c/u, validar por bytes mágicos) → guarda cada foto en Documentos (carpeta «Buleje IA · Fotos», creada si falta, con la DB class de documentos) → `conversar({ …, sesionId: "app:"+conversacionId, canal: "app", usuarioPanel: username, imagenes })` → guarda los 2 mensajes en `AIConversation(channel "app")`/`AIMessage(extra)` → `{ conversacionId, usuario: MensajeApp, asistente: MensajeApp }`. Título = primeras palabras del primer mensaje.
- `GET /api/admin/ia/conversaciones` (las del usuario) → `{ items: ConversacionResumen[] }` · `GET /[id]` → `{ id, titulo, mensajes: MensajeApp[] }` · `PATCH /[id]` `{ titulo }` · `DELETE /[id]`.
- `POST /api/admin/ia/confirmar` `{ conversacionId, aprobacionId, decision: "aprobar"|"rechazar" }` → misma lógica que `POST /api/ai-assistant/approvals` (tenant del pendiente = el de la sesión) + `anotarHecho()` en la memoria RAM + guarda un mensaje del asistente «✅ …» con `registradas`/`papeles` → `{ mensaje: MensajeApp }`.
- Rate limit en el chat; el texto pasa por `processSafeInput` como el resto.
- Las URL de `adjuntos` = la ruta existente que baja un documento con la sesión.

### Carril 4 · Conexión MCP para apps de afuera (ChatGPT, Claude, Gemini, Cursor)
Archivos: `lib/mcp-servidor/**`, `app/api/mcp/route.ts` (+ `app/api/mcp/t/[token]/route.ts`), `lib/db/asistente-conexiones.db.ts`, `app/api/admin/ia/conexiones/**`, la exención mínima en `proxy.ts`/`lib/middleware/**` (ZONA DE PELIGRO: leer `docs/adr/014-*` y cómo se exime `/api/integrations/n8n/anotar`), tests.
- MCP Streamable HTTP sin estado (JSON-RPC 2.0: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`; respuesta JSON; `MCP-Protocol-Version`). Token `bul_mcp_<aleatorio>` en `Authorization: Bearer` o en la ruta `/api/mcp/t/<token>` (para apps que solo aceptan una URL). Hash SHA-256; comparar en tiempo constante; revocado/inactivo = 401.
- Herramientas = el catálogo de agentes (`ALL_AGENT_TOOLS` + `resolveToolCall` + `orchestrator.executeSync`) con el usuario/rol de la conexión (el rol se re-lee del usuario en cada llamada: si lo bajaron o lo borraron, se nota). `permiteEscribir=false` → solo lectura. Con escritura: la herramienta corre el ensayo y deja un pendiente; `confirmar_operacion { aprobacionId }` la ejecuta (misma regla de tenant que approvals). Rate limit por conexión. Registrar `usos/ultimoUso` y auditar cada escritura.
- `GET /api/admin/ia/conexiones` → `{ items: ConexionMcp[], urlMcp }` · `POST` `{ nombre, permiteEscribir? }` → `{ conexion, token }` (el token, UNA vez) · `PATCH /[id]` `{ nombre?, permiteEscribir?, activo? }` · `DELETE /[id]` (revoca). Solo `owner`/`admin`.

### Carril 5 · La app (pantallas)
Archivos: `app/admin/ia/page.tsx` (+ `layout`/`loading` si hacen falta), `components/admin/buleje-ia/**`, `hooks/use-buleje-ia-*.ts`, y UN botón «Abrir Buleje IA» en `components/admin/unified/AsistenteIAHubModule.tsx`.
- App a pantalla completa, primero celular (400 px) y también PC: barra lateral (conversaciones, «Nueva», Memoria, Modelos, Conectar apps) que en celular es un cajón.
- Chat: mensajes con Markdown (reusar `components/admin/chat-ia/MarkdownContent.tsx`), fotos adjuntas en miniatura, tarjetas «Confirmar / Cancelar» de cada pendiente (→ `/api/admin/ia/confirmar`), tarjetas de papel con «Abrir / Bajar», el modelo que contestó en chiquito. Compositor: texto, 📷 (en celular abre la cámara: `accept="image/*" capture="environment"`; ≤4 fotos, se achican en el navegador a ≤1600 px antes de subir), 🎤 dictado (reusar `components/admin/chat-ia/dictado.ts` / `hooks/use-voz-continua`), Enter manda. Estado vacío con 4 ejemplos tocables (el del combustible de Brandon primero).
- Modelos: tarjetas del catálogo (ChatGPT, Claude, Gemini, DeepSeek, Qwen, Kimi, GLM, MiniMax, Groq, xAI, OpenRouter, Personalizado) con «gratis»/«lee fotos»; pegar clave → Probar → elegir modelo de la lista REAL → Guardar; marcar principal; estado; borrar. Si no hay ninguno: aviso «estás usando la IA de la plataforma (no lee fotos)».
- Memoria: lista, buscar, editar, olvidar, agregar a mano.
- Conectar apps: crear conexión, mostrar el token UNA vez con copiar, URL, instrucciones cortas para ChatGPT, Claude, Gemini y Cursor; interruptor «puede anotar»; revocar.
- DS obligatorio (skill `bsm-design-system`): tokens, sin hex, claro y oscuro, títulos del DS, ≤300 líneas por componente. Copia en el idioma de Brandon (sin «token», «MCP», «API» en la pantalla principal: «clave», «conexión»; en Conectar apps se puede decir «MCP» entre paréntesis).
- Mientras los servidores no estén, la pantalla se construye contra el contrato de arriba; el hilo principal prueba punta a punta al final.

## Reglas para todos los carriles
- `tenantId` primer argumento, nada de `"main"` de respaldo; `requireAdmin(req, ["admin","owner"])` (lectura del chat: los roles que hoy usan el asistente).
- Con 5 carriles vivos: NO `npm run typecheck` completo (usar tsc acotado a tus archivos, memoria de agente), `npx vitest run <tus tests>`, `npm run test:guardianes` antes de reportar. **No hacer commits**: los hace el hilo principal al final.
- Antes de CREAR un archivo, `ls` la ruta. Nada de worktrees.
- Reporte final en TEXTO, ≤25 líneas: qué quedó, qué se probó (con la salida), qué NO, y «Para acelerar:».
