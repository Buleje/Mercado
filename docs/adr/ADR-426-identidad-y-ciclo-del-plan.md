# ADR-426 — El plan de manejo se corrige, se elimina y se reconoce

- **Estado:** aceptado
- **Fecha:** 2026-09-21
- **Contexto forestal:** Libro TH (LO-TH) · Plan de manejo (ADR-126/423) · Permisos (ADR-421/425)

## Contexto

Pedido de Brandon (2026-09-21), sobre la vista Plan del LO-TH:

> «la opción de también eliminar plan de manejo que haya ingresado, con su menú
> de "¿estás seguro?", y en el menú también tiene que tener los detalles de
> datos que alojó ese plan de manejo para saber qué estoy eliminando; también
> poder editar el plan de manejo creado a nuevos datos; y nuevos campos en el
> modal de nuevo plan de manejo para que tenga más detalles y observaciones,
> como poner el dueño o propietario, apodo y otros muchos para identificar
> mejor todo».

Lo que se midió antes de escribir código:

| Qué | Resultado |
|---|---|
| `DELETE /api/admin/forestal/plan` | **405** — no existía. Un plan cargado por error sólo se podía marcar «cerrado» y seguía en el selector |
| Editar un plan | El `PATCH` existía desde ADR-126, **sin una sola pantalla que lo usara** |
| Qué cuelga de un plan | `ForestPlanSpecies` · `ForestCensusTree` · `ForestLothEntry` · `ForestGtf` · `ForestContrato.planId` |
| Campos de identidad | El plan tenía `titularName` y `region`; nada de propietario, apodo, provincia, distrito, sector ni cuenca |

El caso que lo disparó es real y quedó en el tenant QA: un plan de prueba
(`QA-ADR425-RONDA2`) creado durante una verificación **no se podía sacar**.

## Decisión

1. **Nueve columnas aditivas y nullable en `ForestPlan`** (`alias`,
   `propietarioNombre`/`DocTipo`/`Doc`, `provincia`, `distrito`, `sector`,
   `cuenca`, `contratoId`) + índice `(tenantId, contratoId)`. Expand puro: el
   código viejo sigue andando sin leerlas.
   - **Ninguna es un casillero del formato oficial** y así está escrito en el
     schema: son los datos con los que se reconoce el papel en la oficina. El
     módulo no inventa campos oficiales (mismo criterio que el catálogo de ARFFS).
   - El **propietario** existe porque en un PMFI el permiso está a nombre del
     dueño del predio y quien opera es otro; sin el campo, ese nombre vive en un
     cuaderno.
   - `contratoId` cierra el vínculo con el permiso desde el otro lado:
     `ForestContrato.planId` ya existía (ADR-421) y ahora se puede ir del plan al
     papel sin recorrer todos los contratos. Ref. app-level, sin FK, igual que
     `caratulaId`.
2. **La región deja de ser texto libre y arrastra a provincia y distrito**: los
   25 departamentos de `lib/peru-ubigeo`, y la provincia/distrito encadenados —
   no se puede guardar una provincia que no pertenece a ese departamento.
   Cambiar de región limpia las dos. Sector y cuenca quedan libres a propósito:
   en la selva el punto se nombra por el caserío o la quebrada y no hay lista que
   los contenga.
3. **El mismo formulario hace el alta y la edición.** Un plan mal cargado se
   corrige, no se duplica. `desdePlan()` copia campo por campo y no con un
   spread: una copia a mano que se queda corta **borra** al guardar, porque lo
   que no llega viaja como `null` — es el error que ya costó dos rondas en RRHH
   y en el Directorio.
4. **Eliminar es baja lógica y dice antes qué se lleva.** El diálogo enumera lo
   que cuelga con el número real («Tiene 3 especies autorizadas, 612 árboles
   censados y 2 guías emitidas. Nada de eso se borra…») o admite que no hay nada
   («se puede sacar sin dejar nada suelto»). Los asientos y las guías son lo que
   se declara ante la ARFFS: no se tocan.
5. **Los indicadores del plan se pueden ocultar.** La ley interna dice «plegado
   sigue mostrando las cifras en una línea», y el dueño pidió poder esconderlas:
   se resuelve con tres estados recordados (detalle → cifras → oculto) y el
   control pegado a las cifras, no en la esquina opuesta.

## Consecuencias

- Migración aplicada contra el pooler en **modo session (:5432)**, que es lo
  único que resuelve en esta red (`DIRECT_URL` no resuelve por DNS), registrada
  como `20260921050000_forest_plan_predio_y_permiso` con su `rollback.sql`.
  Verificado leyendo `information_schema`: 39 columnas (eran 30), todas
  nullable y sin default, índice presente, **6 filas y 0 tocadas**; más un
  round-trip real en QA escribiendo y leyendo los 9 campos.
- **El guard va en los DOS sentidos.** `ForestPlanDB` rechaza un `contratoId`
  ajeno y `ForestContratoDB` rechaza un `planId` ajeno (`PlanAjenoError` → 400).
  Verificado contra el servidor: `{"planId":"plan-de-otro-negocio"}` responde
  `400 plan_ajeno` y el caso legítimo 200.
- **`contratoId` va sin FK a propósito.** El ensayo de la migración mostró que
  una FK habría aceptado un contrato **de otro tenant** (compara ids, no
  tenants): el aislamiento es app-level en este repo, así que el guard —contrato
  del mismo `tenantId` y vivo— vive en `ForestPlanDB`, no en el motor.
- **`ForestContrato.planId` (ADR-421) es 1:1 y lo real es 1 permiso : N planes**
  (una concesión aprueba un PO por año). `ForestPlan.contratoId` es el lado que
  soporta esa cardinalidad; el campo viejo queda como estaba, sin backfill
  (medido: 0 de 12 contratos lo tenían cargado).
- **`sector` ya existía**, pero en el KV `loth-cartografia:{tenantId}` y **uno
  por tenant**, con dos planes por tenant compartiéndolo. Ahora es por plan; no
  hubo datos que migrar (el único KV lo tenía vacío).
- Un plan eliminado desaparece del selector pero su `planId` sigue citado por
  asientos y guías: cualquier lectura futura de esas filas tiene que tolerar un
  plan dado de baja (el patrón ya existe con `deletedAt` en el resto del módulo).
- El formulario pasó de 4 bloques a 5 y de ~330 a ~560 líneas: la ubicación y el
  bloque de costeo salieron a sus propios archivos para no pasar el estándar.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Borrado físico del plan | Los asientos del libro y las guías lo citan; borrarlo deja huérfano lo que se declaró ante la ARFFS. |
| Un formulario aparte para editar | Dos formularios del mismo documento se desincronizan: el campo nuevo se agrega en uno solo. Ya pasó en este repo. |
| Confirmación genérica («esta acción no se puede deshacer») | No dice qué se pierde. Un plan con 600 árboles censados y uno vacío se ven iguales en ese cartel. |
| Provincia y distrito como texto libre | El mismo error que dejó «Constitucion» en el campo región de un plan real. |
| Declarar los campos nuevos como casilleros oficiales | No se verificaron contra el formato del LO-TH; el módulo prefiere decir que son internos a inventar una equivalencia. |

## Referencias

- `prisma/migrations/20260921050000_forest_plan_predio_y_permiso/` (+ `rollback.sql`) · `prisma/schema.prisma` (`ForestPlan`)
- `components/admin/forestal/LothPlanForm.tsx` · `LothPlanFormUbicacion.tsx` · `LothPlanFormCosteo.tsx` · `LothPlanView.tsx`
- `lib/db/forest-plan.db.ts` (`usosDelPlan`, `eliminarPlan`) · `__tests__/forestal-baja-del-plan-de-manejo.test.ts` · `__tests__/loth-plan-editar-no-pierde-campos.test.ts`
- ADR-425 (permisos del titular) · ADR-421 (el contrato como eje) · ADR-126 (plan de manejo)
