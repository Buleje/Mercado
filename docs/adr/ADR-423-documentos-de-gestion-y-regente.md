# ADR-423 — Los cinco documentos de gestión forestal, y el regente que los firma

- **Fecha:** 2026-09-21
- **Estado:** Aceptado
- **Área:** Forestal · LO-TH · vista Plan de manejo
- **Fuentes primarias (verificadas 2026-09-21):**
  - **Directiva de Supervisión de Títulos Habilitantes con Fines Maderables**, RJ N° 001-2018-OSINFOR
  - **Reglamento para la Gestión Forestal**, D.S. 018-2015-MINAGRI (arts. 54-56)
  - **RDE N° 264-2019-MINAGRI-SERFOR-DE** (formato del LO-TH)

## Contexto

El alta de un plan de manejo era un `<select>` con tres siglas —`PO`, `PMFI`, `DEMA`— y los
mismos doce campos para las tres. Tres problemas:

1. **Faltaban dos.** La Directiva de OSINFOR enumera los planes de manejo forestal: Plan General
   de Manejo Forestal, Plan de Manejo Forestal Intermedio, Plan Operativo y Declaración de
   Manejo. El **PGMF** no existía en el formulario. Y las **plantaciones forestales**, que se
   gestionan desde la misma pantalla, tampoco.
2. **Las siglas no se explicaban.** No son variantes de un mismo documento: cada una corresponde
   a un **título habilitante distinto** —PGMF y PO a concesiones, PMFI a permisos en predios
   privados, DEMA a permisos en comunidades nativas y campesinas—. Quien llena el formulario
   reconoce el suyo por el tipo de bosque en el que trabaja, no por tres letras sueltas.
3. **El regente forestal no tenía dónde ir.** La Directiva lo define como «profesional
   responsable de la elaboración e implementación del Plan de Manejo», inscrito en el **Registro
   Nacional de Regentes** que conduce SERFOR, y con tres especialidades (maderables, no
   maderables, plantaciones). Es quien **suscribe el informe de ejecución junto al titular**,
   dentro de los 45 días de culminado el año operativo. No existía como campo.

## Decisión

**1. Cinco tipos, cada uno con su metadata normativa** (`lib/forestal/loth-tipos-plan.ts`):
sigla, nombre completo, para qué título habilitante es, si la norma espera regente, qué campos
no aplican y la vigencia típica —esta última **sólo como ayuda escrita, nunca autocompletada**:
las fechas salen de la resolución, no de un promedio.

**2. El formulario se acomoda al tipo.** Una plantación no tiene parcela de corta ni título
habilitante de bosque; un PGMF no tiene la parcela del año (esa es del Plan Operativo). Los
campos que no aplican **no se muestran y no se envían**: un campo escondido que igual viaja deja
datos que ninguna pantalla va a mostrar.

**3. El regente entra al modelo.** `ForestPlan.regenteName`, `.regenteRegistro`,
`.regenteEspecialidad` y `.representanteLegal`. Migración `20260921020000_forest_plan_regente`,
expand puro: cuatro columnas nullables, `NULL` = «no se cargó», distinto de «no tiene regente».

**4. Se avisa, no se bloquea.** Si el tipo exige regente y no se cargó, el formulario lo dice
—«es quien firma el informe de ejecución junto al titular»— pero **deja guardar**. Bloquear el
alta por un dato que se consigue después obliga a inventarlo, que es el problema que la
validación pretendía evitar.

**5. El plazo del informe de ejecución queda calculable.** `plazoInformeEjecucion()` traduce los
45 días calendario de la Directiva a una fecha y un estado. Todavía no se muestra en ninguna
pantalla: queda listo para el aviso.

## Consecuencias

**A favor**
- El formulario enseña la norma mientras se llena, en vez de asumir que quien lo usa ya la sabe.
- El expediente queda completo: el regente y su N° de registro son parte de lo que un supervisor
  pide, y antes no se guardaban en ninguna parte.
- Registrar una plantación deja de pedir datos de bosque natural que no existen.

**En contra / a vigilar**
- Cuatro columnas más en `ForestPlan`.
- `PLANTACION` entra como un `planType` más, pero una plantación **no es un plan de manejo de
  bosque natural**: comparte pantalla y modelo por conveniencia. Si crece (turnos de corta,
  densidad, especies por hectárea), va a pedir su propio modelo antes que más columnas acá.
- La vigencia típica es orientativa y puede envejecer si cambia la norma; está escrita en un
  solo lugar y como texto, no como cálculo.

## Alternativas consideradas

- **Dejar el `<select>` y documentar aparte.** Descartado: el problema no era que faltara
  documentación, era que el formulario no distinguía documentos distintos.
- **Bloquear el guardado sin regente.** Descartado por lo dicho en la decisión 4.
- **Un modelo aparte para plantaciones.** Descartado por ahora: hoy comparten todos los campos
  salvo dos. Se reevalúa cuando la plantación necesite datos propios.

## Verificación

En navegador, sobre el formulario real: los cinco tipos aparecen con su nombre y su título
habilitante; al elegir **Plantación** desaparecen «Título habilitante» y «Parcela de corta», y en
**PGMF** desaparece sólo la parcela; la especialidad del regente se sugiere sola
(`plantaciones` al elegir Plantación). Se creó un DEMA y se leyó **la fila en la base**:
`planType=DEMA`, `regenteName=Ing. QA Regente`, `regenteRegistro=RNR-9977`,
`representanteLegal=Jefe comunal QA`, `parcelaCorta=null`. 16 tests de las reglas de tipo y del
plazo de 45 días.

## Referencias

- `lib/forestal/loth-tipos-plan.ts` · `components/admin/forestal/LothPlanForm.tsx`
- `__tests__/loth-tipos-plan.test.ts`
- Migración `prisma/migrations/20260921020000_forest_plan_regente/`
- ADR-422 (medición en tala) · ADR-126 (vista Plan) · skill `serfor-osinfor-compliance`
