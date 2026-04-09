# `lib/credit/` — Módulo de crédito Fiado Digital

Motor del diferenciador #1 de Bodega San Martín: convertir el fiado de
cuaderno en una experiencia software-first, auditable, y con transparencia
radical para el cliente.

Referencias:

- Plan completo: `docs/fiado-digital-ola2-plan.md` (702 líneas)
- ADR arquitectónico: `docs/adr/021-fiado-digital-ola2.md`
- Engine base (TD-018 cerrado): scoring 0–1000 con 5 ponderaciones.

---

## Mapa de la carpeta

| Archivo | Propósito | Estado |
|---|---|---|
| `scoring-engine.ts` | Motor de cálculo del score 0–1000 (5 factores: historial, puntualidad, ticket, antigüedad, lealtad). Expone `calculateCreditScore()`, `updateCreditProfile()`, `determineCreditLimit()`, `classifyRisk()`. | ✅ Producción |
| `installment-manager.ts` | Manager de cuotas 2/3/4 con tasas 0/3/5%. Genera planes de pago, calcula próximas fechas, detecta mora. | ✅ Producción |
| `reniec-client.ts` | Verificación DNI contra RENIEC con cache de 1 día, rate limit 10 req/min y degrade mode automático cuando falta provider o hay falla externa. | 🟡 Phase 1 scaffold — degrade mode siempre hasta TD-030 |
| `README.md` | Este documento. | 📄 Doc |

---

## Módulos planificados (pendientes de TD-030)

| Archivo | Propósito | Fase |
|---|---|---|
| `score-history.ts` | Helper `snapshotCreditScore()` para escribir append-only en `CreditScoreHistory` con breakdown, trigger y delta. | 1 |
| `guarantor-service.ts` | Lógica de fiado familiar: reserva de límite del avalador, aprobación, revocación. | 3 |
| `reminders-scheduler.ts` | Enqueue de recordatorios T-3/T-1/T0/T+1/T+7/T+30 con idempotencia por `fiadoId + stage + dueDate`. | 2 |

---

## DAG de dependencias

```
                 ┌──────────────────────┐
                 │  scoring-engine.ts   │  ← engine puro, sin side-effects
                 └──────────┬───────────┘
                            │
                ┌───────────┴────────────┐
                │                        │
                ▼                        ▼
   ┌──────────────────────┐  ┌──────────────────────┐
   │ installment-manager  │  │  score-history.ts    │  (pendiente TD-030)
   │        .ts           │  │  snapshotCreditScore │
   └──────────┬───────────┘  └──────────┬───────────┘
              │                         │
              │                         ▼
              │           ┌──────────────────────────────┐
              │           │ feature-flags/fiado-digital  │
              │           │    gate de endpoints Phase 1 │
              │           └──────────────┬───────────────┘
              │                          │
              ▼                          ▼
   ┌──────────────────────────────────────────┐
   │  app/api/credit/**                       │
   │  - profile/[customerId]      ✅ producción│
   │  - check                     ✅ producción│
   │  - create-plan               ✅ producción│
   │  - pay                       ✅ producción│
   │  - score-history/[customerId] 🟡 Phase 1  │
   │  - reniec/verify              🟡 pendiente│
   │  - me/credit-score            🟡 pendiente│
   └──────────────────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────────┐
   │  components/credit/**                    │
   │  - CreditScoreCard             🟡 Phase 1 │
   │  - CreditTransparencyBanner    🟡 Phase 1 │
   │  - CreditScoreChart            ⏸ pendiente│
   │  - GuarantorRequestForm        ⏸ Phase 3  │
   └──────────────────────────────────────────┘
```

Leyenda: `✅` producción · `🟡` Phase 1 scaffold · `⏸` pendiente.

---

## Estado por fase

### Phase 1 — Foundation + transparencia (SCAFFOLDING EN PROGRESO)

| Entregable | Estado |
|---|---|
| `lib/credit/reniec-client.ts` (degrade mode + rate limit + cache) | ✅ Scaffold |
| `lib/feature-flags/fiado-digital.ts` | ✅ Scaffold |
| `app/api/credit/score-history/[customerId]/route.ts` (stub) | ✅ Scaffold |
| `components/credit/CreditScoreCard.tsx` | ✅ Scaffold |
| `components/credit/CreditTransparencyBanner.tsx` | ✅ Scaffold |
| Migración TD-030 `LoyaltyTransaction` | 🔒 **Bloqueante — a mano por Brandon** |
| Migración `CreditScoreHistory` + `ReniecVerification` | 🔒 Pendiente de TD-030 |
| Endpoint `POST /api/credit/reniec/verify` | ⏸ Pendiente de schema |
| Endpoint `GET /api/me/credit-score` | ⏸ Pendiente de schema |
| Helper `snapshotCreditScore()` | ⏸ Pendiente de schema |

### Phase 2 — Automatización (PENDIENTE)

Todo pendiente de que Phase 1 esté en prod con `FIADO_DIGITAL_V2_PHASE1=true`.

- Cron `credit-reminders-daily` + worker BullMQ `credit-reminders.worker.ts`
- Cron `weekly-credit-report` al dueño
- Cron `credit-score-weekly-recalc`
- 10 templates WhatsApp nuevos
- Nueva cola `CREDIT_REMINDERS` en `lib/queue/queues.ts`

### Phase 3 — Fiado familiar + integración checkout (PENDIENTE)

- Modelo `CreditGuarantor` (N:M avalador ↔ avalado)
- UI flujo de aval en marketplace
- Integración en `CheckoutModal.tsx` (**zona de peligro** — skill `checkout-flow` obligatorio)
- `POST /api/checkout/fiado-option`

---

## Reglas que todos los módulos deben respetar

1. **`tenantId` como primer parámetro / primer filtro** en toda función que
   toque la DB (regla crítica CLAUDE.md §3).
2. **`safeParse()` de Zod**, nunca `.parse()` (regla §2).
3. **Nunca `export const dynamic = "force-dynamic"`** en rutas — ADR-019.
4. **Raw SQL solo con parámetros posicionales** `$1 $2 $3` — ADR-011.
5. **Decimal-safe para montos** — usar `lib/decimal-utils.ts` (ADR-018).
6. **Fire-and-forget explícito** para notificaciones
   (`enqueueCreditReminder().catch(() => {})`).
7. **Feature flag `FIADO_DIGITAL_V2_PHASE{1,2,3}`** en cualquier código que
   llegue a prod antes de que Brandon dé luz verde.
8. **Degrade mode siempre disponible** — si RENIEC o cualquier API externa
   cae, el sistema continúa con `verified: false` y el admin puede validar a mano.

---

## TODOs globales (cuando TD-030 aterrice)

- [ ] Conectar `reniec-client.ts` al provider real `apis.net.pe` y SUNAT.
- [ ] Implementar `snapshotCreditScore()` escribiendo en `CreditScoreHistory`.
- [ ] Reemplazar el stub de `/api/credit/score-history/[customerId]` por
      query real `prisma.creditScoreHistory.findMany(...)`.
- [ ] Wire `CreditScoreCard` al endpoint de score-history para alimentar el
      mini-chart de los últimos 12 snapshots.
- [ ] Wire `CreditTransparencyBanner` a `/api/me/credit-score` para que
      calcule delta real contra el snapshot del mes anterior.
- [ ] Migrar la persistencia de hits RENIEC a la tabla `ReniecVerification`
      con `expiresAt = now + 90 días`.
- [ ] Agregar tests unitarios:
      `lib/credit/__tests__/reniec-client.test.ts` (degrade, rate limit, cache),
      `lib/feature-flags/__tests__/fiado-digital.test.ts` (combinación de fases).
