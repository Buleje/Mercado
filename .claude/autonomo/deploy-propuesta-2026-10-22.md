# Pase a producción: propuesta (medida el 22-10-2026, NO aplicada)

> Fase de medición. Nada de esto está en el repo ni en Vercel. Todo lo que dice «Brandon» necesita su decisión, su cuenta o un pago.

## 0. Estado medido

| Dato | Medido | Cómo |
|---|---|---|
| Producción | `dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2`, subido por CLI el 16-07 22:35 Lima (READY, rollback candidate). Vercel no guarda el commit (`meta: {}`); lo más probable es `6b4bd49d2` (cabeza de `origin/prod`, 22:32 del mismo día) | MCP `get_deployment` · `git log origin/prod` |
| Distancia | HEAD `fe1b885bc` está **1 919 commits** por delante de `origin/prod` (ancestro → avance directo) y 3 719 por delante de `master`. **15 commits locales sin push** (origin de la rama está en `f8a105635`) | `git rev-list --count` |
| Dominio vivo | `mercado-hazel.vercel.app/api/health` → 200, base ok. `buleje.pe` → NXDOMAIN (respuesta del registro .pe) aunque figura como alias | curl · DNS-over-HTTPS |
| SLO | 0 errores de runtime en producción en 7 días | MCP `get_runtime_errors since=7d` |
| Previews | 8 de 8 últimos en ERROR. El último (`f8a1056`, 22-10): **SIGKILL por falta de memoria** a los 9,4 min, durante «Creating an optimized production build», en una máquina «2 cores, 8 GB» | `list_deployment_events` |
| Plan Vercel | **Hobby** (la máquina de build «2 cores, 8 GB» es la Basic, la única de Hobby). Sin Rolling Releases (sólo en Pro/Enterprise) | log del build + docs |
| Plan Supabase | **Free**: sin backups diarios accesibles (sólo desde Pro) y sin branching | MCP `get_organization` + docs de Supabase |
| CLI de Vercel | Logueado en **otra cuenta** (`currentTeam team_M1Gvmy…`): `whoami` → «Not authorized», `--scope brandon-luis-projects-9cf56555` → «scope does not exist». El MCP sí tiene acceso al equipo, pero no a las variables de entorno (403) | `vercel whoami`, MCP `filter_project_envs` |
| Repo | `Buleje/Mercado` es **PÚBLICO** | `gh repo view` |

## 1. `vercel.json` — diff propuesto (OCR del Archivo + papeles por WhatsApp)

Por qué: el OCR tiene un presupuesto de 60 s (`PRESUPUESTO_MS`) + 45 s por pasada; las rutas con `app/api/**` = 30 s lo cortan a la mitad. Las 4 entradas nuevas son las rutas que llegan a `analyzeDocumentContent` → `ocr-servidor`. Para las carpetas `[id]` se usa `*` en el patrón (en un glob, `[id]` es una clase de caracteres y no coincide con la carpeta literal). Producción ya acepta `maxDuration: 300` en Hobby (`origin/prod:vercel.json` tiene 8 entradas así).

```diff
     "app/api/admin/documents/expediente/route.ts": {
       "maxDuration": 300
     },
+    "app/api/admin/documents/*/analyze/route.ts": {
+      "maxDuration": 300
+    },
+    "app/api/whatsapp/webhook/route.ts": {
+      "maxDuration": 300
+    },
+    "app/api/admin/forestal/guias/documentos/route.ts": {
+      "maxDuration": 300
+    },
+    "app/api/admin/forestal/loth/medicion-carga/*/fotos/route.ts": {
+      "maxDuration": 300
+    },
     "app/api/admin/forestal/ctp/vincular-trozas/route.ts": {
```

Ya están: `expediente` (300, commit `b8f7267c9` de hoy), `indexar-pendientes` (300), `cron/documentos-indexar` (300).

## 2. `next.config.ts` — diff propuesto (archivos que el trazado no ve)

`ocr-servidor.ts` arma la ruta del worker (`node_modules/tesseract.js/src/worker-script/node/index.js`) y del idioma (`node_modules/@tesseract.js-data/spa/4.0.0_best_int`) con `process.cwd()`, y el worker carga el núcleo con `require` condicional. Sin esto, la función en Vercel no tiene esos archivos: el análisis sigue pero **sin OCR** (no se cae). Los PDF escaneados pasan por `pdf-a-imagen` → `asegurarFuentesPdf`, que también necesita los `.ttf`. Peso agregado ≈ 13 MB por función (3 núcleos lstm 8,4 MB + idioma 2,1 MB + dependencias 1,7 MB), lejos del tope de 250 MB.

```diff
+// OCR en el servidor (22-10): rutas que llegan a ocr-servidor.ts. El worker y el idioma se
+// cargan por ruta de disco (process.cwd()), así que el trazado de archivos no los ve solo.
+const ARCHIVOS_OCR = [
+  "./node_modules/tesseract.js/package.json",
+  "./node_modules/tesseract.js/src/**/*",
+  "./node_modules/tesseract.js-core/package.json",
+  "./node_modules/tesseract.js-core/tesseract-core-*lstm.js",
+  "./node_modules/tesseract.js-core/tesseract-core-*lstm.wasm",
+  "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/*",
+  "./node_modules/wasm-feature-detect/**/*",
+  "./node_modules/is-url/**/*",
+  "./node_modules/node-fetch/**/*",
+  "./node_modules/regenerator-runtime/**/*",
+  "./node_modules/bmp-js/**/*",
+  "./node_modules/next/dist/compiled/@vercel/og/*.ttf",
+];
+
   outputFileTracingIncludes: {
     "/api/admin/documents/[id]/thumbnail": [
       "./node_modules/next/dist/compiled/@vercel/og/*.ttf",
     ],
+    "/api/admin/documents": ARCHIVOS_OCR,
+    "/api/admin/documents/[id]/analyze": ARCHIVOS_OCR,
+    "/api/admin/documents/indexar-pendientes": ARCHIVOS_OCR,
+    "/api/cron/documentos-indexar": ARCHIVOS_OCR,
+    "/api/whatsapp/webhook": ARCHIVOS_OCR,
+    "/api/admin/forestal/guias/documentos": ARCHIVOS_OCR,
+    "/api/admin/forestal/loth/medicion-carga/[id]/fotos": ARCHIVOS_OCR,
   },
```

(`const ARCHIVOS_OCR` va arriba de `const nextConfig`.) `node-fetch/**` incluye su `node_modules` anidado (`whatwg-url`, `tr46`, `webidl-conversions`). `gunzip.js` usa el `zlib` de Node, no `zlibjs`.

**Cómo verificarlo en el deploy sin dominio**: en el tenant QA subir un PDF escaneado y mirar que el análisis traiga texto; en los logs de esa función, que no aparezca `ocr` con «sin idioma» o «worker».

## 3. Código (opcional; no es config, revisar antes)

- `app/api/admin/documents/route.ts:238` y `lib/forestal/documentos-guia-server.ts:180` lanzan el análisis fire-and-forget **sin `after()`**. En Vercel la función puede congelarse apenas sale la respuesta, así que el análisis al subir puede no terminar. No se pierde nada: el documento queda pendiente y lo levanta `cron/documentos-indexar` (22:40 Lima, hasta 25 por negocio). Arreglo: envolver en `after(() => enColaDeAnalisis(…))`, igual que `app/api/whatsapp/webhook/route.ts:261`.

## 4. Crons — 92 en la rama contra 78 en producción

+15 nuevos, −1 (`auto-close-register`, pausado). Medido hoy con SELECT (10 negocios activos de 15):

| Cron | Hora Lima | 1.ª corrida, medida | Peligro |
|---|---|---|---|
| `documentos-papelera` (en pausa) | — | Borra para siempre **310 documentos de Blas + 33 de main** (>30 días en la papelera; Blas verificado de nuevo: 310) | **ALTO**: queda en pausa |
| `auto-close-register` (en pausa) | — | Cerraría sin conteo la caja de **Blas abierta desde el 11-06** (también `demo` 06-09 y QA-UI 04-09). Ojo: producción HOY lo corre para `main` (CronHealthLog 22-10 23:06 UTC); al pasar la rama, `main` deja de cerrarse sola | **ALTO**: Brandon decide |
| `documentos-indexar` | 22:40 | Describe con IA hasta 25 documentos por negocio: hoy 0 de Blas, 22 de main, 26 en total. Sin tope de gasto, sólo de tiempo (240 s) | medio: costo chico, sin tope |
| `forestal-plazos` | 07:20 | Correo + WhatsApp **todos los días** mientras siga el problema (2 guías de Blas sin ingreso); sólo la campana evita repetir. No filtra negocios inactivos | medio |
| resto (13 nuevos + 10 cambiados) | varias | 0 a 7 mensajes, con marca de «ya avisado»; `camaras-personas-retencion` 0 fotos >30 días; `cleanup-demos` 0; `turnos-zombie-close` 0 turnos abiertos | bajo |

Propuesta: mantener los 2 en pausa (ya lo están). Opcional: mover los 5 de madrugada que mandan WhatsApp (`tramites-vencimiento` 03:50, `tramites-sin-respuesta` 04:05, `contratos-vencimiento` 04:10, `planificacion-avisos` 04:15) a 13:xx UTC (08:xx Lima). Hoy mandan 0, así que no urge.

## 5. Build: tres caminos

| | (a) Pro + Enhanced | (b) `vercel build` local + `--prebuilt` | (c) GitHub Actions + `--prebuilt` |
|---|---|---|---|
| Máquina | 8 vCPU / 16 GB (Turbo 30 / 60 GB si no alcanza) | esta PC: 19 GB, 12 núcleos | `ubuntu-latest` en repo público: 4 vCPU / **16 GB** / 14 GB de disco |
| Costo | Pro **US$ 20/mes** + Enhanced **US$ 0,028/min** (≈ US$ 0,40 un build de 15 min); Turbo US$ 0,105/min | 0 | 0 |
| RAM medida | pico local de ~10 GB generando páginas (16-10) → entra en 16 GB | igual, pero hay que cerrar el dev (7,9 GB) y los demás agentes: el 16-10 lo mataron 2 veces con el dev vivo. **Nunca terminó un build completo local** | igual que (a) |
| Tiempo | compila en 5,1 min en local; estimado 15-25 min en total | 15-30 min con la PC parada; prerender a 119 ms por consulta (Lima → us-east-2) | 15-25 min, cerca de la base (EE. UU.) |
| Qué destraba además | **Rolling Releases** (canario 5→25→100 % nativo, regla 14 al pie de la letra), previews por git que funcionan, uso comercial (Hobby es sólo para uso no comercial) | nada | builds repetibles sin usar la PC |
| Qué necesita | Brandon: pasar a Pro y elegir Enhanced en Settings → Build and Deployment → Build Machine | Brandon: `vercel login` con la cuenta `buleje`; bajar los secretos de producción a `.vercel/.env.production.local` (borrar al final) | Brandon: crear un `VERCEL_TOKEN` y guardarlo como secreto del repo |

**Recomendación: (a).** Con un solo pago resuelve el build, el canario de la regla 14 y el uso comercial. **Sin pago: (c)**; (b) sólo como último recurso. (c) es gratis y no frena la PC, pero tiene más piezas y los logs del repo público son públicos (el workflow no debe imprimir variables).

Workflow propuesto para (c) (`.github/workflows/deploy-prebuilt.yml`, NO creado):

```yaml
name: Deploy prebuilt (manual, sin dominio)
on:
  workflow_dispatch:
    inputs:
      ref: { description: "commit o rama", required: true }
permissions: { contents: read }
jobs:
  build:
    runs-on: ubuntu-latest   # repo público → 4 vCPU / 16 GB
    timeout-minutes: 60
    env:
      VERCEL_ORG_ID: team_tZ6dsZ6AVoAQ9enqpd4kVRPK
      VERCEL_PROJECT_ID: prj_J3LW8EWUie3GLvqSdYGVBvcqu7V5
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with: { ref: "${{ inputs.ref }}" }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci --no-audit
      - run: npx vercel@59.25.4 pull --yes --environment=production --token="$VERCEL_TOKEN"
      - run: npx vercel@59.25.4 build --prod --token="$VERCEL_TOKEN"
        env: { NODE_OPTIONS: "--max-old-space-size=12288" }
      - id: dep
        run: echo "url=$(npx vercel@59.25.4 deploy --prebuilt --prod --skip-domain --token="$VERCEL_TOKEN")" >> "$GITHUB_OUTPUT"
      - if: always()
        run: rm -f .vercel/.env.production.local
      - run: echo "Deploy sin dominio → ${{ steps.dep.outputs.url }}"
```

Comandos de (b), con todo cerrado (`free -g` ≥ 14 disponible):

```bash
vercel login                                   # cuenta buleje (hoy está en otra)
vercel pull --yes --environment=production --scope brandon-luis-projects-9cf56555
NODE_OPTIONS=--max-old-space-size=12288 vercel build --prod --scope brandon-luis-projects-9cf56555
vercel deploy --prebuilt --prod --skip-domain --scope brandon-luis-projects-9cf56555   # imprime la URL
rm -f .vercel/.env.production.local
```

## 6. Migraciones: nada pendiente

- `node scripts/migraciones-cruce.mjs` → **107 carpetas, 0 pendientes, 0 filas sin carpeta**. Las 10 «aplicadas a mano» del 09-10 ya se marcaron el **16-10 08:19** (`applied_steps_count = 0`). **No hace falta ningún `resolve --applied`.** Si alguna vez reapareciera una: `node scripts/prisma-session.mjs migrate resolve --applied <carpeta>`.
- `prisma migrate diff` (base → schema, por el pooler de sesión): **0 tablas, 0 columnas y 0 enums que falten en la base** → el código nuevo arranca. Sobran en la base 7 tablas y 7 columnas viejas (inofensivas) y faltan 15 índices (sólo rendimiento).
- 8 migraciones aplicadas tienen el checksum cambiado: no afecta el build (no corre `migrate`). Igual: **nunca `prisma migrate deploy`/`dev`** contra esta base.
- Volver atrás es seguro a nivel de esquema: las 77 migraciones nuevas sólo agregan cosas (las `DROP` están en los `rollback.sql`, que no se aplicaron); `Tenant.codigo` es `NOT NULL` pero con `DEFAULT generar_codigo_tienda()`, así que el código viejo sigue insertando. Cuidado: si el código nuevo escribe valores nuevos de un enum y se vuelve atrás, el Prisma viejo falla al leer esas filas (memoria `valor-de-enum-nuevo-rompe-cliente-viejo`).

## 7. DR drill mínimo (regla 14: < 35 días; el último fue el 19-05, hace 156 días)

Hoy **no hay ningún backup que funcione**: Supabase Free no da backups, y `backup-offsite.yml` lleva **194 de 194 corridas fallidas** (las últimas 10, en 12-16 s). Las causas, en orden:
1. El cron corre el workflow de `master` (la rama por defecto), que todavía tiene `cache-dependency-path: bodega-san-martin/package-lock.json` → `setup-node` falla. El arreglo ya está en la rama: se resuelve al mergear a `master`.
2. El repo tiene **0 de los 7 secretos** que pide (`DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_S3_*` ×5); sólo existe `CHROMATIC_PROJECT_TOKEN`. El aviso a Sentry da `apigateway Not found` porque `SENTRY_*` está vacío.
3. `apt install postgresql-client` en ubuntu-24.04 instala la v16, y la base es **PostgreSQL 17.6**: `pg_dump` aborta por versión. Hay que instalar `postgresql-client-17` desde el repo de PGDG.

**Ensayo mínimo que cumple la regla sin tocar producción** (≈ 20 min, < 1 GB de RAM, la base pesa 72 MB): un volcado de SOLO LECTURA → restaurarlo en un Postgres 17 local → cruzar conteos → cronometrar.

```bash
# PG 17 local (sudo funciona sin contraseña; hoy sólo hay PG 16)
sudo apt install -y postgresql-common && sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt install -y postgresql-17 && sudo pg_createcluster 17 drill --port 5434 --start
# volcado por el pooler en modo sesión (:5432, como prisma-session.mjs); DIRECT_URL no resuelve desde esta red
/usr/lib/postgresql/17/bin/pg_dump "<DATABASE_URL con :5432>" -Fc -n public --no-owner --no-acl -f ~/dr/buleje-AAAA-MM-DD.dump
sudo -u postgres createdb -p 5434 drill
sudo -u postgres /usr/lib/postgresql/17/bin/pg_restore -p 5434 -d drill --no-owner --no-acl -j 4 ~/dr/buleje-AAAA-MM-DD.dump
DR_BACKUP_PATH=~/dr/buleje-AAAA-MM-DD.dump DR_TEMP_DB_URL=postgresql://postgres@localhost:5434/drill node scripts/dr-drill.mjs
# cruzar count(*) de Tenant, Order, Sale, CashRegister, Document y las tablas forestales de Blas (prod vs drill)
# registrar en reports/dr-drills/AAAA-MM-DD.md (plantilla: reports/dr-drills/TEMPLATE.md)
gpg -c ~/dr/buleje-AAAA-MM-DD.dump && rm ~/dr/buleje-AAAA-MM-DD.dump   # tiene datos personales (Ley 29733)
```

Opcional, 3 min: el ensayo del rollback se hace en el propio pase (paso 6 del plan): promover, volver al deploy viejo cronometrando y volver a promover.

## 8. Plan de pase por partes

0. **Brandon decide**: (i) build (a)/(c)/(b); (ii) los 2 crons en pausa siguen así, y se cuenta y cierra a mano la caja de Blas del 11-06; (iii) backup: Supabase Pro (desde US$ 25/mes, backups diarios guardados 7 días) o bucket propio + 7 secretos; (iv) acepta por escrito que, sin Pro, el canario es «deploy sin dominio → humo → promover» y no 5→25→100.
1. **Ensayo DR** del §7 (lo puede correr un agente con OK de Brandon; sólo lee producción).
2. **Push** de los 15 commits locales + aplicar los diffs del §1 y §2 (commit chico).
3. **Build sin dominio** según el camino elegido; queda una URL `mercado-<hash>-brandon-luis-projects-9cf56555.vercel.app` con variables de producción y sin tráfico.
4. **Humo sobre esa URL** (escribe en la base real → probar sólo en tenants QA):
   - `BASE_URL=<url> bash scripts/post-deploy-smoke.sh` (10 endpoints: health, health/secrets, webhooks, sales, marketplace/feed…);
   - `curl <url>/api/cron/reportes-diarios/0700` sin token → 401 (existe y está protegida);
   - login `qaadmin` / `Qa-admin-1234` en `main`: Inicio, POS (cobrar una venta QA), Archivo (subir un PDF escaneado → el análisis con texto = OCR andando), `?tab=` de Documentos › expediente;
   - tenant forestal QA `inversiones-agroforestales-blas-sociedad-op-qa-ui`: Libro CTP, GTF, Libro TH;
   - `/t/main` y una ficha del marketplace; consola sin errores; MCP `get_runtime_errors` de ese deploy = 0.
5. **Promover**: con Pro, `vercel rr configure --enable --advancement-type=manual-approval --stage=5 --stage=25` → `vercel rr start --dpl=<id>` → `vercel rr approve …` → `vercel rr complete --dpl=<id>`. Sin Pro: `vercel promote <url> --scope brandon-luis-projects-9cf56555 --yes`. Los crons nuevos se prenden recién acá.
6. **Ensayo de vuelta atrás** (opcional, 3 min): rollback → `curl …/api/health` → volver a promover.
7. **Mirar**: 30 min de `get_runtime_errors`; la primera noche (22:40 `documentos-indexar`, 19:07 `turnos-zombie-close`); la primera mañana (07:20 `forestal-plazos`). Después avanzar `prod` (y `master`) al mismo commit: así el backup corre con el workflow arreglado.

## 9. Volver atrás en 1 minuto

```bash
vercel rollback dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2 --scope brandon-luis-projects-9cf56555 --yes --timeout 1m
curl -s https://mercado-hazel.vercel.app/api/health     # buleje.pe no resuelve
```

Si el CLI sigue en la otra cuenta: MCP `request_rollback` (`projectId=prj_J3LW8EWUie3GLvqSdYGVBvcqu7V5`, `deploymentId=dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2`; el MCP sí tiene acceso al equipo), o el panel → Deployments → ese deploy → **Instant Rollback**. La base no vuelve atrás (es aditiva, ver §6). Los crons vuelven a los 78 del deploy viejo, `auto-close-register` de `main` incluido.
