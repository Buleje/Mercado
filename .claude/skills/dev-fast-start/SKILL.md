---
name: dev-fast-start
description: Arranca dev server limpio + crea QA admin + deshabilita onboarding modal + captura baseline visual — todo en paralelo. Uso cuando Brandon diga "arranca dev rapido", "setup rapido para qa", "necesito ver el admin", "prepara todo para verificar".
---

# Skill: dev-fast-start

Arranca el entorno local de desarrollo en modo optimizado para verificacion
agentica — **paralelismo maximo**, sin prompts manuales, listo en ~60s.

## Qué hace (paralelo)

1. Verifica si dev server ya corre (`curl localhost:3000`). Si 200 → skip arranque.
2. Si no corre → `npm run dev` en background (Turbopack con filesystem cache,
   rebuild ~5s si cache existe).
3. Crea/asegura admin QA: `qaadmin` / `Qa-admin-1234` en tenant `main` via
   `node -r dotenv/config scripts/create-qa-admin-raw.mjs`.
4. Marca onboarding completo en DB via SQL directo (alternativa a localStorage
   que necesita browser context fresco cada vez).
5. Captura screenshots baseline de los 9 modulos criticos con
   `node scripts/visual-verify-admin-focused.mjs` → 
   `reports/visual-verify/YYYY-MM-DD-{context}/`.

## Cuando invocar

- Al inicio de una sesion de QA visual.
- Antes de un ultra-impact que tocara UI admin.
- Despues de un restart forzado.
- Si Brandon dice: "arranca dev rapido", "setup de qa", "prepara el entorno",
  "necesito ver [modulo]".

## Como ejecutar

Este skill es un **runner coordinado**, no texto. Ejecuta en paralelo:

```bash
# Paralelo:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ &
CHECK_PID=$!
wait $CHECK_PID

# Si != 200 → arrancar dev
cd bodega-san-martin && npm run dev &

# Mientras compila, setup admin + onboarding completed
node -r dotenv/config scripts/create-qa-admin-raw.mjs &
```

## Contrato de salida

Al terminar reportar tabla con:
- Dev server status (200 OK / compilando / failed)
- URL local (http://localhost:3000)
- Credenciales QA (qaadmin / Qa-admin-1234 / tenant main)
- Path del baseline screenshot dir

**Regla de oro:** no matar `node.exe` ni wipear `.next` salvo que el server
no responda despues de 60s (con el filesystem cache activo, el rebuild es
~5s, no 30-60s como antes).
