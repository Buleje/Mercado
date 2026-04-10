---
name: adr-manager
description: |
  Gestiona Architecture Decision Records (ADR) en `bodega-san-martin/docs/adr/`.
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

Implementación del comando `/adr` y guardián de la regla CLAUDE.md #12:

> "Cualquier cambio de arquitectura requiere ADR nuevo en `docs/adr/`."

## Cuándo crear un ADR

| Cambio | ADR obligatorio | Por qué |
|---|:---:|---|
| Nuevo modelo Prisma o cambio de relación | ✅ | Schema impact |
| Nuevo endpoint público o cambio de contrato | ✅ | API contract |
| Cambio en RBAC (`role-permissions.ts`) | ✅ | Seguridad |
| Cambio en flujo de pago (CheckoutModal/orders.db) | ✅ | Riesgo financiero |
| Nuevo MCP server / plugin / integración externa | ✅ | Dependencia externa |
| Cambio de estrategia de caché o ISR | ✅ | Performance + comportamiento |
| Cambio en estructura multi-tenant | ✅ | Aislamiento |
| Refactor grande (≥10 archivos, ≥300 LOC) | ✅ | Documentar el "por qué" |
| Bugfix puntual sin cambio de diseño | ❌ | Suficiente con commit msg |
| Cambio de copy o UI cosmético | ❌ | No es decisión |

## Numeración automática

Al ejecutar `/adr [título]`, el skill:

1. Lista `bodega-san-martin/docs/adr/*.md`
2. Extrae números existentes con `^(\d{3})-`
3. Calcula `max + 1`, padding a 3 dígitos
4. Slugifica el título: lowercase + guiones + sin tildes
5. Crea archivo: `docs/adr/{NNN}-{slug}.md`

## Plantilla obligatoria

```markdown
# ADR-{NNN} — {Título}

**Status:** 🟢 Accepted | 🟡 Proposed | 🔴 Deprecated | 🟣 Superseded by ADR-{XXX}
**Fecha:** YYYY-MM-DD
**Autor:** Brandon (Buleje) + Claude Code (Lead Systems Architect)
**Contexto del proyecto:** Bodega San Martín (ERP/e-commerce multi-tenant Pucallpa)

---

## 1. Contexto

[Por qué surgió esta decisión. Estado del sistema **antes**. Restricciones,
problemas detectados, oportunidades. 2-4 párrafos.]

## 2. Decisión

[**Qué decidimos hacer**. Frase contundente. Si es un cambio técnico, citar
los archivos/módulos impactados. Si es organizacional, citar el proceso.
1-2 párrafos.]

## 3. Consecuencias

### ✅ Positivas
- [Beneficio 1]
- [Beneficio 2]

### ⚠️ Negativas / costos
- [Costo 1: tiempo, complejidad, deuda asumida]
- [Costo 2]

### 🔄 Migraciones requeridas
- [Si aplica: pasos manuales, scripts, deploys coordinados]

## 4. Alternativas evaluadas

| Opción | Pros | Contras | Por qué descartada |
|---|---|---|---|
| A: [...] | [...] | [...] | [...] |
| B: [...] | [...] | [...] | [...] |
| **C: la elegida** | [...] | [...] | — |

## 5. Verificación

- [ ] Tests añadidos / actualizados
- [ ] Documentación actualizada (`ARCHITECTURE.md`, `CLAUDE.md`, etc.)
- [ ] Memoria actualizada si aplica
- [ ] Rollback plan documentado
- [ ] Notificado al equipo (si hay equipo)

## 6. Referencias

- ADRs relacionados: ADR-XXX, ADR-YYY
- Issues / PRs: #NNN
- Documentación externa: [link]
- Memorias relevantes: `~/.claude/projects/.../memory/[archivo].md`

---

> Generado por skill `adr-manager` · revisar antes de mergear
```

## Ejemplo de uso

```
brandon> /adr migración a fluid compute
claude> 🏛️ ADR Manager arrancando...
        Próximo número libre: 020
        Slug: migracion-a-fluid-compute
        Creando: docs/adr/020-migracion-a-fluid-compute.md
        ✅ Plantilla escrita.
        ⏳ Esperando que llenes Contexto/Decisión/Consecuencias.
```

## Reglas duras

1. **Nunca renumerar ADRs existentes.** Inmutables.
2. **Nunca borrar ADRs.** Marcar como `Superseded` y crear el nuevo.
3. **Slug corto** (max 50 chars), descriptivo, sin tildes, sin paréntesis.
4. **Status obligatorio** desde el momento de creación.
5. **Si Brandon no lo llena en la misma sesión**, dejarlo `🟡 Proposed`.
6. **Antes de crear**, listar ADRs existentes y avisar si hay duplicado temático.
7. **Index** — actualizar `docs/adr/INDEX.md` si existe (link a nuevo ADR).

## Salida final del skill

```markdown
## 🏛️ ADR creado

**Archivo:** `docs/adr/020-migracion-a-fluid-compute.md`
**Status:** 🟡 Proposed
**Próximos pasos:**
1. Llenar secciones 1-6 (te ayudo si querés)
2. Cambiar status a 🟢 Accepted cuando se aplique
3. Commitear: `docs(adr): add ADR-020 migracion a fluid compute`
4. Actualizar memoria si aplica (`feedback_*` o `project_*`)
```

## Referencia

- ADRs existentes: `bodega-san-martin/docs/adr/`
- Plantilla actual: `docs/adr/000-template.md`
- Regla CLAUDE.md #12
