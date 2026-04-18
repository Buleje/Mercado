---
name: sprint-wrap
description: Cierra un sprint del roadmap ADR-075 o similar — auto-genera ADR addendum con delta cuantitativo, baseline snapshot, visual verify post, update MEMORY.md, y commit del cierre. Uso cuando Brandon diga "cerra sprint", "wrap sprint", "cierre", "delta final", o al terminar un ultra-impact mayor.
---

# Skill: sprint-wrap

Cierra profesionalmente una iteracion de un roadmap largo (ej. Sprint A/B/C
del ADR-075). Evita que el trabajo quede sin documentacion o baseline.

## Proceso (7 pasos)

```
1. CAPTURE baseline post:
   - npx tsc --noEmit > reports/baseline/<date>-<sprint>/tsc-post.txt
   - npm run lint > lint-post.txt
   - npx tsx scripts/lint-design-tokens.ts > lint-design-tokens-post.txt
   - git log --oneline HEAD~<N>..HEAD > commits.txt

2. DELTA compute:
   - comparar pre vs post por regla/metrica
   - tabla markdown con % delta

3. VISUAL VERIFY post:
   - node scripts/visual-verify-admin-focused.mjs
   - capturar en reports/visual-verify/<date>-<sprint-post>/
   - comparar contra baseline pre (Read screenshots, comparar)

4. ADR ADDENDUM:
   - append a docs/adr/<NNN>-<title>.md con seccion
     "## Addendum — Sprint X (YYYY-MM-DD)"
   - incluir: tabla delta, archivos migrados TOP 10, commits, roadmap
     pendiente

5. UPDATE MEMORY.md:
   - agregar linea al index con pointer al sprint recap
   - crear memory file project_sprint_<N>_<date>.md si descubrimos
     algo nuevo (shadowing, hotfix, pattern)

6. COMMIT cierre:
   - git commit con:
     - subject lowercase: "docs(adr): adr-NNN addendum sprint X + baseline delta"
     - body: metas cumplidas/no, % del roadmap, archivos nuevos, lo que queda

7. REPORT final al usuario:
   - tabla resumen ejecutiva (warnings pre/post, files changed, commits)
   - tabla de mejoras de alto impacto para siguiente sprint
   - lista de "lo que queda"
```

## Cuando invocar

- Al terminar un ultra-impact con ≥3 commits.
- Cuando Brandon dice: "cierra sprint", "wrap sprint", "cierre del sprint X",
  "delta final", "baseline post", "termine sprint".
- Antes de abrir PR al master si el branch incluyo un sprint completo.

## Output contract

Reporta tabla:

| Gate | Pre | Post | Delta | ✓/✗ |
|---|---:|---:|---:|---|
| ... | ... | ... | ... | ... |

+ tabla de mejoras agenticas para siguiente sprint (siempre) ← memoria del user lo pide.

## Invariantes

- NUNCA bypass HUSKY sin justificacion.
- SIEMPRE danger zone respetada (proxy.ts, orders.db.ts, checkout/, etc).
- SIEMPRE documentar lo que queda — nunca reportar "todo hecho" si hay residuo.
- SIEMPRE actualizar MEMORY.md si hubo descubrimientos trans-sesion.
