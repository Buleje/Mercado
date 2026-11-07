---
name: adr
description: "Crea un ADR en docs/adr con el número correcto (siguiente al último ADR-NNN) y el formato vigente. Usar cuando un cambio toque arquitectura, contratos de API, schema Prisma, RBAC o pagos, o cuando Brandon escriba «/adr» o «haz un ADR»."
user-invocable: true
allowed-tools: Read, Write, Bash, Grep
argument-hint: "[título corto]"
---

# /adr

1. Número = último + 1 (ADR viejos `NNN-`, nuevos `ADR-NNN-`; una sola numeración):
   `echo $((10#$(ls docs/adr | rg -o '^(?:ADR-)?(\d+)-' -r '$1' | sort -n | tail -1) + 1))`
2. Leer antes lo del tema: `rg -il '<tema>' docs/adr | tail -5`.
3. Crear `docs/adr/ADR-<N>-<slug>.md` (slug corto, sin tildes):

```
# ADR-<N> — <Título>

- **Estado:** aceptado (AAAA-MM-DD). Schema: <migración> | Sin schema.
- **Pedido por:** Brandon (DD-MM): «<cita>».
- **Relacionados:** ADR-<M> (<qué>).

## Contexto
## Decisión
## Alternativas descartadas
## Consecuencias
```

Nunca renumerar ni borrar: uno nuevo reemplaza al viejo. Sin índice que mantener (el README quedó en el 006).
