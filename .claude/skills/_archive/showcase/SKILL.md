---
name: showcase
description: |
  Genera resumen ejecutivo de ADRs + auto-genera contenido de showcase
  (case-study, LinkedIn, Twitter) tras commits feat:/BREAKING CHANGE.
  Fusiona showcase manual + showcase-auto.
  Usar: "showcase", "logros", "portfolio", "linkedin draft".
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Agent
argument-hint: "[últimos N ADRs | auto | last-commit | full]"
model: sonnet
---

# Showcase — Resumen ejecutivo + auto-generacion

## Modo manual: `/showcase [N]`

```
1. Leer ADRs en docs/adr/ (DESC por numero)
2. Tomar ultimos 5 (o N)
3. Extraer: titulo, problema, tecnologias, impacto
4. Generar:
   a. Tabla resumen ejecutivo
   b. LinkedIn draft (max 300 palabras)
   c. Actualizar docs/growth/CASE_STUDIES.md
```

## Modo auto: `/showcase auto` o `/showcase last-commit`

Se activa si ultimo commit cumple: `feat:` | `BREAKING CHANGE` | `ADR-`

```
1. Leer ultimo commit → verificar si califica
2. Si califica:
   a. Extraer archivos tocados, lineas, ADRs relacionados
   b. Crear docs/showcase/[YYYY-MM-DD]-[slug]/
   c. Generar: case-study.md + linkedin.md + twitter-thread.md
3. Si no califica: salir silenciosamente
```

## Formato de salida

```markdown
## Showcase — [fecha]

### Resumen ejecutivo
| # | Decision | Problema | Solucion | Impacto |
|---|---|---|---|---|

### LinkedIn Draft (listo para copiar)
[200-300 palabras con hook, historia, resultado, hashtags]

### Archivos generados (modo auto)
- docs/showcase/[fecha]-[slug]/case-study.md
- docs/showcase/[fecha]-[slug]/linkedin.md
- docs/showcase/[fecha]-[slug]/twitter-thread.md
```

## Reglas

1. Lenguaje ejecutivo, sin jerga innecesaria
2. Datos reales, no inventar metricas
3. Max 1 pagina el resumen
4. LinkedIn draft copiable directamente
5. No generar para chore/fix/docs/style — solo feat/BREAKING
