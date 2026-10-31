# ADR-515 — La nota del día de asistencia vive en una tabla aparte

- **Estado:** aceptado (2026-10-23). Schema: `prisma/migrations/20261023d_asistencia_nota` (aditiva).
- **Pedido por:** Brandon (23-10): «en asistencia quiero para poner también motivo o nota para ponerlo sin poner presente ni nada, solo una nota».
- **Relacionados:** ADR-414/417 (colaboradores y asistencia), memoria `valor-de-enum-nuevo-rompe-cliente-viejo`.

## Contexto

`Asistencia.estado` es obligatorio: cada fila es una marca (Presente, Tardanza, Falta…). Para anotar «fue al banco» o «permiso médico» sin marcar nada no hay dónde. Volver `estado` opcional o sumar un valor `NOTA` al enum rompe al cliente Prisma viejo de producción, que lee la misma base compartida.

## Decisión

- Tabla nueva `AsistenciaNota` (`tenantId`, `colaboradorId`, `fecha` DATE, `nota` ≤ 300, `autor`), única por persona y día, con FK compuesta a `Colaborador(tenantId, id)`. El cliente viejo nunca la lee.
- `PUT/DELETE /api/rrhh/asistencia/nota` con los mismos roles y la misma ventana que marcar asistencia; colaborador de otro negocio = 404; nota sobre un día ya marcado = 409 (se edita en la marca).
- Al marcar el día, la nota pasa a `Asistencia.nota` en la misma transacción (si la marca trae nota, se juntan «A · B»); al quitar la marca vuelve como nota suelta.
- La nota no cuenta en presentes, tardanzas ni faltas.

## Alternativas descartadas

- `estado` opcional o valor `NOTA` en el enum: rompe al Prisma de producción.
- Guardarla en `Note`, en un campo personalizado o como marca borrada: parches sin integridad (sin unicidad por persona y día, ni FK).

## Consecuencias

- Las notas pueden contener datos de salud («permiso médico»): las ven sólo los roles que marcan asistencia (Ley 29733).
- Lectura de la hoja = marcas + notas sueltas del rango (2 consultas con índice `tenantId, fecha`).
