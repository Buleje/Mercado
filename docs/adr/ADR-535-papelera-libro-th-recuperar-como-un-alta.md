# ADR-535 — Papelera del Libro TH: recuperar una línea = un alta con las mismas reglas

- **Estado:** aceptado (2026-11-04). Sin schema (usa el `deletedAt` que ya existía).
- **Pedido por:** Brandon (04-11): «concentrate en mejorar mi sistema panel admin… integra funciones, mejoras y todo eso».
- **Relacionados:** ADR-125 (Libro TH), ADR-426 (baja lógica del plan), ADR-530 (respaldos del Libro CTP: recuperar sin pisar), ADR-305 (invariantes T1–T5).

## Contexto

Borrar una línea del LO-TH es soft-delete (`deletedAt`), pero ninguna pantalla mostraba lo borrado ni lo devolvía. Medido en Blas (04-11): 60 líneas borradas en 3 momentos (hora de Lima) — 28-09 06:24 (8, limpieza de datos de prueba), 06-10 20:17 (8: 4 talas + 2 trozados + 2 despachos) y 06-10 23:35 (44: 22 trozados + 22 despachos). Un borrado por error en el libro que fiscaliza OSINFOR no tenía vuelta.

## Decisión

1. **Recuperar = alta.** Cada línea vuelve a pasar, contra el libro de HOY y en UNA transacción, lo mismo que un alta: mes cerrado (P1), plan vivo, guía del sistema no anulada ni borrada, tala contra el censo de TODOS los planes (otro plan u otra especie → 422), DMC (T8) y cupo (T9) con la justificación y el motivo que YA llevaba en `observations` (nunca uno nuevo), T1–T7 con sus candados. Si hoy el plan que le tocaría (censo o fuente) no es el que tenía, no vuelve: se registra de nuevo.
2. **Conserva id y N.º** (el correlativo cuenta las borradas: nunca se reusó).
3. **De la fuente a la salida** (`ORDEN_DE_RECUPERO` = inverso del borrado). **Las hijas siguen a su fuente:** si la tala (o el trozado) pedida no vuelve y no hay otra viva, su trozado (o su salida) tampoco (`fuente_no_volvio`); si la fuente está en la papelera sin marcar, se dice su N.º para marcarla junto.
4. **Candados en el orden de siempre:** las filas pedidas `FOR UPDATE` por id (dos recuperos a la vez no cuentan ni auditan dos veces), los árboles ordenados y, si vuelve una tala, las filas de Tala antes del primer cupo.
5. **Vista previa exacta:** `POST ?vista=1` corre la misma transacción y la deshace (`SimulacionDeshecha`). Auditoría (`loth_linea_restaurar`), caché y censo («talado», plan por plan) van sólo después del commit real.
6. Sólo admin/dueño (los mismos que borran). Tope 300 líneas por pedido; la ruta tiene 300 s en `vercel.json`.
7. El grupo borrado por una limpieza de pruebas (`por` con «limpieza») se marca en la pantalla: no devolverlo.
8. **Aviso al celular al borrar mucho** (Brandon eligió «Aviso al borrar mucho», 04-11): 10+ líneas en un borrado en bloque (Secciones o todo un plan), o la 10.ª suelta en 10 minutos (una vez por racha), mandan un Telegram a los chats vinculados a ESE negocio: cuántas, quién, hora de Lima, secciones, m³ y «Papelera del libro». Después del commit y con `.catch(logger)`: un Telegram caído no frena un borrado (`lib/forestal/loth-aviso-borrado*.ts`).

## Alternativas descartadas

- **«Des-borrar» a ciegas** (`deletedAt = null`): devolvía duplicados — en Blas las 22 trozas del 06-10 23:35 ya están vivas con el código de su guía («1» → «1-0001»).
- **Tabla de respaldos aparte** (como ADR-530): el soft-delete ya guarda la fila entera; una tabla más duplicaba el dato.
- **Cambiarle el plan a la línea al recuperarla:** una línea del libro no se reescribe al volver; si su plan cambió, se registra de nuevo.

## Consecuencias

- En Blas hoy (vista previa, nada escrito): 0 de 44 del 06-10 23:35 vuelven (duplicados vivos); 0 de 8 del 06-10 20:17 (sus 4 especies no están en el registro de la plantación tras el borrado del censo de esa noche; 2 despachos con guía anulada); 5 de 8 del 28-09 podrían volver pero son datos de prueba.
- La papelera depende del soft-delete: un borrado físico futuro no aparece acá.
- Código: `lib/forestal/loth-papelera.ts` (puro, con test), `ForestLothDB.listarBorradas/recuperarLineas`, `app/api/admin/forestal/loth/papelera/route.ts`, `LothPapeleraModal` en el «⋯» del libro.
