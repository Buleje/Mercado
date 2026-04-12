# Fiado Digital — Plan de Arquitectura Ola 2

**Versión:** 1.0 (DRAFT)
**Fecha:** 2026-04-09
**Autor:** solution-architect (subagente)
**ADR asociado:** ADR-021 (`docs/adr/021-fiado-digital-ola2.md`)
**Scope:** Diferenciador #1 de Buleje — "el fiado de cuaderno convertido en software"
**Estado:** Propuesta — pendiente aprobación de Brandon antes de ejecutar Fase 1

---

## 0. Resumen ejecutivo (1 página)

**Qué es Fiado Digital.** Transformar el fiado tradicional ("llévate ahora, paga después" anotado en un cuaderno) en una experiencia software-first que decide crédito en <2s, cobra solo por WhatsApp sin que nadie levante el teléfono, y muestra al dueño un reporte semanal automatizado.

**Por qué es el diferenciador #1.** Ni Mercado Libre, ni Rappi, ni Didi, ni Yape prestan S/50–1000 sin tarjeta, sin banco, sin burocracia, en 2 segundos, en base a la confianza generada dentro de la misma bodega. Es un moat que ningún player global puede copiar rápido porque requiere presencia local, tolerancia al riesgo informal y datos propios del barrio. Para la señora de 55 años de Pucallpa, el fiado digital es "la aplicación que funciona como mi compadre de toda la vida pero nunca se olvida de cobrarme".

**Qué ya existe (verified).**

| Componente | Estado | Path |
|---|---|---|
| Engine de scoring 0–1000 con 5 ponderaciones | ✅ Funcional post-TD018 | `lib/credit/scoring-engine.ts` |
| Installment manager (2/3/4 cuotas, tasas 0/3/5%) | ✅ Funcional post-TD018 | `lib/credit/installment-manager.ts` |
| DB layer de fiados legacy (Prisma + map Decimal) | ✅ Funcional | `lib/db/fiados.db.ts` |
| Endpoints POST/GET fiados, cobro, cobro masivo | ✅ Funcional | `app/api/fiados/**` |
| Endpoints credit profile/check/create-plan/pay | ✅ Funcional | `app/api/credit/**` |
| Modelos Prisma `Fiado`, `FiadoCuota`, `CreditProfile`, `CreditInstallment` | ✅ En schema | `prisma/schema.prisma` L1730–L2862 |
| Cola BullMQ + fallback fire-and-forget | ✅ Funcional | `lib/queue/queues.ts` |
| Worker WhatsApp send-only | ✅ Funcional | `lib/workers/send-whatsapp.worker.ts` |
| Templates WhatsApp (comercio, no fiado todavía) | ✅ Funcional | `lib/whatsapp/message-templates.ts` |
| Campos `Customer.diasCredito`, `alertasWhatsapp` | ✅ En schema | `prisma/schema.prisma` L210–L211 |

**Qué falta (gap analysis).**

1. **Sin RENIEC**: el scoring solo usa historial propio. Cliente nuevo → score 0 → sin crédito, aunque sea buen pagador en otro lado.
2. **Sin recordatorios automáticos**: hoy el dueño debe llamar manualmente cuando vence un fiado. No hay cron ni BullMQ ni templates de cobro.
3. **Sin reporte semanal**: el dueño no sabe cuánto cobró la semana, cuánto está en fiado activo, quién entró a mora.
4. **Sin explicación del score al cliente**: solo el admin ve el score en el panel. El cliente no sabe "por qué no le dieron fiado" ni cómo subir.
5. **Sin fiado familiar**: no hay manera de que un cliente avale a otro.
6. **Sin integración POS/marketplace checkout**: "pagar con fiado" no es una opción visible en el carrito ni en el POS; el operador debe crear fiado manualmente post-venta.
7. **Sin historial de score**: `CreditProfile.creditScore` solo guarda el valor actual, no la evolución en el tiempo (requerido para mostrar al cliente "tu score subió de 520 a 610 este mes").

**Objetivo Ola 2.** Cerrar esos 7 gaps en **3 fases** (Fase 1 MVP, Fase 2 automatización, Fase 3 fiado familiar + POS) con entregables incrementales y feature flags por fase. Cada fase es **deployable de forma independiente** y no bloquea operación existente.

**Éxito = 5 métricas.** Ver sección 12 KPIs.

---

## 1. User stories

| # | Story | Prioridad | Fase |
|---|---|---|---|
| **US-F1-01** | Como **cajero**, quiero que al escanear el DNI de un cliente nuevo el sistema me diga en <2s si puedo darle fiado y cuánto, para no perder tiempo evaluando a ojo y cerrar la venta rápido. | 🔴 P0 | Fase 1 |
| **US-F1-02** | Como **dueña de bodega**, quiero que el sistema me muestre el **score del cliente con sus 5 componentes** (historial, puntualidad, ticket, antigüedad, lealtad) para entender por qué se dio o negó el crédito y poder explicárselo al cliente. | 🔴 P0 | Fase 1 |
| **US-F1-03** | Como **cliente**, quiero **ver mi propio score en el marketplace** con una explicación clara de qué me sube y qué me baja (paga a tiempo → +, paga tarde → −), para mejorarlo a propósito. | 🟡 P1 | Fase 1 |
| **US-F2-04** | Como **cliente**, quiero recibir un **recordatorio amable por WhatsApp 3 días antes** del vencimiento de mi fiado, para no olvidarme y no perder mi score. | 🔴 P0 | Fase 2 |
| **US-F2-05** | Como **cliente**, quiero recibir un **recordatorio más directo 1 día antes** y un **aviso urgente el día del vencimiento**, con el monto exacto y un link para confirmar pago, para no entrar a mora por distracción. | 🔴 P0 | Fase 2 |
| **US-F2-06** | Como **dueña de bodega**, quiero que los **lunes a las 8am** me llegue un WhatsApp con un resumen de la semana: cuánto cobré, cuánto tengo en fiado activo, cuántos clientes nuevos con crédito, cuántos entraron a mora, para tomar decisiones sin abrir la compu. | 🔴 P0 | Fase 2 |
| **US-F3-07** | Como **sobrina de clienta antigua**, quiero pedir que mi tía **me avale un fiado de S/30** compartiendo parte de su límite, para poder llevarme las cosas aunque yo todavía no tenga score propio. | 🟡 P1 | Fase 3 |
| **US-F3-08** | Como **cliente del marketplace online**, quiero que en el **checkout aparezca el botón "Pagar con fiado"** si mi score lo permite, mostrando el plan de cuotas disponible (2, 3 o 4), para pagar como siempre pero sin levantar el teléfono. | 🔴 P0 | Fase 3 |
| **US-F3-09** | Como **dueña**, quiero poder **desactivar el fiado digital para un cliente puntual** (ej: me enteré que se mudó) sin bloquearle el resto de funciones, para mitigar riesgo sin castigar. | 🟢 P2 | Fase 3 |

---

## 2. Cambios al schema.prisma

Todos los cambios son **aditivos** (nullable + default o tabla nueva), compatible con `prisma migrate dev` + estrategia SQL manual ADR-020 si hay downtime cero requerido. **Razonamiento de cada cambio:**

### 2.1 Nuevo modelo `CreditScoreHistory`

**Por qué:** hoy `CreditProfile.creditScore` solo guarda el valor actual. US-F1-03 pide mostrarle al cliente "tu score subió de 520 a 610 este mes" → necesitamos el timeline. Sin historial no hay transparencia. También alimenta el dashboard del admin con una línea temporal.

```prisma
model CreditScoreHistory {
  id              String   @id @default(cuid())
  tenantId        String
  customerId      String   // FK a Customer.phone
  creditProfileId String   // FK a CreditProfile.id
  score           Int      // 0-1000 al momento del snapshot
  creditLimit     Decimal  @db.Decimal(12, 2)
  riskLevel       String   // none | low | medium | high
  trigger         String   // "payment_on_time" | "payment_late" | "new_loan" | "default" | "manual_recalc" | "weekly_cron"
  deltaScore      Int      // +10, -50, etc.
  reason          String?  // explicación legible: "Pago puntual de cuota 2/3"
  breakdown       Json     // snapshot del breakdown de ponderaciones
  createdAt       DateTime @default(now())

  creditProfile CreditProfile @relation(fields: [creditProfileId], references: [id], onDelete: Cascade)

  @@index([tenantId, customerId, createdAt(sort: Desc)])
  @@index([creditProfileId, createdAt(sort: Desc)])
}

// En CreditProfile agregar:
// scoreHistory CreditScoreHistory[]
```

### 2.2 Nuevo modelo `CreditReminder`

**Por qué:** necesitamos **idempotencia** en los recordatorios. Si el cron corre 2 veces el mismo día, no debe enviar el WhatsApp duplicado. Cada recordatorio enviado queda registrado con `idempotencyKey = fiadoId + stage + date`. Además permite auditoría: "¿le avisé a doña Rosa del fiado vencido? Sí, el jueves 10 a las 8am".

```prisma
model CreditReminder {
  id             String   @id @default(cuid())
  tenantId       String
  fiadoId        String?  // FK a Fiado.id (opcional, uno de los dos)
  installmentId  String?  // FK a CreditInstallment.id (opcional, uno de los dos)
  customerId     String   // Customer.phone
  stage          String   // "T-3" | "T-1" | "T-0" | "T+1" | "T+7" | "T+30"
  dueDate        DateTime // fecha de vencimiento al momento del envío
  channel        String   @default("whatsapp") // whatsapp | sms | push
  status         String   // "queued" | "sent" | "delivered" | "read" | "failed"
  messageSid     String?  // ID del proveedor WhatsApp para tracking
  idempotencyKey String   @unique // fiadoId + stage + dueDate.toISOString()
  sentAt         DateTime?
  errorMessage   String?
  createdAt      DateTime @default(now())

  @@index([tenantId, customerId, createdAt(sort: Desc)])
  @@index([fiadoId])
  @@index([installmentId])
  @@index([stage, dueDate])
}
```

### 2.3 Nuevo modelo `CreditGuarantor` (Fase 3 — fiado familiar)

**Por qué:** US-F3-07. Un cliente "avalador" cede parte de su límite disponible a otro ("avalado"). Requiere relación N:M con atributos (monto cedido, estado, fecha).

```prisma
model CreditGuarantor {
  id                  String   @id @default(cuid())
  tenantId            String
  guarantorCustomerId String   // quien avala (Customer.phone)
  beneficiaryCustomerId String // quien recibe aval (Customer.phone)
  guaranteedAmount    Decimal  @db.Decimal(12, 2) // S/ que el avalador cede
  status              String   // "pending" | "active" | "revoked" | "exhausted"
  approvedBy          String?  // username del admin que aprobó
  approvedAt          DateTime?
  revokedAt           DateTime?
  revokedReason       String?
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([tenantId, guarantorCustomerId, beneficiaryCustomerId])
  @@index([tenantId, status])
  @@index([guarantorCustomerId])
  @@index([beneficiaryCustomerId])
}
```

### 2.4 Nuevo modelo `ReniecVerification` (Fase 1)

**Por qué:** US-F1-01 pide validar DNI contra RENIEC. Cacheamos el resultado para no pagar cada consulta (RENIEC/APIs Perú cobran por hit). También permite auditoría legal futura ("¿validaste a este cliente?").

```prisma
model ReniecVerification {
  id             String   @id @default(cuid())
  tenantId       String
  customerId     String?  // opcional: se crea antes o se vincula después
  dni            String   // 8 dígitos
  fullName       String?  // nombre devuelto por RENIEC
  birthDate      DateTime?
  verified       Boolean  @default(false)
  source         String   // "reniec_api" | "manual" | "cached"
  rawResponse    Json?    // respuesta cruda de la API para auditoría
  verifiedAt     DateTime?
  expiresAt      DateTime // cache: 90 días
  createdAt      DateTime @default(now())

  @@unique([tenantId, dni])
  @@index([tenantId, customerId])
  @@index([dni])
  @@index([expiresAt])
}
```

### 2.5 Cambios a `CreditProfile` (aditivos)

```prisma
model CreditProfile {
  // ...campos existentes...
  dniVerified        Boolean  @default(false) // linked a ReniecVerification
  reniecVerifiedAt   DateTime?
  allowFamilyCredit  Boolean  @default(true)  // opt-out del fiado familiar
  autoReminders      Boolean  @default(true)  // opt-out de recordatorios WhatsApp
  scoreHistory       CreditScoreHistory[]
  guarantorsGiven    CreditGuarantor[] @relation("guarantor") // cuando este cliente avala
  guarantorsReceived CreditGuarantor[] @relation("beneficiary") // cuando este cliente es avalado
}
```

> **Nota 1:** las relaciones nombradas requieren ajustar también `CreditGuarantor` con `@relation("guarantor", ...)` y `@relation("beneficiary", ...)`. Omitido en 2.3 por claridad; se documenta en ADR-021.
>
> **Nota 2:** `CreditGuarantor` apunta a `Customer.phone` directo, no a `CreditProfile.id`, para simplificar (mismo patrón que `Fiado.customerId`).

### 2.6 Cambios a `CreditInstallment` (aditivos)

```prisma
model CreditInstallment {
  // ...campos existentes...
  reminders      CreditReminder[]  // inverso
  // nada más, ya tiene nextDueDate y status
}
```

### 2.7 Dependencia explícita con TD-030 (`LoyaltyTransaction`)

El scoring engine usa `loyaltyPoints` como uno de los 5 factores (peso 10%). Hoy `loyaltyPoints` es un contador acumulado en `Customer.loyaltyPoints`. **TD-030 crea `LoyaltyTransaction`** para tener historial real de puntos. **Fiado Digital Ola 2 depende de TD-030 ya aplicado** porque:

1. El componente "tu score subió porque usaste tus puntos" requiere saber **cuándo** cambió el saldo.
2. El reporte semanal al dueño incluye "W puntos fidelizados esta semana" → solo resolvible con tabla de transacciones.

**→ Bloqueo duro: TD-030 debe estar cerrado antes de mergear Fase 1 de este plan.**

---

## 3. Nuevas API routes

| Método | Path | Auth | Request body | Response shape | Fase |
|---|---|---|---|---|---|
| `POST` | `/api/credit/reniec/verify` | `requireAdmin(["admin","cajero"])` | `{ dni: string (8 dígitos) }` | `{ verified: bool, fullName?, birthDate?, cached: bool }` | 1 |
| `GET` | `/api/credit/score-history/[customerId]` | `requireAdmin(["admin","cajero"])` | — | `{ timeline: [{ date, score, deltaScore, trigger, reason }], currentScore, currentLimit }` | 1 |
| `GET` | `/api/me/credit-score` | Session cliente (marketplace) | — | `{ score, creditLimit, availableCredit, riskLevel, breakdown, tips: string[] }` | 1 |
| `POST` | `/api/credit/score/recalculate` | `requireAdmin(["admin"])` | `{ customerId, reason? }` | `{ before, after, deltaScore }` | 1 |
| `GET` | `/api/credit/reminders/[fiadoId]` | `requireAdmin(["admin","cajero"])` | — | `{ reminders: CreditReminder[] }` | 2 |
| `POST` | `/api/credit/reminders/resend` | `requireAdmin(["admin"])` | `{ fiadoId, stage }` | `{ sent: bool, sid?, reason? }` | 2 |
| `GET` | `/api/admin/reports/weekly-credit` | `requireAdmin(["admin"])` | `?weekOf=YYYY-MM-DD` | `{ collectedAmount, activeCredit, newCustomers, intoDefault, topDebtors }` | 2 |
| `POST` | `/api/credit/guarantors` | `requireAdmin(["admin"])` o cliente autenticado marketplace | `{ guarantorCustomerId, beneficiaryCustomerId, guaranteedAmount, notes? }` | `{ id, status: "pending" }` | 3 |
| `POST` | `/api/credit/guarantors/[id]/approve` | `requireAdmin(["admin"])` | — | `{ id, status: "active" }` | 3 |
| `POST` | `/api/credit/guarantors/[id]/revoke` | `requireAdmin(["admin"])` o guarantor dueño | `{ reason }` | `{ id, status: "revoked" }` | 3 |
| `GET` | `/api/credit/guarantors` | `requireAdmin(["admin","cajero"])` | `?customerId=X&role=guarantor\|beneficiary` | `{ guarantors: CreditGuarantor[] }` | 3 |
| `POST` | `/api/checkout/fiado-option` | Session cliente marketplace | `{ orderDraftId }` | `{ eligible: bool, availableCredit, suggestedPlans: [{ installments, amountPerInstallment, interestRate }] }` | 3 |
| `POST` | `/api/cron/credit-reminders` | `CRON_SECRET` header | `{ dryRun?: bool }` | `{ scanned, queued, skipped, errors }` | 2 |
| `POST` | `/api/cron/weekly-credit-report` | `CRON_SECRET` header | — | `{ tenantsProcessed, messagesEnqueued }` | 2 |

**Todas las rutas respetan:**
- `tenantId` como primer parámetro en queries DB (regla CLAUDE.md §3).
- `safeParse()` de Zod (regla §2), **nunca** `.parse()`.
- Sin `export const dynamic = "force-dynamic"` (ADR-019). Runtime autodetecta dinámicas al leer `cookies()/headers()/searchParams`.
- Raw SQL solo con `$1 $2 $3` posicionales (ADR-011).

---

## 4. Cambios a API routes existentes

| Route | Cambio | Razonamiento |
|---|---|---|
| `POST /api/fiados/route.ts` | Después de crear fiado, invocar `enqueueCreditReminder({ fiadoId, stage: "T-3", dueDate: fechaVence })` (fire-and-forget). | Empezar a agendar el ciclo de recordatorios desde el nacimiento del fiado. |
| `POST /api/fiados/[id]/pagar/route.ts` | Después de registrar pago, invocar `updateCreditProfile()` + **snapshotear** `CreditScoreHistory` con `trigger="payment_on_time"` o `"payment_late"`. | Para que el cliente vea "tu score subió +12 porque pagaste puntual". |
| `POST /api/credit/create-plan/route.ts` | Validar aval familiar si `guarantorId` viene en body; snapshotear historial de score. | Habilita fiado familiar en checkout. |
| `POST /api/credit/pay/route.ts` | Snapshot de `CreditScoreHistory` después de cada pago. | Igual que fiados. |
| `GET /api/credit/profile/[customerId]/route.ts` | Incluir `scoreHistory` (últimos 12 registros) + guarantors asociados. | UI admin muestra timeline completo. |
| `proxy.ts` middleware | Agregar headers CSP para permitir imagen del "termómetro de score" si usamos chart externa. | Solo si el UI lo requiere; probablemente inline SVG y no haga falta. |

---

## 5. Cron jobs nuevos

Todos son rutas POST con auth por `CRON_SECRET` header, agendados vía **Vercel Cron** (`vercel.json`) o **BullMQ repeatable job** si se decide background workers. **Recomendación:** Vercel Cron → POST → ruta → la ruta enqueue jobs en BullMQ → worker los procesa. Esto da:
- Garantía de ejecución puntual (Vercel Cron es confiable).
- Procesamiento desacoplado (worker puede tardar sin bloquear el HTTP).
- Observabilidad en dashboard BullMQ existente.

| Job | Schedule (cron) | Path | Qué hace |
|---|---|---|---|
| `credit-reminders-daily` | `0 8 * * *` (8am Lima = 13 UTC) | `POST /api/cron/credit-reminders` | Escanea `Fiado` y `CreditInstallment` con `nextDueDate/fechaVence` en [T-3, T-1, T0, T+1, T+7, T+30] respecto a hoy. Para cada uno, verifica en `CreditReminder` si ya envió ese stage. Si no, enqueue a cola `credit-reminder-whatsapp`. Idempotente. |
| `weekly-credit-report` | `0 8 * * 1` (lunes 8am Lima) | `POST /api/cron/weekly-credit-report` | Por cada tenant con al menos 1 `CreditProfile` activo: agrega métricas semanales y enqueue WhatsApp al owner del tenant. |
| `credit-score-weekly-recalc` | `0 6 * * 0` (domingo 6am Lima) | `POST /api/cron/credit-score-recalc` | Recalcula score de todos los clientes activos del tenant. Snapshotea `CreditScoreHistory` con `trigger="weekly_cron"`. Esto asegura que scores no "queden dormidos" si el cliente no compra en semanas. |
| `overdue-detector` | `0 */6 * * *` (cada 6 horas) | `POST /api/cron/fiados-overdue` (reusar lógica existente `checkOverdue`) | Marca fiados/installments vencidos como `overdue`/`VENCIDO` y snapshotea score con `trigger="default"`. |

**Registrar en `vercel.json`:**

```json
{
  "crons": [
    { "path": "/api/cron/credit-reminders", "schedule": "0 13 * * *" },
    { "path": "/api/cron/weekly-credit-report", "schedule": "0 13 * * 1" },
    { "path": "/api/cron/credit-score-recalc", "schedule": "0 11 * * 0" },
    { "path": "/api/cron/fiados-overdue", "schedule": "0 */6 * * *" }
  ]
}
```

**Nueva cola BullMQ:** `CREDIT_REMINDERS` en `lib/queue/queues.ts`. Worker nuevo en `lib/workers/credit-reminders.worker.ts`. Job data:

```typescript
export interface CreditReminderJobData {
  tenantId: string;
  fiadoId?: string;
  installmentId?: string;
  customerPhone: string;
  stage: "T-3" | "T-1" | "T-0" | "T+1" | "T+7" | "T+30";
  dueDate: string; // ISO
  amount: number;
  idempotencyKey: string;
}
```

---

## 6. WhatsApp templates nuevos

Todos en español neutro latinoamericano, tono variable según stage (amable → directo → urgente), con emojis moderados. Añadir en `lib/whatsapp/message-templates.ts`:

### 6.1 Recordatorio T-3 (3 días antes) — amable

```
👋 ¡Hola {nombre}!

Solo para recordarte con cariño que tu fiado de *S/{monto}* con *{nombreBodega}* vence el *{fechaVence}* (en 3 días).

✅ Tu score actual: *{score}/1000*
⏰ Pagas a tiempo → tu score sube
📊 Ver detalles: {linkPortal}

¡Gracias por la confianza!
```

### 6.2 Recordatorio T-1 (1 día antes) — directo

```
🔔 Hola {nombre},

Mañana vence tu fiado de *S/{monto}* con *{nombreBodega}*.

📅 Vencimiento: *{fechaVence}*
💰 Monto: *S/{monto}*
🏪 Acércate a la tienda o paga por Yape al *{yape}*

💡 Paga a tiempo y mantén tu crédito abierto.
📊 Tu score: *{score}/1000*
```

### 6.3 Recordatorio T-0 (mismo día) — urgente

```
⚠️ {nombre}, HOY vence tu fiado

💰 Monto: *S/{monto}*
🏪 Bodega: *{nombreBodega}*
📅 Vence: *HOY*

📱 Paga por Yape al *{yape}* o acércate a la tienda.

Si ya pagaste, ignora este mensaje. Si necesitas más tiempo, responde aquí y te ayudamos. 🙏
```

### 6.4 Recordatorio T+1 (1 día después) — aviso de mora

```
😟 Hola {nombre},

Tu fiado de *S/{monto}* venció ayer y sigue sin pagar.

⚠️ Tu score bajó de {scoreAntes} a *{scoreAhora}/1000*.
📉 Esto afecta tu crédito disponible.

¿Necesitas facilidades? Responde este mensaje o acércate a *{nombreBodega}*.
Estamos para ayudarte. 🤝
```

### 6.5 Recordatorio T+7 — presión + plan de pago

```
🚨 {nombre}, tu fiado tiene 7 días de atraso

💰 Monto original: *S/{monto}*
🏪 Bodega: *{nombreBodega}*
📉 Tu score actual: *{score}/1000* (bajó {delta} puntos)

Podemos ayudarte con un plan en cuotas. Responde este mensaje o visita la bodega HOY.

Si no recibimos respuesta esta semana, tu fiado entrará a mora formal. 😔
```

### 6.6 Recordatorio T+30 — escalamiento final

```
❌ {nombre}, tu fiado entró a MORA

💰 Monto: *S/{monto}*
📅 Días de atraso: 30
📊 Tu score: *{score}/1000*
🔒 Tu crédito ha sido suspendido temporalmente.

Para regularizar, acércate a *{nombreBodega}* o llámanos al {telefono}.

Cuando pagues, tu score se recupera automáticamente. 💪
```

### 6.7 Reporte semanal al dueño (lunes 8am)

```
📊 *Resumen semanal — {nombreBodega}*
Semana del {lunesInicio} al {domingoFin}

💰 *Cobrado esta semana:* S/{montoCobrado}
📦 *Fiado activo total:* S/{montoActivo} ({numClientes} clientes)
✨ *Clientes nuevos con crédito:* {nuevos}
⚠️ *Entraron a mora:* {moraCount}
⭐ *Cliente top del mes:* {topClienteNombre} (score {topScore})

🔝 *Top 3 deudores a cobrar esta semana:*
1. {deudor1} — S/{monto1} (vence {fecha1})
2. {deudor2} — S/{monto2} (vence {fecha2})
3. {deudor3} — S/{monto3} (vence {fecha3})

Abre tu panel → {linkDashboard}

¡Buena semana! ☀️
```

### 6.8 Notificación al cliente cuando score sube

```
🎉 ¡{nombre}, tu score subió!

📊 Antes: {scoreAntes}/1000
📈 Ahora: *{scoreNuevo}/1000* (+{delta})
💰 Nuevo crédito disponible: *S/{limiteNuevo}*

¿Por qué subió? {razonHumana}

Sigue comprando y pagando puntual — tu score puede seguir creciendo. 💪
```

### 6.9 Solicitud de aval familiar (al avalador)

```
🤝 Hola {avaladorNombre},

*{beneficiarioNombre}* te está pidiendo que le avales un fiado de *S/{monto}* en *{nombreBodega}*.

Si aceptas, se descuenta temporalmente *S/{monto}* de tu crédito disponible (hoy tienes S/{disponible}).
Cuando {beneficiarioNombre} pague, tu crédito se libera automáticamente.

✅ Aceptar: {linkAceptar}
❌ Rechazar: {linkRechazar}

Solo tú puedes autorizar esto. La bodega no puede forzarlo.
```

### 6.10 Confirmación de aval aceptado

```
✅ Aval aceptado

{avaladorNombre} autorizó un aval de *S/{monto}* para {beneficiarioNombre}.
Ya puede llevar sus compras a *{nombreBodega}*.

¡Gracias por apoyar a los tuyos! 🤗
```

---

## 7. Cambios UI

### 7.1 Componentes nuevos

| Componente | Path propuesto | Qué hace | Fase |
|---|---|---|---|
| `CreditScoreCard.tsx` | `components/credit/CreditScoreCard.tsx` | Card visual con score 0-1000, velocímetro, delta vs semana pasada, breakdown de 5 ponderaciones con barras. | 1 |
| `CreditScoreTimeline.tsx` | `components/credit/CreditScoreTimeline.tsx` | Gráfico de línea (recharts o SVG custom) del score en el tiempo; markers por evento relevante. | 1 |
| `MyCreditPanel.tsx` | `components/marketplace/MyCreditPanel.tsx` | Panel en perfil del cliente marketplace: score, límite, próximos pagos, tips para subir. | 1 |
| `ReniecVerifyDialog.tsx` | `components/credit/ReniecVerifyDialog.tsx` | Dialog modal para ingresar DNI y validar contra RENIEC, con spinner y resultado. | 1 |
| `CreditReminderLog.tsx` | `components/credit/CreditReminderLog.tsx` | Lista de recordatorios enviados a un cliente (admin view). Botón "reenviar". | 2 |
| `WeeklyCreditReportPreview.tsx` | `components/admin/WeeklyCreditReportPreview.tsx` | Preview en el admin de cómo se ve el reporte semanal; permite regenerar manual. | 2 |
| `GuarantorRequestForm.tsx` | `components/credit/GuarantorRequestForm.tsx` | Form para pedir aval: seleccionar avalador, monto, razón. | 3 |
| `FiadoCheckoutOption.tsx` | `components/checkout/FiadoCheckoutOption.tsx` | Botón "Pagar con fiado" en el `CheckoutModal.tsx` con selector de cuotas 2/3/4. **ZONA DE PELIGRO**, requiere skill `checkout-flow` antes de tocar. | 3 |
| `CreditBreakdownExplainer.tsx` | `components/credit/CreditBreakdownExplainer.tsx` | Explica en lenguaje simple "por qué tu score es X". | 1 |

### 7.2 Componentes modificados

| Componente | Cambio | Fase |
|---|---|---|
| `components/admin/CustomersTab.tsx` | Agregar columna "Score" y "Crédito disponible". Click → abre `CreditScoreCard`. | 1 |
| `components/admin/FiadosTab.tsx` | Mostrar estado de recordatorios enviados (icono timeline). | 2 |
| `app/admin/page.tsx` | Agregar tab "Fiado Digital" con subtabs: clientes / reportes / aval familiar. Usar **dynamic import** (ya tiene 1256 líneas, respetar zona peligrosa). | 1–3 |
| `components/marketplace/UserProfileMenu.tsx` | Link a "Mi crédito" → `/marketplace/mi-credito`. | 1 |
| `components/checkout/CheckoutModal.tsx` | Integrar `FiadoCheckoutOption`. **Invocar skill `checkout-flow` antes de editar**. | 3 |
| `components/CartSidebar.tsx` | Mostrar badge "Eligible para fiado" si `availableCredit >= cartTotal`. | 3 |

### 7.3 Páginas nuevas

| Ruta | Qué muestra | Fase |
|---|---|---|
| `/marketplace/mi-credito` | `MyCreditPanel` — score, historial, próximos pagos, tips | 1 |
| `/marketplace/avalar` | Vista para aceptar/rechazar solicitudes de aval pendientes | 3 |
| `/admin/credit/reports/weekly/[weekOf]` | Reporte semanal expandido (mismo dato que el WhatsApp) | 2 |
| `/admin/credit/reminders/[fiadoId]` | Log de recordatorios con opción reenviar | 2 |

**Regla Next 16:** ninguna página usa `export const dynamic = "force-dynamic"` (ADR-019). Todas usan `use cache` directive + `cacheLife`/`cacheTag` donde aplique. Los fetches dinámicos (`cookies()`, `headers()`) auto-disparan render dinámico. Los datos sensibles (score propio del cliente) van en server component con `await cookies()` para forzar personalización.

---

## 8. Orden de implementación recomendado

### Fase 1 — Foundation + transparencia (Semana 1–2 Ola 2)

**Objetivo:** engine enriquecido con RENIEC + historial de score + UI de transparencia para cliente y dueño. **Sin automatización todavía.**

| Paso | Tarea | Owner recomendado | Duración | Depende de |
|---|---|---|---|---|
| 1.1 | Aplicar TD-030 `LoyaltyTransaction` (ADR-020 Opción B paso 3) | database-engineer | 30 min | ADR-020 ejecutado |
| 1.2 | Migración schema: `CreditScoreHistory`, `ReniecVerification`, campos aditivos en `CreditProfile` | database-engineer | 45 min | 1.1 |
| 1.3 | Integrar API de verificación RENIEC (provider: decidir Apis.net.pe, Sunat, o custom) con cache | backend-platform-engineer | 3h | 1.2 |
| 1.4 | Nueva función `snapshotCreditScore(tenantId, customerId, trigger, reason)` en `scoring-engine.ts` | backend-platform-engineer | 1h | 1.2 |
| 1.5 | Modificar `updateCreditProfile` para snapshotear después de cada cálculo | backend-platform-engineer | 30 min | 1.4 |
| 1.6 | Endpoint `POST /api/credit/reniec/verify` + tests unit | backend-platform-engineer | 2h | 1.3 |
| 1.7 | Endpoint `GET /api/credit/score-history/[customerId]` | backend-platform-engineer | 1h | 1.4 |
| 1.8 | Endpoint `GET /api/me/credit-score` (cliente marketplace) | backend-platform-engineer | 1h | 1.4 |
| 1.9 | Endpoint `POST /api/credit/score/recalculate` (admin) | backend-platform-engineer | 1h | 1.4 |
| 1.10 | `CreditScoreCard.tsx` + `CreditScoreTimeline.tsx` + `CreditBreakdownExplainer.tsx` | frontend-engineer | 4h | 1.7, 1.8 |
| 1.11 | `MyCreditPanel.tsx` + ruta `/marketplace/mi-credito` | frontend-engineer | 3h | 1.8, 1.10 |
| 1.12 | `ReniecVerifyDialog.tsx` + integración en `CustomersTab` | frontend-engineer | 3h | 1.6 |
| 1.13 | Tab "Fiado Digital" en admin con subtab "Clientes" | frontend-engineer | 2h | 1.10 |
| 1.14 | Tests e2e Playwright: flujo "admin verifica DNI → score aparece → cliente ve su score" | qa-reliability-engineer | 3h | 1.11, 1.13 |
| 1.15 | ADR-021 FINAL con sección "Ejecución real Fase 1" | solution-architect | 30 min | 1.14 |

**Feature flag:** `FIADO_DIGITAL_V2_PHASE1` — off por default hasta e2e green.

**Total Fase 1:** ~25 horas ingeniería (~4 días hábiles con un dev).

### Fase 2 — Automatización de recordatorios + reporte semanal (Semana 3–4 Ola 2)

| Paso | Tarea | Owner | Duración | Depende de |
|---|---|---|---|---|
| 2.1 | Migración schema: `CreditReminder` | database-engineer | 20 min | Fase 1 mergeada |
| 2.2 | Nueva cola BullMQ `CREDIT_REMINDERS` + worker `credit-reminders.worker.ts` | backend-platform-engineer | 4h | 2.1 |
| 2.3 | Templates WhatsApp 6.1–6.10 en `message-templates.ts` | backend-platform-engineer | 2h | — |
| 2.4 | Endpoint `POST /api/cron/credit-reminders` | backend-platform-engineer | 3h | 2.2, 2.3 |
| 2.5 | Endpoint `POST /api/cron/weekly-credit-report` | backend-platform-engineer | 3h | 2.3 |
| 2.6 | Endpoint `POST /api/cron/credit-score-recalc` | backend-platform-engineer | 2h | 1.9 |
| 2.7 | Endpoint `POST /api/cron/fiados-overdue` (refactor de `checkOverdue` existente) | backend-platform-engineer | 1h | — |
| 2.8 | Registrar crons en `vercel.json` | devops-release-engineer | 15 min | 2.4–2.7 |
| 2.9 | Endpoint `GET /api/credit/reminders/[fiadoId]` + `POST /api/credit/reminders/resend` | backend-platform-engineer | 2h | 2.2 |
| 2.10 | Endpoint `GET /api/admin/reports/weekly-credit` | backend-platform-engineer | 2h | 2.5 |
| 2.11 | `CreditReminderLog.tsx` + `WeeklyCreditReportPreview.tsx` | frontend-engineer | 3h | 2.9, 2.10 |
| 2.12 | Tests unit: idempotencia de recordatorios (enviar 2x → 1 WhatsApp) | qa-reliability-engineer | 2h | 2.4 |
| 2.13 | Tests e2e: simular cron run → verificar envío único + log en CreditReminder | qa-reliability-engineer | 3h | 2.12 |
| 2.14 | Monitoreo Sentry: alertas para job failures en cola `credit-reminders` | devops-release-engineer | 1h | 2.2 |

**Feature flag:** `FIADO_DIGITAL_V2_PHASE2`. Rollout: primero en 1 tenant de staging con 10 fiados de prueba; validar 5 envíos consecutivos sin duplicados antes de activar en prod.

**Total Fase 2:** ~28 horas.

### Fase 3 — Fiado familiar + integración checkout (Semana 5–6 Ola 2)

| Paso | Tarea | Owner | Duración | Depende de |
|---|---|---|---|---|
| 3.1 | Migración schema: `CreditGuarantor` | database-engineer | 30 min | Fase 2 mergeada |
| 3.2 | Nueva función `calculateEffectiveCredit(customerId)` que considera avales recibidos | backend-platform-engineer | 2h | 3.1 |
| 3.3 | Endpoints `POST/GET /api/credit/guarantors` + `approve`/`revoke` | backend-platform-engineer | 4h | 3.1 |
| 3.4 | Flujo WhatsApp: cuando se crea `CreditGuarantor pending`, envíar template 6.9 al avalador con botones aceptar/rechazar | backend-platform-engineer | 3h | 3.3 |
| 3.5 | Endpoint `POST /api/checkout/fiado-option` | backend-platform-engineer | 3h | 3.2 |
| 3.6 | **[ZONA DE PELIGRO]** Integrar `FiadoCheckoutOption.tsx` en `CheckoutModal.tsx` (leer skill `checkout-flow` antes) | checkout-specialist | 5h | 3.5, ADR-015 leído |
| 3.7 | `GuarantorRequestForm.tsx` + ruta `/marketplace/avalar` | frontend-engineer | 3h | 3.3 |
| 3.8 | Tests e2e: flujo completo "cliente A avala cliente B → B checkout marketplace con fiado → B paga → A recupera crédito" | qa-reliability-engineer | 4h | 3.6, 3.7 |
| 3.9 | Load test k6: 100 cálculos de score concurrentes + 50 checkouts con fiado | performance-engineer | 2h | 3.6 |
| 3.10 | Monitoreo: nuevo dashboard "Fiado Digital" con 5 KPIs | performance-engineer | 2h | — |

**Feature flag:** `FIADO_DIGITAL_V2_PHASE3`. Rollout gradual 10%/50%/100% durante 1 semana.

**Total Fase 3:** ~28 horas.

### Total Ola 2 Fiado Digital

- **Ingeniería neta:** ~81 horas (~13 días hábiles)
- **Con buffer de 30% (bugs, rework):** ~105 horas (~17 días hábiles)
- **Duración calendario con 1 full-time dev + 1 QA part-time:** **4–5 semanas**
- **Con paralelización (frontend + backend + QA en simultáneo dentro de cada fase):** **3–4 semanas**

---

## 9. Complejidad estimada por fase

| Fase | Complejidad técnica | Complejidad UX | Blast radius | Rollback dificultad |
|---|---|---|---|---|
| **Fase 1** — Foundation | 🟡 Media (RENIEC API + snapshot pattern + migration simple) | 🟡 Media (nuevos componentes de visualización + dialogs) | 🟢 Baja (todo aditivo, sin tocar hot path) | 🟢 Fácil (feature flag off) |
| **Fase 2** — Automatización | 🔴 Alta (cron + idempotency + queue + 10 templates + reporte agregado) | 🟢 Baja (mayormente admin view) | 🟡 Media (si hay bug → WhatsApp spam a clientes reales) | 🟡 Media (pausar cron + limpiar cola) |
| **Fase 3** — Fiado familiar + checkout | 🔴 Alta (toca checkout crítico + N:M relaciones + flujo WhatsApp interactivo) | 🔴 Alta (UX de aval es delicado, requiere copy cuidadoso) | 🔴 Alta (checkout es zona de peligro, bug = compras bloqueadas) | 🔴 Difícil (checkout revert requiere skill) |

---

## 10. Dependencias con otros TDs y features

| Dependencia | Tipo | Bloqueo |
|---|---|---|
| **TD-030 `LoyaltyTransaction`** (migration-plan-ola1-2026-04-09.md) | 🔴 Duro | Fase 1 no puede mergear hasta que TD-030 esté en prod. El reporte semanal y la notificación de "puntos usados este mes" lo requieren. |
| **TD-018 Float→Decimal** | 🟢 Ya aplicado | Scoring y installment manager ya lo toleran. |
| **ADR-011 raw SQL parámetros posicionales** | 🟢 Regla continua | Todo el SQL de este plan respeta `$1 $2 $3`. |
| **ADR-014 middleware modular** | 🟢 Compatible | Los nuevos endpoints pasan por el mismo stack middleware sin cambios. |
| **ADR-015 checkout footer slot** | 🟡 Toca | Fase 3 integra con CheckoutModal → revisar footer slot + skill `checkout-flow`. |
| **ADR-019 Next16 cache components** | 🟢 Ya aplicado | Ninguna ruta nueva usa `force-dynamic`. |
| **WhatsApp Business API** (`lib/whatsapp/conversation-engine.ts`) | 🟢 Ya existe | Los templates nuevos se suman al file existente. |
| **BullMQ + Redis** (`lib/queue/*`) | 🟢 Ya existe | Cola nueva es aditiva. Fallback fire-and-forget funciona si Redis no disponible. |
| **Vercel Cron** (`vercel.json`) | 🟡 Puede requerir upgrade de plan | Verificar que plan actual permite 4 crons adicionales. |
| **RENIEC / API externa** | 🟡 Decisión pendiente | Brandon debe decidir provider: Apis.net.pe (pago per hit), Sunat (gratis pero lento), o sin validación (degrade mode). |
| **Feature flags ADR-005** | 🟢 Compatible | Cada fase con su flag. |

---

## 11. Riesgos + mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **WhatsApp spam si falla idempotencia** | 🟡 Media | 🔴 Alto (cliente enojado + costo WhatsApp) | `CreditReminder.idempotencyKey` UNIQUE + worker verifica existencia antes de enviar + tests específicos de doble ejecución del cron |
| R2 | **RENIEC API down o rate limit** | 🟡 Media | 🟡 Medio (bloquea onboarding de clientes nuevos) | Degrade mode: si RENIEC falla, permitir creación de perfil con `dniVerified=false` y scoring sin bonus. Cache 90 días para reducir hits. Fallback manual por admin. |
| R3 | **Reporte semanal llega vacío los lunes** | 🟢 Baja | 🟡 Medio (dueño pierde confianza) | Dry-run el domingo; logs explícitos; alerta Sentry si cron falla; fallback a generar on-demand desde admin UI. |
| R4 | **Fiado familiar abusado** (usar a abuelitos vulnerables como avaladores) | 🟡 Media | 🔴 Alto (reputación + legal) | Opt-in explícito del avalador via WhatsApp interactivo; límite máximo S/100 por aval en Fase 3; admin debe aprobar cada aval manualmente en v1; alertas si un mismo avalador recibe 3+ solicitudes distintas en 7 días. |
| R5 | **Checkout marketplace bloqueado** por bug en `FiadoCheckoutOption` | 🟡 Media | 🔴 Alto (zona de peligro) | Feature flag gradual 10%/50%/100%; fallback a "seguir sin fiado" si componente falla; e2e completo antes de mergear; obligatorio revisar con checkout-specialist. |
| R6 | **Score fluctúa demasiado** (cliente ve +50/-50 diario → desconfía) | 🟡 Media | 🟡 Medio | Smoothing: `deltaScore` solo se muestra al cliente si `abs(delta) >= 5`; cron semanal recalcula; triggers menores no notifican. |
| R7 | **Multi-tenant leak**: score de tenant A contamina tenant B | 🟢 Baja | 🔴 Alto | `tenantId` en todas las queries + tests específicos de aislamiento + review regla §3 CLAUDE.md en cada PR. |
| R8 | **Scoring mal calibrado en caliente**: clientes legítimos reciben risk=high | 🟡 Media | 🟡 Medio | A/B testing en Fase 1: mostrar score sin bloquear; medir falsa negativa vs historial real; ajustar `WEIGHTS` en config, no en código. |
| R9 | **Coste RENIEC descontrolado** | 🟡 Media | 🟡 Medio | Cache 90 días + rate limit 100/tenant/día + alerta si excede budget mensual. |
| R10 | **Cron no dispara en Vercel** (zona horaria, plan limits) | 🟢 Baja | 🟡 Medio | Todos los crons en UTC + test manual via curl + healthcheck que verifica última ejecución en cada endpoint. |
| R11 | **BullMQ worker cae silencioso** → recordatorios dejan de enviarse | 🟡 Media | 🔴 Alto | Heartbeat del worker + dashboard BullMQ + alerta si cola crece más de 100 jobs sin procesarse. |
| R12 | **Cliente paga pero el score no sube rápido** → pierde confianza | 🟡 Media | 🟡 Medio | `processPayment` dispara `updateCreditProfile` inmediatamente + notificación WhatsApp 6.8 dentro de 60s del pago. |

---

## 12. KPIs para medir éxito post-launch

Definir dashboard "Fiado Digital" en `performance-engineer` con Grafana/Metabase. Medir semanal y mensual.

### KPIs de adopción

| KPI | Definición | Target 30 días post-launch | Target 90 días |
|---|---|---|---|
| **Clientes con score activo** | `count(CreditProfile where isActive=true and creditLimit > 0)` | ≥ 50 | ≥ 200 |
| **Verificaciones RENIEC** | `count(ReniecVerification where verified=true)` | ≥ 30 | ≥ 150 |
| **Fiados creados con nuevo flujo** | `count(Fiado created since Fase1 launch)` | ≥ 20/mes | ≥ 80/mes |

### KPIs de calidad

| KPI | Definición | Target | Umbral de alerta |
|---|---|---|---|
| **Tasa de pago puntual** | `paidOnTime / (paidOnTime + paidLate + defaulted)` global del tenant | ≥ 75% | < 60% |
| **Recordatorios efectivos** | `% de fiados que pagaron dentro de 24h de recibir recordatorio T-1 o T0` | ≥ 40% | < 20% |
| **Tasa de default (30d)** | `defaulted / totalLoans` en ventana móvil 30 días | ≤ 8% | > 15% |

### KPIs de negocio

| KPI | Definición | Target |
|---|---|---|
| **Ticket promedio con fiado vs sin fiado** | `avg(total fiado) / avg(total cash)` | ≥ 1.3x (el fiado sube el ticket) |
| **Retención clientes con crédito** | `% de clientes con CreditProfile que compran al menos 1x/semana` | ≥ 60% |
| **NPS de la feature** | Encuesta in-app tras 3 transacciones con fiado | ≥ 70 |
| **Reduction de llamadas de cobranza** | Comparar llamadas/semana antes vs después Fase 2 | ≥ 60% reducción |

### KPIs de sistema

| KPI | Target |
|---|---|
| Latencia p95 `POST /api/credit/score/recalculate` | < 500ms |
| Latencia p95 `GET /api/me/credit-score` | < 150ms (cacheable) |
| Tasa de error en cola `credit-reminders` | < 0.5% |
| Jobs BullMQ retrasados > 5 min | 0 |
| Costo mensual RENIEC | < S/100/tenant |

---

## 13. Glosario rápido (Feynman)

| Término | Qué es en cristiano |
|---|---|
| **Score** | Un número del 0 al 1000 que dice "qué tan confiable es este cliente para pagar". Como las estrellas de un Uber pero para plata. |
| **Límite de crédito** | Cuánto máximo puede llevarse fiado. Depende del score: score alto → más plata. |
| **Idempotencia** | Si le mandas el mismo WhatsApp dos veces, solo llega uno. Evita spam. |
| **Snapshot** | Foto del score en un momento exacto. Sirve para ver historia. |
| **Aval** | Cuando alguien dice "yo respondo por esta persona". Si el avalado no paga, el avalador pierde crédito. |
| **RENIEC** | El padrón nacional de DNIs en Perú. Si valido ahí, sé que el DNI es real y a quién le pertenece. |
| **BullMQ** | El "cartero" del sistema: maneja tareas en background sin bloquear al usuario. |
| **Cron** | Un robot que corre tareas a horas fijas (lunes 8am, todos los días, etc). |
| **Feature flag** | Un interruptor para prender/apagar una función sin volver a deployar. Si algo explota, apago el switch y listo. |
| **Fiado Digital** | Esta iniciativa completa. El fiado del cuaderno convertido en software que decide solo, cobra solo, y avisa solo. |

---

## 14. Referencias

- **ADR-011** — Delivery raw SQL parámetros posicionales
- **ADR-014** — Middleware modular auth/CSP/tenant/rate-limit
- **ADR-015** — Checkout confirmar step footer slot
- **ADR-016** — Plan maestro 24 semanas
- **ADR-017** — Índices Ola 1 aplicados
- **ADR-018** — TD-018 Float→Decimal estrategia
- **ADR-019** — Next 16 cache components, no force-dynamic
- **ADR-020** — Plan unificado migraciones Ola 1 (TD-030 bloqueante)
- **ADR-021** — Fiado Digital Ola 2 (este plan)
- `lib/credit/scoring-engine.ts` — engine actual de scoring
- `lib/credit/installment-manager.ts` — manager de cuotas
- `lib/queue/queues.ts` — infraestructura BullMQ
- `lib/whatsapp/message-templates.ts` — templates comerciales existentes
- `docs/migration-plan-ola1-2026-04-09.md` — TD-030 pendiente (dependencia dura)

---

**Última revisión:** 2026-04-09 por solution-architect.
**Próximo paso:** Brandon aprueba ADR-021 → migration-planner detalla SQL de Fase 1 → backend-platform-engineer arranca 1.1–1.9 → frontend-engineer en paralelo 1.10–1.13.
