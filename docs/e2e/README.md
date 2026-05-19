# E2E Tests — Guia de configuracion y ejecucion

Tests Playwright: 8 specs, 63 tests. Branch: `chore/production-ready-final`.

---

## Prerrequisitos

| Herramienta | Version | Para que |
|---|---|---|
| Node.js | >= 20 | Correr seed y tests |
| PostgreSQL | >= 14 | DB local (o Supabase) |
| Dev server | Next.js 16 en :3000 | `npm run dev` |
| Playwright | 1.59 (ya en devDeps) | Runner de tests |

**La DB debe tener el schema de Prisma aplicado.** Si es una instalacion fresca:
```bash
npm run db:migrate
```

---

## Paso 1 — Configurar .env.test

```bash
cp .env.test.example .env.test
```

Edita `.env.test` y rellena:
- `DATABASE_URL` — misma URL de tu `.env` local (Supabase o PostgreSQL local).
- `E2E_TWILIO_AUTH_TOKEN` — copiar del `TWILIO_AUTH_TOKEN` de tu `.env`.
- `E2E_WHATSAPP_VERIFY_TOKEN` — copiar del `WHATSAPP_VERIFY_TOKEN` de tu `.env`.

Los demas valores los obtenes en el Paso 2.

---

## Paso 2 — Correr el seed

El seed crea todos los fixtures en la DB y te dice que copiar al `.env.test`.

```bash
npx dotenv -e .env.test -- node scripts/e2e/seed-e2e.mjs
```

El script imprime algo como:

```
[1/6] Tenant "main":   clxxxxxxxxxxxxxxxx
[2/6] Tenant "mi-pollo": clxxxxxxxxxxxxxxxxx
[3/6] Customer principal: clxxxxxxxxxxxxxxxxx (phone: 987654321)
[4/6] Customer RTBF:  clxxxxxxxxxxxxxxxxx (DNI: 99999999) -- recreado
[5/6] AdminUser repartidor: clxxxxxxxxxxxxxxxxx (username: delivery_e2e)
[6/6] Order delivery:  E2E-DELIVERY-1716000000000 (status: confirmado)

------------------------------------------------------------
COPIAR estas lineas al .env.test:

E2E_TENANT_ID=clxxxxxxxxxxxxxxxx
E2E_DELIVERY_ORDER_ID=E2E-DELIVERY-1716000000000
E2E_CUSTOMER_PHONE=987654321
E2E_CUSTOMER_DNI=12345678
E2E_RTBF_CUSTOMER_DNI=99999999
E2E_DELIVERY_USER=delivery_e2e
E2E_DELIVERY_PASSWORD=Delivery-2026-E2E
------------------------------------------------------------
```

Copia esas lineas al `.env.test`.

---

## Paso 3 — Correr el dev server

En una terminal aparte:

```bash
npm run dev
```

Esperar hasta ver `Ready on http://localhost:3000`.

---

## Paso 4 — Correr los tests

### Todos los specs E2E:
```bash
npx dotenv -e .env.test -- npx playwright test
```

### Un spec especifico:
```bash
npx dotenv -e .env.test -- npx playwright test e2e/checkout-yape-full.spec.ts
```

### Con UI interactiva (para debuggear):
```bash
npx dotenv -e .env.test -- npx playwright test --ui
```

### Headed (ver el browser):
```bash
npx dotenv -e .env.test -- npx playwright test --headed
```

### Solo tests sin marca `skip`:
La mayoria de tests son resilientes: hacen `test.skip()` si la env var requerida
no esta configurada. Puedes correr sin `.env.test` y pasaran los tests base.

---

## Specs incluidos (commit 283dd313)

| Spec | Tests | Requiere seed |
|---|---|---|
| `admin-orders-approve.spec.ts` | 8 | No (usa `test.skip` si no hay ordenes) |
| `checkout-yape-full.spec.ts` | 5 | No (usa mocks de API) |
| `customer-login-browse.spec.ts` | 8 | Si — `E2E_CUSTOMER_PHONE` |
| `delivery-flow.spec.ts` | 10 | Si — `E2E_DELIVERY_USER` + `E2E_DELIVERY_ORDER_ID` |
| `multi-tenant-isolation.spec.ts` | 8 | Si — ambos tenants en DB |
| `privacidad-export-l29733.spec.ts` | 8 | Si — `E2E_TENANT_ID` + `E2E_CUSTOMER_DNI` |
| `privacidad-rtbf-l29733.spec.ts` | 8 | Si — `E2E_RTBF_CUSTOMER_DNI` + `E2E_TENANT_ID` |
| `whatsapp-webhook-signature.spec.ts` | 8 | No — solo `E2E_TWILIO_AUTH_TOKEN` |

---

## Fixture de imagen (checkout Yape)

`checkout-yape-full.spec.ts` test 2 intenta subir un archivo JPG. Sin el archivo
el test pasa igualmente (la condicion es opcional). Para activar el upload real:

```bash
# Opcion A — ImageMagick
convert -size 400x600 xc:white \
  -draw "text 50,100 'YAPE - E2E Test'" \
  e2e/helpers/fixtures/yape-comprobante.jpg

# Opcion B — cualquier JPG valido
cp ~/Downloads/cualquier-imagen.jpg e2e/helpers/fixtures/yape-comprobante.jpg
```

Ver instrucciones completas: `e2e/helpers/fixtures/yape-comprobante.placeholder.md`

---

## Troubleshooting

| Problema | Solucion |
|---|---|
| `Error: DATABASE_URL not defined` | Asegurar que `.env.test` tiene `DATABASE_URL` correcta |
| `Login admin fallo` | Verificar que el tenant "main" tiene el usuario `qaadmin` (correr `node -r dotenv/config scripts/create-qa-admin-raw.mjs`) |
| `Tenant "demo" no encontrado` | Cambiar `E2E_VENDOR_SLUG` a un slug real de vendor en tu DB |
| Tests de WhatsApp fallan con 403 esperado | `E2E_TWILIO_AUTH_TOKEN` no coincide con `TWILIO_AUTH_TOKEN` del server |
| `E2E_TENANT_ID` requerido | Correr seed: `npx dotenv -e .env.test -- node scripts/e2e/seed-e2e.mjs` |
| Dev server no levanta en :3000 | `npm run dev:clean` para matar procesos colgados |
| Tests corren pero todos fallan con 500 | El dev server puede necesitar warmup (~30s despues de iniciar) |
| Error `PrismaClientKnownRequestError` en seed | Schema desactualizado — correr `npm run db:migrate` primero |

---

## Idempotencia del seed

- **Tenants**: `upsert` por slug — seguro repetir.
- **Customer principal**: `upsert` por phone — no duplica.
- **Customer RTBF**: `deleteMany` + `create` — se recrea en cada run. Normal.
- **AdminUser repartidor**: `upsert` por `tenantId+username` — seguro repetir.
- **Orden delivery**: siempre crea nueva con ID timestampeado. Actualizar `E2E_DELIVERY_ORDER_ID` en `.env.test` despues de cada seed si vas a testear el flujo completo de delivery.

El seed **NO** borra datos de otros tenants ni modifica el usuario `qaadmin` existente.
