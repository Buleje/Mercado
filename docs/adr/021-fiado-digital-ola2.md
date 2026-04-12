# ADR-021: Fiado Digital Ola 2 — Diferenciador #1 de Buleje

## Estado

🟡 **Propuesta — DRAFT** (pendiente aprobación de Brandon antes de ejecutar Fase 1)

**Nota:** Este ADR depende duro de ADR-020 (TD-030 `LoyaltyTransaction`) en estado ✅ Aplicado. Si TD-030 no está en prod cuando se mergee Fase 1, este ADR se bloquea.

**Documento de apoyo:** `docs/fiado-digital-ola2-plan.md` (plan completo con user stories, API routes, cron jobs, templates WhatsApp, KPIs).

## Fecha

2026-04-09

## Contexto

Buleje necesita definir, en términos arquitectónicos, cómo transforma el **fiado informal de cuaderno** en una experiencia software-first que sea **el diferenciador clave** frente a Mercado Libre, Rappi, Didi y cualquier player global presente en Perú.

**Por qué el fiado es el diferenciador #1:**

1. Ninguna app grande en LATAM presta dinero sin tarjeta, sin banco y sin burocracia a montos pequeños (S/50–1000).
2. Requiere presencia local, conocimiento del cliente y tolerancia al riesgo informal → moat natural contra globales.
3. Es la práctica cultural dominante en bodegas peruanas. Digitalizarla sin romper la confianza es un salto generacional, no incremental.
4. Para la señora de 55 años de Pucallpa, "la aplicación que funciona como mi compadre de toda la vida pero nunca se olvida de cobrarme" es más valiosa que cualquier descuento marketplace.

**Estado actual (verified en codebase 2026-04-09):**

| Componente | Estado | Gap |
|---|---|---|
| `lib/credit/scoring-engine.ts` — engine 0–1000 con 5 factores | ✅ Funcional post-TD018 | No integra RENIEC, no snapshot histórico |
| `lib/credit/installment-manager.ts` — cuotas 2/3/4 | ✅ Funcional post-TD018 | No notifica a cliente |
| `app/api/fiados/**` — endpoints básicos | ✅ Funcional | No dispara recordatorios |
| Modelos `Fiado`, `CreditProfile`, `CreditInstallment` | ✅ En schema | Sin historial de score, sin tabla de reminders, sin avales familiares |
| `lib/queue/queues.ts` BullMQ | ✅ Funcional | Sin cola dedicada a credit-reminders |
| `lib/whatsapp/message-templates.ts` | ✅ Funcional | Sin templates de cobro/score/reporte semanal |
| `app/api/credit/profile/[customerId]` | ✅ Funcional | Solo admin view; cliente no ve su score |

**Gaps críticos que bloquean el diferenciador:**

1. **Sin RENIEC** → cliente nuevo no puede recibir crédito aunque sea confiable.
2. **Sin recordatorios automáticos** → el dueño sigue cobrando a mano por teléfono → escala imposible.
3. **Sin reporte semanal automático al dueño** → sin observabilidad del negocio para no-técnicos.
4. **Sin transparencia al cliente** → el score es una caja negra → desconfianza → menor adopción.
5. **Sin fiado familiar** → sobrinas/nietos excluidos aunque haya un pariente confiable.
6. **Sin integración en checkout marketplace** → el "pagar con fiado" no es experiencia fluida, requiere operador.
7. **Sin historial de score** → imposible mostrar "tu score subió este mes" → sin gamification.

La pregunta arquitectónica es: **¿cómo diseñamos la Ola 2 de Fiado Digital para cerrar estos 7 gaps con mínimo blast radius, aprovechando infraestructura existente (BullMQ, templates WhatsApp, engine de scoring) y respetando reglas críticas del CLAUDE.md?**

## Opciones consideradas

### Opción A — Big-bang monorepo: un solo PR gigante con las 7 mejoras

- ✅ Una sola migración de schema; una sola decisión de producto.
- ✅ "Launch event" más impactante para marketing.
- ❌ Blast radius enorme — si un cron falla, afecta a todo.
- ❌ Review inviable (~80 archivos modificados).
- ❌ Mezcla 3 planos lógicos independientes (transparencia, automatización, extensión).
- ❌ Rollback imposible sin revert masivo.
- ❌ Retrasa todo a la fase más compleja (fiado familiar + checkout).

### Opción B — 3 fases secuenciales con feature flags por fase

- **Fase 1: Foundation + transparencia** — RENIEC + historial de score + UI cliente + UI admin. Sin cambio de comportamiento para nadie que no sea admin o cliente con crédito.
- **Fase 2: Automatización** — cron recordatorios + reporte semanal al dueño + recálculo semanal + 10 templates WhatsApp.
- **Fase 3: Fiado familiar + integración checkout** — modelo `CreditGuarantor` + flujo de aval WhatsApp + botón "Pagar con fiado" en marketplace checkout.

- ✅ Cada fase es deployable, testeable y rollbackable de forma independiente.
- ✅ Feature flags ADR-005 permiten rollout gradual dentro de cada fase.
- ✅ Fase 1 entrega valor inmediato (transparencia) sin tocar nada crítico.
- ✅ Fase 2 es donde aterriza la magia para el dueño (reporte lunes 8am).
- ✅ Fase 3 concentra el riesgo en checkout (zona de peligro) al final, cuando ya hay confianza en el stack.
- ✅ Permite paralelizar frontend + backend + QA dentro de cada fase.
- ❌ Triple overhead de CI/CD.
- ❌ Ventana total más larga (4–6 semanas vs 3 en big-bang teórico).
- ❌ El diferenciador completo no aterriza hasta Fase 3.

### Opción C — Externalizar el motor de crédito a un microservicio

- ✅ Aislamiento operacional del riesgo crediticio.
- ✅ Permitiría ofrecer scoring-as-a-service a otras bodegas a futuro (moat ampliado).
- ❌ Complejidad enorme innecesaria para el estado actual (1 tenant productivo).
- ❌ Violaría "perfect before new" — hay un engine funcionando en monorepo, romperlo sin razón.
- ❌ Operar un microservicio en Pucallpa con 1 dev = suicidio operacional.
- ❌ Dos deploys, dos schemas, dos observabilidades, dos rollbacks.

### Opción D — Integrar proveedor externo de scoring (Equifax, Sentinel Perú)

- ✅ Score con datos del mercado completo → decisiones más precisas.
- ✅ Reducción de riesgo crediticio real.
- ❌ Contratos, costos mensuales fijos, compliance → incompatible con la escala actual.
- ❌ Rompe la promesa "tu bodega, tus datos, tu decisión" → el dueño pierde soberanía.
- ❌ Dependencia externa que degrade toda la experiencia si el proveedor cae.
- ❌ La señora de 55 años en Pucallpa no confía en "un reporte de una empresa de Lima que no conozco".

### Opción E — Diferir la Ola 2 completa hasta después del roadmap 24 semanas

- ✅ Priorizar checkout, delivery, marketplace primero.
- ❌ Brandon explícitamente clasifica Fiado Digital como **diferenciador #1**. Diferirlo = perder la ventana competitiva.
- ❌ Los competidores (Yape, Bim, Plin) están experimentando con BNPL. Si no salimos pronto, el pozo se achica.

## Decisión

**Elegimos la Opción B — 3 fases secuenciales con feature flags.**

### Principios arquitectónicos guía

1. **Todo aditivo en schema.** Ningún cambio destructivo de columna/tipo/unique. Nuevas tablas (`CreditScoreHistory`, `CreditReminder`, `CreditGuarantor`, `ReniecVerification`) y campos nullable en `CreditProfile`. Esto permite rollback via drop table sin perder datos existentes.
2. **Tenant aislado siempre.** Toda query nueva lleva `tenantId` como primer filtro, siguiendo regla crítica §3 del CLAUDE.md. Tests específicos de aislamiento multi-tenant en cada fase.
3. **Snapshots inmutables del score.** `CreditScoreHistory` es append-only. Nunca se modifica un registro histórico; si hay corrección se agrega una fila con `trigger="manual_recalc"`. Esto da auditoría legal futura y permite al cliente ver evolución real.
4. **Idempotencia blindada en recordatorios.** Clave única `fiadoId + stage + dueDate` en `CreditReminder.idempotencyKey`. El worker verifica existencia antes de enviar. Si el cron corre 2x → 1 WhatsApp. Tests unitarios específicos de doble ejecución.
5. **Fire-and-forget explícito para notificaciones.** `enqueueCreditReminder().catch(() => {})` en los endpoints que disparan recordatorios, nunca bloqueantes del hot path (ADR CLAUDE.md §7).
6. **Cron via Vercel Cron → ruta POST → BullMQ enqueue.** Tres capas: Vercel Cron garantiza disparo puntual; la ruta valida `CRON_SECRET`; BullMQ procesa en worker desacoplado. Esto aísla falla de envío de falla de agendamiento.
7. **Fallback graceful si RENIEC falla.** Degrade mode: `dniVerified=false` + scoring sin bonus + admin puede validar manualmente. El sistema nunca se bloquea por API externa caída.
8. **Feature flags por fase.** `FIADO_DIGITAL_V2_PHASE1|2|3` — off por default; rollout gradual 10%/50%/100% en Fase 3 (la más crítica).
9. **Cliente ve su propio score con breakdown y tips.** Transparencia radical: nunca un "te negaron crédito" sin explicación accionable. Genera confianza y gamificación.
10. **Next 16 cache components.** Ninguna ruta nueva usa `export const dynamic = "force-dynamic"` (ADR-019). Rutas sensibles (score propio) usan `await cookies()` → runtime marca automático como dinámicas. Rutas de admin agregadas usan `use cache` + `cacheTag("credit-profile", customerId)` + `updateTag()` post-write.
11. **Raw SQL solo con `$1 $2 $3`.** Cualquier optimización SQL directa (ej: query agregada del reporte semanal) usa parámetros posicionales (ADR-011).
12. **Safeparse Zod en todos los endpoints nuevos.** Nunca `.parse()`. Regla CLAUDE.md §2.

### Modelo de datos resultante

**Nuevas tablas:**

- `CreditScoreHistory` — append-only, un snapshot por cada cambio de score.
- `CreditReminder` — log de WhatsApps enviados con idempotencia.
- `CreditGuarantor` — N:M avalador↔avalado con monto cedido.
- `ReniecVerification` — cache de 90 días de validaciones DNI.

**Campos aditivos en `CreditProfile`:**

- `dniVerified: Boolean` (default false)
- `reniecVerifiedAt: DateTime?`
- `allowFamilyCredit: Boolean` (default true)
- `autoReminders: Boolean` (default true)

**Nuevas relaciones inversas:**

- `CreditProfile.scoreHistory`
- `CreditProfile.guarantorsGiven` + `guarantorsReceived`

### Nuevas superficies de sistema

| Superficie | Cantidad nueva | Fase |
|---|---|---|
| Modelos Prisma | 4 | 1, 2, 3 |
| API routes | 14 | 1 (4), 2 (5), 3 (5) |
| Cron jobs | 4 | 2 |
| Colas BullMQ | 1 (`CREDIT_REMINDERS`) | 2 |
| Workers BullMQ | 1 (`credit-reminders.worker.ts`) | 2 |
| Templates WhatsApp | 10 | 2 |
| Componentes React nuevos | 9 | 1 (6), 2 (2), 3 (1) |
| Componentes React modificados | 6 | 1–3 |
| Páginas nuevas | 4 | 1, 2, 3 |
| Feature flags | 3 | 1, 2, 3 |

### Orden de ejecución

1. **Bloqueante previo**: TD-030 `LoyaltyTransaction` debe estar ✅ en prod (ADR-020, opción B paso 3).
2. **Fase 1 — Foundation (Semana 1–2 Ola 2)**: RENIEC + snapshot histórico + UI transparencia. Feature flag `PHASE1`.
3. **Fase 2 — Automatización (Semana 3–4)**: cron + reminders + reporte semanal. Feature flag `PHASE2`. Rollout en staging con 10 fiados de prueba antes de prod.
4. **Fase 3 — Fiado familiar + checkout (Semana 5–6)**: `CreditGuarantor` + `FiadoCheckoutOption`. Feature flag `PHASE3`. Rollout gradual 10%/50%/100%. **Zona de peligro**: skill `checkout-flow` obligatorio antes de tocar `CheckoutModal.tsx`.

Detalle completo en `docs/fiado-digital-ola2-plan.md` secciones 8–9.

### Criterios de rollback por fase

| Fase | Trigger de rollback | Acción | Tiempo estimado |
|---|---|---|---|
| **Fase 1** | UI rota, score incorrecto masivo, RENIEC API leak | Apagar `FIADO_DIGITAL_V2_PHASE1` en feature flags → revert commit → opcional `DROP TABLE CreditScoreHistory, ReniecVerification` | 15 min |
| **Fase 2** | Spam WhatsApp, recordatorios duplicados, cron no corre | Pausar cron en `vercel.json` → drain cola `CREDIT_REMINDERS` → apagar flag `PHASE2` | 10 min |
| **Fase 3** | Checkout roto, aval abusado, score explota en load | Apagar flag `PHASE3` → `CheckoutModal` vuelve a versión previa via feature flag → investigar con checkout-specialist | 5 min flag + 30 min investigación |

### Monitoreo y observabilidad

- **Dashboard Fiado Digital** en Grafana/Metabase con los 5 KPIs del plan (adopción, calidad, negocio, sistema).
- **Alertas Sentry**:
  - Cola `credit-reminders` con > 100 jobs sin procesar.
  - Tasa de error > 1% en cualquier endpoint `/api/credit/**`.
  - Cron no ejecutado en las últimas 25 horas.
  - RENIEC verificaciones fallidas > 5% en 1 hora.
- **Healthchecks** en `/api/cron/credit-reminders` que reporta última ejecución.
- **Auditoría legal**: `ReniecVerification.rawResponse` y `CreditScoreHistory` inmutables.

## Consecuencias

### Positivas

- ✅ El fiado se convierte en una **experiencia software-first auditada** que el dueño puede confiar sin mirarla todos los días.
- ✅ **Transparencia radical** para el cliente construye confianza y diferencia radicalmente contra cualquier app de tarjeta o BNPL tradicional.
- ✅ **Automatización elimina el dolor manual** del dueño (llamar a cada deudor). Reducción estimada 60% de llamadas de cobranza.
- ✅ **Fiado familiar** amplía base de clientes sin incrementar riesgo (el avalador garantiza con su propio score).
- ✅ **Integración checkout** convierte el diferenciador en feature visible en el embudo de conversión del marketplace.
- ✅ **Score histórico** habilita futura gamificación y programas de fidelidad (sumarse a loyalty en Ola 3).
- ✅ **Arquitectura aditiva** minimiza blast radius — nada existente se rompe.
- ✅ **Reusa infraestructura existente** (BullMQ, WhatsApp templates, scoring engine) → costo marginal bajo.
- ✅ **Cada fase deployable independiente** → Brandon puede decidir parar en Fase 1 o 2 si Fase 3 no se justifica.

### Negativas

- ⚠️ **Costo RENIEC** por verificación (≈ S/0.05–0.20 por hit según proveedor). Cache 90 días mitiga, pero hay línea base.
- ⚠️ **Dependencia de cron** — si Vercel Cron cambia o falla, el valor principal (recordatorios, reporte) se rompe silencioso. Mitigación: healthchecks y alertas.
- ⚠️ **Sobreingeniería del sistema de score** si la bodega tiene < 50 clientes con crédito. Mitigación: fase 1 solo, evaluar adopción antes de Fase 2.
- ⚠️ **Riesgo de spam WhatsApp** si idempotencia falla — costo económico + reputacional. Mitigación: tests exhaustivos, dry-run, flag off por default.
- ⚠️ **Complejidad schema +20%** en modelos de crédito. Mitigación: ADR documenta cada modelo, docs/CLAUDE-EXTENDED.md actualizado.
- ⚠️ **Carga operacional de 4 crons nuevos** en Vercel Cron — verificar plan permite (algunos tiers limitan a 2 crons/proyecto).
- ⚠️ **Frontend ~9 componentes nuevos + 6 modificados** implica coverage de tests no trivial. Mitigación: Playwright e2e por fase.
- ⚠️ **Zona de peligro en Fase 3** — `CheckoutModal` es crítico. Mitigación: skill `checkout-flow` obligatorio + checkout-specialist review.
- ⚠️ **Bloqueado por TD-030** — no podemos arrancar Fase 1 hasta que ADR-020 ejecute LoyaltyTransaction. Mitigación: priorizar TD-030 en el sprint inmediato.

### Neutras

- 🔸 Los tests existentes de `lib/credit/**` no se rompen — todos los cambios son aditivos. Nuevos tests se agregan por fase.
- 🔸 La documentación `CLAUDE.md` debe actualizarse añadiendo `components/credit/` y `/marketplace/mi-credito` si se decide agregarlos a zona de peligro (probablemente no necesario).
- 🔸 El engine de scoring (`scoring-engine.ts`) se mantiene estable; solo se agrega función auxiliar `snapshotCreditScore()`.
- 🔸 BullMQ agrega una cola más pero no cambia el patrón existente. Dashboard BullMQ sigue siendo el mismo.

## Próximos pasos (post-aprobación del ADR)

1. **migration-planner** produce el SQL detallado de Fase 1 con `CREATE INDEX CONCURRENTLY` y rollback.
2. **database-engineer** ejecuta la migración Fase 1 vía pooler session mode (siguiendo patrón ADR-020).
3. **backend-platform-engineer** implementa endpoints Fase 1 (1.4–1.9 del plan).
4. **frontend-engineer** en paralelo desarrolla componentes Fase 1 (1.10–1.13).
5. **qa-reliability-engineer** escribe e2e Playwright (1.14).
6. **devops-release-engineer** configura feature flag `FIADO_DIGITAL_V2_PHASE1`.
7. **solution-architect** actualiza este ADR con la sección "Ejecución real Fase 1" una vez mergeado.
8. **Repetir secuencia para Fase 2 y Fase 3.**

## Referencias

- `docs/fiado-digital-ola2-plan.md` — plan completo de implementación (user stories, APIs, crons, templates, KPIs, riesgos)
- **ADR-005** — Feature flags
- **ADR-011** — Raw SQL parámetros posicionales
- **ADR-014** — Middleware modular
- **ADR-015** — Checkout footer slot (zona de peligro Fase 3)
- **ADR-016** — Plan maestro 24 semanas
- **ADR-018** — TD-018 Float→Decimal (ya aplicado, requisito previo)
- **ADR-019** — Next 16 cache components (ninguna ruta nueva usa force-dynamic)
- **ADR-020** — Migraciones Ola 1 (TD-030 LoyaltyTransaction bloqueante dura)
- `lib/credit/scoring-engine.ts` — engine actual (reusado)
- `lib/credit/installment-manager.ts` — manager de cuotas (reusado)
- `lib/queue/queues.ts` — infra BullMQ (reusada)
- `lib/whatsapp/message-templates.ts` — templates comerciales (extendidos)
- `prisma/schema.prisma` — modelos `Fiado`, `CreditProfile`, `CreditInstallment` (base)
- `docs/migration-plan-ola1-2026-04-09.md` — dependencia TD-030

---

**Autor:** solution-architect (subagente)
**Revisores esperados:** Brandon (aprobación final), database-engineer (schema sign-off), backend-platform-engineer (feasibility), checkout-specialist (Fase 3 sign-off antes de tocar `CheckoutModal`).
**Última actualización:** 2026-04-09.
