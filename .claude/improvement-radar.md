# Improvement Radar — Buleje

Bandeja de propuestas de mejora detectadas por Claude entre sesiones.
Cada entrada: **status** [pending|approved|applied|blocked|rejected].

Al arrancar sesión, `session-start-context.mjs` muestra las `pending` en el contexto.

---

## Aplicadas en sesión 2026-04-28

### [applied] 2026-04-28 — OOM cap tsc bajado a 4096 MB
- post-tool-tsc.mjs: `--max-old-space-size=12288 → 4096`. Causaba OOM en WSL (tope 10 GB).

### [applied] 2026-04-28 — stop-alert-sound.mjs neutralizado
- Antes lanzaba explorer.exe (YouTube) + powershell.exe (beeps). Robaba foco al terminal.

### [applied] 2026-04-28 — MCPs no usados desactivados
- `~/.claude.json`: Twilio + Resend movidos a `mcpServers_disabled`. Backup en `~/.claude.json.backup-*`.
- Para reactivar: `python3 -c "import json; d=json.load(open('/home/usuario/.claude.json')); d['mcpServers']['twilio']=d['mcpServers_disabled'].pop('twilio'); json.dump(d, open('/home/usuario/.claude.json','w'), indent=2)"`

### [applied] 2026-04-28 — N+1 en StoreReviewsDB.listByStoreId
- `lib/db/store-reviews.db.ts`: paralelizado top-N reviews + groupBy de ratings (antes era 2 queries seriales con findMany completo). Latencia esperada: ~50% menos. Memoria: ~10× menos en stores con muchas reseñas.

### [applied] 2026-04-28 — DB pool warmup en boot
- `instrumentation.ts`: SELECT 1 fire-and-forget en startup. Elimina cold start de pgBouncer (~720ms en primera request) → primera request real ya tibia.

### [applied] 2026-04-28 — post-edit-ui-screenshot debounce 5s
- Agregado mismo patrón que post-tool-tsc. Evita 5 chromiums paralelos en bursts de edits UI.

### [applied] 2026-04-28 — Sonnet/Haiku routing para subagentes
- Memoria `feedback_model_routing.md` con tabla por tipo de tarea. Usar `model: "sonnet"` en subagentes mecánicos.

### [applied] 2026-04-28 — React Compiler (annotation mode)
- `babel-plugin-react-compiler@1.0.0` instalado.
- `next.config.ts`: `experimental.reactCompiler = { compilationMode: "annotation" }`.
- **Cero impacto** sobre componentes que NO usen `"use memo"`. Para activar en un componente: agregar `"use memo"` arriba.
- Dev server health-check post: ok, 118 ms.

## Bloqueadas

### [blocked] 2026-04-28 — Schema drift ProductAnalytics
- **Razón:** `prisma migrate status` reporta `P1013: invalid port number in database URL`. DIRECT_URL en `.env.local` tiene problema de formato/red.
- **Acción manual:** corregir DIRECT_URL (ver Supabase dashboard → Settings → Database → Connection string → Direct) y luego correr:
  ```
  set -a && . .env.local && set +a && npx prisma migrate deploy
  ```

---

## Pendientes (próximas sesiones)

### [pending] 2026-04-28 — Telegram bot setup (necesita input Brandon)
- **Acción manual:** ver `/setup-autonomy` Bloque 3.
- **Beneficio:** notificación push real al móvil cuando termina trabajo largo.

### [pending] 2026-04-28 — Playwright deps (necesita 1 sudo)
- **Acción manual:** ver `/setup-autonomy` Bloque 1.
- **Beneficio:** tests E2E sin depender del Chrome de Windows.

### [pending] 2026-04-28 — Tesseract OCR (necesita 1 sudo)
- **Acción manual:** ver `/setup-autonomy` Bloque 2.
- **Beneficio:** extraer texto exacto de cualquier screenshot.

---

## Tecnologías nuevas a evaluar

- **Next.js 16 PPR** ✅ ya activo (`cacheComponents: true`)
- **React Compiler** ✅ activo en annotation mode (opt-in)
- **Bun runtime**: 3-4x más rápido que Node. Riesgo: incompat con algunos MCPs.
- **Vercel AI SDK 6**: prompt caching automático. Si se usa chat con IA, -70% costo.
