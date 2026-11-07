# ADR-324 — Los apartados 1 y 2 del LO-CTP salen de datos reales

- **Fecha:** 2026-08-01
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP · formato RDE N° D000025-2023-MIDAGRI-SERFOR-DE
- **Relacionado:** ADR-311 (paridad de casilleros, dejó los dos apartados pendientes) · ADR-313 (retrozado) · ADR-312 (la troza como pieza trazable) · port de `~/proyectos/appforestal` (`lop`, `proveedores`, `lotes`)

## El problema

El formato oficial no son sólo las cuatro secciones de movimientos y los tres
cuadros resumen: pide además dos **apartados**. Buleje los emitía vacíos, y en
los dos casos el dato ya estaba en la base:

1. **Apartado 1 · Fuente de origen o procedencia de la madera.** La hoja se
   armaba con los títulos habilitantes de la *Ficha del CTP* —que son los del
   propio centro, no los de la madera que compra— y con el titular, el RUC, la
   resolución y la procedencia **en blanco**. Peor: el casillero (5) de la
   Sección 1 se llama "N° de fuente de origen/procedencia" y **no había registro
   al que apuntara**. Un número que no referencia nada.

2. **Apartado 2 · Retrozado.** La hoja decía literalmente *"El retrozado NO se
   registra en este módulo"*. El ADR-313 lo había implementado tres días antes:
   `WoodEntryTroza.trozaOrigenId`, la validación por Huber, el descarte, el lock
   sobre la madre. El libro negaba lo que la base tenía.

3. Como consecuencia de (2), los casilleros **(7) a (10) del Cuadro Resumen 1**
   —retrozado m³/N° y de-retrozado m³/N°— salían siempre vacíos.

## La decisión

Una lib pura, `lib/forestal/loctp-apartados.ts`, con tres funciones que
consumen **el export a Excel y la pantalla** (`CtpApartadosSerfor`): si cada uno
calculara lo suyo, el libro que se presenta y el que se mira en pantalla podrían
decir cosas distintas del mismo período.

### 1. La fuente se identifica por la fuente, no por el proveedor

`derivarFuentes()` agrupa por **resolución + código de título + titular**, no por
proveedor: el mismo aserradero puede comprarle al mismo titular madera de dos
concesiones distintas, y en el libro son dos fuentes.

Los datos salen de `WoodEntry.serforGtf` —la ficha oficial tal como la publicó
SERFOR— porque es ahí donde consta el titular real de la concesión. Sin ficha se
cae al proveedor de la guía.

**El N° se asigna por la fecha del PRIMER ingreso de cada fuente**, no por el
orden en que llega el listado. Igual que el folio (ADR-311): si el N° de una
fuente cambiara porque entró un ingreso de otra, el libro dejaría de casar con lo
ya presentado.

> **Corregido el 2026-08-01 (auditoría adversarial).** La primera versión numeraba
> por orden de aparición del array. Como el listado viene por `entryDate desc`, un
> ingreso nuevo de una fuente nueva se llevaba el N° 1 y corría a todas las demás:
> el libro de julio y el de agosto se contradecían sobre quién era la fuente 1 — y
> la Sección 1 referencia ese número. Ahora es cronológico, con desempate por
> clave, y no depende de cómo llegue el array.
>
> **Alcance de la estabilidad:** el N° es estable **dentro de un período**. El
> Apartado 1 numera las fuentes *del libro que se está presentando*, así que el
> mismo titular puede ser el 2 en el libro de agosto y el 1 en el histórico. Eso
> es propio del formato —cada libro presentado trae su propio Apartado 1— y no un
> efecto del orden del array, que era el bug.

### 2. `rucInstancia` NO es el RUC del titular

Es el de la **ARFFS que registra la guía** ("RUC de la Instancia que Registra").
Ponerlo en el casillero (6) declararía que el bosque es de la autoridad. El dato
real vive en el campo crudo `campos["RUC del titular"]`, con fallback al
documento del proveedor.

### 3. Sin nada que la identifique, no se inventa una fuente

Un ingreso sin titular, sin código de título y sin resolución **no genera fila**
y queda sin N°. Mismo criterio que el resto del libro: un dato que no existe va
vacío, nunca en cero ni en un placeholder que parezca completo.

### 4. El casillero (5) sigue siendo el N° declarado en la guía

El puente al Apartado 1 va en una columna extra **después de la 13**, junto a
CITES y proveedor. La numeración oficial no se corre: es lo que el fiscalizador
busca con el dedo.

### 5. El retrozado NO mueve el saldo del Cuadro Resumen 1

Cortar una troza en tres no crea ni destruye madera, y el consumo se atribuye
contra el m³ del **ingreso** (invariante I2), no contra cada pedazo. Sumar
(9)−(7) al saldo contaría la misma madera dos veces.

Los dos pares de casilleros existen para que el fiscalizador pueda **seguir el
corte**, no para cambiar el total. Por eso:

- **La madre se cuenta UNA vez** en (7)/(8) aunque salgan tres pedazos.
- **Los pedazos** van en (9)/(10).
- El **descarte** se informa aparte y se marca en la fila del apartado: un
  volumen que se esfuma sin explicación es lo que un fiscalizador marca.

### 6. Los diámetros del Apartado 2 van en centímetros

Es como los publica SERFOR en la guía. El ERP de referencia los rotula "(m)" y
después imprime `73` — o el rótulo miente o el número está mil veces mal.

## Consecuencias

- La hoja "Apartado 1 · Fuentes" lista las fuentes del período con sus 7
  casilleros + guías y m³ que ampara cada una; los títulos del propio CTP quedan
  al pie, separados y rotulados como tales.
- La hoja "Apartado 2 · Retrozado" lista los 11 casilleros reales del período.
- El Cuadro Resumen 1 muestra (7)-(10) en pantalla y en Excel.
- Endpoint nuevo: `GET /api/admin/forestal/trozas?retrozos=1&from&to`. Filtra por
  `fechaRetrozo` —el retrozado es una operación del patio con fecha propia: un
  pedazo cortado en agosto de una troza que entró en julio es del libro de
  agosto— y cae a `createdAt` para los pedazos viejos sin fecha.
- La portada del libro declara cuántas fuentes y cuántos cortes hubo, en vez del
  cartel de "no registrado".

## Lo que NO se hace

- No se numeran fuentes que el ingreso no identifica.
- No se pisa el `originSourceNumber` que declara la guía con el N° derivado.
- No se toca el saldo de trozas con el retrozado.

## Referencias

- `lib/forestal/loctp-apartados.ts` · `__tests__/forestal-loctp-apartados.test.ts`
- `lib/forestal/ctp-export.ts` (hojas "Apartado 1 · Fuentes" y "Apartado 2 · Retrozado")
- `components/admin/forestal/CtpApartadosSerfor.tsx` (vista Cuadros SERFOR)
