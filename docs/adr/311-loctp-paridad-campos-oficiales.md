# ADR-311: Libro CTP — paridad de campos con el formato oficial del LO-CTP (SERFOR)

- **Estado:** Aceptado (2026-07-30)
- **Relacionado:** ADR-124 (especialización forestal), ADR-134 (ingresos y costos), ADR-135 (despacho → origen), ADR-136 (lotes), ADR-309 (GTF de salida)
- **Zona de peligro:** `prisma/schema.prisma` (`WoodEntry`, `ForestCtpEntry`), `lib/db/wood-entries.db.ts`, `lib/db/forest-ctp.db.ts`
- **Fuente normativa (verificada 2026-07-30 contra el PDF oficial, 64 pág.):**
  - **RDE N° D000025-2023-MIDAGRI-SERFOR-DE** — formato vigente del Libro de Operaciones de CTP (exigible desde el 20/01/2023).
  - **Guía Práctica para la implementación y uso del LO-CTP (SERFOR)** —
    `https://cdn.www.gob.pe/uploads/document/file/6264954/5511967-guia-practica-...pdf`
  - **Aplicativo LOE-CTP del MC-SNIFFS** — `https://sniffs.serfor.gob.pe/control/libroctp/` (v2.6.1 al 2026-07-30).

---

## Contexto

El Libro CTP del panel es sólido **hacia adentro**: trazabilidad ingreso → corrida →
despacho con las invariantes I1–I5, lotes, costeo y cierre de período. Pero al comparar
sus campos con el formato oficial del LO-CTP aparecen huecos en los **identificadores
con los que SERFOR y un fiscalizador cruzan los datos**.

El formato tiene **cuatro secciones** (Ingresos 13 casilleros · Consumos 11 · Producción 9 ·
Salidas 12) más tres cuadros resumen y dos apartados (Fuente de origen, Retrozado). Los
huecos, casillero por casillero:

| Casillero oficial | Sección | Antes |
|---|---|---|
| (1) N° de registro | las 4 | ❌ en Ingresos no existía (había orden por fecha, no folio); en Producción/Salidas ya era `lineNo` pero no se mostraba con ese nombre |
| (3) Tipo de documento (GTF/GRR/Otros) | 1 y 4 | ❌ siempre implícito "GTF" |
| (5) N° de fuente de origen/procedencia | 1 | ❌ |
| (10) Código que asigna el CTP | 1 | ❌ |
| (11) Unidad de medida | 1 | ❌ implícita m³ |
| (9) Código del producto | 4 | ❌ |
| (8) N° de lote | 3 y 4 | ⚠️ el lote existía (ADR-136) pero no llegaba al documento |

⚠️ **Dos suposiciones razonables salieron mal antes de leer la fuente literal**, y por eso la
numeración vive en un solo módulo con la cita al lado: se asumió que Ingresos tenía 12
casilleros (tiene 13, con el nombre científico como casillero propio) y que el (10) era "el
código de otro CTP" cuando en realidad es **el código que este centro le asigna al producto
que entra y marca físicamente sobre la madera**. La columna se había creado como
`originCtpCode`; se renombró a `ctpProductCode` el mismo día, antes de que tuviera datos.

El LOE-CTP del MC-SNIFFS es una SPA con login y **sin API pública** (verificado): no hay
integración automática posible hoy. Lo que sí hace falta —y es prerequisito de cualquier
export o carga masiva futura— es que el libro **guarde los mismos campos que el formato
oficial pide**, con el mismo nombre y el mismo número de columna.

## Decisión

1. **Cinco campos nuevos en `WoodEntry`**, nombrados por su casillero oficial:
   `libroNro` (1), `docType` (3, GTF|GRR|Otros), `originSourceNumber` (5),
   `ctpProductCode` (10), `unit` (11). `originCode`, que ya existía, queda documentado como
   el casillero (9) *Código de origen/procedencia* — el que traía desde el bosque.
2. **`libroNro` es el folio del libro**: correlativo por tenant, asignado dentro de la
   misma transacción del INSERT (`max + 1` con la fila bloqueada), igual que `lineNo` de
   `ForestCtpEntry` — que **ya era** el "N° de registro" de producción y despacho, sólo que
   no se mostraba con ese nombre.
3. **Dos campos nuevos en `ForestCtpEntry`** para la salida: `docType` (3) y
   `codigoProducto` (9). El lote (8) lo cubre `ForestProdLote` (ADR-136) y ahora **llega al
   documento**: `ForestLoteDB.list` expone las corridas de cada lote, así el export pone el
   N° de lote en la fila de la corrida (Sección 3) y en la del despacho (Sección 4, vía las
   corridas que lo respaldan).
4. **Producción no gana columnas de origen — y resulta que el formato tampoco las pide.**
   La Sección 3 tiene 9 casilleros y ninguno es de origen: la trazabilidad hacia atrás la
   dan la **Sección 2 (Consumos)** y el N° de lote. En el código eso ya existía como el
   puente `ForestCtpConsumo`, así que el export **deriva** los casilleros 3 a 7 de Consumos
   del ingreso consumido. Duplicarlos en la fila sería crear dos verdades sobre el mismo
   dato: la corrida diría un origen y el ingreso otro, que es lo que un fiscalizador busca.
5. **Los campos son opcionales y de texto libre, con ejemplo en el hint.** No se validan
   con expresiones inventadas: los formatos de código los emite la ARFFS y varían por
   región (la guía ejemplifica `RD-SD-549` como N° de fuente y `1-13-51-A-1` como código de
   lote/producto en salida). Un patrón adivinado rechazaría datos legítimos.
6. **Un validador puro dice qué falta**, no el schema. `lib/forestal/loctp-campos.ts`
   guarda las cuatro secciones con su numeración y marca por fila los casilleros que el
   formato exige — 10 en Ingresos (1-8, 11, 12) — y la UI lo muestra como aviso, **nunca**
   bloquea guardar. Mismo criterio que la trazabilidad: el libro admite huecos, el documento
   oficial no. Los dos códigos (9 y 10) NO son obligatorios: la guía permite omitir uno
   cuando existe el otro.
7. **El Código de CTP del centro no se repite por fila**: vive en la Ficha del CTP
   (`codigoCtp`, asignado por la ARFFS) y de ahí lo toma la portada del export. El campo
   nuevo `ctpProductCode` es otra cosa: el código que este centro le pone a **cada troza o
   paquete** que entra, para poder identificarla dentro de la planta.

## Consecuencias

- **El folio arranca en 1 para los ingresos existentes**, backfilleados por fecha de
  ingreso y `createdAt` para que el orden del libro sea el cronológico. Un libro cuyo folio
  no respeta el orden de los hechos no se puede presentar.
- **`unit` es informativo, no cambia la unidad base.** Todo el libro (saldos, invariantes
  I1–I5, costeo) se calcula en **m³** y sigue así: si un ingreso llegó declarado en kg o
  unidades, la cantidad se registra en m³ y `unit` conserva lo que decía el documento.
  Cambiar la unidad base sería otro ADR y tocaría todas las agregadas.
- **El plazo del CTP ya estaba bien (verificado 2026-07-30).** La guía oficial pide **2 días
  útiles** y `PLAZO_REGISTRO_DIAS` de `ctp-compliance.ts` **ya vale 2**, con la fórmula de
  días hábiles replicada en SQL (`FUERA_DE_PLAZO_SQL` en `wood-entries.db.ts`) para que el
  conteo y el filtro no divergan. Lo que encoda **15 días** es `loth-constants.ts`, que es el
  **otro** libro: el LO-TH del título habilitante (RDE 264-2019), con su propia norma.
  `.claude/rules/forestal-serfor.md` y el skill decían "el código dice 15 días" mezclando los
  dos libros: se corrigió en este mismo cambio.
- **El export oficial quedó alineado con el formato**, no sólo con nombres parecidos: una
  hoja por sección, cada cabecera con su número de casillero, el **folio** en el (1) —no la
  posición en la hoja, que cambiaría al filtrar el período— y las columnas propias (CITES,
  permiso, rendimiento) **después** de la última oficial para no correr la numeración. Lo que
  el formato no tiene casillero para recibir (proveedor, tipo de origen, destino) va en
  Observaciones, que es donde la guía dice que se consigna información adicional.
- **Un casillero vacío es mejor que uno inventado.** En Consumos, el (7) N° de fuente queda
  vacío si el ingreso no lo tiene (poner ahí la GTF sería declarar otro dato) y el (10) N° de
  lote va vacío porque lo que se consume son trozas, que no tienen lote: el lote de la
  corrida destino se crea *después* del consumo.
- **Los tres cuadros resumen y los dos apartados ya están** (2026-07-30, misma ronda):
  `lib/forestal/loctp-resumenes.ts` los calcula PURO y los consumen el export (5 hojas nuevas)
  y la pantalla (pestaña **Cuadros SERFOR** en el grupo Control). El mismo módulo para los dos:
  si la pantalla y el Excel mostraran números distintos del mismo período, ninguno serviría.
  El **stock inicial** de los cuadros se pide como el saldo al cierre del período anterior
  (un `to` = `from − 1ms`), no se asume cero. La **línea de producción** (LP/LRE) es un campo
  nuevo de `ForestCtpEntry` porque el Cuadro Resumen 3 se presenta por lote **y por línea**.
- **En los cuadros, un dato que no existe va vacío, no en cero.** Un 0 en un cuadro oficial
  afirma "no hubo movimiento". Las **piezas consumidas** van vacías porque el consumo se
  atribuye en m³ y no por troza; el **retrozado** va vacío porque el módulo no registra el
  Apartado 2; el **reproceso** también. Mismo criterio que el costo sin factura: `null`,
  jamás 0.
- **Con unidades distintas, el Resumen 3 da FACTOR de conversión y no porcentaje.** Un "73%"
  entre pies tablares y metros cúbicos no significa nada; la guía pide el factor (`pt/m³`).
- **Pendiente explícito:** el **Apartado 2 (Retrozado)** se declara en el export pero no se
  registra —haría falta un modelo propio con la fórmula de Smalian—; la **forma de presentación**
  del producto, que el formato pide entre paréntesis en el mismo casillero del tipo
  ("madera aserrada (larga angosta)"); y la **carga masiva** al LOE-CTP, que requiere la
  plantilla real que el aplicativo descarga con la sesión del titular — sin ese archivo,
  generar el import sería adivinar columnas.

## Alternativas descartadas

- **Guardar todo en un JSON `camposSerfor`.** Rápido, pero un campo que se filtra, se ordena
  o se valida no puede vivir en un JSON opaco: el folio y el tipo de documento se consultan.
- **Derivar el folio del orden de la consulta.** El folio tiene que ser estable: si se
  recalcula al listar, la fila que hoy es la 40 mañana es la 41 y el libro deja de casar con
  lo ya presentado.
- **Validar los códigos con regex.** Ver decisión 5: no hay un formato único verificable.

## Referencias

- `lib/forestal/loctp-campos.ts` (catálogos + validador puro) · `__tests__/forestal-loctp-campos.test.ts`
- `scripts/forestal-loctp-paridad-migration.sql` (idempotente, con backfill del folio)
