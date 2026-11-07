# ADR-506 — Personal eventual en Asistencia

- **Estado:** aceptado (2026-10-20). Schema: columna aditiva `Colaborador.eventual Boolean @default(false)`.
- **Pedido por:** Brandon (20-10): la gente de paso (chofer, ayudante del día) no debe llenar la lista todos los días; y quien lleva 14 días sin venir debe salir con «¿se retiró?».

## Decisión

1. **Qué es:** un colaborador `eventual` sale en la hoja de un día sólo si tiene marca ese día; si no, va a un grupo plegado «Eventuales» desde donde se le marca.
2. **Por qué columna y no puesto/estado:** el puesto describe el oficio (un chofer puede ser fijo o de paso) y el estado (`ACTIVO`, `LICENCIA`…) alimenta lo ganado y el cese; ambos tienen otro significado y mezclarlos rompería reportes. Una columna booleana es independiente de los dos y reversible.
3. **«Última vez que vino»:** la hoja devuelve `ultimaVino: Record<colaboradorId, FechaKey>` calculado con UNA query agrupada (`MAX(fecha)` de marcas vivas con estado PRESENTE, TARDANZA o MEDIO_DIA, toda la historia). La pantalla decide con él el «¿se retiró?» a los 14 días.

## Consecuencias

- Lo ganado, adelantos y pagos NO cambian: `eventual` sólo gobierna qué se ve en la hoja.
- Filas existentes: `false` (nada cambia hasta que alguien lo marca).
- La marca se edita con `action: "editar"` y se acepta en el alta (default false).
