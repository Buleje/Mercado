# ADR-518 — La ficha del Directorio es la entidad; sus planes se atan en el alta del plan

- **Estado:** aceptado (2026-10-26). Sin schema: usa `ForestContrato.titularId/planId` y `ForestPlan.contratoId`, que ya existen. No se borra ni se migra ningún dato.
- **Pedido por:** Brandon (26-10): «en directorio se pone información del ente (SAC, comunidad, etc.), sólo la información como RUC y todo eso, mas no se puede poner a qué plan de manejo, sus permisos […] eso se hace en crear nuevo plan de manejo; ahí se vinculará el directorio con el plan de manejo […] porque entidad sólo hay 1 pero de esa entidad se pueden saber muchos planes de manejo distintos».
- **Relacionados:** ADR-425 (un titular, varios permisos: esto mueve su pantalla de la ficha al alta del plan), ADR-421 (`ForestContrato`), ADR-426 (identidad del plan).

## Contexto

La ficha del Directorio (`ForestParty`, `CtpParteModal`) pedía, en el paso «Proveedor», el título habilitante, la resolución, el plan de manejo, la vigencia y la ARFFS, y además montaba la lista editable de permisos de ADR-425. Una comunidad es UNA ficha pero tiene N planes, cada uno con su título, su área y su vigencia: los campos sueltos de la ficha guardaban uno solo y el alta del plan los volvía a pedir.

Medido el 26-10 (READ ONLY): fichas con datos de permiso anotados — main 23, Blas 13, op-qa-ui 11. Permisos (`ForestContrato`): main 7, Blas 7. Planes: main 2, Blas 5.

## Decisión

1. **La ficha guarda sólo la entidad**: documento, nombre, representante y su DNI, dirección, pago, papeles propios, código de CTP. Los campos de permiso salen del formulario.
2. **«Planes de manejo y permisos de este titular»** en la ficha, de SÓLO LECTURA (`ctp-parte-planes.tsx` + `lib/forestal/directorio-planes.ts`): junta los permisos con `titularId` = la ficha y los planes del Libro TH atados por `contratoId`; lo que coincide sólo por nombre se muestra como «por el nombre». Cada fila: código, documento, área, vigencia, estado y «Ver en el Libro TH».
3. **«Crear plan de manejo para este titular»** abre el alta del plan con el titular puesto (pedido en memoria de módulo, vence a los 2 min, `hooks/loth-plan-alta-pedida.ts`). Sólo se copian datos de ENTIDAD (titular, representante, región, ARFFS).
4. **Al guardar el plan queda ATADO a la ficha** (`loth-plan-atar-titular.ts`): con permiso elegido se le pone `planId` (y `titularId` si no tenía dueño); sin permiso se crea uno con el código del plan (`titularId` + `planId`) y el plan recibe `contratoId`. Si ese código ya es un permiso de otra ficha o de otro plan, no se toca. Sin código no se inventa permiso. Si el titular se cambia a mano, ya no se ata.
5. **Nada se borra**: lo que la ficha anotó del permiso se ve en «Anotado antes en la ficha» con «Pasarlo a un plan» (abre el alta con esos datos). Las columnas siguen y sus lectores (ingreso de madera, `completarPlanDesdeDirectorio`, libreta, importadores, salud del Directorio) siguen leyéndolas como respaldo.

## Alternativas descartadas

- **Borrar o migrar las columnas viejas de `ForestParty`**: regla «nada se borra»; los importadores de guías todavía las escriben y el ingreso las lee.
- **Seguir editando permisos desde la ficha (ADR-425 tal cual)**: dos lugares para el mismo papel; el área y la vigencia quedaban vacías (0 de 6 en Blas el 21-09).
- **Copiar el título viejo de la ficha a todo plan nuevo**: un plan nuevo de la misma comunidad es otro papel; copiarlo solo fabricaría un título falso. Va sólo con «Pasarlo a un plan».

## Consecuencias

- La GTF no cambia: la del CTP lee `ForestCtpFicha`, la del LO-TH lee plan/permiso; ninguna lee los campos de permiso de la ficha.
- La barra de salud del Directorio deja de pedir el título si la ficha tiene planes en la lista.
- Una ficha abierta encima de otro formulario (selector del Directorio, `aboveModals`) muestra la lista sin botones de navegación, para no perder lo que se llena abajo.
- `CtpPartePermisos.tsx` queda sin montar (no se borra).
