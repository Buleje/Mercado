# ADR-305 — Invariantes de cadena de custodia del Libro de Operaciones TH (T1–T5)

**Estado:** Aceptado · **Fecha:** 2026-07-20
**Relacionados:** ADR-125 (LO-TH), ADR-134/135 (invariantes I1–I5 del CTP), ADR-136 (lotes)

## Contexto

El Libro de Operaciones de Títulos Habilitantes (LO-TH, ADR-125) registra el
aprovechamiento en el bosque en 6 secciones: `tala → trozado → despacho_troza /
consumo_troza → producto_terminado → despacho_producto`. Es el registro que
**fiscaliza OSINFOR** hacia atrás (verifica el origen legal del título habilitante).

A diferencia del Libro CTP —que desde ADR-134/135 tiene las invariantes I1–I5
aplicadas app-level con LOCK dentro de la transacción— el LO-TH **no tenía ninguna
guarda de cadena de custodia**. `ForestLothDB.create` insertaba tras validar solo
el schema Zod. Consecuencia (verificada en código y schema):

- **Se podía movilizar la misma troza dos veces** (un `despacho_troza` y/o un
  `consumo_troza` con el mismo `trozaCode`) → doble conteo, el patrón de blanqueo
  que busca OSINFOR. El único freno era filtrar la troza del *dropdown* del form
  (`availableSource`), bypassable por API y con carrera (TOCTOU).
- **Se podía trozar más de lo tumbado** (Σ trozado del árbol > volumen de la tala).
- **Se podía despachar más producto del que se produjo.**
- El `lineNo` correlativo se calculaba `max+1` **fuera de transacción** → carrera
  podía repetir el número.

La Analítica (`detectAnomalias`) *detectaba* algunas de estas después del hecho,
pero un libro "bien hecho" las **impide**: el punto de un Libro de Operaciones es
que un fiscalizador no pueda encontrar la misma troza contada dos veces.

## Decisión

Espejar la filosofía del CTP (ADR-134/135) en el LO-TH: **invariantes app-level,
validadas y aplicadas dentro de UNA transacción con `FOR UPDATE` sobre el recurso
disputado.** Postgres no puede expresarlas (son agregadas y el aislamiento es
app-level, no RLS), así que si no se aplican en `ForestLothDB.create`, no se
aplican en ningún lado.

Modelo de datos: el LO-TH es una tabla **plana** (`ForestLothEntry` + discriminador
`section`), enlazada por **códigos** (`treeCode`/`trozaCode`), no por puentes N:M
como el CTP. Por eso las invariantes son de **cobertura/unicidad de código**, no de
suma sobre un puente.

| Inv. | Regla | Previene (lenguaje OSINFOR) |
|---|---|---|
| **T1** | una troza aparece en `despacho_troza ∪ consumo_troza` a lo sumo 1 vez | **misma troza movilizada 2 veces** (blanqueo) |
| **T2** | la troza despachada/consumida debe existir en `trozado` | despachar/consumir una troza fantasma |
| **T3** | `trozaCode` único en `trozado`; `treeCode` único en `tala` | cadena ambigua / doble tumba |
| **T4** | Σ trozado(árbol) ≤ volumen de la tala del árbol | trozar más de lo tumbado |
| **T5** | Σ despacho_producto(prod·esp·unidad) ≤ Σ producto_terminado | despachar más de lo producido |

Reglas de diseño heredadas del CTP:

- **El LOCK va sobre el recurso disputado, no sobre la fila que se escribe.** Dos
  altas que movilizan la misma troza son filas distintas: sin lock ambas leen el
  mismo saldo y las dos pasan. Se lockea la troza (T1/T2), el árbol (T4) o el
  producto (T5), ordenado por `id` para no deadlockear.
- **`≤`, nunca `==`** (donde aplica suma): forzar igualdad fabrica el fraude que
  previene. La merma normal hace que trozado < tala.
- **Errores de invariante → 422**, no 500 (`LothInvariantError` +
  `lothErrorResponse`, gemelos de `CtpInvariantError`/`ctpErrorResponse`). Es dato
  del operador que no cuadra, con mensaje en español accionable.
- **`lineNo` atómico**: se calcula bajo `FOR UPDATE` de la sección/carátula
  (`IS NOT DISTINCT FROM` para la carátula null).

### Fuera de alcance de este ADR (se tratan aparte)

- **T6 — movilizado ≤ autorizado por el plan** (exceso de aprovechamiento): sigue
  como *señal* de cumplimiento (`computeBalance.exceso` + panel Cumplimiento), no
  como bloqueo duro, porque depende del volumen autorizado del POA que el plan
  puede no tener cargado; bloquear al escribir atraparía correcciones legítimas.
- Sin migración de schema: las invariantes son de comportamiento, no de datos.

## Consecuencias

- **Positivas:** el LO-TH queda fiscalizable por construcción, igual que el CTP; la
  Analítica pasa de único guardián a segunda red. Se cierra el TOCTOU del `lineNo`.
  Auditoría completa (`loth-audit.ts`, gemelo de `ctp-audit.ts`) en
  create/annul/delete/carátula — antes 0 trazas de quién hizo qué.
- **Costo:** cada alta ahora es una transacción con 1–2 `FOR UPDATE`. Volumen de
  escritura del LO-TH es bajo (captura de campo), así que la serialización por
  recurso es aceptable. `LOTH_TX_OPTS` da 20s de timeout (pooler remoto).
- **Datos existentes:** las invariantes solo aplican a altas nuevas. Un libro con
  doble-movilización previa NO se corrige solo; la Analítica/Cumplimiento lo
  siguen marcando para subsanación manual (anular es visible, ADR-125).

## Alternativas descartadas

- **Constraint `@@unique` en Postgres** para T1/T3: no expresa T4/T5 (agregadas) ni
  el aislamiento por tenant app-level, y partiría la lógica en dos lugares. Se
  mantiene todo en la DB class, como el CTP.
- **Bloquear al leer el dropdown (statu quo):** UI-only, bypassable, con carrera.
  Es exactamente lo que este ADR reemplaza.
