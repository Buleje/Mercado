# Plan: potenciar POS · Fiados · WhatsApp/IA (2026-06-17)

> Basado en auditoría con evidencia `archivo:línea` (3 agentes paralelos, trust-but-verify).
> **Hallazgo clave:** la mayoría de las "funciones nuevas" YA existen. Los gaps reales son pocos.
> Estado: EXISTE (no rebuildear) · PARCIAL (cablear, barato) · GAP (build real).

---

## Estado real auditado

### POS / Caja (`components/admin/unified/POSCajaModule.tsx`)
| Función | Estado | Evidencia | Acción |
|---|---|---|---|
| Offline + sync | ✅ EXISTE (robusto) | `components/admin/pos/usePOSOffline.ts:16-180` | nada |
| Escáner barras cámara | ✅ EXISTE | `components/admin/BarcodeScanner.tsx:34-97` | iOS Safari falla (sin `BarcodeDetector`) → polyfill zxing |
| **Yape QR dinámico** | ❌ GAP | `YapeQRPayment.tsx:32-103` QR dibujado/falso; `:143` Math.random; confirmación manual | **build: QR real con monto + confirmación** |
| Fiar en 1 tap | ✅ EXISTE (atómico) | `pos/POSView.tsx:1457-1520` | nada |
| Cierre arqueo + foto | 🟡 PARCIAL | conteo/diff `CashAuditTab.tsx:140-393` ✅; foto solo localStorage `CashRegisterTab.tsx:2112` | persistir foto server-side |
| Ticket por WhatsApp | 🟡 PARCIAL | `pos/POSView.tsx:492-540` `wa.me` manual | auto-envío vía API |
| (bug) cierre de turno | 🐛 | POST best-effort traga errores `POSCajaModule.tsx:118-128` | usar corte del backend |

### Fiados (`components/admin/FiadosModule.tsx`)
| Función | Estado | Evidencia | Acción |
|---|---|---|---|
| Cobranza auto WhatsApp | 🟡 PARCIAL | cron `app/api/cron/fiados-reminder/route.ts` (13:09 diario, `vercel.json:183`) arma mensaje pero crea NOTIFICACIÓN con `wa.me`, no auto-envía | cablear a `lib/whatsapp.ts` |
| Límite crédito + score | 🟡 PARCIAL | backend aplica `creditLimit` `fiados.db.ts:169-220` ✅; form hardcodea `limite=500` `FiadosModule.tsx:420`; `CreditProfile.creditScore` (schema:3345) NO cableado | mostrar límite real + cablear score |
| Estado de cuenta compartible | ❌ GAP | `FiadosModule.tsx:1395` solo `wa.me` de 1 saldo | build página pública con token |
| Abonos parciales + aging | ✅ EXISTE (sólido) | `fiados.db.ts:279-345`; `/api/analytics/fiado-analytics` 4 buckets | aging usa `createdAt` no `fechaVence` (fix 3 líneas) |
| Foto/firma al fiar | ❌ GAP (roto) | firma canvas nunca `toDataURL` `FiadoModals.tsx:473-554`; foto base64 → `descripcion` rechazada por Zod `max(500)` `route.ts:16`; sin campos `fotoUrl/firmaUrl` schema:2056 | campos schema + storage |

### WhatsApp + IA (bot real = `lib/whatsapp/concierge/*`, NO los componentes admin)
| Función | Estado | Evidencia | Acción |
|---|---|---|---|
| Bot toma pedidos 24/7 | 🟡 PARCIAL (gated) | lógica completa `lib/whatsapp/concierge/concierge-router.ts:35-110` + handlers; apagado sin `ANTHROPIC/GROQ` key → fallback keyword; requiere `WHATSAPP_APP_SECRET` + `TenantWhatsAppConfig` | **operacional: setear envs + config tenant** |
| Resumen diario al dueño | ✅ EXISTE (gated) | cron `app/api/cron/daily-summary/route.ts:157-283`; envío depende `WHATSAPP_API_URL/TOKEN` | sumar "te deben Y" (fiados) |
| Sugeridas IA + plantillas | ✅ EXISTE (en chat D2) | `app/api/admin/chat/threads/[id]/suggest/route.ts`; `WhatsAppTemplates.tsx` HUÉRFANO (0 imports) | montar templates + reusar suggest en inbox WA |
| Broadcast segmentado | ❌ GAP | `Campaign` model + segmentos + `estimateAudience` existen; NADA despacha; `/campaigns/notify` solo notif in-app | **build cron dispatch → WhatsApp** |

---

## Plan de ejecución (3 sprints, por ROI)

### Sprint 1 — "Cablear lo que ya existe" (barato, alto valor)
1. **Fiados cobranza auto-WA**: cron → envío real `lib/whatsapp.ts` (con opt-in `notifPromotions`). [FEATURE]
2. **Resumen diario + "te deben Y"**: sumar `por-cobrar.db.ts`/`FiadosDB` al payload. [HOTFIX]
3. **Fiados form: límite real**: `FiadosModule.tsx:420` usar `creditLimit` del API (ya lo devuelve). [HOTFIX]
4. **Montar `WhatsAppTemplates.tsx`** (huérfano) como sub-tab. [HOTFIX]
5. **Aging por `fechaVence`** no `createdAt`. [HOTFIX]
6. **Persistir foto de arqueo** server-side (Media/blob → URL). [FEATURE]

### Sprint 2 — "Gaps que venden" (build real)
7. **Yape QR real** con monto + confirmación (deeplink/EMVCo). ⚠️ zona dinero — gate full. [FEATURE/DANGER]
8. **Broadcast dispatch**: cron `campaigns-dispatch` (audiencia → `enqueueNotification whatsapp`). [FEATURE]
9. **Estado de cuenta fiados público** con token (patrón tracking existe). [FEATURE]
10. **Foto/firma al fiar**: campos `fotoUrl`/`firmaUrl` en `Fiado` + storage (migración). [FEATURE+schema]

### Sprint 3 — "Robustez + activación"
11. **iOS barcode polyfill** `@zxing/browser`. [HOTFIX]
12. **Auto-envío ticket WA** (`wa.me` → API) al cerrar venta. [FEATURE]
13. **UI config bot WhatsApp** por tenant (self-onboarding). [FEATURE]
14. **ENV / operacional** (decisión Brandon): `ANTHROPIC_API_KEY` o `GROQ_API_KEY` (bot inteligente + insights + sugeridas) · `WHATSAPP_API_URL`+`TOKEN` (envío saliente) · `WHATSAPP_APP_SECRET` (entrante). Sin esto, todo degrada a fallback "tonto" pero no rompe.

---

## Notas
- **El bot "toma pedidos" NO es build, es activación** (envs + `TenantWhatsAppConfig`). El código está y testeado.
- Núcleos sólidos (no tocar): POS offline, fiar atómico, abonos/aging Fiados, concierge state machine.
- "Vistosas pero rotas en persistencia": Yape QR, foto arqueo, foto/firma fiado → son los GAPs reales.
