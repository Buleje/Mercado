# ADR-314 — Catálogos del negocio maderero

- **Fecha:** 2026-07-30
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP · cierra el *"forma de presentación"* pendiente del ADR-311
- **Relacionado:** ADR-311, ADR-312, ADR-313

## El problema

Los desplegables del libro los habíamos escrito nosotros: *"Madera aserrada"*,
*"Madera escuadrada"*, *"Tablillas"*… Diez opciones inventadas con criterio de
programador, no de aserradero.

Un CTP en operación (AppForestal) tenía otros: **16 variantes de MADERA ASERRADA**
con la nomenclatura del SNIFFS, **19 formas de presentación** y **4 líneas de
producción**. Y una GTF real confirma el estilo: `MADERA EN ROLLO` · `TROZAS` ·
`Metros Cúbicos` — MAYÚSCULAS, con la variante entre paréntesis.

Además, la *"forma de presentación"* del formato oficial no existía en el schema:
la guía la declara y se perdía al registrar.

## La decisión

Un módulo, `lib/forestal/loctp-catalogos.ts`, con la procedencia de cada dato
escrita en el archivo:

| Catálogo | Origen | Confianza |
|---|---|---|
| `MADERA EN ROLLO`, `TROZAS`, unidad | GTF `1-19-0313629` de SERFOR | **verificado contra el documento** |
| 16 variantes de MADERA ASERRADA | CTP en operación (feb–mar 2026) | usado en producción real, **no contrastado con la RDE** |
| 19 presentaciones | idem | idem |
| 2 líneas nuevas | idem | idem |
| meta de rendimiento 56% | idem | **operativa, no legal** |

Los tres catálogos dejan salida libre (`OTRO`, `Sin declarar`): rechazar un valor
que la autoridad sí admite sería peor que aceptar uno de más.

### Decisiones concretas

**1 · `presentacion` en `WoodEntry` y en `ForestCtpEntry`.** Con backfill desde la
ficha de SERFOR ya guardada — los 3 ingresos cargados desde SERFOR quedaron en
`TROZAS`; los cargados a mano quedaron en `NULL`, sin inventarles nada.

**2 · Se sugiere, no se impone.** Elegir *paquetería larga* pone `PAQUETES`, pero
el operador puede cambiarlo y entonces el producto ya no lo pisa: un producto que
suele ir en paquetes puede salir suelto una vez, y el libro tiene que poder decirlo.

**3 · Entrada ≠ salida.** `MADERA EN ROLLO` es materia prima y no aparece en el
desplegable de producción/despacho: ofrecerla dejaría registrar una salida de
trozas como si fuera producción.

**4 · `LP` y `LRE` conservan su código.** El Cuadro Resumen 3 agrupa por ese valor;
renombrarlos partiría en dos las corridas ya registradas. `LREM` y `LPC` se suman
con códigos propios.

**5 · El rendimiento se compara contra la meta.** 38% parece bien hasta que se sabe
que lo normal ronda 56%. Verde ≥56%, ámbar por debajo, **rojo por encima de 100%**
—de 1 m³ de troza no salen 1.2 m³ de tabla: eso es un error de carga, no una
corrida excelente—. No bloquea ni entra en el score: depende de la especie y del
equipo, y castigarlo enseñaría a inflarlo.

**6 · `juzgarRendimiento` recibe PORCENTAJE.** La primera versión aceptaba fracción
y porcentaje y adivinaba por el tamaño; con `1.2` no hay forma de saber si son 1.2%
o 120%. La ambigüedad se elimina en vez de parchearse.

## Consecuencias

- `PT_POR_M3 = 424` para mostrar pie tablar. El libro sigue calculando en m³.
- Los registros viejos conservan sus tipos antiguos: **no se migran**. Son texto
  libre en el schema y reescribirlos cambiaría actas ya presentadas.
- Si algún día se consigue el anexo de la RDE D000025-2023, hay que cotejar los
  catálogos no verificados.

## Lo que NO se hace

- No se convierte a pie tablar para guardar.
- No se rechaza un valor fuera del catálogo.
- El rendimiento no entra en el score de cumplimiento.
