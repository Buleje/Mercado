# ADR-530 — Respaldos del Libro CTP: foto comprimida en la base y recuperar sin pisar

- **Estado:** aceptado (2026-11-03). Schema: `prisma/migrations/20261103a_ctp_respaldos_adr530` (tabla nueva `ForestCtpRespaldo`, aditiva).
- **Pedido por:** Brandon (03-11): «quiero función que permita tipo guardar un respaldo de todo de libro ctp todo, ingresos, consumos, lotes, salidas, producción todo en general y guardar eso en alguna pestaña para usar o tener eso de respaldo para cuando se elimine usar esa versión, eso impleméntalo bien».
- **Relacionados:** ADR-139 (cierre del mes: candado y huella), ADR-326 (consumo por pieza, T1), ADR-396 (código único de lote de aserrío), ADR-134 (puentes N:M del libro). Plan medido: `docs/PLAN-respaldos-libro-ctp-2026-11-03.md`.

## Contexto

No existía respaldo del libro: `app/api/cron/auto-backup` solo contaba ventas. Varios caminos borran de verdad o sueltan datos sin rastro: vaciar el libro (`ForestCtpPurgaDB.vaciar`), anular un día de producción, dar de baja una corrida (suelta sus trozas: `consumidaEnId`/`despachadaEnId` = null) y editar una corrida (consumos, origen de salidas y reprocesos se borran y se crean con id nuevo). El 02-10 un «ensayo con rollback» vació el libro de `main` y solo se recuperó a mano.

Medido el 03-11: el libro entero de Blas son 174 filas ≈ 153 kB de JSON (QA forestal 234 ≈ 205 kB); comprimido, ≈ 25-35 kB por respaldo.

## Decisión

1. **Foto en una tabla propia** (`ForestCtpRespaldo`): `datos` = gzip de `{ version, columnas, tablas }` con TODAS las filas del libro del negocio (vivas y dadas de baja), leídas en una transacción `RepeatableRead`. `conteos` por tabla para la lista sin descomprimir; `huella` (sha256) para no repetir un diario idéntico. Tablas y orden de inserción: `TABLAS_RESPALDO` en `lib/forestal/ctp-respaldo-tipos.ts`.
2. **Pestaña «Respaldos»** en Cumplimiento, junto a «Cerrar el mes»: guardar ahora (con nota), descargar `.json.gz`, comparar y recuperar.
3. **Comparar** con hoy, por corrida / salida / ingreso / lote: borrada · de baja · cambiada · nueva.
4. **Recuperar SOLO lo borrado o dado de baja, sin pisar**: inserta con el id original y `skipDuplicates`; deshace bajas. Bloquea (con el motivo en palabras del libro) lo que tocaría un mes cerrado, una troza que ya usó otra corrida, un código de lote repetido entre vivos, consumos de una corrida editada después (contaría la misma madera dos veces) o una columna obligatoria nueva sin valor. Si algún saldo de corrida queda negativo, no se recupera nada. La huella del libro que vio el operador al comparar se exige al recuperar (si cambió, 409 y se vuelve a comparar).
5. **Automáticos**: cada noche (solo si cambió) y siempre antes de vaciar, anular un día o cerrar el mes; si ese respaldo previo falla, la acción no corre. Poda: 30 diarios, «antes de» 90 días (mínimo 10); los manuales tienen tope 20 y nunca se podan solos. El diario corre en `app/api/cron/ctp-respaldos` (no en `auto-backup`, que recorre productos y clientes de todos los negocios) y, mientras producción siga en la versión de julio, lo dispara un temporizador local de la PC (`ctp-respaldos-noche.timer`, 21:00).
6. Roles: ver la lista admin, almacenero y dueño; guardar, comparar, descargar y recuperar solo admin y dueño (`RUTAS_PANEL`). Recuperar y descargar se auditan.

## Alternativas descartadas

- **«Volver todo atrás»** (reponer el libro entero a la foto): borraría el trabajo posterior, desharía guías ya declaradas a SERFOR, rompería la huella de los meses cerrados y es el mismo patrón que vació `main` el 02-10.
- **Guardar el respaldo en Documentos** (archivo en el bucket): se puede borrar desde la carpeta, la ficha vive en otra tabla y comparar obligaría a bajar el archivo entero; la tabla propia da la foto en la misma transacción y la lista en <1 kB.
- **Copia semanal a la PC** (parte 4 del plan): Brandon no la eligió.

## Consecuencias

- 60 respaldos de Blas ≈ 2 MB en la base; la poda los mantiene acotados.
- Toda tabla nueva del libro debe sumarse a `TABLAS_RESPALDO` (y a la foto) o no se respalda.
- Un mes cerrado nunca se reabre por recuperar: lo de ese mes se ve en la comparación pero queda bloqueado.
- Si producción se actualiza a la versión nueva, apagar el temporizador local (`systemctl --user disable --now ctp-respaldos-noche.timer`) para no duplicar el diario (el cron de `vercel.json` lo cubre).
