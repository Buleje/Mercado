# Runbook — Pasar la rama de trabajo a producción

> Medido el 2026-09-26 sobre `audit/storefront-mejoras-verificadas-2026-06-15` @ `9bb4cc551`.
> **No aplicado.** Todo lo que toca producción (variables de entorno, merge, promover) lo decide el dueño.
> Rige la regla 14 de `CLAUDE.md` §4 (SLO sano + canary 5 %→25 %→100 % + DR drill < 35 días); el §5 dice qué parte se cumple y qué no.

## 0. Dónde estamos

| Dato | Medido | Fuente |
|---|---|---|
| Producción | `dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2`, subido por CLI el **2026-07-16 22:35 (Lima)**, commit `7774f5ca` de la rama `prod`. `/api/health` → 200, base `ok` en 12 ms | Vercel `get_deployment` sobre el alias de producción; `git log origin/prod` |
| Lo que NO es | No es un build de `master` del 09-05: `master` no recibe commits desde el **2026-05-09** (`b4ad806df`) y su último deploy a producción por git fue ese día (`dd1af4bb`) | `list_deployments target=production` |
| Distancia | **+1 062 commits** sobre `origin/prod`, +2 862 sobre `master`. Los dos son ancestros de la rama → avance directo, sin conflictos | `git rev-list --count`, `git merge-base --is-ancestor` |
| Previews | **15 de 15** últimos en `ERROR` (esta rama, `nube/*`, `cleanup/*`) | `list_deployments` |
| Dominio | `buleje.pe` y `www.buleje.pe` dan **NXDOMAIN** en el registro `.pe`. La web que funciona es `mercado-brandon-luis-projects-9cf56555.vercel.app` | Cloudflare DNS-over-HTTPS, 26-09 |
| Canary nativo | Rolling Releases **no disponible** (la API responde 404 a la config y al estado de facturación). El plan sólo admite crons diarios | `get_rolling_release_config`, `docs/runbooks/reportes-hora-exacta.md` |

## 1. Por qué fallan los previews

Build `bld_4daijzzbe` del deploy `dpl_C5UhZSjPwjR4By57u8ufzF7W9LWi` (commit `9bb4cc551`). `tsc` pasa y compila en 3,5 min; cae al generar las páginas estáticas (0/1943):

```
Error occurred prerendering page "/marketplace/__validate__".
Error [DriverAdapterError]: (ENOTFOUND) tenant/user app_user.sofkgguriggocouiuamx not found
Export encountered an error on /(store)/marketplace/[slug]/page: /marketplace/__validate__, exiting the build.
Error: Command "npx prisma generate && npm run build" exited with 1
```

**Causa, reproducida** con 4 conexiones `SELECT current_user` desde local:

| Usuario | Host del pooler | Resultado |
|---|---|---|
| `app_user` | `aws-0-us-east-2` | **FALLA** con el mismo mensaje, byte a byte |
| `app_user` | `aws-1-us-east-2` | conecta |
| `postgres` | `aws-0-us-east-2` | falla: `tenant/user postgres… not found` |
| `postgres` | `aws-1-us-east-2` (el de `.env.local`) | conecta |

El `DATABASE_URL` de **Preview** es el string del ADR-114 (`docs/security/rls-credentials-2026-05-18.md`: `app_user` @ `aws-0-us-east-2`). El pooler del proyecto vive en `aws-1`, así que Supavisor no encuentra el tenant. Y aunque se corrija el host, `app_user` no debe usarse: no tiene `BYPASSRLS`, hay **8 tablas con RLS y 13 políticas**, y el ADR-114 dice no cambiarlo en Vercel hasta TD-116.

**Por qué no se arregla con código**: el build necesita la base. 14 rutas tienen `generateStaticParams`, la de producto prerenderiza hasta 100 productos reales y los `generateMetadata` con `"use cache"` consultan la base. Con una base que responde, el mismo centinela `__validate__` pasó el build completo local del 09-05 (`90f0f7743`: «static pages ✓»).

## 2. Arreglo de código que queda en el árbol

| Archivo | Qué | Evidencia |
|---|---|---|
| `lib/documents/miniatura-doc.ts:60-67` | `path.join(/* turbopackIgnore: true */ process.cwd(), …)` | El mismo build avisa: `matches 16671 files in [project]/` y `Encountered unexpected file in NFT list` para `/api/admin/documents/[id]/thumbnail`. Sin esto, cuando se arregle la base, esa función carga el proyecto entero (134 MB sólo en archivos versionados) y puede pasar el tope de 250 MB. Los `.ttf` siguen viajando por `outputFileTracingIncludes` |

Verificado: `npm run typecheck` 0 errores; `eslint` 0; en el dev server, las miniaturas de un `.xlsx` y un `.docx` del tenant `main` responden 200 `image/webp` 420×420 con texto legible. **No verificado**: que el aviso desaparezca en un build (no se corrió `next build` completo local por RAM).

## 3. Lo que no es código

| # | Qué | Dónde | Valor exacto |
|---|---|---|---|
| 1 | `DATABASE_URL` de **Preview** | Vercel → Settings → Environment Variables | `postgresql://postgres.sofkgguriggocouiuamx:<PASSWORD>@aws-1-us-east-2.pooler.supabase.com:6543/postgres` (igual que `.env.local`) |
| 2 | `DATABASE_URL` de **Production**: revisar | ídem | El deploy vivo conecta, pero el valor actual no se pudo leer (la API responde 403). Si alguien lo cambió después del 16-07 al string del ADR-114, el build de producción falla igual (falla segura: queda el deploy viejo). Tiene que ser usuario `postgres.<ref>`, host `aws-1` |
| 3 | `DIRECT_URL` y `AUTH_SECRET` en Preview **y** Production | ídem | `validateEnv()` corta el arranque si faltan (en los previews también, porque `NODE_ENV=production`). `DIRECT_URL` sugerido: pooler en modo sesión `…@aws-1-us-east-2.pooler.supabase.com:5432/postgres` |
| 4 | Upstash en Preview | ídem | El build de preview avisa `UPSTASH_REDIS_REST_URL/TOKEN missing`. En producción, sin ellos y sin `ALLOW_IN_MEMORY_RATELIMIT=true`, se registra CRITICAL (no corta el arranque) |
| 5 | Dominio `buleje.pe` | registro `.pe` | NXDOMAIN: registrarlo, o quitarlo del proyecto. 151 archivos lo tienen escrito (canonical, correos); Resend no verifica y los checks de `deploy-rollback.md` apuntan ahí |
| 6 | Canales de aviso | Meta / Resend | WhatsApp `401 Cannot parse access token`; correo «buleje.pe not verified» (medido el 26-09 en `reportes-hora-exacta.md`). Los crons nuevos fallarán al enviar, no mandarán spam |

**Variables que pide `lib/env.ts` en producción** (sólo nombres): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (las tres cortan el arranque), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`, `WHATSAPP_APP_SECRET`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (o `ALLOW_IN_MEMORY_RATELIMIT=true`). **No debe existir**: `ALLOW_ADMIN_BYPASS_LOGIN=true`.

**Nuevas desde producción** (todas opcionales, con valor por defecto): `CACAO_DIGEST_EMAIL`, `DOC_ANALISIS_CONCURRENCIA`, `DOC_VISION_API_KEY`, `DOC_VISION_BASE_URL`, `DOC_VISION_MODEL`, `DOC_VISION_TIMEOUT_MS`, `N8N_ALLOW_LOCAL` (sólo desarrollo).

**Comparar con lo cargado en Vercel**: no se pudo medir (403 en la API de variables; el CLI local no está logueado en la cuenta `buleje`). Comando para hacerlo: `vercel env ls production` y `vercel env ls preview` con esa cuenta.

## 4. Crons que se activan

Producción tiene 78; la rama, 91 (13 nuevos). Todos diarios. Lima = UTC − 5.

| Cron | UTC | Lima | Qué hace |
|---|---|---|---|
| `tramites-vencimiento` | 08:50 | **03:50** | WhatsApp |
| `tramites-sin-respuesta` | 09:05 | **04:05** | WhatsApp |
| `contratos-vencimiento` | 09:10 | **04:10** | WhatsApp |
| `documentos-papelera` | 09:20 | 04:20 | sólo base |
| `documentos-indexar` | 03:40 | 22:40 (día antes) | sólo base |
| `ia-salud` | 11:00 | 06:00 | Telegram |
| `cacao-precio-diario` | 12:00 | 07:00 | correo |
| `reportes-diarios/0700` | 12:00 | 07:00 | reportes forestales (ADR-439) |
| `asistente-avisos` | 12:20 | 07:20 | Telegram |
| `forestal-plazos` | 12:20 | 07:20 | WhatsApp + correo |
| `reportes-diarios/1300` | 18:00 | 13:00 | reportes forestales |
| `reportes-diarios/1800` | 23:00 | 18:00 | reportes forestales |
| `reportes-diarios/2100` | 02:00 | 21:00 (día antes) | reportes forestales |

**Cambia de comportamiento**: `auto-close-register` (23:00 UTC = 18:00 Lima) antes miraba sólo `main`; ahora recorre todos los tenants. Cajas abiertas hoy: **Blas desde el 11-06 (108 días)**, QA desde el 04-09 y `demo` desde el 06-09. La primera noche las cierra tomando lo esperado como contado.

### Build sin tsc en Vercel (09-10)

`vercel.json` → `buildCommand` corre `npm run build:notypecheck` (solo `next build`). El `npm run build` completo arranca con `scripts/tsc7.mjs -p tsconfig.build.json`, que ocupó 9,28 GB en 30 s medido local, y la máquina de build de Vercel tiene 8 GB: los previews morían con `exited with 137`. El chequeo de tipos no se pierde: lo corre el pre-commit en cada commit, y `next.config.ts` ya tenía `ignoreBuildErrors: true`.

### En pausa desde el 09-10 (decisión de Brandon: «proteger a Blas»)

Dos crons salieron de `vercel.json` → `crons`. El código de sus rutas sigue igual, solo dejan de correr solos. Para volver a prenderlos, se repone su entrada:

| Cron | Entrada para reponer | Por qué está en pausa (medido el 09-10) |
|---|---|---|
| `documentos-papelera` | `{ "path": "/api/cron/documentos-papelera", "schedule": "20 9 * * *" }` | En su primera corrida borraba para siempre (base + storage) 310 documentos de Blas y 33 de `main` que llevan más de 30 días en la papelera |
| `auto-close-register` | `{ "path": "/api/cron/auto-close-register", "schedule": "0 23 * * *" }` | Cerraba sin conteo la caja real de Blas, abierta desde el 11-06. Deja de cerrar también la de `main`, que en julio sí cerraba sola |

Antes de reponerlos: que Blas revise su papelera (restaurar lo que sirva) y que se cuente y cierre a mano la caja del 11-06.

## 5. Riesgos

| Riesgo | Medido | Mitigación |
|---|---|---|
| Canary 5→25→100 % de la regla 14 | Rolling Releases no disponible | Sustituto: build de producción **sin dominio** → probar su URL → promover (paso 4) |
| DR drill < 35 días | Último registro: `dr-drill-runbook-2026-05-19.md` (**130 días**). El backup off-site de GitHub Actions lleva **0 éxitos en 167 corridas** desde el 13-04 (`setup-node` sin ruta de caché + endpoint «apigateway Not found») | Decidir: arreglar el backup y ensayar una restauración antes, o aceptar el riesgo por escrito |
| Caja real cerrada sin conteo | 108 días abierta | Contarla y cerrarla desde «Cuadrar caja» antes del pase |
| Rutas | 202 páginas/rutas nuevas, 319 cambiadas, 1 borrada (`app/api/contratos/export`, 0 llamadas en el código) | — |
| Sesiones | Mismo `AUTH_SECRET` → los JWT siguen valiendo; se agrega `lib/auth/session-refresh.ts` | Probar login y un refresh en el deploy sin dominio |
| Service worker | `public/sw.js` igual en `prod` y en la rama (`buleje-v15`, último cambio 2026-05-20) | Nada nuevo |
| Capacitor | `capacitor.config.ts` sin cambios; en producción usa los archivos empaquetados (sin `server.url`): la app instalada no cambia con el deploy, sólo las API que llama | — |
| Migraciones | Base compartida y aditiva. 80 carpetas, 73 filas en `_prisma_migrations`: 10 aplicadas a mano sin fila (06-18 a 09-22). El build no corre `migrate` | **Nunca** `prisma migrate deploy` sin antes `prisma migrate resolve --applied` de esas 10 |
| El preview escribe en la base real | Preview y producción usan la misma Supabase | Probar sólo en tenants QA; en los previews no corren crons |

## 6. Orden recomendado

1. **Brandon** — decidir DR/backup (§5), contar y cerrar la caja de Blas del 11-06, y decidir qué crons de madrugada se prenden o se mueven a las 13:00 UTC (08:00 Lima).
2. **Brandon** — corregir `DATABASE_URL` de Preview (§3.1), revisar el de Production (§3.2) y confirmar `DIRECT_URL`/`AUTH_SECRET` en los dos.
3. **Commit + push** del arreglo de §2 → Vercel arma solo el preview de la rama. Sin commit: «Redeploy» del `dpl_C5UhZSjPwjR4By57u8ufzF7W9LWi` desde el panel (sin el arreglo de §2).
4. **Probar el preview** (URL `mercado-git-audit-storefr-380c8c-…vercel.app`): estado `Ready`; `/api/health` 200; login en el panel QA; abrir una tienda del marketplace; `GET /api/cron/reportes-diarios/0700` sin token → 401 (existe); consola sin errores.
5. **Pase sin tráfico**: Vercel → Settings → Environments → Production → apagar «Auto-assign Custom Production Domains». Merge por PR a `master` (avance directo; el último deploy a producción por git salió de `master`, así que es la rama de producción). Vercel arma un build **de producción, con las variables de producción**, sin tomar el dominio. Repetir el paso 4 sobre su URL propia.
6. **Promover** ese deploy (panel → «Promote», o `vercel promote <url>`). Volver a prender el auto-assign. Avanzar también `prod` al mismo commit para que git refleje lo que está online.
7. **Mirar** los primeros 30 min (logs de error), la primera noche (cierre de cajas, 18:00 Lima) y la primera mañana (envíos).

## 7. Volver atrás en 1 minuto

| Vía | Cómo |
|---|---|
| Panel | Deployments → `dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2` (16-07, `isRollbackCandidate: true`) → **Instant Rollback** |
| CLI | `vercel rollback dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2` (con la cuenta `buleje`) |
| MCP | `request_rollback` con `projectId=prj_J3LW8EWUie3GLvqSdYGVBvcqu7V5`, `deploymentId=dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2` |

Después del rollback: `curl -s https://mercado-brandon-luis-projects-9cf56555.vercel.app/api/health` (no `buleje.pe`, que no resuelve) y `vercel crons ls` para ver qué crons quedaron vivos. La base **no** vuelve atrás: las migraciones son aditivas y el código viejo las tolera. Mientras el rollback esté activo, Vercel no asigna el dominio a los deploys nuevos hasta volver a promover.
