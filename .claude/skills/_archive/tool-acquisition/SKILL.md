---
name: tool-acquisition
description: Busca, evalua, instala, CONECTA y CREA librerias npm, MCPs, agentes, skills, hooks. Activar cuando detecto un gap de capacidad o Brandon diga "potencia", "autoequipate", "instala lo necesario".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
argument-hint: [gap-o-capacidad-a-cubrir]
model: sonnet
---

# Tool Acquisition — Autoequipamiento

> **Regla de oro:** Si hay una libreria/MCP/skill que resuelve esto mejor que hacerlo a mano, la INSTALO, pruebo y reporto. Si NO existe, la CREO. Sin pedir permiso.

## Workflow de 6 pasos

### 1. Nombrar el gap (1 frase)
```
GAP: "No puedo generar facturas PDF con QR SUNAT sin 200 lineas de jsPDF"
```

### 2. Buscar candidatos
| Fuente | Como |
|---|---|
| npm/GitHub | `WebSearch "mejor libreria [gap] 2026 typescript npm"` |
| Vercel Marketplace | Skill `vercel:marketplace` |
| MCP servers | `WebSearch "mcp server [gap]"` |
| Context7 | Verificar APIs actuales antes de escribir codigo |

### 3. Filtro 5/5
| Criterio | Pregunta |
|---|---|
| Mantenimiento | Ultimo commit < 6 meses? Downloads > 1000/sem? |
| Compatibilidad | Next.js 16 + React 19 + Node 24? |
| Licencia | MIT/Apache/BSD? (NO GPL) |
| Tamano | < 100KB minified (frontend)? |
| Alternativa | Ya hay algo en el proyecto que hace lo mismo? |

**Solo instalar si >= 4/5.**

### 4. Instalar con seguridad
```bash
npm install <paquete>@<version>  # siempre version pinneada
npm run lint && npx tsc --noEmit && npm run test
```

Para MCPs: agregar en `~/.claude.json` mcpServers, reiniciar Claude Code.
Para skills/agentes: crear archivo .md en `.claude/skills/` o `.claude/agents/`.

### 5. Probar en ejemplo minimo
```typescript
// scripts/test-nueva-libreria.mjs
import { thing } from "nueva-libreria";
console.log(await thing.hello());
```

### 6. Reportar
```
✅ Instale: <paquete>@<version>
📋 Para que: <1 linea>
🧪 Probado: <ejemplo ejecutado>
🔁 Donde lo uso: <modulo>
```

## Mandato Nivel 4 — Completeness (10 checkpoints)

Toda tool instalada debe cumplir >= 7/10:
1. Version pinneada
2. Types instalados (`@types/pkg`)
3. Wrapper en `lib/integrations/<tool>.ts`
4. 3 tests (happy + error + edge)
5. Logger + Sentry en catches
6. Feature flag si riesgoso
7. ADR si dep critica (auth/pagos/DB)
8. JSDoc en wrapper
9. Bundle size medido (frontend)
10. lint + tsc + test + build verdes

## Crear nuevas capacidades

| Situacion | Que hacer |
|---|---|
| Existe libreria npm > 1k downloads | Instalar (6 pasos) |
| Existe MCP publico | Instalar el MCP |
| Gap especifico de Bodega | Crear skill local |
| Necesito especialista | Crear agente en `.claude/agents/` |
| Tarea repetitiva | Crear slash command |
| Proteger comando peligroso | Crear hook |

## Safety checks

```
❌ NUNCA < 100 downloads/sem (salvo autor conocido)
❌ NUNCA conflicto peer deps sin confirmar
❌ NUNCA post-install sospechosos sin leer
❌ NUNCA instalar fuera de bodega-san-martin/
❌ NUNCA mezclar npm y pnpm
❌ NUNCA olvidar lint + tsc + test post-install
❌ NUNCA GPL en codigo comercial
❌ NUNCA < 7/10 checkpoints
✅ SIEMPRE context7 para verificar API actual
✅ SIEMPRE ADR si dep critica
✅ SIEMPRE bundle size si frontend
```
