---
name: audit-search
description: |
  Busca quién accedió a datos de un cliente y cuándo en el audit log.
  Cumple Ley 29733 Art. 18 (derecho a saber quién vio tus datos).
  Usar cuando Brandon diga "quién vio los datos de", "audit search",
  "buscar accesos", "quién accedió a".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[DNI 8 dígitos] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]"
model: haiku
---

# Audit Search — Quién Accedió a Datos de un Cliente

## Algoritmo

```
1. Validar DNI
2. Llamar POST /api/compliance/access-log con { dni, tenantId, fromDate?, toDate? }
3. Recibir lista de accesos:
   - Timestamp
   - Actor (usuario, agente, sistema)
   - Acción (read, create, update, delete, export)
   - Tabla/entidad accedida
   - IP de origen
4. Formatear en tabla cronológica
```

## Formato de salida

```markdown
## 🔍 Audit Search — DNI [XXXXXXXX]

| Fecha | Actor | Acción | Entidad | IP |
|---|---|---|---|---|
| 2026-04-10 14:30 | admin@bodega | read | Customer | 190.X.X.X |
| 2026-04-10 14:31 | system:mcp | read | Order | internal |
```

## Reglas

1. **Modelo Haiku** — búsqueda simple, no necesita razonamiento.
2. **Solo admin** puede buscar.
3. **El acto de buscar también se registra** en el audit log.
