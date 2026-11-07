# K7 — Cubicación comercial con descuentos, ligada a la cuenta (ADR-483)

> Contrato C-contrato, 2026-10-08. Extiende ADR-478 (K2, `cubicacion-cuenta.md`): **misma tabla, misma plata, mismos frenos**. No reescribe K2: lo generaliza. Ningún agente construye nada que no esté acá; lo que no está, va a «pendientes».

## 0. Pedido (Brandon)

- **(O) Libro TH › GTF** (`/admin?tab=loth-libro-operaciones&vista=gtf`): «poner y cubicar las trozas en método Oxapampina, porque en Smalian es según SERFOR pero como yo compro es en Oxapampina descontando huecos y demás, y vincular esa cubicación a alguna cuenta de algún cliente o proveedor».
- **(A) Libro CTP › Despacho** (`/admin?tab=ctp-libro-operaciones&vista=despacho`): «una cubicación aparte que es con descuentos, la madera aserrada igual pero con descuentos, que así vendo al cliente o me venden a mí, y puede ser de dos formas: cubicando uno por uno con la herramienta forestal cubicador de madera, u otro poniendo automáticamente el volumen y piestaje total y ponerle a cuánto cuesta cada especie o general».

## 1. Medido en Blas (SÓLO LECTURA, `node scripts/sql-lectura.mjs`, 08-10)

| Qué | Cifra | Dato o derivado |
|---|---|---|
| GTF del LO-TH (`ForestGtf`) | 3 filas: `019-001-0000001` ×2 (una viva, de trozas) y `019-0000002` | dato |
| Trozas de la GTF viva `019-001-0000001` (09-10-2025) | **22**, las 22 con código único y con D1/D2/largo | dato |
| Volumen DECLARADO de esa GTF (`volumenTotalM3`) | **20,3030 m³** (= Σ `items.volumeM3`) | dato (SERFOR, Smalian) |
| Smalian recalculado de D1/D2/largo | 20,3721 m³ (+0,069 por redondeo de cada troza) | derivado: **manda el declarado** |
| Oxapampina BRUTA con esas medidas (Ø prom. cm→pulg, m→pies, Ø²·L÷24,5) | **5 364,42 PT** | derivado (medidas de la guía, no de cinta) |
| Declarado en PT (20,3030 × 424, `PT_POR_M3`) | 8 608,47 PT → Oxapampina **−3 244,05 PT (−37,7 %)** antes de descontar huecos | derivado |
| ¿La GTF del LO-TH está en el Libro CTP? | **No**: `WoodEntry` de Blas sólo tiene `010-001-0000005…14` (7 guías). Hoy `guiaCanonica` daría 422 `GUIA_NO_ENCONTRADA` | dato |
| Despachos en el Libro CTP (`ForestCtpEntry section='despacho'`) | **0** (sólo 5 corridas de producción) | dato |
| `ForestCubicacionTrozas` de Blas | **0** | dato |
| Cubicaciones de aserrada guardadas (KV `ctp-cubicaciones:{tenant}`) | **3**, sin GTF: 50 / 154 / 496 piezas, 9 972,34 / 4 283,69 / 7 727,06 PT (21 983,09 PT) | dato |

Consecuencias: (O) tiene un caso real (22 trozas) que HOY no se puede ligar; (A) se prueba en **main** / QA forestal (`inversiones-agroforestales-blas-sociedad-op-qa-ui`): Blas no tiene un despacho.

## 2. Qué existe (reutilizar)

| Pieza | Dónde | Hoy |
|---|---|---|
| Tabla | `prisma/schema.prisma:5654-5707` `ForestCubicacionTrozas` | CUB-AAAA-NNNN, `formula` smalian/oxapampina, `diametros`, persona, `sentido`, `gtfNumber`, `trozas` Json congelado, `volumen`, `porEspecie`, `monto` (NULL = sin valorizar), estado, versión, idempotencia, imputación |
| CHECKs que NO ve Prisma | `prisma/migrations/20261008_cubicacion_trozas_cuenta/migration.sql:66-70` | **`formula_chk IN ('smalian','oxapampina')`** → hoy un `'tablar'` revienta el INSERT; `diametros_chk IN (1,2)`; `monto_chk` (aplicada ⇒ monto > 0) |
| DB class | `lib/db/forest-cubicacion-trozas.db.ts` (698 l.) | `list:316 get:338 detalle:349 guardar:375 editar:423 borrar:457 aplicar:474 anular:617`; `guiaCanonica:256` (422 si la guía de compra no está en `WoodEntry`); `exigirGuiaSinPlata:278`; **`aResumen:142` y `aplicar:~512` mapean toda fórmula ≠ oxapampina a smalian** |
| Lógica + Zod | `lib/forestal/cubicacion-cuenta.ts` (363 l.) | `trozaEntradaSchema:29`, `cuerpoCubicacion:44`, `guardar/editar/aplicar/anular…Schema:65-84`, `TrozaCongelada:89`, `LineaEspecie:101`, `CubicacionTrozasResumen:132`, `cubicarEnServidor:211`, `agruparPorEspecie:247`, `valorizar:266` (sólo por especie), `repartirFifo:290`, `huellaAplicar:339`, `fmtVolumen:348` |
| Fórmulas | `lib/forestal/cubicacion-trozas-formula.ts:67-100` (`RANGO_FORMULA`, `cubicarSegun`), `lib/forestal/cubicacion-oxapampa.ts:23,112` (`DIVISOR_OXAPAMPA=24.5`, `ptOxapampaDelCubicador`), `lib/forestal/cubicacion.ts:85,132` (`PT_POR_M3=424`, `cubicarPieza` → `{pieTablar, m3}`) | **no hay ningún descuento** (grep `hueco|rajadura|castigo|descuento` en cubicadores = 0) |
| Freno guía | `lib/db/guia-cubicacion.db.ts` (`filtroMismaGuia`, `cubicacionQuePagoLaGuia`) + 5 puertas de `costoTotal`; `__tests__/guia-cubicacion-puertas.test.ts` | compara con `mismoNumeroGtf`; lock `ForestCuentaDB.bloquearGuiasEnTx` |
| Rutas | `app/api/admin/forestal/cubicaciones-trozas/{route,_comun}.ts`, `[id]/{route,aplicar/route,anular/route}.ts`, `personas/route.ts` | `guardCubicacion`: CUBICAR = admin/almacenero/owner; PLATA = admin/owner sin bypass de manager; `spec:forestal:herramientas`; CSRF |
| UI trozas | `CubicadorTrozas.tsx` + `cubicador-trozas-{guardar,valorizar,precios,medidas,guardadas,…}.tsx`, `hooks/use-cubicaciones-trozas.ts` (`useCubicacionTrozas:151`, `usePersonasDeLaCuenta:186`, tipo `CubicacionTrozas:28`) | `GuardarEnLaCuentaModal({rows, formula, diametros, previaId,…})` con persona/sentido/fecha/guía; `ValorizarCubicacionModal({id, puedeAplicar,…})` |
| Planilla Oxapampa del CTP | `CtpCubicarOxapampaModal.tsx` (294) + `ctp-cubicar-oxapampa-fila.tsx` + `hooks/use-planilla-oxapampa` | celdas D1″·D2″·L′ tipo Excel: **patrón a copiar** para (O) |
| Aserrada | `lib/db/forest-cubicaciones.db.ts` (KV, tope 300), `app/api/admin/forestal/cubicaciones/route.ts`, `CubicacionRegistro` (`lib/forestal/cubicacion-registro.ts:32`: `precioPt`, `valor`, `piezas: PiezaCubicada[]`, `ctpEntryIds`, `gtfNumber`, `cliente` texto) | sin dueño, sin cuenta, sin descuentos |
| Despacho | `ForestCtpEntry section='despacho'`, `gtfNumber` (GTF de salida), `valorVenta Decimal?` (`schema:6628`, NULL = margen desconocido); menú de fila `CtpEntriesTabla.tsx:540-548` («Papeles del despacho», prop `onPapeles:127`); montaje `CtpEntriesView.tsx:787,2053,2218` | |
| GTF del LO-TH | `ForestGtf` (`schema:6458`): `items: GtfItem[]` (`lib/db/forest-gtf.db.ts:84`: `code`, `codigoGuia`, `species`, `diamMayorM`, `diamMenorM`, `lengthM`, `volumeM3`), `volumenTotalM3`, `planId`, `status emitida|anulada`, `titularName`; menú ⋯ `gtf-acciones-menu.tsx:56-125` (`opcionesGtf`, los modales se montan ahí, uno por fila) | |

## 3. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Una tabla**: se generaliza `ForestCubicacionTrozas` (aditivo). Misma secuencia CUB, mismo aplicar/anular/idempotencia/locks/auditoría (`ctp_cubicacion_trozas_*`, el detalle dice material y origen). Las rutas siguen en `/api/admin/forestal/cubicaciones-trozas/**` | reutilizar > crear; la plata ya está revisada (revisión M) |
| D2 | `material`: `troza` (default; las filas viejas no cambian) \| `aserrada`. `formula` suma `tablar` (aserrada: PT = esp″·ancho″·largo′÷12 × cant, con `cubicarPieza`). Aserrada guarda `diametros = 2` (sin sentido; 2 evita el rótulo «medido con 1 Ø») | |
| D3 | `origen` + `origenId`: `libre` \| `ctp` \| `loth` (`origenId = ForestGtf.id`) \| `despacho` (`origenId = ForestCtpEntry.id`). NULL en filas viejas = como antes. Con `loth`/`despacho` la guía **no se exige en `WoodEntry`** (se acaba el 422 de Blas) | |
| D4 | `modo`: `pieza` (uno por uno) \| `total` (rápida, sólo aserrada) | |
| D5 | **Descuentos**: por troza (Ø del hueco, largo que no sirve, castigo %), por pieza aserrada (piezas descartadas, castigo %) y del lote (por especie: % y/o `menos` en la unidad; general %). Se guarda bruto y neto. **Ningún descuento deja volumen < 0 ni neto > bruto**: 422 `DESCUENTO_INVALIDO` antes de guardar + CHECK en la base | Brandon: «descontando huecos y demás» |
| D6 | Plata en la unidad del lote (ADR-478 §4): S/ por PT (oxapampina, tablar), S/ por m³ (smalian). **El servidor nunca convierte m³→PT para pagar.** En modo total el PT lo escribe/confirma la persona; la pantalla puede sugerir `m³ × 424` rotulado «≈ sugerido» | regla 2 de verificación |
| D7 | Precio **por especie o general**: `precioGeneral` cubre las especies sin precio propio | pedido |
| D8 | Frenos: **una guía, una plata** (igual que hoy, por `mismoNumeroGtf`, para todo material y origen) + **un despacho, una cubicación aplicada** (lock `cub:{tenant}:despacho:{origenId}` + chequeo bajo el lock → 409 `DESPACHO_YA_VALORIZADO`). Sin índice parcial (Prisma lo propondría borrar) | |
| D9 | Aplicar **no** escribe `ForestCtpEntry.valorVenta` (P&L ≠ cuenta). La pantalla muestra «Valor de venta del libro: S/ X / sin valor» al lado, sin botón (pendiente P2) | el default más seguro |
| D10 | (O) prellena con **2 Ø** (mayor y menor de la guía), convertidos cm→pulg y m→pies a **1 decimal**, marcados «de la guía» hasta que se tipee la cinta | 1 Ø infla hasta 21 % (ADR-440 §1) |
| D11 | (A) «uno por uno» = **elegir una cubicación guardada del Cubicador de madera** (el servidor copia SUS piezas del KV por `cubicacionRefId`, no las del cuerpo) o «Abrir el Cubicador de madera» (Herramientas) y volver. No hay un segundo cubicador | reutilizar `CubicadorMadera` (3 500 l.) |
| D12 | GET de la lista **sin** `material` = sólo `troza` (Herramientas y Cuenta no cambian); `material=todas` trae ambas | compatibilidad |

## 4. Schema y SQL — **C-DB**

`prisma/schema.prisma`, modelo `ForestCubicacionTrozas` (después de `formula`/`gtfNumber`, con su `///`):

```prisma
  /// "troza" | "aserrada" (ADR-483). Las filas de ADR-478 son troza.
  material            String   @default("troza")
  /// null (como antes) | "libre" | "ctp" | "loth" | "despacho". Con loth/despacho la guía no se exige en WoodEntry.
  origen              String?
  /// loth → ForestGtf.id · despacho → ForestCtpEntry.id. Sin FK (ADR-426): se valida del MISMO tenant en la DB class.
  origenId            String?
  /// "pieza" (uno por uno) | "total" (volumen y PT por especie a mano; sólo aserrada).
  modo                String   @default("pieza")
  /// Volumen antes de los descuentos, en la unidad del lote. null = sin descuentos (bruto = volumen).
  volumenBruto        Decimal? @db.Decimal(14, 4)
  /// DescuentoLote (lib/forestal/cubicacion-comercial-tipos.ts). Los de cada troza/pieza viven en `trozas`.
  descuentos          Json?
  /// Sólo origen loth: el volumen DECLARADO de la GTF (SERFOR, Smalian) al guardar.
  referenciaSmalianM3 Decimal? @db.Decimal(14, 4)
  /// Aserrada «uno por uno»: id de la cubicación del Cubicador de madera (KV) de la que se copiaron las piezas.
  cubicacionRefId     String?

  @@index([tenantId, origen, origenId])
```

`prisma/migrations/20261008_cubicacion_comercial/migration.sql` (sin `;` en comentarios ni literales; el script parte por `;`):

```sql
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "material" TEXT NOT NULL DEFAULT 'troza';
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "origen" TEXT;
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "origenId" TEXT;
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "modo" TEXT NOT NULL DEFAULT 'pieza';
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "volumenBruto" DECIMAL(14,4);
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "descuentos" JSONB;
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "referenciaSmalianM3" DECIMAL(14,4);
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "cubicacionRefId" TEXT;
CREATE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_origen_origenId_idx" ON "ForestCubicacionTrozas" ("tenantId", "origen", "origenId");
ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_formula_chk";
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_formula_v2_chk" CHECK ("formula" IN ('smalian', 'oxapampina', 'tablar'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_material_chk" CHECK ("material" IN ('troza', 'aserrada'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_modo_chk" CHECK ("modo" IN ('pieza', 'total') AND ("modo" = 'pieza' OR "material" = 'aserrada'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_origen_chk" CHECK ("origen" IS NULL OR "origen" IN ('libre', 'ctp', 'loth', 'despacho'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_tablar_chk" CHECK (("formula" = 'tablar') = ("material" = 'aserrada'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_volumen_neto_chk" CHECK ("volumen" >= 0 AND ("volumenBruto" IS NULL OR "volumenBruto" >= "volumen"));
```

- Idempotente: `ADD COLUMN/INDEX IF NOT EXISTS`; `DROP … IF EXISTS` de la vieja y `ADD` de la **v2** (otro nombre: la 2.ª corrida no la borra; su «already exists» lo salta el script). ADD COLUMN con DEFAULT constante = sólo catálogo (PG ≥ 11), no reescribe.
- Antes: respaldo de conteos (`select count(*), estado, formula from "ForestCubicacionTrozas" group by 2,3` + `count(*) from "AdelantoEntrega" where "cubicacionId" is not null`) a `reports/respaldo-k7-2026-10-08.json`; después, las mismas cifras deben dar igual.
- Pasos: `--ensayo` → aplicar → aplicar otra vez («0 nuevas») → `node scripts/prisma-session.mjs migrate resolve --applied 20261008_cubicacion_comercial` → `flock /tmp/bsm-pesado.lock npx prisma generate`. Revertir (comentado en el archivo): `DROP CONSTRAINT` de las 5 nuevas, re-`ADD` de `formula_chk` original (sólo si no hay `tablar`), `DROP INDEX`, `DROP COLUMN` ×8.
- Ojo: el dev en :3000 puede seguir con el cliente Prisma viejo → 500 en los campos nuevos hasta que Brandon lo reinicie (no lo reinicia ningún agente; memoria `hub-next-dev-cache`). Decirlo en el reporte.

## 5. Tipos compartidos EXACTOS — `lib/forestal/cubicacion-comercial-tipos.ts`

Lo crea **el hilo principal antes de lanzar a los 4** (copiar tal cual); si no, C-BE en su primer paso. Nadie más lo edita sin avisar.

```ts
/**
 * cubicacion-comercial-tipos — contrato K7 (ADR-483): la cubicación COMERCIAL
 * (con descuentos) de trozas (Oxapampina/Smalian) o de madera aserrada (PT
 * tablar), ligada a la cuenta de una persona. Extiende ADR-478 sin romperlo.
 *
 * PURO y client-safe: sólo Zod y tipos. Las cuentas viven en
 * `cubicacion-comercial.ts`; la plata la calcula el SERVIDOR.
 */
import { z } from "zod";
import { limaDateKey } from "@/lib/utils";
import type { FormulaTrozas } from "./cubicacion-trozas-formula";

export type MaterialCubicacion = "troza" | "aserrada";
/** "tablar" = madera aserrada: PT = espesor″ × ancho″ × largo′ ÷ 12 × cantidad. */
export type FormulaComercial = FormulaTrozas | "tablar";
export const esFormulaComercial = (v: unknown): v is FormulaComercial =>
  v === "smalian" || v === "oxapampina" || v === "tablar";
/** null = filas de ADR-478 (libre o guía del CTP por `gtfNumber`). */
export type OrigenCubicacion = "libre" | "ctp" | "loth" | "despacho";
export type ModoCubicacion = "pieza" | "total";
export type EstadoCubicacionComercial = "borrador" | "aplicada" | "anulada";

/** Tope de un castigo %: más que esto no es un descuento, es otra madera. */
export const PCT_DESCUENTO_MAX = 90;

const pct = z
  .number()
  .min(0)
  .max(PCT_DESCUENTO_MAX, `Un descuento no pasa del ${PCT_DESCUENTO_MAX} %.`);
const idOpcional = z.string().trim().max(60).nullish().transform((v) => v || undefined).optional();
const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || undefined).optional();

export const fechaCubicacionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.")
  .refine(
    (f) => !Number.isNaN(Date.parse(`${f}T00:00:00.000Z`)) && new Date(`${f}T00:00:00.000Z`).toISOString().slice(0, 10) === f,
    "Esa fecha no existe.",
  )
  .refine((f) => f <= limaDateKey(), "La fecha no puede ser de mañana en adelante.");

// ── Descuentos ───────────────────────────────────────────────────────────────

/**
 * Descuento de UNA troza, en la unidad de su fórmula (pulgadas/pies en
 * Oxapampina, cm/m en Smalian). Orden: largo neto → menos el cilindro del
 * hueco con ese largo → castigo %. Hueco ≥ Ø menor o largo ≥ largo de la
 * troza = 422 `DESCUENTO_INVALIDO {troza}`.
 */
export const descuentoTrozaSchema = z.object({
  hueco: z.number().positive().max(400).nullish(),
  menosLargo: z.number().positive().max(100).nullish(),
  pct: pct.nullish(),
});
export type DescuentoTroza = z.infer<typeof descuentoTrozaSchema>;

/** Descuento de UNA medida de madera aserrada: piezas que no se cobran (≤ cantidad) y castigo %. */
export const descuentoPiezaSchema = z.object({
  descartadas: z.number().min(0).max(99_999).nullish(),
  pct: pct.nullish(),
});
export type DescuentoPieza = z.infer<typeof descuentoPiezaSchema>;

/**
 * Descuento del LOTE, después de los de cada troza/pieza: primero por especie
 * (`menos` en la unidad del lote, ≤ el neto de esa especie; luego su %), al
 * final el % general. Clave de especie = `claveEspecie` (sin tildes ni
 * mayúsculas); una clave que no está en el lote = 422 `DESCUENTO_INVALIDO {clave}`.
 */
export const descuentoLoteSchema = z.object({
  pct: pct.nullish(),
  porEspecie: z
    .array(
      z.object({
        clave: z.string().trim().min(1).max(80),
        pct: pct.nullish(),
        menos: z.number().positive().max(9_999_999).nullish(),
      }),
    )
    .max(60)
    .optional(),
});
export type DescuentoLote = z.infer<typeof descuentoLoteSchema>;

// ── Trozas: los campos nuevos que se MEZCLAN en `cuerpoCubicacion` (cubicacion-cuenta.ts) ──

/** `trozaEntradaSchema.extend(trozaDescuentoCampo)` */
export const trozaDescuentoCampo = { descuento: descuentoTrozaSchema.nullish() } as const;
/** `cuerpoCubicacion.extend(origenTrozaCampos)` + refine: origen "loth" ⇒ origenId. */
export const origenTrozaCampos = {
  origen: z.enum(["libre", "ctp", "loth"]).optional(),
  origenId: idOpcional,
  descuentos: descuentoLoteSchema.nullish(),
} as const;

// ── Aserrada ─────────────────────────────────────────────────────────────────

const UNIDAD = z.enum(["pulg", "cm", "pies", "m"]);

export const piezaComercialSchema = z.object({
  especie: z.string().trim().min(1, "Falta la especie de una pieza.").max(80),
  cantidad: z.number().positive().max(99_999),
  espesor: z.number().positive().max(999),
  ancho: z.number().positive().max(999),
  largo: z.number().positive().max(999),
  uEspesor: UNIDAD.default("pulg"),
  uAncho: UNIDAD.default("pulg"),
  uLargo: UNIDAD.default("pies"),
  descuento: descuentoPiezaSchema.nullish(),
});
export type PiezaComercialEntrada = z.infer<typeof piezaComercialSchema>;

/** Modo rápido: una línea por especie, o una sola «General». El PT es lo que se cobra. */
export const lineaTotalSchema = z.object({
  especie: z.string().trim().min(1, "Falta la especie (o «General»).").max(80),
  pt: z.number().positive("El pie tablar tiene que ser mayor que 0.").max(9_999_999),
  /** Informativo (lo que dice el libro o la guía). Nunca se convierte a PT en el servidor. */
  m3: z.number().positive().max(99_999).nullish(),
  piezas: z.number().int().positive().max(9_999_999).nullish(),
});
export type LineaTotalEntrada = z.infer<typeof lineaTotalSchema>;

const cuerpoAserrada = z.object({
  material: z.literal("aserrada"),
  modo: z.enum(["pieza", "total"]),
  fecha: fechaCubicacionSchema,
  beneficiarioId: idOpcional,
  parteId: idOpcional,
  /** venta = le vendo al cliente (devuelve su RECIBIDO) · compra = me venden (paga su DADO). */
  sentido: z.enum(["compra", "venta"]).default("venta"),
  origen: z.enum(["libre", "despacho"]).default("libre"),
  origenId: idOpcional,
  gtfNumber: textoOpcional(80),
  contratoId: idOpcional,
  /** Uno por uno desde el Cubicador de madera: el servidor copia SUS piezas (el cuerpo no manda `piezas`). */
  cubicacionRefId: idOpcional,
  piezas: z.array(piezaComercialSchema).max(5000).optional(),
  lineas: z.array(lineaTotalSchema).max(60).optional(),
  descuentos: descuentoLoteSchema.nullish(),
  notas: textoOpcional(500),
});
type CuerpoAserrada = z.infer<typeof cuerpoAserrada>;
const reglasAserrada = (d: CuerpoAserrada, ctx: z.RefinementCtx) => {
  if (!d.beneficiarioId && !d.parteId) ctx.addIssue({ code: "custom", path: ["beneficiarioId"], message: "Elige la cuenta de la persona." });
  if (d.origen === "despacho" && !d.origenId) ctx.addIssue({ code: "custom", path: ["origenId"], message: "Falta el despacho." });
  if (d.modo === "pieza" && !d.cubicacionRefId && !d.piezas?.length)
    ctx.addIssue({ code: "custom", path: ["piezas"], message: "Elige una cubicación guardada o carga las piezas." });
  if (d.modo === "pieza" && d.cubicacionRefId && d.piezas?.length)
    ctx.addIssue({ code: "custom", path: ["piezas"], message: "Con una cubicación guardada, las piezas salen de ella." });
  if (d.modo === "total" && !d.lineas?.length) ctx.addIssue({ code: "custom", path: ["lineas"], message: "Pon el pie tablar de al menos una especie." });
  if (d.modo === "total" && d.piezas?.length) ctx.addIssue({ code: "custom", path: ["piezas"], message: "El modo rápido no lleva piezas." });
};
export const guardarAserradaSchema = cuerpoAserrada.superRefine(reglasAserrada);
export const editarAserradaSchema = cuerpoAserrada.extend({ version: z.number().int().positive() }).superRefine(reglasAserrada);
export type GuardarAserradaInput = z.infer<typeof guardarAserradaSchema>;
export type EditarAserradaInput = z.infer<typeof editarAserradaSchema>;

/** Se MEZCLA en `aplicarCubicacionSchema`: `precios` pasa a `.max(60).default([])` + refine «precios o general». */
export const precioGeneralCampo = { precioGeneral: z.number().positive().max(100_000).nullish() } as const;

// ── Lo congelado por el servidor y lo que devuelve ───────────────────────────

/** Campos que se suman a `TrozaCongelada` (troza con descuento). */
export interface TrozaCongeladaComercial {
  descuento?: DescuentoTroza;
  /** Volumen sin descuentos; `volumen` es el neto. Sólo si hubo descuento. */
  bruto?: number;
  /** Origen loth: el m³ que la GTF declara para ESA troza (SERFOR). */
  m3Guia?: number;
}

export interface PiezaCongelada {
  n: number;
  especie: string;
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: "pulg" | "cm" | "pies" | "m";
  uAncho: "pulg" | "cm" | "pies" | "m";
  uLargo: "pulg" | "cm" | "pies" | "m";
  /** PT de toda la medida sin descuento (como `cubicarPieza`). */
  bruto: number;
  descuento?: DescuentoPieza;
  /** PT neto. */
  volumen: number;
}

export interface LineaTotalCongelada {
  n: number;
  especie: string;
  pt: number;
  m3: number | null;
  piezas: number | null;
  /** = pt (los descuentos de una línea rápida van en `descuentos.porEspecie`). */
  volumen: number;
}

/** Lo que `CubicacionTrozasResumen` suma (C-BE lo extiende con esto). */
export interface CamposComerciales {
  material: MaterialCubicacion;
  origen: OrigenCubicacion | null;
  origenId: string | null;
  modo: ModoCubicacion;
  /** null = no hubo descuentos (bruto = volumen). */
  volumenBruto: number | null;
  descuentos: DescuentoLote | null;
  referenciaSmalianM3: number | null;
  cubicacionRefId: string | null;
}

export interface CubicacionExistente {
  id: string;
  codigo: string;
  estado: EstadoCubicacionComercial;
  monto: number | null;
  personaNombre: string | null;
}

/** GET …/cubicaciones-trozas/origen?tipo=loth&id= */
export interface PrefillTrozaGtf {
  codigo: string | null;
  especie: string;
  /** Pulgadas y pies a 1 decimal, convertidos de la guía (cm/m). La cinta manda. */
  d1: number;
  d2: number;
  largo: number;
  m3Guia: number | null;
}
export interface PrefillOrigenLoth {
  tipo: "loth";
  gtfId: string;
  gtfNumber: string;
  fecha: string | null;
  titular: string | null;
  tituloHabilitante: string | null;
  /** `ForestGtf.volumenTotalM3`: lo que declara la guía (Smalian, SERFOR). */
  smalianDeclaradoM3: number | null;
  trozas: PrefillTrozaGtf[];
  /** Trozas de la guía sin D1/D2/largo: no se prellenan, se cuentan. */
  sinMedidas: number;
  existentes: CubicacionExistente[];
}

/** GET …/cubicaciones-trozas/origen?tipo=despacho&id= */
export interface PrefillOrigenDespacho {
  tipo: "despacho";
  despachoId: string;
  gtfNumber: string | null;
  fecha: string;
  destinatario: string | null;
  /** Las líneas vivas del despacho con esa guía (o sólo ésta si no tiene guía): lo que dice el LIBRO. */
  lineas: Array<{ id: string; especie: string; m3: number | null; piezas: number | null; ptLibro: number | null }>;
  /** Del Cubicador de madera (KV), las ligadas a esa guía o a las corridas del despacho primero. */
  guardadas: Array<{ id: string; nombre: string; fecha: string; pt: number; piezas: number; ligada: boolean }>;
  /** `ForestCtpEntry.valorVenta` sumado de las líneas: null = alguna sin valor (nunca 0). */
  valorVentaLibro: number | null;
  existentes: CubicacionExistente[];
}
export type PrefillOrigen = PrefillOrigenLoth | PrefillOrigenDespacho;
```

## 6. Cuentas puras — `lib/forestal/cubicacion-comercial.ts` (C-BE; client-safe; las FE la importan para la vista previa)

| Firma | Regla |
|---|---|
| `unidadesComercial(f: FormulaComercial): { volumen: "PT" \| "m³"; decimales: 2 \| 4; nombre: string }` | tablar → PT, 2, «Pie tablar (aserrada)» |
| `class DescuentoInvalidoError extends Error { constructor(readonly donde: { troza?: number; pieza?: number; clave?: string }, message: string) }` | |
| `trozaNeta(formula: FormulaTrozas, d1: number, d2: number, largo: number, d?: DescuentoTroza \| null, n?: number): { bruto: number; neto: number }` | bruto = `cubicarSegun(f, d1, largo, d2)`; L′ = largo − menosLargo (> 0 o error); hueco < min(d1,d2) o error; neto = max(0, (cubicarSegun(f,d1,L′,d2) − cubicarSegun(f,hueco,L′,hueco)) × (1 − pct/100)): cada `cubicarSegun` ya viene redondeado; el neto se redondea otra vez a la fórmula (PT 2, m³ 4) |
| `piezaNeta(p: PiezaComercialEntrada, n?: number): { bruto: number; neto: number }` | bruto = `cubicarPieza(p).pieTablar`; descartadas ≤ cantidad o error; neto = `cubicarPieza({...p, cantidad: cantidad − descartadas}).pieTablar × (1 − pct/100)`, 2 dec, ≥ 0 |
| `aplicarDescuentoLote(lineas: LineaEspecie[], d: DescuentoLote \| null \| undefined, f: FormulaComercial): { lineas: LineaEspecie[]; bruto: number; neto: number }` | por especie: menos ≤ volumen o error; luego su %; al final el general; ninguna < 0; redondeo por línea; total = Σ líneas |
| `lineasDeEspecie(c: { material; modo; formula; trozas: unknown[] }): LineaEspecie[]` | la ÚNICA que usan `aplicar` y la pantalla: troza → `agruparPorEspecie` (con `volumen` neto); aserrada pieza/total → agrupa `volumen` por `claveEspecie` |
| `valorizar(lineas, precios, precioGeneral?)` (en `cubicacion-cuenta.ts`, parámetro nuevo) | precio propio > general > `FaltaPrecioError`; monto por especie al céntimo, medio céntimo hacia arriba sobre el decimal |
| `ptSugeridoDeM3(m3: number): number` | `round2(m3 × PT_POR_M3)`; sólo para el rótulo «≈ sugerido»; el servidor no la llama |
| `pulgadasDeMetros(m: number)`, `piesDeMetros(m: number)` | 1 decimal, para el prellenado de (O) |

Widen en `cubicacion-cuenta.ts` (C-BE): `unidadDe`, `decimalesDe`, `fmtVolumen`, `agruparPorEspecie`, `repartirFifo(decimales)` aceptan `FormulaComercial`; `TrozaCongelada` extiende `TrozaCongeladaComercial`; `CubicacionTrozasResumen` extiende `CamposComerciales` con `formula: FormulaComercial`; `CubicacionTrozasDTO` suma `piezas?: PiezaCongelada[]; lineas?: LineaTotalCongelada[]` (`trozas` sigue `TrozaCongelada[]`, vacío en aserrada); `huellaAplicar` incluye `precioGeneral`.

## 7. Servidor — C-BE

**`lib/db/forest-cubicacion-trozas.db.ts`** (lo genérico):
- `SELECT_RESUMEN` + 8 columnas; `aResumen`: `formula` = `esFormulaComercial(r.formula) ? r.formula : "smalian"` (**nunca** tablar→smalian), `material`, `origen`… ; `aDTO` reparte `trozas` Json en `trozas | piezas | lineas` por `material`/`modo`.
- `list(tenantId, filtros + { material?: MaterialCubicacion | "todas"; origen?; origenId? })`: sin `material` = `troza` (D12). La clave de caché suma los filtros nuevos.
- `guardar`/`editar` (troza): aceptan `origen`, `origenId`, `descuentos`, `trozas[].descuento`. `guiaCanonica` → `guiaDelOrigen(tenantId, input)`: `loth` = `ForestGtf {id, tenantId, deletedAt: null}` (404 `ORIGEN_NO_ENCONTRADO`; `status='anulada'` → 422 `GUIA_ANULADA`), número = el de `WoodEntry` si `mismoNumeroGtf` encuentra uno, si no el de la `ForestGtf`; `referenciaSmalianM3 = volumenTotalM3`; cada troza con `codigo` igual a un `items[].code` lleva `m3Guia`. Sin origen: como hoy.
- `cubicar(input)` usa `trozaNeta` por troza (lanza `DESCUENTO_INVALIDO`) y `aplicarDescuentoLote`; guarda `volumen` = neto del lote, `volumenBruto` = Σ bruto sólo si difiere.
- `aplicar`: `formula` vía `esFormulaComercial`; líneas = `aplicarDescuentoLote(lineasDeEspecie(cub), cub.descuentos, formula).lineas`; `valorizar(…, input.precios, input.precioGeneral)`. Si `origen='despacho'`: después del lock de guía, `pg_advisory_xact_lock(hashtext('cub:{tenant}:despacho:{origenId}'))` y otra `aplicada` viva con el mismo `origen/origenId` → 409 `DESPACHO_YA_VALORIZADO {codigo}`. Orden de locks: guía → despacho → persona → fila → adelantos.
- Códigos nuevos en `CodigoCubicacion`/`STATUS`: `DESCUENTO_INVALIDO` 422, `ORIGEN_NO_ENCONTRADO` 404, `GUIA_ANULADA` 422, `DESPACHO_YA_VALORIZADO` 409, `CUBICACION_REF_NO_ENCONTRADA` 404, `MATERIAL_DISTINTO` 409 (PATCH que cambia material).

**`lib/db/forest-cubicacion-comercial.db.ts`** (nuevo, ≤ 400 l.): `CubicacionComercialDB`
- `prefillLoth(tenantId, gtfId): Promise<PrefillOrigenLoth>` — sólo `tipo` troza; convierte con `pulgadasDeMetros`/`piesDeMetros`; `existentes` por `origen='loth' AND origenId`.
- `prefillDespacho(tenantId, despachoId): Promise<PrefillOrigenDespacho>` — `ForestCtpEntry {id, tenantId, section:'despacho', deletedAt:null, status ≠ 'anulado'}` (404); líneas hermanas por `gtfNumber` con `mismoNumeroGtf`; `guardadas` = `ForestCubicacionesDB.list` (ligadas primero: `gtfNumber` igual o `ctpEntryIds` ∩ corridas del despacho por `ForestCtpDespachoOrigen`); `valorVentaLibro` null si alguna línea es null.
- `guardarAserrada(tenantId, input: GuardarAserradaInput, actor)` / `editarAserrada(tenantId, id, input: EditarAserradaInput, actor)` — persona con `resolverPersona` (exportarla), despacho validado como arriba (`gtfNumber` = el del despacho, nunca el del cuerpo), `cubicacionRefId` → piezas del KV (404 `CUBICACION_REF_NO_ENCONTRADA`), `piezaNeta` por pieza, `aplicarDescuentoLote`; `formula='tablar'`, `diametros=2`, `material='aserrada'`; mismo código CUB (mismo lock `cub:{tenant}:codigo`), misma auditoría. Aplicar/anular/borrar = los de `ForestCubicacionTrozasDB` (genéricos).

**Rutas** (todas con `guardCubicacion` de `_comun.ts`; `tenantId` del JWT; Zod `safeParse` → 422 `validation_error`):

| Ruta | Cambio | Roles |
|---|---|---|
| `GET /api/admin/forestal/cubicaciones-trozas?…&material=troza\|aserrada\|todas&origen=&origenId=` | filtros nuevos | CUBICAR |
| `POST …/cubicaciones-trozas` | `body.material === "aserrada"` → `guardarAserradaSchema` + `CubicacionComercialDB.guardarAserrada`; si no, `guardarCubicacionSchema` (troza, con origen y descuentos) | CUBICAR |
| `PATCH …/[id]` | lo mismo con `editar…Schema`; la fila manda el material (409 `MATERIAL_DISTINTO`) | CUBICAR |
| `GET …/[id]` · `DELETE …/[id]` · `POST …/[id]/aplicar` · `POST …/[id]/anular` | sin cambio de forma; aplicar acepta `precioGeneral` | CUBICAR / PLATA |
| **nueva** `GET …/cubicaciones-trozas/origen?tipo=loth\|despacho&id=` | `{ prefill: PrefillOrigen }` · 404 `ORIGEN_NO_ENCONTRADO` · 422 `GUIA_ANULADA`. Además de `spec:forestal:herramientas`, `loth` pide `spec:forestal:loth-libro` y `despacho` `spec:forestal:ctp-libro` (nombres verificados con grep: 64 y 127 usos) | CUBICAR |

**ADR**: `docs/adr/ADR-483-cubicacion-comercial-con-descuentos.md` (C-BE, al cerrar; estructura de ADR-478).

## 8. Pantallas

**(O) — C-FE-O.** En el menú ⋯ de la GTF (`opcionesGtf`): «Cubicar en Oxapampina» (hint «Con descuentos, para comprar o vender; al lado la cifra SERFOR»), sólo `tipo='trozas'` y guía viva (en «Anuladas y otras» no aparece). Abre `LothGtfCubicarModal`:
1. Cabecera: GTF, titular, **«SERFOR (Smalian): 20,303 m³ declarados»** (dato) y **«Oxapampina neta: X PT»** en vivo; debajo, rótulo derivado «≈ Y PT si se pasara lo declarado a PT (×424): Z % menos», nunca como dato.
2. Planilla (patrón `CtpCubicarOxapampaModal` / `ctp-cubicar-oxapampa-fila`): una fila por troza con código único, especie, D1″, D2″, L′ (prellenados de la guía en gris «de la guía» hasta tipear), **Hueco″, −Largo′, Castigo %**, PT bruto, PT neto, m³ de la guía. Selector Oxapampina/Smalian (Smalian = cm/m sin convertir). Descuento general % y por especie al pie.
3. «Guardar en la cuenta» → `GuardarEnLaCuentaModal` con la prop nueva `vinculo?: { origen: "loth"; origenId: string; gtfNumber: string; descuentos: DescuentoLote | null; descuentosPorTroza: Array<DescuentoTroza | null>; sentidoInicial: "compra" | "venta" }` (`descuentosPorTroza` alineado por índice con `rows`; guía fija, no editable; sin `vinculo` el modal se porta como hoy). Después abre `ValorizarCubicacionModal` (valorizar con precio por especie, descontar del adelanto, anular: lo de ADR-478).
4. Si la guía ya tiene `existentes`, se listan arriba con estado y monto; una aplicada → aviso «esta guía ya se pagó con CUB-…».

**(A) — C-FE-A.** En el menú de una fila de Despacho (`CtpEntriesTabla`): «Cubicación comercial» (hint «Con descuentos, para cobrarle al cliente o pagar al que te vende»). Abre `CtpCubicacionComercialModal`:
1. Cabecera: GTF de salida, destinatario, lo que dice el LIBRO por línea (m³), «Valor de venta del libro: S/ X | sin valor» (sólo lectura, D9).
2. Dos pestañas (`SegmentedControl`): **«Uno por uno»** = elegir una de `guardadas` (ligadas primero) o «Abrir el Cubicador de madera» (Herramientas, nueva pestaña con `?despacho=<id>`) y volver; **«Rápida»** = líneas especie | PT | m³ (opcional) | piezas (opcional), botón «+ General»; el PT se tipea; botón «≈ desde el libro» que pone `m³ × 424` rotulado «sugerido, revísalo».
3. Descuentos: por especie (% y −PT) y general %; resumen bruto → neto en vivo con `aplicarDescuentoLote`.
4. Persona (`usePersonasDeLaCuenta`), sentido (default «Le vendo» = venta; «Me vende» = compra), fecha → guardar → `ValorizarCubicacionModal` con **precio por especie o general**.

`ValorizarCubicacionModal`/`ValorizarPrecios` se generalizan (C-FE-A): unidad por `unidadesComercial`, medidas por material (trozas → `MedidasCongeladas`; piezas/líneas → `cubicacion-comercial-medidas.tsx`), bruto → descuentos → neto, campo «Precio general (S/ por PT)», y la vista previa usa `lineasDeEspecie` + `aplicarDescuentoLote` (también para trozas con descuento de lote de (O)).

Textos con tuteo; tokens del DS; ≤ 300 líneas por componente; `aboveModals` cuando se abre sobre otro modal.

## 9. Reparto de archivos (DISJUNTO) y orden

| Agente (modelo) | Archivos (sólo estos) | Gate |
|---|---|---|
| hilo principal (antes de lanzar) | `lib/forestal/cubicacion-comercial-tipos.ts` (copia de §5) | — |
| **C-DB** (database, sonnet) | `prisma/schema.prisma` (sólo el modelo `ForestCubicacionTrozas`), `prisma/migrations/20261008_cubicacion_comercial/migration.sql`, `reports/respaldo-k7-2026-10-08.json` | ensayo + 2 corridas + `prisma generate` (flock) + SELECT de columnas |
| **C-BE** (backend, **opus**: plata) | `lib/forestal/cubicacion-comercial.ts` (nuevo), `lib/forestal/cubicacion-cuenta.ts`, `lib/db/forest-cubicacion-trozas.db.ts`, `lib/db/forest-cubicacion-comercial.db.ts` (nuevo), `app/api/admin/forestal/cubicaciones-trozas/route.ts`, `…/[id]/route.ts`, `…/[id]/aplicar/route.ts` (sólo si hace falta), `…/origen/route.ts` (nuevo), `docs/adr/ADR-483-cubicacion-comercial-con-descuentos.md`, `__tests__/cubicacion-comercial.test.ts` (nuevo), `__tests__/forest-cubicacion-comercial-db.test.ts` (nuevo), `__tests__/forestal-cubicacion-cuenta.test.ts` y `__tests__/forest-cubicacion-trozas-db.test.ts` (sólo ajustes) | vitest de esos 4 + puertas en UNA llamada; reviewer opus (dinero) |
| **C-FE-O** (frontend, sonnet; patrón establecido) | `components/admin/forestal/gtf-acciones-menu.tsx` (**compartido**: releer y agregar sólo la opción + el montaje), `LothGtfCubicarModal.tsx` (nuevo), `loth-gtf-cubicar-fila.tsx` (nuevo), `hooks/use-cubicar-guia-loth.ts` (nuevo), `cubicador-trozas-guardar.tsx` (prop `vinculo`), `cubicador-trozas-medidas.tsx` (columnas bruto/descuento/neto/m³ guía), `__tests__/loth-gtf-cubicar.test.ts` (nuevo) | 1 captura claro 1280 en QA forestal |
| **C-FE-A** (frontend, sonnet) | `components/admin/forestal/CtpEntriesTabla.tsx` y `CtpEntriesView.tsx` (**compartidos**: releer y agregar sólo la acción, la prop y el montaje), `CtpCubicacionComercialModal.tsx` (nuevo), `cubicacion-comercial-rapida.tsx` (nuevo), `cubicacion-comercial-medidas.tsx` (nuevo), `hooks/use-cubicacion-comercial-despacho.ts` (nuevo), `cubicador-trozas-valorizar.tsx`, `cubicador-trozas-precios.tsx`, `hooks/use-cubicaciones-trozas.ts` (widen `formula`, `ultimosPrecios`, tipo con `piezas/lineas`) | 1 captura claro 1280 en main |

Orden: tipos → C-DB ∥ C-BE (primero `cubicacion-comercial.ts`, que las FE importan) ∥ FE (contra §5-§6). **typecheck UNA vez al final** (hilo principal, flock). Ningún agente toca `cubicador-trozas-guardadas.tsx`, `CubicadorTrozas.tsx`, `CubicadorMadera.tsx`, `forest-cubicaciones.db.ts`, `guia-cubicacion.db.ts` ni las 5 puertas.

## 10. Riesgos de plata (cada uno con su red)

| Riesgo | Red |
|---|---|
| `tablar` leído como `smalian` (aResumen/aplicar) → montos por m³ sobre PT | `esFormulaComercial`; test 23 |
| CHECK viejo `formula_chk` rechaza `tablar` | migración v2 (§4) |
| Moneda | sólo `PEN` (columna con default; ningún cuerpo trae moneda); sin dólares |
| null vs 0 | `monto` NULL = sin valorizar; precio > 0; neto 0 → 422 `MONTO_CERO`; `valorVentaLibro` null si falta alguna línea |
| Doble pago por guía | `exigirGuiaSinPlata` para todo material/origen; GTF del LO-TH canonizada contra `WoodEntry` con `mismoNumeroGtf`; las 5 puertas ya miran `cubicacionQuePagoLaGuia` (también ven las de loth y aserrada: mismo `gtfNumber`) |
| Doble pago por despacho sin guía | lock `cub:{tenant}:despacho:{id}` + chequeo bajo lock → 409 |
| Descuento que deja negativo o neto > bruto | 422 `DESCUENTO_INVALIDO` + `Math.max(0, …)` + CHECK `volumen_neto_chk` |
| m³ → PT para pagar | el servidor no convierte; `ptSugeridoDeM3` sólo en pantalla, rotulado |
| 1 Ø infla | (O) prellena 2 Ø |
| Piezas del cliente en «uno por uno» | con `cubicacionRefId` el servidor copia las del KV |
| P&L vs cuenta | aplicar no toca `valorVenta` |
| Cliente Prisma viejo en dev | avisar a Brandon; no reiniciar |

## 11. Tests

Puros (`__tests__/cubicacion-comercial.test.ts`):
1. Troza Oxapampina sin descuento: neto = bruto = `cubicarSegun`.
2. Hueco: Ø 20″/20″, L 10′, hueco 6″ → bruto 163,27, hueco 14,69, neto 148,58 (resta de dos `cubicarSegun` ya redondeados a 2 decimales: así cuadra con lo que se ve por troza).
3. −Largo 2′ → 130,61; castigo 10 % → ×0,9.
4. Hueco ≥ Ø menor, −Largo ≥ largo → `DescuentoInvalidoError {troza}`; pct 91 → Zod falla.
5. Smalian con hueco en cm: resta π/4·h²·L′.
6. Pieza 10 × 2″×8″×10′ = 133,33 PT; 2 descartadas → 106,67; descartadas > cantidad → error.
7. Lote: `menos` > neto de la especie → error; clave ausente → error; especie → general en ese orden; nunca < 0.
8. Total: el PT manda; el m³ no cambia el volumen.
9. `valorizar` con `precioGeneral`: propio > general > `FaltaPrecioError`; 33,33 × 2,5 = 83,33.
10. `huellaAplicar` cambia con `precioGeneral`.
11. Las 22 trozas de la GTF de Blas (fixture con sus D1/D2/largo): prellenado 1 decimal y Oxapampina bruta ≈ 5 364 PT (tolerancia 1 PT).
12. `unidadesComercial("tablar")` = PT, 2.
DB (`__tests__/forest-cubicacion-comercial-db.test.ts`, prisma mockeado como `forest-cubicacion-trozas-db.test.ts`):
13. troza `origen=loth` sin `WoodEntry` → guarda (sin 422) con el número de la `ForestGtf` y `referenciaSmalianM3`.
14. loth de otro tenant → 404 `ORIGEN_NO_ENCONTRADO`; anulada → 422 `GUIA_ANULADA`.
15. loth ya ingresada → número canonizado al de `WoodEntry`.
16. aplicar loth con costo en `WoodEntry` → 409 `GUIA_YA_VALORIZADA`.
17. aserrada `origen=despacho` de otro tenant / anulado → 404.
18. segunda aplicada del mismo despacho sin guía → 409 `DESPACHO_YA_VALORIZADO`.
19. `cubicacionRefId` copia las piezas del KV; id inexistente → 404.
20. aplicar aserrada venta → RECIBIDO FIFO; excede → 422 `EXCEDE_LO_RECIBIDO`; anular devuelve.
21. `list` sin `material` → sólo troza.
22. PATCH que cambia material → 409.
23. `aResumen` con `formula='tablar'` → tablar y unidad PT.
Siguen verdes: `guia-cubicacion-puertas`, `forestal-cubicacion-cuenta`, `forest-cubicacion-trozas-db`, `cubicacion-cuenta-pantalla`.
Camino del usuario (regla verificacion-de-verdad): (O) en QA forestal: cubicar → guardar → valorizar → descontar → anular, con el SELECT de la entrega antes/después; (A) en main con un despacho sembrado.

## 12. Pendientes (decisiones tomadas por default; Brandon puede cambiarlas)

- P1. Descuento por hueco = cilindro del hueco con el largo neto (Ø_h²·L′÷24,5). Si en la plaza se descuenta otra cosa (p. ej. «Ø menos hueco» al cuadrado), cambia sólo `trozaNeta`.
- P2. ¿«Aplicar» debería llenar `valorVenta` del despacho cuando está vacío? Hoy no (D9).
- P3. Una cubicación comercial por **GTF de salida** (no por línea): si Brandon quiere una por línea de una guía con varias especies, el freno por guía lo impide.
- P4. Compra y venta de la misma guía siguen bloqueadas entre sí (freno sin `sentido`, como ADR-478).
- P5. Prefijo único `CUB-` para trozas y aserrada.
- P6. «Abrir el Cubicador de madera» con `?despacho=<id>` sólo abre la herramienta; ligarla al volver es elegirla en «Uno por uno».
