# @bodega-san-martin/mcp-server

MCP (Model Context Protocol) server that lets Claude Code operate the bodega business directly -- querying live data, sending WhatsApp messages, and generating SUNAT invoices.

## Tools

| Tool | Description |
|------|-------------|
| `get_fiado_vencido` | Clientes con credito vencido: nombre, telefono, monto, dias de atraso |
| `get_ventas_hoy` | Resumen de ventas: total, ticket promedio, por metodo de pago, top productos |
| `get_inventario_critico` | Productos con stock bajo o lotes por vencer en 7 dias (FEFO) |
| `enviar_whatsapp` | Enviar mensaje WhatsApp templado via Twilio (o log a DB sin Twilio) |
| `generar_boleta_sunat` | Generar boleta de venta electronica con IGV segun SUNAT |

## Setup

```bash
cd tools/mcp-bodega
npm install
cp .env.example .env  # Edit with your database URL
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Claude Code config

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "bodega": {
      "command": "node",
      "args": ["tools/mcp-bodega/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "MCP_API_KEY": "your-key"
      }
    }
  }
}
```

## Architecture

- **Transport:** stdio (standard MCP protocol)
- **Database:** Direct PostgreSQL via `pg` (node-postgres), not Prisma
- **Auth:** MCP_API_KEY environment variable
- **Rate limit:** 100 requests/minute per tenant (in-memory)
- **Logging:** Every call logged to stderr with tenant, tool, latency, success
- **Multi-tenant:** Every query includes tenantId (rule #3)
- **SQL safety:** All queries use positional parameters $1, $2 (rule #11)

## Templates (WhatsApp)

| Template | Variables |
|----------|-----------|
| `cobranza_fiado` | nombre, monto, fecha, telefono_bodega |
| `pedido_listo` | nombre, pedido_id |
| `promocion` | nombre, descripcion, fecha_fin |
| `bienvenida` | nombre, bodega_nombre |
| `custom` | mensaje |
