# ADR-402 — El permiso declarado del asiento

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — «en el campo de N° de permiso quitale ese candado y que también se pueda
  editar ese campo».
- **Depende de:** ADR-401 (corregir un asiento sin romperlo), ADR-394 (existencia de apertura),
  ADR-393 (un lote, un permiso).

## Contexto

El editor de una corrida (ADR-401) mostraba el **N° de permiso** con un candado y este texto:

> Esta corrida no consumió madera de ninguna guía —es un inventario de apertura—, así que no hay
> ingreso del que heredar el permiso. Registrarlo necesita un campo propio del asiento, que hoy no
> existe.

Era cierto, y por eso el candado. Una corrida **no tiene permiso propio**: hereda el de la madera
que consumió, y ese dato vive en `WoodEntry.originCode` de sus guías (`titularOrigen` se arma
leyendo los consumos). Pero una **existencia de apertura** (ADR-394) es madera anterior al libro:
no consumió ninguna guía, así que no hay ingreso del que heredar nada. Para esas corridas —que en
el libro de Pucallpa son la mayoría de lo importado— el permiso quedaba en blanco **sin ningún
lugar donde escribirlo**, y la columna «N° Permiso» decía «—» para siempre.

Un campo que no se puede llenar en la pantalla donde se lo pide es un dato que el libro nunca va a
tener. Ante una fiscalización, «de qué título habilitante salió esta madera» es de las primeras
preguntas.

## Decisión

### 1. `ForestCtpEntry.originCode` — el permiso DECLARADO del asiento

Columna nueva, nullable. Es el permiso que alguien declara a mano para una corrida que no tiene de
dónde heredarlo.

### 2. La guía sigue mandando cuando existe

Se lee **sólo si no hay permiso heredado**:

```
titularOrigen = heredados.length > 0 ? heredados : (originCode ? [originCode] : [])
```

No es un override: si la corrida consumió guías, el origen legal es el de esas guías y punto. Dos
fuentes para el mismo dato sería el libro diciendo dos cosas según quién lo lea — exactamente lo
que la trazabilidad no puede permitirse. Vale para las dos lecturas que hoy derivan el permiso de
una corrida: `productosDisponibles` y `list()`.

### 3. Se corrige por `corregir_linea`, y NO es un campo del registro

Entra en `CAMPOS_CORREGIBLES` pero **fuera** de `CAMPOS_CORREGIBLES_DEL_REGISTRO`, o sea: se puede
escribir con el período abierto y el asiento vivo, aunque la corrida ya esté despachada.

Dos razones, y ninguna es comodidad:

1. Donde este campo existe, hoy es un **hueco**, no una afirmación: nada lo está citando, porque
   hasta ahora no había manera de escribirlo.
2. El permiso de una guía ya se corrige con esos mismos candados —`completarGuia` lo completa sobre
   ingresos validados y `corregirGuia` (ADR-401) lo sobrescribe—. Ser más estricto con el permiso
   del asiento dejaría **el mismo dato con dos reglas** según dónde viva.

El rastro es el de siempre: `ctp_linea_update` con el antes y el después.

### 4. La pantalla dice dónde va a quedar lo que se escribe

El candado se va, y en su lugar el modal explica el destino, que no es el mismo en los tres casos:

| Caso | Dónde se guarda | Qué dice la pantalla |
|---|---|---|
| Con una guía (o varias con el mismo permiso) | en la(s) guía(s) | «lo heredan **todas** sus corridas, no sólo ésta» |
| Sin guías (existencia de apertura) | en el asiento | «se guarda **en el propio asiento** y vale sólo para ella» |
| Con guías de **permisos distintos** | en todas las guías | «lo que escribas los **unifica**; si de verdad son dos títulos, corregí cada guía desde Ingresos» |

El tercer caso antes también estaba bloqueado. Se abre porque bloquear no evitaba el error —el
libro quedaba igual de mal— y ahora al menos avisa qué va a pasar.

## Consecuencias

- Una existencia de apertura puede declarar su título habilitante, y ese permiso aparece en la
  columna «N° Permiso», en el filtro por permiso y en los KPIs que lo usan (ADR-400).
- Aparece una asimetría deliberada: el permiso se corrige con la corrida despachada; la especie no.
  El criterio es de dónde salió el dato, no cuán importante parece.
- El campo puede quedar mal cargado sin que ninguna invariante lo note: no participa de I1–I5. Es
  un dato declarativo, como el `originCode` del ingreso.
- Un permiso **heredado** no se puede pisar desde el asiento. Si está mal, se corrige en la guía —
  que es donde lo van a buscar el resto de las corridas y el fiscalizador.
- Sigue faltando lo que el ADR-401 dejó pendiente: relleno masivo con vista previa y deshacer por
  `ForestCtpCorreccion`.

## Alternativas

- **Dejar el candado y mandar a Ingresos.** No hay ingreso al que ir: la corrida no consumió
  ninguna guía. Era mandar a una pantalla que no puede resolverlo.
- **Escribirlo en `materiaPrimaRef` u `observations`.** Sin migración, pero mete un dato de origen
  legal en un campo de texto libre: nadie lo podría filtrar ni exportar como permiso, y el próximo
  que lea esa referencia no sabría qué es.
- **Que el asiento pise siempre a la guía.** Da dos verdades sobre el mismo origen — el problema
  que el libro justamente evita.
