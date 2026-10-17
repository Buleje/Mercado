# ADR-138 · Importación del Libro de Operaciones CTP (LO-CTP)

- **Estado:** Aceptado (Etapa 1 — Ingresos)
- **Fecha:** 2026-07-18
- **Contexto forestal:** [[134-forestal-ctp-fk-costos]] · [[135-forestal-ctp-despacho-origen]] · [[137-forestal-ctp-serfor-alineacion]]

## Contexto

Un CTP que ya lleva su Libro de Operaciones (en el LOE-CTP del SNIFFS, o en un Excel
con el formato oficial) necesita **cargar todo su histórico** a la app sin re-teclear
cientos de ingresos, consumos, producciones y despachos.

Investigación (2026-07-18, fuentes SERFOR):
- **RDE N.° D000025-2023-MIDAGRI-SERFOR-DE** aprueba el **formato oficial del LO-CTP**
  (vigente desde 2023-01-20): registros de **Ingreso · Consumos · Producción · Salida**
  con columnas fijas.
- El **manual LOE-CTP / MC-SNIFFS** documenta que la carga de Transformación al SNIFFS
  se hace **desde una plantilla Excel** — o sea, el mecanismo oficial de carga masiva
  **ya es un Excel**.
- La app **ya exporta** ese formato exacto (`lib/forestal/ctp-export.ts` →
  `exportarLibroCtpOficial`: hojas `Datos del CTP · 1. Ingreso · 2. Consumos ·
  3. Producción · 4. Salida`).

## Decisión

**El importador consume el mismo Excel LO-CTP que la app exporta** (round-trip), que
es el formato oficial RDE D000025-2023 y equivale a la plantilla del SNIFFS. Un CTP
usa **un solo archivo** para el SNIFFS y para la app.

Contrato:
1. **Parseo client-side** (`lib/forestal/ctp-import.ts`, ExcelJS en el browser) —
   detecta la hoja de Ingresos (`1. Ingreso` oficial o `Ingresos` interno, por nombre
   o por cabeceras) y mapea filas → `ImportedIngreso[]` **tolerante a variantes de
   cabecera** (normaliza acentos/puntuación). El titular sale de la columna `Titular`
   (interno) o del primer segmento de `Observaciones` (oficial).
2. **Dry-run obligatorio** — el endpoint `POST /api/admin/forestal/wood-entries/import`
   con `mode:"preview"` valida cada fila (Zod `safeParse` + GTF presente + volumen > 0)
   y marca `crear | existe | error` **sin escribir**. La UI muestra el detalle; el
   operador confirma.
3. **Commit idempotente** — `mode:"commit"` crea sólo las filas `crear`, **saltando las
   que ya existen por `gtfNumber`** (re-importar el mismo archivo no duplica). Cada alta
   pasa por `WoodEntriesDB.create` (mismas validaciones/audit que el alta manual) y por
   `ctp-audit`.
4. **Etapas** (rollout): Etapa 1 = **Ingresos** (sin dependencias). Etapas siguientes =
   Producción → Consumos → Salidas, en ese orden (dependencias: un consumo necesita el
   ingreso y la corrida; un despacho necesita la corrida). Cada etapa reusa el mismo
   pipeline (parse → preview → commit idempotente).

## Consecuencias

- **Origen legal preservado:** no se crea un ingreso sin `gtfNumber` (fila sin GTF =
  `error` en el preview, nunca se importa). Mismo guardrail que el alta manual.
- **Sin schema nuevo** — reusa `WoodEntry`, `WoodEntriesDB.create`, `ctp-audit`.
- **Invariantes intactas:** los ingresos no las tocan; cuando se agreguen consumos/
  despachos (etapas 2+), la atribución pasará por `setConsumos`/`setOrigenes` (I1–I5).
- El status de un ingreso importado es `pendiente` (igual que el alta manual): el
  operador valida después. No se auto-valida al importar (un import no acredita origen).
- **Idempotencia por `gtfNumber`**: si un CTP legítimamente tiene dos ingresos con la
  misma GTF (raro), el segundo se salta. Se documenta en el preview.

## Alternativas descartadas

- **Subir el archivo al server y parsear ahí:** el parseo client-side evita manejo de
  archivos en el API y deja el endpoint recibiendo JSON validado (más simple + testeable).
  El server igual re-valida (nunca confía en el cliente).
- **Import directo sin preview:** rechazado — crea datos fiscalizables; un import a ciegas
  puede meter basura difícil de revertir. El dry-run es innegociable.
- **Formato propio (CSV custom):** rechazado — el objetivo es el formato **oficial** para
  que sea un solo archivo con el SNIFFS.

## Referencias

- RDE N.° D000025-2023-MIDAGRI-SERFOR-DE (formato LO-CTP).
- Manual LOE-CTP / MC-SNIFFS (carga desde plantilla Excel).
- `lib/forestal/ctp-export.ts` (formato exportado = target del round-trip).
- Skill `serfor-osinfor-compliance`.
