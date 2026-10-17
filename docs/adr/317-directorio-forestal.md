# ADR-317 — El directorio forestal: las partes dejan de ser texto libre

- **Fecha:** 2026-07-31
- **Estado:** aceptado
- **Contexto:** GTF de salida (ADR-309) · ingresos del Libro CTP (ADR-312) · port de `~/proyectos/appforestal`
- **Relacionado:** ADR-309 (los datos oficiales de la guía), ADR-311 (paridad LO-CTP)

## El problema

La Guía de Transporte Forestal pide, **por cada viaje**, la identidad de cuatro
actores —propietario, destinatario, transportista, conductor— más la placa del
vehículo. En un aserradero real esos cuatro se repiten viaje tras viaje: el mismo
comprador de Pucallpa, el mismo camión, el mismo chofer.

Hasta acá se tipeaban de cero cada vez, y el proveedor del ingreso vivía como
`WoodEntry.providerName`: un string libre. El costo no es la velocidad, es que
**los datos no se pueden cruzar**:

> "MADERERA DEL ORIENTE SAC", "Maderera del Oriente" y "MAD. ORIENTE" son tres
> proveedores para cualquier consulta y uno solo para la realidad.

Cuando un fiscalizador pide *"todo lo que le compraste a X"* o *"todas las guías
del camión A2C-123"*, esa pregunta no tiene respuesta.

AppForestal resolvió el síntoma con listas de semillas hardcodeadas en el
frontend (`DESTINATARIO_SEEDS`, `TRANSPORTISTA_SEEDS`). Sirve para demostrar,
no para operar.

## La decisión

### 1. Dos modelos: `ForestParty` y `ForestVehiculo`

`ForestParty` es una persona o empresa con **roles**, no con tipo:

```prisma
roles String[]  // proveedor · destinatario · transportista · conductor
```

Array y no una columna, porque la misma empresa suele ser proveedor **y**
destinatario, y el dueño-chofer es transportista **y** conductor. Una fila por
rol duplicaría el mismo RUC — el problema que se vino a resolver.

`ForestVehiculo` va aparte: no tiene documento ni dirección, tiene placa,
configuración del MTC y capacidad. Su clave natural es la **placa normalizada**
(sin guiones, en mayúscula): `A2C-123`, `a2c123` y `A2C 123` son el mismo camión.

### 2. El documento es la identidad → guardar es *upsert*, no *insert*

`@@unique([tenantId, docTipo, docNumero])`. Guardar una parte con un RUC que ya
existe **actualiza** esa fila y le **suma** los roles nuevos. Los NULL son
distintos entre sí en Postgres, así que las partes sin documento (existen: un
comprador informal) conviven sin chocar.

### 3. ⚠️ Un upsert por documento NO puede vaciar lo que no le mandaron

Esto se descubrió verificando contra la API, no leyendo el código:

> alta del destinatario con dirección → guardarlo como proveedor desde otra
> pantalla → **la dirección quedaba en `null`**

La barra de la guía sólo conoce los campos de su pantalla. Si el update pisa con
`null` lo que no vino, cada alta rápida borra el trabajo de la anterior. La regla
quedó así:

| Cómo llegó | Qué se aplica |
|---|---|
| Con `id` (edición explícita en el Directorio) | **todos** los campos — sólo ahí se puede vaciar uno |
| Sin `id`, match por documento/placa | **sólo los campos con valor** (`soloConValor`) |

### 4. El autocompletado reusa lo que ya existe

RUC → `/api/sunat/lookup-ruc` · DNI → `/api/reniec/lookup`. Son endpoints que el
sistema ya tenía, con rate-limit y caché propios: no se abrió un proxy nuevo.
Para CE y pasaporte no hay padrón público y el botón no aparece.

### 5. El orden lo decide el uso, y el uso se cuenta al guardar

`usos` + `ultimoUso` ordenan la libreta: el comprador de todos los martes queda
arriba sin que nadie lo configure. Se incrementa **cuando la guía se guarda**, no
al abrir el desplegable — mirar y cambiar de idea no es usar.

Es un contador de conveniencia, no un dato de compliance: si el `PATCH` falla,
se loguea y la guía —que ya se guardó— no se entera.

### 6. Baja lógica, nunca borrado

`deletedAt` + `activo`. Las guías ya emitidas nombran a esa parte; borrarla de
verdad dejaría huérfano justo el rastro que un fiscalizador va a cruzar. Los
selectores de la guía sólo ofrecen activas; la vista de administración las
muestra todas.

## Consecuencias

- Una vista nueva en el Libro (**Gestión → Directorio**, tecla `g`) y una barra
  de tres gestos —*elegir de la libreta · traer del padrón · guardar*— en cada
  sección de la guía.
- `WoodEntry.providerName` sigue siendo la fuente del ingreso: el directorio lo
  **completa**, no lo reemplaza. Migrar los strings existentes a filas es un paso
  posterior y explícito.
- Los faltantes se calculan **por rol** (`faltantesParaGuia`): a un destinatario
  sin dirección le falta el punto de llegada; al mismo, como transportista, no.
  Se muestran; no bloquean guardar — el criterio de todo el módulo.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Reusar `Supplier` del ERP | Es el proveedor de la bodega (productos, precios, órdenes de compra). Un titular forestal tiene título habilitante y no vende SKUs. |
| Una tabla por rol | El mismo RUC entraría 2-3 veces; fusionar después es peor que no separar. |
| Deducir por nombre parecido | Uniría a dos personas distintas. Sin documento no se fusiona: se duplica y se avisa. |
| Semillas en el front (AppForestal) | No es dato del tenant, no se puede cruzar, no sobrevive al deploy. |

## Referencias

- D.S. 018-2015-MINAGRI art. 172 — quién emite la guía y por qué propietario ≠ emisor.
- RDE 122-2015-SERFOR-DE — formato, original + 2 copias.
- `lib/forestal/directorio.ts` (puro) · `lib/db/forest-directorio.db.ts` · `__tests__/forestal-directorio.test.ts`.
