---
name: adr-manager
description: |
  Gestiona Architecture Decision Records (ADR) en `docs/adr/`.
  Implementa el comando `/adr [título]`: crea ADR-XXX.md con estructura
  Contexto / Decisión / Consecuencias / Alternativas / Referencias.
  Auto-numera el siguiente ADR libre. Usar SIEMPRE que un cambio impacte
  arquitectura, contratos públicos, schema DB, o seguridad.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate
argument-hint: "[título corto del ADR]"
model: opus
---

# ADR Manager — gestor de decisiones arquitecturales

Regla CLAUDE.md #12: "Cualquier cambio de arquitectura requiere ADR nuevo en `docs/adr/`."

## Cuándo crear un ADR

| Cambio | ADR? |
|---|:---:|
| Nuevo/cambio modelo Prisma o relación | Si |
| Nuevo endpoint público o cambio de contrato API | Si |
| Cambio en RBAC (`role-permissions.ts`) | Si |
| Cambio en flujo de pago (CheckoutModal/orders.db) | Si |
| Nuevo MCP / plugin / integración externa | Si |
| Cambio de estrategia de caché o ISR | Si |
| Cambio en estructura multi-tenant | Si |
| Refactor grande (>=10 archivos, >=300 LOC) | Si |
| Bugfix puntual sin cambio de diseño | No |
| Cambio de copy o UI cosmético | No |

## Numeración automática

1. Lista `bodega-san-martin/docs/adr/*.md`
2. Extrae números existentes con `^(\d{3})-`
3. Calcula `max + 1`, padding a 3 dígitos
4. Slugifica título: lowercase + guiones + sin tildes
5. Crea: `docs/adr/{NNN}-{slug}.md`

## Plantilla (headers obligatorios)

```markdown
# ADR-{NNN} — {Título}

**Status:** Accepted | Proposed | Deprecated | Superseded by ADR-{XXX}
**Fecha:** YYYY-MM-DD
**Autor:** Brandon (Buleje) + Claude Code

## 1. Contexto
[Estado antes + restricciones + problemas. 2-4 párrafos.]

## 2. Decisión
[Qué decidimos + archivos/módulos impactados. 1-2 párrafos.]

## 3. Consecuencias
### Positivas / ### Negativas / ### Migraciones requeridas

## 4. Alternativas evaluadas
| Opción | Pros | Contras | Por qué descartada |

## 5. Verificación
- [ ] Tests actualizados
- [ ] Docs actualizadas
- [ ] Memoria actualizada
- [ ] Rollback plan documentado

## 6. Referencias
- ADRs relacionados, Issues/PRs, links externos, memorias
```

## Reglas duras

1. **Nunca renumerar** ADRs existentes — inmutables
2. **Nunca borrar** — marcar como `Superseded` y crear nuevo
3. **Slug corto** (max 50 chars), sin tildes, sin paréntesis
4. **Status obligatorio** desde creación
5. Si no se llena en la sesión, dejarlo `Proposed`
6. Antes de crear, listar ADRs existentes y avisar si hay duplicado temático
7. Actualizar `docs/adr/INDEX.md` si existe

## Output final

```
ADR creado: docs/adr/{NNN}-{slug}.md | Status: Proposed
Próximos: llenar secciones → Accepted → commit: docs(adr): add ADR-{NNN}
```
