---
name: showcase-auto
description: |
  Auto-genera contenido de showcase (case-study + linkedin + twitter)
  después de commits con tag feat: o BREAKING CHANGE. Se conecta al
  hook post-commit para dispararse automático. También invocable
  manualmente.
  Usar cuando se cierre un feature, ADR, o sprint importante.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Agent
argument-hint: "[auto | manual | last-commit]"
model: sonnet
---

# Showcase Auto — Generación automática de contenido de legado

## Cuándo se dispara

### Automático (via hook post-commit)
Se activa si el último commit a master cumple:
- Prefijo `feat:` en el mensaje
- Contiene `BREAKING CHANGE`
- Contiene `ADR-` en el mensaje

### Manual
`/showcase-auto` o `/showcase-auto manual`

## Algoritmo

```
1. Leer último commit (o los últimos N si se especifica)
   → git log -1 --format="%H %s" HEAD
2. Verificar si califica (feat: | BREAKING CHANGE | ADR-)
3. Si califica:
   a. Extraer: archivos tocados, líneas cambiadas, ADRs relacionados
   b. Leer los últimos 5 ADRs via glob:
      → ls -t docs/adr/*.md | head -5
   c. Crear directorio: docs/showcase/[YYYY-MM-DD]-[slug]/
   d. Generar 3 archivos:
      - case-study.md (para clientes técnicos)
      - linkedin.md (para audiencia mixta, máx 250 palabras)
      - twitter-thread.md (8-10 tweets)
   e. Actualizar docs/growth/METRICS.md
4. Si no califica: salir silenciosamente
```

## Formato de slug

Del mensaje del commit, tomar las primeras 3-4 palabras significativas:
- `feat: add fiado digital module` → `fiado-digital-module`
- `feat(checkout): implement Yape QR` → `checkout-yape-qr`

## Salida

```markdown
## 🎯 Showcase Auto — [fecha]

### Commit analizado
`[hash corto]` — [mensaje]

### Archivos generados
- ✅ `docs/showcase/[fecha]-[slug]/case-study.md`
- ✅ `docs/showcase/[fecha]-[slug]/linkedin.md`
- ✅ `docs/showcase/[fecha]-[slug]/twitter-thread.md`

### LinkedIn preview (primeras 3 líneas)
[preview del post]
```

## Reglas

1. **No generar si el commit es chore/fix/docs/style** — solo feat/BREAKING.
2. **No exagerar logros** — ser honesto sobre el estado real.
3. **Lenguaje accesible** — un inversor debe entender el valor.
4. **Si no hay ADRs nuevos**, usar el contexto del commit para generar.
5. **No bloquear el flujo** — si falla, logear y continuar.

## Referencia

- Agente: `growth-specialist` (24)
- Skill hermano: `/showcase` (resumen manual de ADRs)
