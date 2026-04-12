# Activacion de Redis — Buleje

## Por que activar Redis
- **Colas BullMQ**: emails, notificaciones WhatsApp, PDFs y activity logs se procesan con reintentos automaticos en vez de fire-and-forget
- **Cache distribuido**: datos cached se comparten entre todas las instancias serverless (en vez de cache por proceso)
- **Costo**: Upstash Redis free tier = 10,000 commands/dia (suficiente para empezar)

## Opcion 1: Upstash Redis via Vercel Marketplace (recomendado)

### Paso 1: Instalar desde Vercel
1. Ir a tu proyecto en vercel.com → Storage → Browse Marketplace
2. Buscar "Upstash Redis"
3. Click "Add Integration"
4. Seleccionar plan: **Free** (10k commands/day) o **Pay-as-you-go** ($0.2/100k commands)
5. Vercel agrega automaticamente `REDIS_URL` (y `KV_REST_API_URL`, `KV_REST_API_TOKEN`) a tus env vars

### Paso 2: Pull env vars
```bash
vercel env pull .env.local
```

### Paso 3: Verificar
```bash
npm run redis:health
```

### Paso 4: Iniciar workers (opcional para desarrollo)
```bash
npm run queue:workers
```

## Opcion 2: Redis local (desarrollo)

### Docker
```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### .env.local
```env
REDIS_URL=redis://localhost:6379
```

## Opcion 3: Upstash directo (sin Vercel Marketplace)
1. Crear cuenta en upstash.com
2. Crear database → Region: us-east-1 (o la mas cercana a tu Vercel deployment)
3. Copiar la Redis URL
4. En Vercel: Settings → Environment Variables → Add `REDIS_URL`

## Verificacion post-activacion

### Cache funciona?
- Abrir la app → navegar por productos → revisar logs del servidor
- Buscar: `[cache/redis] connection error` = problema
- Buscar: `[queue] Queues initialized` = exito

### Colas funcionan?
- Crear una venta → revisar que el activity log se registra
- Los workers deben estar corriendo: `npm run queue:workers`

## Monitoreo
- Upstash Dashboard: ver commands/day, memoria usada, keys activas
- Panel Admin → Tab "Colas": ver waiting/active/completed/failed por cola

## Troubleshooting

| Problema | Solucion |
|----------|----------|
| `ECONNREFUSED` | Verificar que REDIS_URL es correcto y el servidor esta accesible |
| `NOAUTH` | La URL debe incluir password: `redis://:password@host:port` |
| Colas no procesan | Los workers estan corriendo? `npm run queue:workers` |
| Cache no funciona | Verificar que `ioredis` esta instalado: `npm ls ioredis` |
| Alto latencia Redis | Revisar region — Upstash y Vercel deben estar en la misma region |
| `MaxRetriesPerRequestError` | Revisar si Redis esta caido o si el firewall bloquea el puerto |

## Arquitectura de Redis en Buleje

```
┌─────────────────┐     ┌──────────────┐
│  lib/cache.ts   │────>│   ioredis    │───> Redis (Upstash)
│  (RedisStore)   │     │  write-thru  │
│                 │     │  + mem layer │
└─────────────────┘     └──────────────┘

┌─────────────────┐     ┌──────────────┐
│  lib/queue/     │────>│   BullMQ     │───> Redis (Upstash)
│  (5 queues)     │     │  durable     │
│                 │     │  + retries   │
└─────────────────┘     └──────────────┘
```

### Colas disponibles (lib/queue/queues.ts)
- `email` — envio de emails transaccionales
- `pdf` — generacion de PDFs (facturas, reportes)
- `notification` — push notifications y WhatsApp
- `activity-log` — registro de actividad con reintentos
- `stock-sync` — sincronizacion de inventario

### Degradacion sin Redis
- **Cache**: cae a MemoryStore (cache por proceso, no compartido entre instancias)
- **Colas**: cae a fire-and-forget (sin reintentos, sin persistencia)
- La app sigue funcionando — Redis es opcional pero recomendado para produccion
