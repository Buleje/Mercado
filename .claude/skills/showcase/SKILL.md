---
name: showcase
description: |
  Genera un resumen ejecutivo de alto nivel de los últimos 5 ADRs para
  presentar a un cliente técnico o inversor. Incluye borrador LinkedIn
  y caso de estudio actualizado.
  Usar cuando Brandon diga "showcase", "muéstrame logros", "qué tenemos
  para mostrar", "prepará un resumen ejecutivo", "portafolio".
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
argument-hint: "[últimos N ADRs | tema específico | 'full']"
model: sonnet
---

# Showcase — Resumen ejecutivo de logros

Genera un resumen de alto nivel de los logros técnicos del proyecto, listo para
presentar a clientes, inversores o publicar en LinkedIn.

## Algoritmo

```
1. Leer todos los ADRs en docs/adr/ (ordenados por número DESC)
2. Tomar los últimos 5 (o N si se especifica)
3. Para cada ADR extraer:
   - Título
   - Problema que resolvió
   - Tecnologías usadas
   - Impacto en el negocio
4. Generar:
   a. Tabla resumen ejecutivo
   b. Borrador LinkedIn (máx 300 palabras)
   c. Actualizar docs/growth/CASE_STUDIES.md si existe
5. Mostrar todo en formato visual para Brandon
```

## Formato de salida

```markdown
## 🏆 Showcase — Bodega San Martín

### Resumen ejecutivo (últimos 5 ADRs)

| # | Decisión | Problema | Solución | Impacto |
|---|---|---|---|---|
| 026 | Phase 3 Sovereignty | Sistema sin auto-monitoreo | 3 agentes + 4 skills + 2 hooks | Auto-optimización de costos |
| 025 | Phase 2 Autonomous OS | Bloqueos por errores triviales | Self-heal + pentest + ADR mgr | Autonomía nocturna real |
| ... | ... | ... | ... | ... |

### 🔷 LinkedIn Draft (listo para copiar)

[Post de 200-300 palabras con hook, historia, resultado, hashtags]

### 📖 Case Study actualizado

[Resumen del case study más reciente]
```

## Reglas

1. **Lenguaje ejecutivo** — sin jerga innecesaria
2. **Datos reales** — no inventar métricas
3. **Máximo 1 página** el resumen — si quiere más, invitar a leer los ADRs
4. **LinkedIn draft debe ser copiable** directamente
5. **Actualizar docs/growth/ si existe** — crear directorio si no existe

## Referencia

- Agente: `growth-specialist` — para tareas más profundas de growth
- Memoria: `user_profile.md` — contexto de Brandon
