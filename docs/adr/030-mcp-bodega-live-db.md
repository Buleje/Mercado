# ADR-030: MCP Server para operaciones de negocio en vivo

## Estado
Propuesta

## Fecha
2026-04-09

## Contexto
Claude Code necesita operar el negocio directamente: consultar ventas del dia, identificar fiados vencidos, alertar sobre inventario critico, enviar mensajes WhatsApp a clientes, y generar comprobantes SUNAT. Sin un MCP server, estas operaciones requieren que el usuario ejecute queries manuales o navegue el admin panel, lo cual es lento e impide la autonomia del agente.

## Opciones consideradas

### Opcion A: API REST endpoints en la app principal
- Ventaja: reutiliza la infraestructura existente (auth, middleware, Prisma)
- Ventaja: no requiere proceso separado
- Desventaja: acopla la herramienta de IA al ciclo de deploy de la app
- Desventaja: requiere auth HTTP compleja para Claude Code
- Desventaja: cada tool necesita un endpoint nuevo, mas codigo boilerplate

### Opcion B: MCP Server standalone con acceso directo a DB
- Ventaja: protocolo estandar MCP, Claude Code lo conecta nativamente
- Ventaja: desacoplado del deploy de la app, se puede iterar rapido
- Ventaja: acceso SQL directo con parametros posicionales (seguro, sin ORM overhead)
- Ventaja: rate limit y logging independientes
- Desventaja: duplica parcialmente la logica de queries
- Desventaja: requiere mantener consistencia con cambios de schema

### Opcion C: Plugin de Claude Code con funciones inline
- Ventaja: cero infraestructura adicional
- Desventaja: no tiene acceso a DB, requeriria shell commands
- Desventaja: no es reutilizable entre sesiones
- Desventaja: sin audit trail

## Decision
Elegimos la **Opcion B: MCP Server standalone** porque:

1. **Protocolo nativo:** Claude Code soporta MCP servers via stdio, cero config HTTP
2. **Autonomia:** El agente puede consultar datos y actuar sin intervencion humana
3. **Seguridad:** Queries con parametros posicionales ($1, $2), rate limit por tenant, audit log
4. **Iteracion rapida:** Agregar tools nuevos no requiere redeploy de la app Next.js
5. **Multi-tenant safe:** Cada query incluye tenantId como primer parametro (regla #3)

## Implementacion

### Ubicacion
`tools/mcp-bodega/` -- proyecto standalone TypeScript con su propio `package.json`

### Tools implementados (v1.0)

| Tool | Input | Output |
|------|-------|--------|
| `get_fiado_vencido` | tenant_id | Lista de fiados vencidos con datos del cliente |
| `get_ventas_hoy` | tenant_id, fecha? | Resumen de ventas: total, por pago, por cajero, top 3 |
| `get_inventario_critico` | tenant_id | Productos stock bajo + lotes por vencer 7 dias |
| `enviar_whatsapp` | tenant_id, cliente_id, template, variables | Resultado de envio + audit ID |
| `generar_boleta_sunat` | tenant_id, items[], cliente | Boleta con IGV, correlativo, registro en SunatInvoice |

### Stack tecnico
- **Runtime:** Node.js + TypeScript (ESM)
- **DB:** `pg` (node-postgres) con raw SQL parametrizado
- **Protocol:** `@modelcontextprotocol/sdk` (stdio transport)
- **Validacion:** Zod schemas en cada tool input
- **Rate limit:** In-memory, 100 req/min por tenant
- **Logging:** stderr JSON structured logs

### Seguridad
- MCP_API_KEY validado al iniciar
- Queries SQL siempre con parametros posicionales (regla #11)
- tenantId obligatorio en toda query (regla #3)
- WhatsApp: verificacion de que el cliente pertenece al tenant antes de enviar
- SUNAT: increment atomico de correlativos via UPDATE ... RETURNING

## Consecuencias

### Positivas
- Claude Code puede operar la bodega sin intervencion humana
- Audit trail completo de cada operacion del agente
- Desacoplado: cambios en el MCP no afectan la app principal
- Extensible: agregar tools nuevos es agregar un archivo en `src/tools/`

### Negativas
- Duplicacion parcial de queries que ya existen en `lib/db/*.db.ts`
- Si el schema de Prisma cambia, hay que actualizar las queries SQL manuales

### Riesgos
- Sin Twilio configurado, WhatsApp solo loggea a DB (no envia realmente)
- Rate limit in-memory se resetea al reiniciar el proceso
- Acceso directo a DB requiere que DATABASE_URL este configurado correctamente

### Mitigaciones
- Documentar dependencias de schema en JSDoc de cada tool
- Tests de integracion que validen que las queries SQL coinciden con el schema actual
- Monitorear logs en stderr para detectar errores de queries por cambios de schema
