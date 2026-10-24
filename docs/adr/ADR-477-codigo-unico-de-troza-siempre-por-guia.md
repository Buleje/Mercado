# ADR-477 — Código único de troza SIEMPRE por guía (reemplaza §2 de ADR-474)

- **Estado:** aceptado (2026-10-08). Construido y probado: `__tests__/codigo-unico-troza.test.ts`, `__tests__/loth-importar-guia-codigo-unico.test.ts`, `__tests__/forestal-loth-codigo-unico-db.test.ts`, ajustes en `forestal-loth-importar-guia.test.ts` y `forestal-medidas-desde-guia.test.ts`; ensayo + `--aplicar` + `--revertir` en `main` con guías importadas con el importador viejo; ensayo READ ONLY en Blas. Sin cambio de schema.
- **Relacionados:** ADR-474 (su §2 queda reemplazado), ADR-461 (importar guías ya despachadas), ADR-305 (T1-T5 del Libro TH), ADR-450 (la troza recuerda su `trozadoId` al pasar al CTP). Contrato: `.claude/autonomo/contratos-2026-10-08/codigo-unico.md` (K1).
- **Pedido (Brandon, 08-10):** el código único tiene que verse SIEMPRE y uniforme en cada guía: «12A-0001».

## Contexto

- ADR-474 renombraba sólo cuando el código ya había salido con otra guía del mismo permiso («12A (0000002)»). La 1.ª guía entraba con el código crudo y la 2.ª con paréntesis: dos formas para lo mismo y un libro que no se lee igual.
- Medido (08-10, sólo lectura): 0 de 253 `trozaCode`, 0 de 43 `codificacion` del CTP y 0 de 117 items de GTF terminan en `-\d{4,7}` o `-\d{3}/\d{4,7}` → el sufijo es inequívoco y el código de la guía se puede derivar sin guardarlo. Blas tiene 22 trozas importadas con el código crudo (GTF 019-001-0000001); `main` no tenía ninguna viva.

## Decisión

1. **Toda troza que ENTRA al Libro TH desde una guía** (importar guía ya despachada, ADR-461) entra con `trozaCode = <código en la guía>-<correlativo corto>`, aunque no se repita.
   - Correlativo corto = último tramo del N° sin ceros a la izquierda, mínimo 4 dígitos (crece): `019-001-0000001` → `0001`, `019-001-0090002` → `90002`.
   - **Nivel 2** (otro talonario con el mismo correlativo ya usó el nivel 1): `12A-019/0001`. **Nivel 3**: `12A-019-001/0001`. Si también: choque como antes. El generador sólo propone lo que se parte de vuelta en el mismo código (`candidatosCodigoUnico`).
   - Sin código («-»): sigue `SC-<registro>-<n>` (ya es único por guía).
   - Módulo puro y client-safe: `lib/forestal/codigo-unico-troza.ts` (`correlativoCorto`, `candidatosCodigoUnico`, `partirCodigoUnico`, `codigoDeLaGuia`). Con el N° de la guía sólo se parte si el correlativo (y la serie) son los de ESA guía.
2. **El código de la guía no se guarda en la línea: se deriva** (`codigoDeLaGuia`). Además `ForestGtf.items[].codigoGuia` se escribe SIEMPRE que difiera de `code` (`codigosDeLaGuia`), y lo imprimen la hoja SERFOR y la Relación.
3. **La casilla de ADR-474 sigue** (P6): si el código DE LA GUÍA ya salió (despacho con su N°) con OTRA guía del MISMO permiso —crudo o con su sufijo—, la troza entra `renombrada` (aviso `troza_renombrada`, `repiteGuia`) y la importación exige `confirmaRenombres` (`renombre_sin_confirmar`). Sin esto se pierde la alarma natural de T1: la misma troza física en dos guías ya no choca por código y OSINFOR vería su volumen dos veces.
4. **Otro permiso** con el mismo código de guía (crudo o con sufijo) sigue siendo `conflicto` (P3: la clave (permiso, código) es su propio ADR + security).
5. **Compatibilidad hacia atrás** en la revisión: la troza registrada a mano en el permiso sin salida → `ya_trozada` con su código (P1: no se renombra, puede tener etiqueta); la guía importada antes con el código crudo → `ya_trozada` sobre esa línea; la guía nueva ya importada → `ya_trozada` con su código único (no suma dos veces a la tala). **Anulada y vuelta a emitir** (revisión 08-10): anular la guía anula sólo el despacho y «62B-0014» vuelve al stock; si la guía nueva trae «62B» y en el MISMO permiso hay un Trozado con ese código de guía, sin salida viva, del mismo árbol y de la misma especie → `ya_trozada` sobre esa línea; si hay más de uno (o de otra especie) → `renombrada` con casilla. Un N° que no da correlativo de 4 a 7 dígitos → `conflicto` (nunca entra con el código crudo). El formato «12A (0000002)» sólo se lee.
6. **Parsers:** `arbolDeCodificacion`, `arbolesParaTrazar`, `arbolDeTroza` y el emparejado flexible con la ficha SERFOR (`medidas-desde-guia`) quitan el sufijo primero: «1-0001» es del árbol 1, «12-A-019/0001» del 12. El código CRUDO de la guía no se parte (`arbolDeCodificacion(c, { crudo: true })` en `trozasDeLaGuia`): «P1-0234» y «P1-0235» de una guía son dos árboles. Un QR viejo «/verificar/1» sigue abriendo por el árbol; «/» del nivel 2 viaja como `%2F` (probado con curl: 200 con la cadena).
7. **Lo que NO cambia:** T1-T4 (siguen atando por `trozaCode`, con `≤`), el despacho manual desde el libro (P1), el texto de las observaciones (Deshacer las compara exactas).
8. **Migración (sin schema):** `ForestLothCodigoUnicoDB` (`lib/db/forest-loth-codigo-unico.db.ts`) + `scripts/migrar-codigo-unico-adr-477.mjs`. Ensayo en una tx READ ONLY (nunca `SET SESSION`), plan puro (`lib/forestal/codigo-unico-migracion.ts`) con huella sha256; `--aplicar` con el respaldo y la huella total: una tx por guía, `FOR UPDATE ORDER BY id`, recalcula y aborta si la huella cambió, bloquea por choque de los tres niveles, mes cerrado, CTP atado con el código viejo o la troza también en otra salida; `updateMany` con el código viejo en el WHERE; items con `codigoGuia`; talas referenciales renombradas por nombre; auditoría `loth_codigo_unico_migrado`/`_revertido`; invalida `forest-loth:`/`forest-gtf:`. Migrar y revertir toman el turno del importador (`tomarTurnoDeImportacion`, esperándolo). `--revertir` sólo si cada línea tiene hoy el código que dejó la migración, el viejo sigue libre y nada nuevo cuelga del único; los items se revierten con el mapa al revés sobre los de hoy. `--aplicar` se niega si el ensayo no cuadró (`problemas` del respaldo). Blas: sólo con el OK de Brandon (P7).

## Consecuencias

- El libro, el kárdex, las etiquetas, el QR y el CTP muestran el código único; la hoja SERFOR y la Relación, el de la guía (`codigoImpreso`).
- Las trozas de un permiso dejan de chocar entre guías por construcción; la salvaguarda contra el doble conteo es la casilla, no el choque.
- Etiquetas ya impresas con «1»…«22» en Blas abren igual por el árbol, pero el papel dirá «1» y el libro «1-0001» (P2: reimprimir si las hay).

## Lo que NO resuelve

- La clave (permiso, código) entre permisos ni el T4 por `treeCode` de todo el negocio (P3).
- El despacho manual desde el libro: su código lo pone la persona (P1).
- Un código tipeado a mano que termine en `-dddd` se tomaría por único sin el N° de la guía (0 hoy).

## Alternativas descartadas

- Guardar el único en `despachoCode` (vacío 22/22): partiría la identidad de la troza en dos columnas; T1/T3/Deshacer atan por `trozaCode`.
- Correlativo de 4 fijos: chocaría cada 10 000 guías (main ya tiene 0090002).
- Columna nueva `codigoGuia` en `ForestLothEntry`: schema innecesario mientras el sufijo sea inequívoco.
- Separador «.» en vez de «/» (P4): no hizo falta, `%2F` abre.
