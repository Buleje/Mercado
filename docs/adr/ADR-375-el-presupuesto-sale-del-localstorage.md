# ADR-375 — El presupuesto sale del localStorage, y «mucho» se mide contra la propia historia

- **Estado:** aceptado
- **Fecha:** 2026-08-10
- **Ámbito:** `lib/db/expense-budget.db.ts`, `app/api/expenses/presupuesto/`, `components/admin/compras/historial/PresupuestoPanel.tsx`, `prisma/schema.prisma` (`ExpenseBudget`)

## Contexto

El Historial de Gastos ya decía cuánto se gastó (ADR-374). No podía responder
las dos preguntas que siguen:

**1. «¿Me pasé?»** El presupuesto vivía en
`localStorage["bodega-budget-config"]` (`BudgetVsRealTab`), así que sólo existía
en el navegador donde alguien lo había escrito: el dueño no lo veía desde el
celular y el cajero no lo veía nunca. Peor: el reparto por categoría lo generaba
una función `estimateBudget(cat)` con números fijos, de modo que la comparación
«presupuesto vs real» comparaba contra un techo que **nadie había decidido**.
`BudgetAlertWidget` tenía el mismo problema con otro default (`monthlyBudget = 5000`).

**2. «¿Esto es mucho?»** Un total suelto no responde nada. S/2.100 de luz es
normal o es una fuga según lo que se pagó los meses anteriores, y esa
comparación no estaba en ninguna pantalla.

## Decisión

**1. `ExpenseBudget`** — una fila por `(tenantId, category)` con el techo
mensual. Monto 0 borra la fila: dejar un cero haría que la UI leyera
«presupuesto de S/0» y pintara todo en rojo. El único de la tabla es un
`@@unique([tenantId, category])`: dos filas para «Alquiler» dejarían la
pregunta «¿cuál es el presupuesto?» sin respuesta.

**2. Semáforo con umbrales explícitos**: verde hasta el 80% del techo, ámbar
hasta el 100%, rojo pasado.

**3. «Atípico» se mide contra la propia historia de la categoría**, no contra un
número redondo. Tres condiciones, cada una tapando un falso positivo distinto:

| Condición | Qué evita |
|---|---|
| `actual > promedio + 2σ` | que cualquier subida cuente |
| `actual > promedio × 1.2` | que en una categoría clavada en S/100, S/105 sea «muchas sigmas» |
| ≥ 3 meses previos **con gasto** | que una categoría estrenada el mes pasado salte sola: los ceros de los meses en que no existía inflan la dispersión |

El promedio y el desvío **excluyen el mes en curso**: incluirlo acerca el mes a
sí mismo y esconde justo el salto que se busca, y además el mes está incompleto.

**4. La serie mensual devuelve un punto por mes aunque no haya gastos.** Un mes
ausente del gráfico miente por omisión.

**5. Cuenta lo mismo que el Historial**: `recurring = false`. Incluir las
plantillas de gastos fijos haría que el presupuesto se viera superado sin que
nadie hubiera pagado nada (ADR-374).

## Consecuencias

- El techo es del negocio, no del navegador: se fija una vez y lo ve todo el
  que entre al panel.
- `BudgetVsRealTab` y `BudgetAlertWidget` siguen con sus fuentes viejas
  (localStorage y el default de 5000). **Migrarlos queda pendiente** — son
  ahora la única lectura del presupuesto que no coincide con esta.
- La alerta de atípico es deliberadamente conservadora. Se prefiere no avisar a
  avisar de más: un rojo falso enseña a ignorar la lista entera (la lección de
  los siete rojos falsos del libro CTP).
- Ocho tests cubren los umbrales, incluida la categoría nueva que **no** debe
  saltar.

## Alternativas descartadas

- **Un solo techo mensual global** en vez de uno por categoría. Es lo que ya
  había y no sirve para decidir: «gastaste S/4.000 de S/5.000» no dice dónde
  recortar.
- **Guardarlo en `Settings` como JSON.** Evitaba la tabla, pero repite
  exactamente el patrón que el ADR-374 acaba de desarmar: datos de negocio
  serializados donde la base no puede consultarlos.
- **Marcar atípico con un porcentaje fijo (ej. +30%).** Trata igual a una
  categoría estable y a una que siempre salta; el desvío estándar es lo que
  distingue una fuga de la variación normal de esa categoría.

## Referencias

- ADR-374 — la plantilla de gasto fijo no es plata gastada.
- `.claude/rules/verificacion-de-verdad.md` §4 — la tolerancia sale de cómo se
  mide en el mundo real, no del epsilon.
