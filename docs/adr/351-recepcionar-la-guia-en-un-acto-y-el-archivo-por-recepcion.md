# ADR-351 — Recepcionar la guía es UN acto, y el archivo se ordena por recepción

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · Ingresos → GTF ingresadas
- **Relacionado:** ADR-339 (bandeja y archivo) · ADR-346 (la guía es la fila) · ADR-350 (la ficha)

## El reporte y lo que dijo la medición

Brandon: *«recepciono en Ingresos y en GTF ingresadas no aparece la guía»*.

**Primero medir.** En su tenant, los 10 asientos del libro **cumplían** el
predicado de «recepcionada», y la guía `019-0000016` (5 asientos, recibida ese
día) **sí aparecía** en el archivo. Reproduje el camino completo —recepcionar en
Ingresos, ir a GTF ingresadas— en los dos tenants: apareció las dos veces.

Queda dicho: **el fallo no se pudo reproducir**. Lo que sí encontró la revisión
son dos cosas que producen exactamente ese síntoma, y las dos estaban:

## 1. Recepcionar una guía eran N llamadas sueltas

La pantalla mandaba **un PATCH por asiento, en paralelo** (`Promise.allSettled`).
Con una guía de 5 especies son 5 transacciones independientes sobre las mismas
filas de `WoodEntryTroza`: si una falla —red, lock, un período que se cierra en
el medio— la guía queda **partida**, con asientos en la bandeja y asientos en el
archivo. El operador la busca en «GTF ingresadas» y la ve incompleta o no la ve.

Ahora hay **un solo pedido**: `PATCH /wood-entries { action: "recepcionar_guia",
ids, fecha }` → `WoodEntriesDB.recepcionarGuia()`, que recorre los asientos **en
serie y ordenados** y corta al primer error. La respuesta dice cuántos entraron y
cuál falló; un fallo parcial contesta **409**, no un 200 mudo.

En serie y no en paralelo a propósito: son dos o cinco asientos, no quinientos —
la latencia no es el problema, la consistencia sí, y en paralelo se pisan los
locks de las mismas piezas.

## 2. El archivo ordenaba por la fecha de la operación

«GTF ingresadas» abría con `entryDate desc`, igual que la bandeja. Una guía de
julio recepcionada hoy **cae al fondo de la lista**: el operador acaba de
recibirla, entra al archivo y no la ve — literalmente el reporte, aunque el
filtro esté bien.

`fechaRecepcion` entra a la whitelist de orden (y a `listPorGuia` como
`_max` del grupo: la guía se recibe de una vez) y **el archivo abre ordenado por
lo último recibido**. La bandeja sigue por fecha de la operación, que es como se
prioriza lo que falta recibir.

Y el toast dejó de decir sólo «recepcionada»: ahora dice **dónde quedó** —«está
arriba de todo en GTF ingresadas, y sus piezas ya se pueden llevar a la sierra
desde Consumos»—, que es la pregunta que le sigue.

## Verificación

En el tenant real de Brandon, con su caso exacto (guía de **2 asientos**):
registrada `QA-VERIF-RECEP` → **Recepcionar** en Ingresos → salió de la bandeja →
**apareció PRIMERA en GTF ingresadas**, arriba de `019-0000016`. Datos de QA
borrados después (2/2).
