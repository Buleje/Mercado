# SESSION HANDOFF — 2026-06-18

> Sesión muy larga (**18 commits**). Branch: `audit/storefront-mejoras-verificadas-2026-06-15`. **NO pusheado.** Árbol limpio.
> Verificación por feature: `tsc -p tsconfig.build.json --noEmit` EXIT=0 · `npm run lint` 0 errores · vitest · screenshots/curl con data real. Estilo: trust-but-verify (agents incluidos).

## Lo construido (18 commits: `8a2c018d` → `9f5581a7`)

**Superadmin — potenciar módulos.** Patrón confirmado en ~10 auditorías: el panel está ~80-90% construido; los gaps reales eran *data computada-pero-no-mostrada* o *umbral hardcodeado→configurable*.
1. Salud 360 del tenant (tab que cablea el endpoint churn muerto) · 2. MRR movement + cobranza/dunning (billing) · 3. auto-aprobación Yape limpios (**OFF por default**, env-gated) · 4. score de triage de solicitudes vendor · 5. plantillas+variables en broadcast chat · 6. motor de alertas con umbrales env + escalación · 7. dry-run preview de automatizaciones · cohortes de conversión (analytics) · cooldown+dry-run en el cron de automatizaciones · recomendación de upgrade + upside MRR (uso vs límites).

**Storefront / PDP.** ahorro+Yape+entrega honesta (reemplazó "~25 min" fake)+UGC en galería · catálogo navegable + opiniones más abiertas + combo con ancla "Este producto" · dropdown de login por rol bajo "Ingresar" · barra lateral de nav en PDP (categorías de la tienda que filtran el catálogo) + rail global de páginas habilitado en PDP **y** tienda (`MarketplaceSideRailShell.shouldShowRail`).

**Visionario (flagship).** **Inteligencia de Barrio** = red de detección de demanda (`/superadmin/intelligence`). Motor puro `lib/intelligence/demand-signals.ts` (26 tests) + API sobre data REAL (OrderItem→category 30d-vs-30d, StockoutPrediction, Store.zone) + dashboard. Construido con **3 agents en paralelo** (API/UI/tests), integrado y verificado por mí (copiados de worktree a main; worktrees branchean de base vieja).

## Pendientes / notas
- `StockoutPrediction` vacío en dev → `unmetDemand`/`stockoutHotspots` salen vacíos (empty state honesto). Con datos se encienden solos.
- Próximo paso de la visión: **#2 Fiado inteligente** (mismo patrón: motor puro + scoring sobre `lib/credit/scoring-engine` + fiados).
- **LOC proyecto:** ~1.07M código fuente (TS 365K · TSX 606K · JS 66K · mjs 25K · Prisma 5.5K), sin `node_modules`/`.next`/`.claude`/generados.
- Worktrees de agents limpiados (`git worktree prune`).
- ⚠️ Yape auto-approve está OFF: activar con `YAPE_AUTO_APPROVE=1` (+ `YAPE_AUTO_APPROVE_MAX_DELTA_PCT`, etc.) — decisión de riesgo, dinero real.

---

# SESSION HANDOFF — 2026-06-17

> Sesión larga (8 commits). Branch: `audit/storefront-mejoras-verificadas-2026-06-15`.
> Todo verificado: `tsc --noEmit` EXIT_CODE=0 fresco · rubric DS PASS · curl/screenshots donde aplicó. NO se pusheó.

## Commits de la sesión
| Hash | Qué |
|---|---|
| `6d69bb3e` | Poda harness (68→49 skills, CLAUDE.md 276→216, settings limpio) |
| `1879f1dc` | Naranja→marca en TODO el proyecto (coral/teal vía @theme) + consistencia superadmin |
| `c0096fd1` | Sprint 1 fiados/whatsapp (aging, cobranza auto, límite real, resumen+fiados, plantillas) |
| `94ee5840` | #8 Broadcast de campañas por WhatsApp (cron dispatch) |
| `0a4daefb` | #9 Estado de cuenta público (link firmado HMAC, sin migración) |
| `301a1469` | #6 Foto del arqueo server-side (upload + URL en notes) |
| `3abc73aa` | #10 Foto DNI + firma del compromiso (upload + URL, sin migración) |
| `6542bc69` | Tokens DS --color-whatsapp + canvas firma (rubric no-hex PASS) |

## ⚠️ CHECKLIST DE ACTIVACIÓN — lo construido está DORMIDO sin esto
Mucho de lo nuevo es lógica completa pero **gated por env/config**. Para activarlo:

| Feature construida | Qué la activa | Sin esto |
|---|---|---|
| **Cobranza fiados auto-WhatsApp** (`c0096fd1`) | `FIADO_AUTO_WHATSAPP=1` | Solo crea notif para revisar (no auto-envía) |
| **Envío WhatsApp saliente** (cobranza, broadcast, resumen diario) | `WHATSAPP_API_URL` + `WHATSAPP_API_TOKEN` | Los workers loguean y salen sin enviar (no-op) |
| **Bot inteligente + insights IA + sugeridas** | `ANTHROPIC_API_KEY` **o** `GROQ_API_KEY` | Degrada a fallback keyword (funciona pero "tonto") |
| **Bot entrante WhatsApp** (toma pedidos) | `WHATSAPP_APP_SECRET` + filas en `TenantWhatsAppConfig` (DB) | Mensaje entrante se descarta |
| **Estado de cuenta público** (`0a4daefb`) | `AUTH_SECRET` (ya seteado) · opcional `FIADO_STATEMENT_SECRET` | — (ya funciona) |
| **Broadcast** (`94ee5840`) | cron corre `:15` cada hora + `WHATSAPP_API_*` | Campañas quedan en "programada" sin despachar |

> El bot que "toma pedidos" NO es build — es activación (envs + `TenantWhatsAppConfig`). El código está y testeado en `lib/whatsapp/concierge/*`.

## Pendiente — roadmap de potenciación POS/Fiados/WhatsApp (plan en `docs/PLAN-potenciar-pos-fiados-whatsapp-2026-06-17.md`)
| Ítem | Estado | Por qué falta |
|---|---|---|
| #7 **Yape QR real** | ⛔ bloqueado externo | Necesita cuenta **Yape Empresas** + spec de su QR dinámico/API. El QR actual (`YapeQRPayment.tsx`) es decorativo (patrón dibujado, no escaneable) + confirmación manual. Money-zone: gate DANGER al construir. |
| **UI config bot WhatsApp** | listo para build | La API existe (`app/api/admin/whatsapp-config` GET/PUT, token enmascarado); falta el form admin. Self-serve para `TenantWhatsAppConfig` → activa el bot por tenant. ~150 LOC + montar tab. |
| **POS auto-envío ticket WA** | requiere endpoint nuevo | Hoy `wa.me` manual (`POSView.tsx:492`). No existe `/api/whatsapp/send`; auto-enviar = endpoint + opt-in (Ley 29733). |
| **Bug cierre de turno** | money-zone | `POSCajaModule.tsx:118-128` POST best-effort traga errores; el resumen re-bucketea pagos en cliente en vez del corte del backend. Sesión dedicada. |
| **iOS barcode** | quick-win | `BarcodeScanner.tsx` usa `BarcodeDetector` nativo (falla en Safari iOS) → polyfill `@zxing/browser`. |

## Gotchas confirmados esta sesión (para no re-investigar)
- **Eliminar un color del proyecto** = remapear paleta Tailwind en `@theme` (globals.css), no codemod 300 archivos.
- **Tailwind arbitrary values con ESPACIOS no renderizan**: `bg-[rgba(0, 160, 160,...)]` se rompe → sin espacios. (Era el bug del highlight del sidebar superadmin.)
- **Formato superadmin YA existe** = `ADMIN_TOKENS` + `lib/superadmin-layout.ts`. No crear primitivos que compitan.
- **Persistir imágenes sin migración**: subir a `/api/upload` → guardar la URL (corta) en un campo de texto existente. El base64 directo lo rechaza el Zod `max(500)`.
- **Login superadmin local bloqueado**: `SUPERADMIN_PASSWORD` vacío en `.env` → no hay QA visual del superadmin sin setearlo + reiniciar dev.
