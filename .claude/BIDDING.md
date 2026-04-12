# BIDDING.md — Sistema de asignacion dinamica

> En SWARM, los items no se asignan fijamente por frente.
> El orchestrator publica items disponibles y los agentes "bidean" segun
> su capacidad y disponibilidad.

---

## Estado actual

| Campo | Valor |
|-------|-------|
| Ola activa | - (ninguna) |
| Items publicados | 0 |
| Bids recibidos | 0 |

---

## Items disponibles (orchestrator publica aqui)

| # | Item | Esfuerzo | Dominio | Asignado a | Status |
|---|------|----------|---------|-----------|--------|
| - | - | - | - | - | - |

---

## Reglas de bidding

1. **Dominio natural** — back bidea por items de API/DB, front por UI, qa por tests
2. **Cross-domain** — un item fullstack puede tener 2 bids (back + front)
3. **Capacidad** — maximo 3 items activos por frente por ola
4. **Prioridad** — items P0 se asignan primero, luego P1
5. **Conflicto** — si 2 frentes bidean por el mismo item, orchestrator decide

## Formato de bid

```markdown
### Bid: frente-{x} → Item #{N}

- Archivos que tocaria: [lista]
- Estimacion: S/M/L turns
- Dependencias: necesito que #{Y} se complete primero
- Confidence: alta/media/baja
```

## Historial de asignaciones

| Ola | Item | Bid ganador | Resultado |
|-----|------|-------------|-----------|
| 1 | #1 | T2 (ad-hoc) | done |
| 1 | #4 | T1 (ad-hoc) | done |
| 1 | #7 | T2 (ad-hoc) | done |
| 1 | #10 | T3 (ad-hoc) | done |
| 1 | #12 | T3 (ad-hoc) | done |

> Nota: Ola 1 fue pre-SWARM — asignacion manual sin bidding formal.
