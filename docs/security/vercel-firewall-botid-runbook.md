# Vercel Firewall + BotID — Runbook de activación

> **Pentest 2026-05-18 Sprint D #3.** Esta config requiere acceso al dashboard
> de Vercel (no se versiona en repo). Brandon debe aplicarla manualmente
> después de leer este runbook.

## Por qué

El proyecto tiene 861 endpoints + rate limit por IP (Upstash). Pero un
atacante con botnet rotativa (cientos de IPs residenciales) **bypasea el
rate limit**. Vercel Firewall + BotID filtra al edge antes de llegar a
nuestras funciones — protección a nivel infra, no nivel app.

## Activación

### 1. BotID (gratis en plan Pro)

Dashboard Vercel → Project → **Security** → **Bot Management** → **Enable BotID**.

- Plan recomendado: **Standard** (gratis, suficiente para 50+ tenants).
- BotID Pro ($) solo si captamos > S/50K MRR.

Cuando se activa, Vercel inyecta un cookie/header que distingue:
- ✅ Humanos verificados
- ⚠️ Bots benignos (Google, OpenAI, etc.) — los dejamos pasar
- ❌ Bots maliciosos / scrapers — bloqueamos en `proxy.ts`

### 2. Firewall Rules — reglas críticas a crear

Dashboard Vercel → **Firewall** → **Add Rule**:

| Rule | Condición | Acción |
|---|---|---|
| `block-scrapers-coupons` | Path matches `/api/coupons/active` AND BotID = `malicious` | Block 403 |
| `challenge-login-flood` | Path matches `/api/auth/*` AND Rate > 30/min from IP | Challenge (CAPTCHA) |
| `block-known-bad-ua` | User-Agent matches `(curl\|wget\|python-requests\|nikto\|sqlmap)` AND Path = `/api/*` | Block 403 |
| `geo-allowlist` | Country NOT IN (`PE`, `US`, `MX`, `CO`, `EC`, `AR`, `CL`, `BR`) AND Path = `/admin/*` | Block 403 |
| `block-admin-public` | Path = `/admin/*` AND BotID = `bot` | Block 403 |

### 3. Integration con `proxy.ts`

El header `x-vercel-bot-protection` viene poblado tras BotID activo. El proxy
debe leer ese header y poder rechazar manualmente cuando el BotID dice
`malicious` pero el firewall no bloqueó (por reglas custom complejas).

Pendiente — agregar 4 líneas a `proxy.ts` cuando Brandon active BotID:

```ts
// proxy.ts (después de auth y antes de rate limit)
const botSignal = req.headers.get("x-vercel-bot-protection");
if (botSignal === "malicious" && req.nextUrl.pathname.startsWith("/api/")) {
  return new Response("Forbidden", { status: 403 });
}
```

## Verificación post-activación

```bash
# 1. BotID activo → header presente
curl -I https://buleje.pe/ | grep -i bot-protection

# 2. UA malicioso → bloqueado
curl -A "sqlmap/1.0" https://buleje.pe/api/coupons/active?tenant=main
# Debe retornar 403

# 3. Geo bloqueado → /admin/login desde VPN ruso
curl --resolve buleje.pe:443:188.114.96.7 https://buleje.pe/admin/login
# Debe retornar 403
```

## Coste

- **BotID Standard**: gratis en Pro
- **Firewall Rules custom**: 100 reglas gratis en Pro, $ por extras
- **Bot Management Pro**: opcional, $ — necesario solo si vemos > 1M bot req/mes

## TODO bloqueante para Brandon

1. [ ] Activar BotID en dashboard
2. [ ] Crear las 5 reglas listadas arriba
3. [ ] Aplicar el snippet del `proxy.ts`
4. [ ] Verificar con los 3 curl tests
5. [ ] Marcar este runbook como ejecutado en `docs/HISTORY.md`
