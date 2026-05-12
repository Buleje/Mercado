# ADR-102: Memoria persistente del agente Claude — arquitectura 3 capas

**Fecha:** 2026-05-12
**Estado:** Aceptado, parcialmente implementado
**Sprint:** Sesión 2026-05-12 (post-incidente "wip-sprint-files")

## Contexto

El agente Claude Code que asiste a Brandon en el desarrollo de Buleje pierde
contexto entre sesiones. Cada vez que se abre una sesión nueva, el agente parte
"de cero" sin recordar:

- Decisiones técnicas tomadas
- Reglas de comunicación (Feynman, no emojis UI, español Perú)
- Estado del proyecto (deuda técnica, pendientes)
- Historia de incidentes y soluciones

El día 2026-05-12 además se detectó un incidente crítico: el hook automático
`BSM Autonomy boot` ejecutaba `git stash save -m "wip-sprint-files"` al inicio
de cada sesión para arrancar con working tree limpio, **escondiendo 562
archivos del sprint 2026-05-11** sin avisar. Brandon creyó haber perdido el
trabajo.

Esto reveló dos necesidades:

1. **Memoria persistente del agente** — qué sabe el agente entre sesiones
2. **Trazabilidad del working tree** — qué archivos están en flight

## Decisión

Implementar memoria persistente en **3 capas complementarias**, no excluyentes:

| Capa | Tecnología | Almacena | Latencia |
|---|---|---|---|
| **L1 — Estática** | `CLAUDE.md` + auto-memory file-based (`~/.claude/projects/.../memory/*.md`) | Reglas, preferencias, ADRs, historia de sesiones | 0ms (carga en cada sesión) |
| **L2 — Episódica** | MCP Memory server (knowledge graph JSONL) + claude-mem (auto-captura) | Entidades, relaciones, decisiones recientes | <50ms (in-process) |
| **L3 — Semántica** | Qdrant local `:6333` collection `memory` con embeddings Xenova `all-MiniLM-L6-v2` (384d Cosine) | Búsqueda semántica sobre toda la memoria | <100ms |

### L1 — Estática (ya existía, mantener)

Auto-memory file-based en `/home/usuario/.claude/projects/-home-usuario-proyectos-Mercado/memory/`:
- `MEMORY.md` como índice (formato: `- [Title](file.md) — hook line`)
- Archivos por tipo: `feedback_*.md`, `project_*.md`, `reference_*.md`, `user_*.md`
- 29 memorias al cierre de sesión 2026-05-11
- Backup diario en `~/memory-backup-YYYY-MM-DD/`

### L2 — Episódica (nuevo, configurado 2026-05-12)

**MCP Memory server oficial Anthropic** (`@modelcontextprotocol/server-memory`):
- 12 entidades core creadas (Brandon, Buleje, Pucallpa, preferencias, design rules)
- 14 relaciones (owns, prefers, demands, enforces)
- Persistencia explícita en `knowledge-graph.jsonl` (no default cwd/memory.json)
- Configurado en `.mcp.json` del proyecto con env `MEMORY_FILE_PATH`

**claude-mem plugin** (Apache 2.0, repo `thedotmack/claude-mem`):
- Hooks lifecycle (SessionStart, PostToolUse, PreCompact, SessionEnd)
- Compresión IA de sesión al cierre
- Worker en port `37777` con UI web
- Search híbrida (vector + keyword) con Chroma
- **Pendiente**: instalación manual del plugin + firewall puerto 37777

### L3 — Semántica (collection creada, sin poblar todavía)

Qdrant local en `:6333`:
- Collection `memory` creada (384 dims, Cosine)
- Embeddings con Xenova `all-MiniLM-L6-v2` (offline, ya instalado)
- Collection `buleje-code` existente (RAG del repo) sigue separada

**Pendiente**: pipeline que indexe las memorias L1 + L2 en L3 para búsqueda semántica unificada.

## Setup paso a paso (implementado parcialmente 2026-05-12)

| # | Paso | Estado |
|---|---|---|
| 1 | Backup de las 29 memorias actuales en `~/memory-backup-2026-05-12/` | ✅ |
| 2 | Crear collection Qdrant `memory` (384 dims Cosine) | ✅ |
| 3 | Poblar knowledge graph con 12 entidades + 14 relaciones core | ✅ |
| 4 | Escribir JSONL persistente en path estable | ✅ |
| 5 | Configurar `.mcp.json` con `MEMORY_FILE_PATH` env var | ✅ |
| 6 | Actualizar `MEMORY.md` con índice nuevo | ✅ |
| 7 | Reiniciar Claude Code para activar MCP memory con persistencia | ⏳ Brandon |
| 8 | Instalar Bun (`curl -fsSL https://bun.sh/install \| bash`) | ⏳ Brandon |
| 9 | `/plugin marketplace add thedotmack/claude-mem` + `/plugin install claude-mem` | ⏳ Brandon |
| 10 | `sudo apt install ufw -y && sudo ufw deny 37777` (mitigar audit HIGH Feb 2026) | ⏳ Brandon |

## Consecuencias

### Positivas

- **Resistencia a pérdida de contexto**: 3 copias redundantes de memoria
- **Búsqueda semántica**: "¿qué dijimos sobre planes Stripe?" funciona sin grep
- **Privacidad**: 100% local — datos clientes Buleje no salen a USA (Ley 29733)
- **Cero lock-in**: cada capa se puede desinstalar sin perder las otras
- **Auto-captura**: claude-mem registra cada PostToolUse sin esfuerzo del usuario

### Negativas / Riesgos

- **Worker port 37777 SIN AUTH** (audit Feb 2026, severidad HIGH): cualquier
  proceso en la máquina podría leer/escribir la memoria. Mitigación obligatoria
  con `ufw deny 37777`.
- **Crecimiento sin límite**: SQLite (claude-mem) y JSONL (MCP memory) crecen.
  Cron mensual de vacuum + retention 6 meses requerido.
- **Compresión IA del worker consume tokens**: configurable a Haiku 4.5 (~$0.10/mes
  con volumen actual).
- **Dependencia del hook BSM Autonomy boot**: aún hace `git stash` sin avisar.
  Próximo ADR debe deshabilitar o reescribir ese comportamiento.

## Alternativas evaluadas

| Opción | Score | Por qué descartada |
|---|---:|---|
| **mem0 cloud** | 23/25 | 10K mems free se acaba en 2-3 meses, después $19-249/mes. Datos a USA. |
| **mem0 self-hosted** | 18/25 | Requiere Docker + Postgres + Qdrant separados (3 servicios) |
| **Letta (MemGPT)** | 17/25 | Cambia paradigma (reemplaza Claude Code por letta-code) |
| **Solo CLAUDE.md** | 12/25 | Carga estática, sin búsqueda semántica, sin captura automática |
| **Stack 3 capas (elegido)** | 24/25 | Suma a lo existente, sin lock-in, 100% local, gratis |

## Referencias

- [MCP Memory oficial Anthropic](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- [claude-mem GitHub (Apache 2.0)](https://github.com/thedotmack/claude-mem)
- [Augment Code — claude-mem security audit Feb 2026](https://www.augmentcode.com/learn/claude-mem-persistent-memory-claude-code)
- [Qdrant agentic builders guide](https://qdrant.tech/articles/agentic-builders-guide/)
- ADR-058: Hub & Spoke v2 (orquestación de agentes)
- ADR-099: Hardening patterns rounds 6-23
