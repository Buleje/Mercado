# K1 · Código único de troza SIEMPRE `<código guía>-<correlativo corto>` — contrato

> Arquitecto (sólo lectura), 2026-10-08 tarde. Lo construye **U (fase 4)**. Reemplaza la regla «sólo si se repite» de ADR-474.
> Todo lo de «Contexto medido» salió de `scripts/sql-lectura.mjs` (READ ONLY) y grep de este checkout.

## 1. Contexto medido

| Qué | Medida | Consecuencia |
|---|---|---|
| Blas · Libro TH vivo (`registrado`, no borrado) | 22 trozado (códigos «1»…«22», `treeCode` = mismo, obs «Importada de la GTF 019-001-0000001 …») + 22 `despacho_troza` (GTF 019-001-0000001) | **44 líneas a migrar** → `1-0001` … `22-0001` |
| Blas · `ForestGtf` 019-001-0000001 | 2 filas: `emitida` (22 items, `trozadoId` puesto, 0 con `codigoGuia`) y `anulada` (la 1.ª importación deshecha, 22 items con ids muertos) | Se migra **sólo la emitida**; la anulada es historia |
| Blas · talas vivas / CTP atado | 0 talas vivas (6 borradas) · 0 `WoodEntryTroza.lothTrozadoId` (17 trozas en el CTP, ninguna del libro) | La migración no toca talas ni CTP (igual las verifica) |
| Blas · cierres del LO-TH | 0 (`PlatformSetting` `loth-cierre:<id>` no existe); fecha de las 44 líneas 2025-10-09 | No hay mes cerrado que frene |
| main · Libro TH | 69 trozado + 69 despacho, pero **registrados sólo 4 + 2**, y **0 importados vivos** (los 49 importados están `anulado`, incl. los 4 «12A (0090002)» de ADR-474) | **main: 0 líneas a migrar**. El «138 trozas en 17 guías» del plan contaba anuladas |
| main · CTP atado al libro | 2 (`85-TOR-C/D`, flujo manual, GTF 001-0000120) | Flujo manual: fuera del alcance (ver P1) |
| Colisión del sufijo nuevo con lo existente | 0 de 253 `trozaCode` (todos los tenants, incl. borrados), 0 de 43 `codificacion` del CTP, 0 de 117 items de GTF terminan en `-\d{4,7}` o `-\d{3}/\d{4,7}` | El sufijo es **inequívoco hoy** → se puede derivar el código de la guía sin guardarlo |
| Códigos con paréntesis nativo de SERFOR | main GTF 019-0000003: «13/A (0000008)» (no es renombre ADR-474) | El sufijo se pega DESPUÉS: «13/A (0000008)-0003» |
| Correlativos > 9999 | main 019-001-0090002, 025-001-9000459 | «corto» = sin ceros a la izquierda, mínimo 4 dígitos (crece) |
| Quién guarda/lee `trozaCode` | 72 archivos de `lib/ app/ components/` (sin generados) + 60 tests | Ver §4: sólo ~12 **cambian**; el resto lee el código como opaco |
| Derivar el árbol de una troza | `arbolDeTroza("12-A-019/0001")` = el código entero ✗ · `arbolDeCodificacion("12A-0001")` = «12A-0001» ✗ (debería «12») · `arbolesParaTrazar("12A-0001")` raíz «12A-0001» ✗ | Hay que quitar el sufijo ANTES (las líneas de despacho no guardan `treeCode`: 22/22 null en Blas) |
| Emparejar con la ficha SERFOR | `medidas-desde-guia.ts` `flojo("12A-0001")` = «12A0001» ≠ «12A» | Hay que quitar el sufijo en la forma flexible |
| «Deshacer la importación» | reconoce el Trozado por **igualdad exacta** de `observations` (`esTrozadoDeLaImportacion`) y ata despachos por `items[].code` (`lineasDeLaGuia`) | La migración **no toca observaciones**; cambia `items[].code` junto con las líneas, en la misma tx |
| QR | `/verificar/${encodeURIComponent(code)}` (loth-labels, loth-troza-etiquetas, loth-pasaporte-print); la página hace `decodeURIComponent`; `traceByCode` busca por `treeCode IN raíces` + `trozaCode startsWith "<raíz>-"` | Un QR viejo «/verificar/1» sigue abriendo por el árbol 1. «/» del nivel 2 viaja como `%2F`: **probar con curl** |
| Límite | `trozaCode` Zod `max(60)` en `app/api/admin/forestal/loth/route.ts:43`; `confirmaRenombres` `max(120)` | El generador descarta candidatos > 60 |

## 2. Decisión

1. **Toda troza que ENTRA al Libro TH desde una guía** (importar guía ya despachada, ADR-461) entra con
   `trozaCode = <código en la guía>-<correlativo corto>`, aunque no se repita.
   - correlativo corto = último tramo del N° de GTF sin ceros a la izquierda, rellenado a 4: `019-001-0000001` → `0001`; `001-0000120` → `0120`; `019-001-0090002` → `90002`.
   - **Nivel 2** (otro talonario con el mismo correlativo ya usó el nivel 1): `<código>-<1er tramo>/<corto>` → `12A-019/0001`.
   - **Nivel 3** (si el nivel 2 también está tomado y el N° tiene ≥3 tramos): `<código>-<todos menos el último>/<corto>` → `12A-019-001/0001`. Si también: `conflicto` como hoy.
   - Sin código («-»): sigue `SC-<registro>-<n>` (ya es único por guía; no lleva sufijo).
2. **El código de la guía no se guarda aparte en la línea: se deriva** (`codigoDeLaGuia`), porque el sufijo es inequívoco (0 choques medidos). Además, `ForestGtf.items[].codigoGuia` se escribe **siempre** que difiera de `code` (hoy sólo en renombres).
3. **Lo que NO cambia:** T1/T2/T3/T4 (siguen atando por `trozaCode`, con `≤`); el despacho manual desde el libro (la troza nace antes que la guía, su código lo pone la persona y ya puede estar en una etiqueta → ver P1); el texto de las observaciones (Deshacer las compara exactas).
4. **Salvaguarda anti-doble conteo (hereda ADR-474 §3):** como ahora nada choca por código, la revisión busca si el **código de la guía** ya salió con OTRA guía del **mismo permiso** (`codigoDeLaGuia(trozaCode) === código` y `planId` igual y tiene `despacho_troza` con otro N°). Si sí → estado `renombrada` (se mantiene el nombre por compatibilidad de la API) + aviso `troza_renombrada` + casilla obligatoria; el servidor rechaza con `renombre_sin_confirmar` si falta. Si no → `nueva`, sin casilla.
5. **Otros permisos:** si el código de la guía ya existe en un Trozado de OTRO permiso, sigue siendo `conflicto` (status quo de ADR-474: la clave (permiso, código) y el T4 por `treeCode` de todo el negocio son su propio ADR + security). Ver P3.
6. **Compatibilidad hacia atrás en la revisión** (guías importadas antes del cambio y no migradas):
   - código crudo con salida con **esta misma** guía y guía ya importada → `ya_trozada` sobre la línea cruda;
   - código crudo en Trozado del mismo permiso **sin salida** (troza registrada a mano antes de la guía) → `ya_trozada` con su código actual (no se renombra: puede tener etiqueta); el item de la GTF lleva `code` = el del libro y `codigoGuia` = el de la guía;
   - formato viejo «12A (0000002)»: sólo se **lee** (los parsers siguen quitando el paréntesis); ya no se genera.
7. **Migración**: sólo Blas, 44 líneas + 1 GTF emitida, con ensayo en seco + respaldo JSON + huella; main no tiene nada vivo que migrar (se ensaya ahí con datos sembrados, §5).
8. **Lectores:** hoja SERFOR y Relación imprimen `codigoImpreso(it) = codigoGuia || codigoDeLaGuia(code, gtfNumber) || code` (lo que va a SERFOR = SNIFFS); libro, kárdex, etiquetas, QR, CTP usan el único. Fase 2 (G) ya muestra «Código en la guía» + «Código único» con `codigoImpreso`; K1 sólo afina el fallback.

## 3. Tipos TS / funciones / rutas con Zod

### 3.1 Módulo nuevo PURO y client-safe: `lib/forestal/codigo-unico-troza.ts`

```ts
/** = `z.string().max(60)` de `trozaCode` en /api/admin/forestal/loth. */
export const CODIGO_UNICO_MAX = 60;
export type NivelCodigoUnico = 1 | 2 | 3;

export interface CodigoUnicoPartido {
  codigoGuia: string;          // «12A», «13/A (0000008)»
  serie: string | null;        // null (nivel 1) · «019» (2) · «019-001» (3)
  correlativo: string;         // «0001», «90002»
  nivel: NivelCodigoUnico;
}

/** «019-001-0000001» → «0001»; «…-0090002» → «90002»; último tramo no numérico → tal cual; sin N° → null. */
export function correlativoCorto(gtfNumber: string | null | undefined): string | null;

/** [N1, N2, N3] sin repetidos, sin los > CODIGO_UNICO_MAX. [] si no hay N° o el código está vacío. */
export function candidatosCodigoUnico(codigoGuia: string, gtfNumber: string): string[];

/**
 * Regex: /^(.+?)-(?:(\d{1,4}(?:-\d{1,4})?)\/)?(\d{4,7})$/ .
 * Con `gtfNumber`, además exige que el correlativo (y la serie, si hay) sean los de ESA guía:
 * así un código tipeado a mano «100-2020» no se parte por casualidad.
 */
export function partirCodigoUnico(code: string, gtfNumber?: string | null): CodigoUnicoPartido | null;

/** El código impreso en la guía: sin el sufijo si lo tiene; si no, el mismo. */
export function codigoDeLaGuia(code: string, gtfNumber?: string | null): string;
```

- `lib/forestal/gtf-talonario.ts`: **exportar** `tramosDe` (hoy privado) para no duplicar la partición del N°.
- `codigoUnicoDeGuia` (`loth-importar-guia.ts:137`) se borra; sus 3 llamadas pasan a `candidatosCodigoUnico`.

### 3.2 Cambios de tipos existentes (`lib/forestal/loth-importar-guia-tipos.ts`)

```ts
// TrozaImportada (sin campos nuevos obligatorios):
//   trozaCode        → SIEMPRE el único cuando hay código (antes: el de la guía salvo renombre)
//   codificacionGuia → ya existe: el de la guía
//   estado "renombrada" → significado nuevo: «su código de guía ya salió con OTRA guía de este permiso» (pide casilla)
repiteGuia?: string | null;   // N° de la otra guía, para el detalle de la vista previa (opcional)
```

### 3.3 Rutas (sin cambios de contrato)

- `POST /api/admin/forestal/loth/importar-guia` y `/vista-previa`: el body NO cambia (`lib/forestal/loth-importar-guia-esquemas.ts:178`, `confirmaRenombres: z.array(z.string().trim().min(1).max(120)).max(500).optional()` sigue siendo la lista de códigos únicos confirmados). RBAC igual (`requireAdmin` admin/dueño). La respuesta trae `trozaCode` = único en todas.
- **No hay ruta nueva para migrar**: script + DB class (patrón `scripts/migrar-blas-wasaco-adr437.mjs`). Entrada validada con Zod en la DB class:

```ts
const MigrarGuiaInput = z.object({
  gtfId: z.string().min(1).max(40),
  huella: z.string().regex(/^[0-9a-f]{64}$/),   // sha256 del plan del ensayo
});
const RevertirInput = z.object({ respaldo: RespaldoCodigoUnicoSchema });
```

### 3.4 DB class nueva: `lib/db/forest-loth-codigo-unico.db.ts`

```ts
export interface CambioDeCodigo { lineaId: string; section: "trozado" | "despacho_troza"; lineNo: number; de: string; a: string }
export interface PlanCodigoUnico {
  gtfId: string; gtfNumber: string; planId: string | null;
  cambios: CambioDeCodigo[];              // Blas: 44
  items: { trozadoId: string | null; de: string; a: string }[];   // Blas: 22
  bloqueos: string[];                     // choque de código, mes cerrado, CTP atado con el código viejo, talas referenciales que lo citan
  huella: string;                         // sha256(JSON estable de cambios + items)
}
export const ForestLothCodigoUnicoDB = {
  /** Sólo lee. Guías `emitida` cuyas trozas entraron por importación (obs «Importada de la GTF <N°>») con código crudo. */
  guiasAMigrar(tenantId: string): Promise<{ gtfId: string; gtfNumber: string; trozas: number }[]>;
  plan(tenantId: string, gtfId: string): Promise<PlanCodigoUnico>;
  /** Una tx por guía: FOR UPDATE ORDER BY id de líneas + GTF; recalcula el plan; huella distinta o bloqueos → aborta. */
  migrarGuia(tenantId: string, input: unknown): Promise<{ cambiadas: number; items: number }>;
  /** Restaura desde el respaldo sólo si cada línea tiene hoy el código `a` del respaldo. */
  revertirGuia(tenantId: string, input: unknown): Promise<{ restauradas: number }>;
};
```

- Auditoría: acción nueva `loth_codigo_unico_migrado` / `loth_codigo_unico_revertido` en `LothAuditAction` (`lib/forestal/loth-audit.ts:51`), 1 entrada por guía con «1→1-0001, …» en `detail`.
- Invalidación tras commit: `invalidateByPrefix(\`forest-loth:${tenantId}\`)` + `invalidateByPrefix(\`forest-gtf:${tenantId}\`)` (mismo par que `forest-loth.db.ts:726`).

## 4. Archivos que se tocan

| Archivo | Cambio |
|---|---|
| `lib/forestal/codigo-unico-troza.ts` (NUEVO) | §3.1 |
| `lib/forestal/gtf-talonario.ts` | exportar `tramosDe` |
| `lib/forestal/loth-importar-guia.ts` | borrar `codigoUnicoDeGuia`; `codigosParaRevisar` = crudo + candidatos; `revisarGuia` §2.1/2.4/2.5/2.6; `arbolDeCodificacion` y `arbolesParaTrazar` quitan el sufijo primero; `codigosDeLaGuia` mapea TODA troza cuyo `codificacionGuia` ≠ `trozaCode` (no sólo renombradas); `observacionTrozado` **mismo texto** |
| `lib/db/forest-loth-importar.db.ts` | `libroDe` (≈l.263): además de `trozaCode IN (…)`, traer Trozados vivos del tenant con `trozaCode startsWith "<código>-"` para detectar el repetido (filtrar en puro con `codigoDeLaGuia`); l.749 sin cambio de llamada |
| `lib/forestal/loth-censo-uso.ts:44` | `arbolDeTroza` quita el sufijo primero y después aplica su regla de siempre («1-0001» → «1»; hoy daría «1» por casualidad y «12-A-019/0001» entero) |
| `lib/forestal/medidas-desde-guia.ts:90` | `flojo` quita el sufijo antes del paréntesis |
| `lib/forestal/loth-guia-despacho.ts:177` | `codigoImpreso` con fallback `codigoDeLaGuia` |
| `lib/forestal/loth-audit.ts` | 2 acciones nuevas |
| `lib/db/forest-loth-codigo-unico.db.ts` (NUEVO) | §3.4 |
| `scripts/migrar-codigo-unico-adr-NNN.mjs` (NUEVO) | §5 |
| `components/admin/forestal/LothImportarGuiasTablas.tsx`, `LothImportarGuiasRenombres.tsx`, `hooks/use-importar-guias.ts` | el chip «Código nuevo» deja de marcar TODAS: sólo `renombrada` = «Repite código de la GTF X»; la columna «Código único» siempre llena; payload igual |
| `docs/adr/ADR-474-…md` | Estado: «Reemplazado en §2 (cuándo se renombra) por ADR-NNN» |
| Tests (§6) | 4 nuevos/actualizados + 3 ajustes |

**No se tocan** (leen el código como opaco y siguen bien): `forest-loth.db.ts` (T1-T4, `despacharConGuiaEnTx`, `traceByCode` hereda el arreglo de `arbolesParaTrazar`), `loth-kardex.ts`, `loth-labels.ts`, `loth-troza-etiquetas.ts`, `loth-pasaporte-print.ts`, `guia-th-al-ctp.ts` (ata por `trozadoId` y luego por `code` único), `loth-importar-guia-deshacer.ts`, `tramites-relacion-guias.ts` (usa `codigoImpreso`), `LothEntryForm.tsx` (manual). Zona de peligro: **ninguno**. Schema: **sin cambios**.

## 5. Migración (datos, sin schema) — ensayo en seco + respaldo

Orden de construcción (para poder ensayar en main con datos de verdad):
1. Construir `codigo-unico-troza.ts` + DB class + script **antes** de cambiar el importador.
2. En **main**, con el importador VIEJO: importar 2 guías del mismo permiso (la 2.ª repite «12A») → quedan líneas crudas + 1 renombre viejo.
3. Ensayo en main (`node scripts/migrar-… --tenant main`) → leer el plan → `--aplicar` en main → curl/captura del libro, «Datos» de la guía, Relación, `/verificar/<código>`, «Deshacer la importación» de la 2.ª guía → `--revertir` con el respaldo → volver a aplicar.
4. Cambiar el importador (§4) y correr tests.
5. Blas: ensayo → Brandon mira el plan → `--aplicar` **sólo con su OK**.

Script (`scripts/migrar-codigo-unico-adr-NNN.mjs`, patrón `migrar-blas-wasaco-adr437.mjs`):
- **Ensayo (por defecto):** `BEGIN READ ONLY … COMMIT` (nunca `SET SESSION`, nunca escribir+rollback); arma el plan en puro; imprime tabla «línea · sección · de → a» + totales; **frena** si algo no cuadra con lo esperado de Blas (22 trozado + 22 despacho + 22 items, 0 bloqueos, 0 colisiones, `trozadoId` de cada item = una línea del plan); escribe el **respaldo JSON** `{ tenantId, fecha, gtf: { id, gtfNumber, items originales }, lineas: [{ id, section, lineNo, trozaCode, updatedAt }], plan, huella }` en `.claude/autonomo/respaldos/codigo-unico-<tenant>-<fecha>.json` e imprime la huella.
- **`--aplicar --huella <sha>`:** llama `ForestLothCodigoUnicoDB.migrarGuia` (shim tsx como el script de ADR-437). En la tx: lock `FOR UPDATE ORDER BY id`; recalcula; huella ≠ → aborta «cambió desde el ensayo»; revisa otra vez colisiones (cualquier línea no borrada del tenant, cualquier status, y items de otras GTF), mes cerrado, CTP con `lothTrozadoId` del plan y `codificacion` = código viejo (si hay → bloquea), talas referenciales que citen el código viejo en `medicionCruda.referencial.trozas` (si hay → se reescriben en la misma tx); `UPDATE "trozaCode"` por id (44); `items` de la GTF emitida: `code` = nuevo, `codigoGuia` = viejo, resto igual (1 fila); auditoría; invalidación. Salida a archivo, leer la 1.ª línea antes de seguir (regla del ensayo que vació main).
- **`--revertir <respaldo.json>`:** sólo si cada línea tiene hoy el código `a`; restaura `trozaCode` e `items` del respaldo.
- **Esperado después en Blas:** `select count(*) … where "trozaCode" ~ '-0001$'` = 44; items con `codigoGuia` 22/22; la Relación de guías imprime «1»…«22»; el libro muestra «1-0001»…; `/verificar/1` sigue abriendo la cadena del árbol 1; vista previa de la misma guía = 22 `ya_trozada`.

## 6. Tests

| Archivo | Casos |
|---|---|
| `__tests__/codigo-unico-troza.test.ts` (NUEVO) | `correlativoCorto`: 0000001→0001, 0000120→0120, 0090002→90002, 9000459→9000459, «TEST-GTF-9001»→9001, vacío→null · candidatos N1/N2/N3 (3 tramos), N1/N2 (2 tramos), descarta > 60 · `partirCodigoUnico` ida y vuelta con «1», «12A», «12-A», «85-TOR-A», «13/A (0000008)», «QABK-THCTP-1-A» · negativos: «85-TOR-A», «SC-…-3», «001-BOL», «85-1» · con `gtfNumber` no parte si el correlativo no es el de esa guía |
| `__tests__/loth-importar-guia-codigo-unico.test.ts` (reescribir los 17) | 1.ª guía «12A» → «12A-0001» `nueva` sin casilla · 2.ª guía del mismo permiso «12A» → «12A-0002» `renombrada` + `renombre_sin_confirmar` sin casilla · dos talonarios mismo correlativo → «12A-019/0001» · N3 · todo tomado → `conflicto` · otro permiso → `conflicto` · troza cruda registrada a mano sin salida → `ya_trozada` con su código · guía vieja ya importada cruda → `ya_trozada` · guía nueva ya importada → `ya_trozada` (no suma dos veces a la tala) · `codigosDeLaGuia` mapea todas · Deshacer reconoce la observación igual que antes |
| `__tests__/forestal-loth-importar-guia.test.ts` (39 casos, fichas reales de Blas) | ajustar los `trozaCode` esperados al sufijo; las talas referenciales siguen sumando por árbol |
| `__tests__/loth-censo-uso.test.ts` | invariante `arbolDeTroza(x + sufijo) === arbolDeTroza(x)`: «1-0001»→«1», «12-A-019/0001»→«12», «12A-0001»→«12A» (igual que «12A» hoy: el pegado sin guion es una limitación vieja de `arbolDeTroza`, no de K1), «85-TOR-A»→«85-TOR». Regex del sufijo verificada en node con 13 códigos (§3.1) |
| `__tests__/forestal-medidas-desde-guia.test.ts` | CTP «12A-0001» ↔ ficha «12A» empareja `flexible` |
| `__tests__/forestal-loth-trace.test.ts` | `arbolesParaTrazar("12A-0001")` raíz «12»; «1-0001» raíz «1» |
| `__tests__/forestal-loth-codigo-unico-db.test.ts` (NUEVO, prisma simulado como `forestal-guia-th-al-ctp-db.test.ts`) | plan de Blas (fixture de 22) → 44 cambios + 22 items; huella distinta → aborta; colisión → bloquea; observaciones intactas; `trozadoId` intacto; revertir sólo si coincide |
| Camino del usuario (main) | vista previa → importar 2 guías → Datos (dos columnas) → Relación (imprime el de la guía) → Deshacer; `curl -s -o /dev/null -w '%{http_code}' localhost:3000/verificar/12A-019%2F0001` = 200 con cadena; 1 captura claro 1280 de la vista previa |

Reviewer **Opus** obligatorio (T1 anti-blanqueo = compliance OSINFOR; >150 líneas de lógica). `security`: no hace falta (sin RBAC ni cruce de tenants), salvo que Brandon elija «sí» en P3.

## 7. Riesgos

1. **Se pierde la alarma natural de T1**: con sufijo siempre, la MISMA troza física listada en dos guías ya no choca por código. Mitigación: §2.4 (casilla cuando el código de guía se repite en el mismo permiso) — si se omite, OSINFOR vería volumen doble.
2. **Etiquetas/QR ya impresos en Blas** con «1»…«22»: el QR viejo sigue abriendo (por árbol), pero la etiqueta dice otro código que el libro (P2).
3. **«/» en el QR** (nivel 2/3): `encodeURIComponent` → `%2F`; si Next/Vercel normaliza `%2F` a `/`, `/verificar/[code]` da 404. Probar con curl antes de cerrar; plan B: separador «.» (P4).
4. **Parser por patrón**: un código tipeado a mano que termine en `-dddd` se tomaría por único (0 hoy). Mitigación: con `gtfNumber` se exige que el correlativo sea el de la guía; `LothEntryForm` podría avisar (fuera de alcance).
5. **T4 por `treeCode` de todo el negocio** (pre-existente): árboles «1»…«22» de plantación chocan con los de otro permiso; no lo arregla este contrato (§2.5, P3).
6. **CTP tipeado a mano** «1» vs pase desde el libro «1-0001»: `trozasYaEnElLibro` no los verá como la misma (hoy Blas: 0 atadas). El pase ata por `trozadoId` primero.
7. **Choque con la fase 2 (G)**: G muestra dos columnas con `codigoImpreso`; K1 cambia sólo su fallback. G no debe crear otro helper.
8. **Tests grandes**: ~56 casos que cambian expectativas → diff grande; separar el commit del módulo puro del del importador.
9. **Escritura en Blas real**: sólo la DB class, con huella del ensayo y respaldo; nunca «ensayo con rollback».

## 8. Borrador de ADR (sin número)

**ADR-NNN — Código único de troza SIEMPRE por guía (reemplaza §2 de ADR-474)**

- **Estado:** propuesto (2026-10-08). Relacionados: ADR-474, ADR-461, ADR-305 (T1-T5), ADR-450.
- **Contexto:** ADR-474 renombraba sólo cuando el código ya había salido con otra guía del mismo permiso («12A (0000002)»). Brandon (08-10) quiere que el código único sea SIEMPRE visible y uniforme en cada guía: «12A-0001». Medido: 0 códigos existentes con ese sufijo; Blas tiene 22 trozas importadas con código crudo; main 0 vivas.
- **Decisión:** toda troza que entra desde una guía lleva `<código>-<correlativo corto>`; choque de talonarios → `<código>-<serie>/<corto>` y luego `<código>-<serie completa>/<corto>`. El código de la guía se deriva del único y se guarda además en `ForestGtf.items[].codigoGuia`. La casilla de ADR-474 se mantiene cuando el código de guía se repite en el mismo permiso. Sin schema. Migración de Blas con ensayo, respaldo y huella.
- **Consecuencias:** el libro, el kárdex, las etiquetas y el CTP muestran el único; la hoja SERFOR y la Relación, el de la guía. Las trozas de un permiso dejan de chocar entre guías por construcción. Los parsers de árbol aprenden el sufijo.
- **No resuelve:** la clave (permiso, código) entre permisos ni el T4 por `treeCode` de todo el negocio; el despacho manual (P1).
- **Alternativas descartadas:** guardar el único en `despachoCode` (vacío 22/22) — partiría la identidad de la troza en dos columnas y T1/T3/«Deshacer» atan por `trozaCode`; correlativo de 4 fijos — chocaría cada 10 000 guías (main ya tiene 0090002); columna nueva `codigoGuia` en `ForestLothEntry` — schema innecesario mientras el sufijo sea inequívoco.

## 9. Preguntas que sólo Brandon puede contestar

| # | Pregunta | Recomendado |
|---|---|---|
| P1 | ¿«Siempre» incluye las trozas que trozas a mano en el libro y sacas con una guía que emite el sistema? Su código ya lo pusiste tú y puede estar en la etiqueta. | No: sólo las que entran desde una guía importada |
| P2 | ¿Imprimiste etiquetas/QR de las 22 trozas de Blas («1»…«22»)? Tras migrar, el QR viejo abre igual, pero el papel dirá «1» y el libro «1-0001». | Si las hay, reimprimir |
| P3 | La misma numeración en guías de OTRO permiso (Blas: árboles 62 y 85, GTF 010-001-0000014): ¿entran ya con su código único o siguen bloqueadas hasta ordenar los árboles por permiso? | Siguen bloqueadas (otro ADR + security) |
| P4 | Si «/» rompe el enlace del QR: ¿`12A-019.0001` te sirve? | Sólo si el curl falla |
| P5 | Guías con correlativo > 9999 (`…-0090002`): ¿«12A-90002» (crece) o los últimos 4 «12A-0002»? | Crece |
| P6 | Segunda guía del mismo permiso que repite «12A»: ¿seguimos pidiendo la casilla «son otras trozas»? | Sí (si fueran las mismas, OSINFOR vería doble volumen) |
| P7 | ¿Autorizas `--aplicar` en Blas después de ver el ensayo? | Ensayo primero, luego tu OK |
