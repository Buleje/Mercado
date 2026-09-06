# ADR-392 — De dónde salió cada casillero: lo que dice el papel vs. lo que escribió una persona

- **Fecha:** 2026-09-06
- **Estado:** aceptado
- **Pedido por:** Brandon — «poder rellenar los campos vacíos, y cuando se rellene y se
  muestre en la próxima, que se ponga un color diferente para hacer saber que es dato
  rellenado manualmente». Aplicado a la Ficha de guía, a Ingresos y a Editar.

## Contexto

El formato oficial del LO-CTP (RDE D000025-2023) tiene **27 casilleros** por ingreso.
En la planta real casi ninguno llega completo: la ficha de la guía QA-CUADRE-5600181
muestra **5 de 27**, y la 019-001-0000011 que reportó Brandon, 7 de 27.

Dos cosas medidas antes de decidir:

1. **El aviso de la ficha promete algo que la UI no cumple.** Dice «se pueden completar
   editando el ingreso», pero `CtpIngresoEditModal` tiene **8 campos** —fecha, GTF,
   código de origen, especie, científico, producto, volumen, notas— contra los 27 del
   formato. Los otros 19 no se pueden completar desde ninguna pantalla.

2. **La mitad del problema ya está resuelta en el schema.** `WoodEntry.serforGtf`
   guarda, textualmente, «la ficha OFICIAL tal como la publicó SERFOR (…) para poder
   reimprimir la GTF y **probar el origen de cada dato** sin depender de que el servicio
   de ellos esté arriba el día de la fiscalización». Falta la otra mitad: qué escribió
   una persona, cuándo y quién.

**Por qué esto no es cosmético.** Un fiscalizador de OSINFOR pregunta de dónde sale cada
número. «Lo dice la guía» y «lo transcribió el almacenero de memoria» son dos respuestas
distintas, y hoy la pantalla las muestra idénticas. Marcar la diferencia no es un color
lindo: es poder sostener el libro.

## Decisión

### 1. Una columna nueva, `WoodEntry.camposManuales Json?`

```jsonc
{
  "gtfSeries":  { "por": "almacen@bodega", "el": "2026-09-06T14:22:10.000Z" },
  "gtfDate":    { "por": "almacen@bodega", "el": "2026-09-06T14:22:31.000Z" }
}
```

Clave = el campo del formato. Valor = quién lo escribió y cuándo. Nada más: el VALOR
vive donde siempre vivió (su columna o `gtfDatos`), acá sólo va la procedencia.

**Por qué no derivarlo comparando contra `serforGtf`.** Se evaluó y se descartó: sirve
sólo para guías traídas de SERFOR. Una existencia de apertura o una guía cargada a mano
—como la 019-001-0000011 del reporte— no tiene `serforGtf`, así que TODO quedaría marcado
como manual y el marcado dejaría de informar. Además no guarda quién ni cuándo, que es
justo lo que se le pide al libro.

**Por qué no dentro de `gtfDatos`.** Ese campo está documentado como «declaraciones de un
documento ajeno: se guardan enteras». Meterle metadata nuestra rompe esa semántica y
ensucia el JSON que se reimprime como papel.

### 2. El editor cubre el formato completo

`CtpIngresoEditModal` pasa de 8 campos a los 27 casilleros, agrupados igual que la ficha
—documento y origen · proveedor · propietario · destinatario · transporte— para que el
que carga vea la misma estructura que el que revisa.

### 3. Lo escrito a mano se ve distinto, siempre

Un casillero con procedencia manual se muestra con marca propia (tono `--data-info` y el
dato de quién/cuándo al pasar el mouse), en la Ficha, en Ingresos y en el editor. Lo que
vino del documento se muestra como hasta ahora.

**No se marca en el papel imprimible.** La GTF que se imprime es la reproducción de un
documento oficial; agregarle marcas nuestras la vuelve un documento distinto.

## Consecuencias

- Migración **aditiva**: columna nullable, sin backfill. Los ingresos existentes quedan
  con `camposManuales = null`, que significa «no sabemos» y no «todo oficial» — para no
  afirmar procedencia de datos cargados antes de esta decisión.
- Va por el pooler con `migrate resolve --applied`; `migrate deploy` está roto en este
  repo (ver memoria `migracion-pooler-y-resolve-quirurgico`).
- El marcado depende de que quien edite quede registrado: el editor tiene que mandar el
  usuario, no sólo el valor.
- Escribir un casillero **no** cambia el estado de la guía ni su validación. Completar no
  es validar: la regla sigue siendo la del libro —el faltante se declara, no se bloquea
  (invariantes I1-I5, `≤` nunca `==`).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Derivar de `serforGtf` | No sirve en guías sin ficha oficial (la mayoría hoy); no guarda quién ni cuándo |
| Marcar sólo en la sesión | Se pierde al recargar; el pedido dice explícitamente «que se muestre en la próxima» |
| Una tabla `CampoManual` aparte | Una fila por casillero por ingreso: 27× las filas para un dato que siempre se lee junto con su ingreso |
| Columna por casillero | 27 columnas nuevas de metadata; el formato oficial cambia y el schema se vuelve inmanejable |

## Referencias

- RDE N° D000025-2023-MIDAGRI-SERFOR-DE — formato del LO-CTP
- ADR-134 (modelo del ingreso) · ADR-347 (casilleros por ingreso) · ADR-350 (ficha de la guía)
- `lib/forestal/guia-ficha.ts` — el mapa casillero → dato, single source de la ficha
