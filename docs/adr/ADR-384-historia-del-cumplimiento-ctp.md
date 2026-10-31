# ADR-384 — La historia del cumplimiento: el score deja de ser una foto

**Estado:** aceptado · **Fecha:** 2026-09-03 · **Ámbito:** Libro de Operaciones CTP

## Contexto

El panel «Cumplimiento del período» muestra un score 0-100 con su desglose por
categoría. Es correcto y es útil, pero **sólo sabe decir cómo estoy hoy**. No
puede responder ninguna de las preguntas que hace un fiscalizador ni las que se
hace el dueño:

- ¿esto viene mejorando o empeorando?
- cuando corregimos los 12 ingresos fuera de plazo de julio, ¿cuánto subió?
- ¿el score estaba en 100 el día que cerramos agosto, o subió después?

Un OSINFOR que pregunta «¿desde cuándo tienen stock negativo?» hoy se contesta
mirando registros de a uno.

## El problema de dónde sacar el dato

El score **se calcula en el cliente** (`hooks/use-ctp-compliance.ts`), juntando
cinco agregados que ya existen: `wood-entries?stats=1`, `ctp?saldos=1`,
`ctp?traza=1`, `ctp-ficha` y `ctp?section=produccion`. La fórmula en sí
(`ctpComplianceScore`) es pura y compartida, pero **el ensamblado de los counts
no**: vive en el hook.

Un cron que recalculara el score server-side tendría que reimplementar los cinco
agregados. Eso crea un **segundo score** que va a divergir del que ve el
operador — el mismo patrón que este módulo ya combatió tres veces (las tres
lecturas de una troza, los tres lectores de `estaFueraDePlazo`, `claveEspecie`).
Un libro fiscalizable no puede tener dos versiones de su propio cumplimiento.

## Decisión

**Se guarda lo que el panel ya calculó, no se recalcula.**

Cuando el panel de cumplimiento termina de componer el score del período, hace
un `POST` idempotente del snapshot del día. La serie que se grafica es,
literalmente, *lo que el libro dijo ese día* — imposible que diverja de lo que
el operador vio, porque es el mismo número.

Modelo `ForestCtpComplianceSnapshot`, único por `(tenantId, periodo, fecha)`:
guarda el score, las 5 categorías que restan y las 5 informativas. Un segundo
POST el mismo día **actualiza** (el operador corrigió algo y el score subió: lo
que vale es el último estado del día, no el primero).

## Lo que esto NO es, dicho de frente

**Sólo hay punto los días que alguien abrió el libro.** No es un cron: si nadie
entró el domingo, el domingo no existe en la serie. La UI lo dice con esas
palabras y el gráfico no interpola entre puntos lejanos — una línea recta sobre
un hueco de tres semanas afirmaría un dato que nadie midió.

Se aceptó a cambio de la garantía que importa: **cero duplicación de la
fórmula**. Un hueco visible es honesto; dos scores que no coinciden, no.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Cron nocturno recalculando server-side | Reimplementa 5 agregados ⇒ segundo score que diverge |
| Derivar la historia de `AuditLog` | El audit registra acciones, no el estado agregado del período |
| Guardar sólo el score (sin categorías) | «Bajó de 92 a 74» sin decir por cuál categoría no sirve para actuar |

## Consecuencias

- Migración: una tabla nueva, sin tocar ninguna existente. No hay backfill
  posible (el pasado no se puede reconstruir sin los agregados de ese día) y no
  se finge: la serie arranca el día que esto se despliega.
- `periodo` se guarda como la `key` del `CtpPeriod` (`mes-actual`, `todo`, …).
  Un snapshot de «mes actual» del 3 de septiembre habla de septiembre; el 3 de
  octubre, de octubre. Por eso la serie se lee siempre por `periodo` + `fecha`,
  nunca sólo por fecha.
- El POST es fire-and-forget: si falla, el panel no se entera y el operador
  tampoco. Guardar la historia nunca puede romper la pantalla que la produce.
