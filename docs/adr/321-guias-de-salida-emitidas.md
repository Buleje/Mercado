# ADR-321 — Las guías de salida, todas juntas

- **Fecha:** 2026-07-31
- **Estado:** aceptado
- **Contexto:** GTF de salida (ADR-309) · verificación SNIFFS (ADR-312) · port de `~/proyectos/appforestal` (`gtf-emitidas`)

## El problema

Una GTF de salida vive dentro de su despacho. Para reimprimirla hay que acordarse
de qué línea era, abrirla y desplegar la sección. Eso alcanza cuando se acaba de
emitir; no alcanza cuando el fiscalizador pide *"las guías de julio"*, cuando el
chofer perdió el original, o cuando hay que saber **cuántas quedaron a medio
llenar** — que es el número que decide si el mes se puede cerrar tranquilo.

`CtpGuiasBandeja` ya existía, pero es la bandeja **del otro lado**: guías del
monte que todavía no ingresaron al CTP. No se reemplazan.

## La decisión

Una vista que **deriva**, no que guarda: una guía emitida ES un despacho con
`gtfNumber`. Una tabla propia crearía dos verdades sobre el mismo documento, que
es justo lo que el libro evita en todos lados.

| Regla | Por qué |
|---|---|
| Despacho **sin número** no aparece | todavía no emitió nada; listarlo lo haría parecer un documento |
| Anulada ≠ incompleta | una guía anulada ya no vale; mezclarlas hace perseguir un fantasma |
| Verificada exige número **y** fecha | un número de SNIFFS sin fecha no dice si la guía sigue vigente |
| Número repetido en dos despachos vigentes → aviso | puede ser una guía que ampara varias líneas, o un typo que rompe la cadena. Se informa, no se bloquea |

KPIs: emitidas · listas para imprimir · a medio llenar · **sin verificar en
SERFOR** (lo primero que mira un control). Filtro "sólo las incompletas" y
búsqueda por número, destino, destinatario o placa.

## Consecuencias

- Vista **Trazabilidad → Guías emitidas** (tecla `e`), sólo lectura. Imprimir y
  completar siguen viviendo en el despacho: un solo lugar donde se edita.
- Verificado contra el tenant real: 27 guías · 1 lista · 1 a medio llenar · 25 anuladas.

## Referencias

- `lib/forestal/guias-emitidas.ts` (puro) · `__tests__/forestal-guias-emitidas.test.ts` (11 casos) · reusa `faltantesGtf()` de `ctp-gtf-datos.ts` como single source de "qué le falta a una guía".
