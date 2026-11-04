# Contrato — copiar de Alegra: detracción, venta desde foto, guía desde la GTF (18-10-2026)

> Architect, solo lectura. Medido contra la base real (READ ONLY) y fuentes SUNAT descargadas el 18-10-2026.
> Lo marcado **sin mapear** / **sin verificar** no se buscó por tope de llamadas: el carril lo resuelve con 1 grep.

## 0. Medición (READ ONLY, 18-10-2026)

| Qué | Blas (`cmpxiv6p4000bohvzwl6bnfpv`) | Todos los tenants |
|---|---|---|
| `SunatInvoice` | 0 | **0** (0 aceptados) |
| `TenantSunatConfig` (token Nubefact) | 0 | **0** |
| `GuiaRemision` | 0 | 0 |
| `Cotizacion` | 0 | 0 |
| `Order` | 0 | — |
| Ventas de madera anotadas (`ForestCuentaMov` concepto venta, cargo) | 0 (0 > S/ 700) | — |
| `ForestGtf` / `ForestGuiaGuardada` | 5 / 2 | — |
| `Product` | 10, los 10 `taxType = gravado` (0 exonerados) | — |

Conclusión: **hoy no se emite ningún comprobante electrónico en ningún tenant**. Las tres piezas se construyen sobre caminos ya escritos pero sin estrenar (patrón de la memoria `ctp-capacidades-construidas-sin-usar`).

---

## 1. Detracción al vender madera — **ZONA DE PELIGRO** (dinero + tributos + `prisma/schema.prisma`)

### 1.1 Cifras oficiales (citadas, no inventadas)

| Dato | Valor | Fuente oficial (consultada 18-10-2026) |
|---|---|---|
| Bien | «Madera», Anexo II numeral 7: subpartidas 4403.10.00.00/4404.20.00.00, 4407.10.10.00/4409.20.90.00 y 4412.13.00.00/4413.00.00.00 (rolliza 4403, aserrada 4407 y contrachapada entran) | https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones |
| **Tasa** | **4 %** «desde el 01.01.2015» (porcentaje modificado por el art. 4 de la R.S. 343-2014/SUNAT, publicada 12.11.2014). El XLS del anexo en sunat.gob.pe (`183_04_anex02.xls`, última modificación 2016) todavía dice 9 %: **está desactualizado, no usarlo** | misma URL |
| Código del bien | Anexo IV: «8 Madera»; Catálogo 54 UBL: **008 Madera** | https://www.sunat.gob.pe/legislacion/superin/2017/anexoVII-117-2017.pdf |
| **Umbral** | No se aplica si el importe de la operación es **≤ S/ 700,00**, ni si el comprobante no da crédito fiscal (boleta) — art. 8 R.S. 183-2004/SUNAT, sustituido por art. 2 R.S. 032-2006/SUNAT | https://www.sunat.gob.pe/legislacion/superin/2004/183.htm (texto consolidado; la página tiene notas sólo hasta 2008 — vigencia 2026 del umbral **sin verificar** contra otra fuente) |
| Operaciones sujetas (Anexo 2) | «La venta **gravada con el IGV**» y el retiro (art. 7) | 183.htm |
| Leyenda | Catálogo 52 código **2006** «Operación sujeta a detracción» | https://www.sunat.gob.pe/legislacion/superin/2017/anexosV-318-2017.pdf |
| Medio de pago | Catálogo 59 **001** «Depósito en cuenta» | anexosV-318-2017.pdf |
| Tipo de operación | Catálogo 51 **1001** «Operación sujeta a detracción»: **sin verificar** — los PDF 2017 leídos sólo traen 0101-0111. No bloquea: Nubefact lo arma con `sunat_transaction: 30` | — |
| Portal SUNAT | Desde el 10-04-2023 la factura del portal incluye los datos de la detracción | https://cpe.sunat.gob.pe/factura-con-detraccion |
| Campos Nubefact (proveedor, no SUNAT) | `sunat_transaction: 30`, `detraccion: true`, `detraccion_tipo: 8` (=008 Madera), `detraccion_porcentaje`, `detraccion_total`, `medio_de_pago_detraccion: 1` (=001). La cuenta del Banco de la Nación se registra en el panel de Nubefact («cuentas bancarias»), no en el JSON | Copia del doc NUBEFACT-DOC-API-JSON-V1 (espejo GitHub); **verificar contra el doc vigente de Nubefact** antes de enviar |

**Amazonía (Ley 27037, art. 13.1):** exonera del IGV la venta de bienes que se efectúa en la zona para su consumo en la misma; SUNAT la da por vigente (Informe 028-2018-SUNAT/7T0000: https://www.sunat.gob.pe/legislacion/oficios/2018/informe-oficios/i028-2018-7T0000.pdf). Como el SPOT del Anexo 2 sólo alcanza a la venta **gravada** (art. 7), la regla queda:

| Venta de madera de Blas | IGV | Detracción |
|---|---|---|
| Comprador y consumo dentro de la Amazonía (Ucayali; Oxapampa) — y Blas cumple los requisitos de la Ley 27037 | Exonerada | **No** (no es venta gravada) |
| Destino fuera de la zona (Lima, Huánuco…) | Gravada 18 % | **Sí, 4 %** si es factura y el importe > S/ 700 |
| Boleta, o factura ≤ S/ 700 | Según lo anterior | No |

Los requisitos de la Ley 27037 (domicilio, administración, activos en la zona) **no se verificaron**: los confirma el contador. Ojo: R.S. 000078-2022 suspendió el SPOT al traslado «desde zona con beneficios hacia el resto del país», pero sólo para el **Anexo 1** (azúcar/alcohol); la madera es Anexo 2 desde el 01-10-2005: no aplica.

### 1.2 Qué existe

| Pieza | Dónde |
|---|---|
| Camino vivo de emisión = **Nubefact JSON**, no UBL a mano | `lib/sunat/nubefact-client.ts:38` (`sunat_transaction: 1` como tipo literal), `lib/sunat/invoice-builder.ts:158` `buildFactura` (`:178` fija 1), `lib/integrations/sunat.ts:361` `emitirFactura` (Zod `:45` ya trae `afectacion` gravado/exonerado/inafecto) |
| Ruta | `app/api/admin/sunat/generate-invoice/route.ts:39` (`requireAdmin` admin, cajero) + `isSunatOficial` |
| Config por tenant | `TenantSunatConfig` (`prisma/schema.prisma:4074`): token, series, `ubigeo`; **sin cuenta de detracciones**. `SunatDB.getConfig` `lib/db/sunat.db.ts:282`, `upsertConfig` `:302` |
| Factura guardada | `SunatInvoice` (`schema.prisma:4097`): sin tipo de operación ni detracción |
| Líneas e IGV | `lib/sunat/lineas-comprobante.ts:32` `TASA_IGV`, `:38` `AFECTACION_IGV`, `:51` `afectacionDe` |
| Camino viejo (UBL a mano) | `lib/sunat.ts:147` `generateXML`, `:205` `InvoiceTypeCode listID="0101"` fijo; lo usan `app/api/invoices/sunat/route.ts`, `app/api/invoices/emit/route.ts`, `lib/sunat-invoice.ts`. **No recibe detracción**: debe rechazar una venta sujeta (no duplicar lógica) |
| Venta forestal | `ForestCuentaMov` (`schema.prisma:7836`); `lib/db/forest-cuenta.db.ts:233` `anotarVentaDeGuia` (cargo «venta» con `referencia = gtfNumber`, `:266`) y `lib/forestal/cubicacion-a-cuenta.ts:104`. **No genera comprobante**. La GTF guarda el N° de factura como texto: `lib/forestal/ctp-gtf-datos.ts:348` `comprobante {tipo, numero}` |
| Hoy «detracción» | sólo texto: `components/admin/TaxTab.tsx:48`, `lib/contabilidad/libros/registro-compras.ts:95-96,210`, `lib/tax/obligaciones-peru.ts:10` |

### 1.3 Contrato

```ts
// lib/sunat/detraccion.ts  (NUEVO, puro, sin I/O — lo importan backend y la vista previa)
export const SPOT_MADERA = {
  codigoBien: "008",          // Catálogo 54
  nubefactTipo: 8,            // detraccion_tipo de Nubefact
  porcentaje: 4,              // Anexo II num. 7, desde 01-01-2015 (R.S. 343-2014/SUNAT)
  umbralSoles: 700,           // art. 8 R.S. 183-2004 (R.S. 032-2006): aplica si importe > 700
  leyenda: "2006",            // Catálogo 52
  medioPago: "001",           // Catálogo 59
  fuente: "https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones",
} as const;

export type MotivoDetraccion =
  | "aplica" | "importe_hasta_700" | "no_gravada" | "boleta_sin_credito_fiscal" | "bien_no_sujeto";

export interface DetraccionCalculada {
  aplica: boolean;
  motivo: MotivoDetraccion;
  codigoBien: "008" | null;
  porcentaje: number;          // 4 | 0
  base: number;                // importe de las líneas gravadas CON IGV (decisión técnica, la confirma el contador)
  monto: number;               // round2(base × 4 %)
  netoACobrar: number;         // total − monto (lo que el cliente paga a Blas fuera del BN)
}

export function calcularDetraccion(i: {
  tipoComprobante: "factura" | "boleta";
  totalGravadoConIgv: number;  // de armarLineasComprobante
  bienSujeto: "008" | null;    // null = la venta no es de madera
}): DetraccionCalculada;
```

- Nubefact (`lib/sunat/nubefact-client.ts`): `sunat_transaction: 1 | 30`; opcionales `detraccion?: boolean; detraccion_tipo?: number; detraccion_porcentaje?: number; detraccion_total?: number; medio_de_pago_detraccion?: number`.
- `buildFactura(order, tenant, settings, customer, detraccion?: DetraccionCalculada)`: si `aplica` → 30 + campos; si no → igual que hoy (1).
- `FacturaInputSchema` (`lib/integrations/sunat.ts`) suma `bienSujetoDetraccion: z.enum(["008"]).optional()`. **El cliente nunca manda porcentaje ni monto**: el servidor llama a `calcularDetraccion` (regla 6). Si `aplica` y `config.cuentaDetracciones` está vacío → `{ success:false, error:"Falta la cuenta de detracciones del Banco de la Nación" }` (no se emite).
- Respuesta de `POST /api/admin/sunat/generate-invoice` (roles sin cambio: admin, cajero) suma `detraccion: DetraccionCalculada`.
- Producto: la madera se marca con su código SPOT. Sin columna nueva en `Product` (no tocar formularios de producto: los tiene otro carril); el bien sujeto se decide por la venta (venta forestal = «008»). **Sin mapear**: qué pantalla llama hoy a `generate-invoice` (candidata `components/admin/sunat/EstadoSunatLinea.tsx`).

**Schema (aditivo, va en el carril 0):**
```prisma
model TenantSunatConfig { cuentaDetracciones String? }        // N° cuenta BN
model SunatInvoice {
  tipoOperacion        String?                 // "0101" | "1001"
  detraccionCodigo     String?                 // "008"
  detraccionPorcentaje Decimal? @db.Decimal(5, 2)
  detraccionMonto      Decimal? @db.Decimal(12, 2)
}
```

### 1.4 ADR para pegar con `/adr`
- **Título:** Detracción SPOT en la factura de madera (4 %, bien 008) calculada en el servidor
- **Contexto:** Alegra sugiere el monto al marcar «Operación sujeta a detracción». Buleje emite por Nubefact con `sunat_transaction` fijo en 1; 0 comprobantes emitidos; las ventas de madera de Blas viven en la cuenta corriente forestal, sin comprobante. La Amazonía exonera parte de esas ventas.
- **Decisión:** una función pura `calcularDetraccion` con las cifras citadas; el servidor decide `aplica` (factura + gravada + > S/ 700 + bien 008); Nubefact arma el UBL (30/8/4 %/001); el camino UBL a mano rechaza ventas sujetas; la factura guarda tipo de operación y monto.
- **Alternativas:** (a) armar el UBL nosotros (`lib/sunat.ts`) — descartada: hay dos caminos y Nubefact ya lo resuelve; (b) que el usuario escriba el monto — descartada: regla 6; (c) tasa por producto en `Product` — descartada por ahora: sólo la madera aplica y los formularios de producto son de otro carril.

### 1.5 Tests y verificación
- `__tests__/sunat-detraccion.test.ts` (nuevo): 700,00 → no; 700,01 → sí, 28,00; exonerada → no; boleta → no; 1.180 → 47,20; bien null → no.
- `__tests__/sunat-invoice-builder.test.ts` (existe): factura con detracción → 30, tipo 8, 4, 001; sin detracción → payload idéntico al de hoy.
- Camino del usuario: **bloqueado** hasta tener token de Nubefact (sandbox) y cuenta BN en QA (0 configs hoy). Con token: QA forestal `inversiones-agroforestales-blas-sociedad-op-qa-ui` → factura de S/ 1.180 a un RUC de Lima → la vista muestra «Operación sujeta a detracción 4 % = S/ 47,20» → el PDF de Nubefact sandbox trae la leyenda → `SELECT "tipoOperacion","detraccionMonto" FROM "SunatInvoice"` = 1001 / 47.20.

---

## 2. Venta desde una foto — FEATURE (sin schema, no es zona de peligro)

### 2.1 Qué existe
| Pieza | Dónde |
|---|---|
| Lector de compras por foto | `app/api/ocr/invoice/route.ts:126` (admin, almacenero), `:38` `RequestSchema {image}`, `:43` `InvoiceSchema` (ítems SIN producto emparejado); visión `lib/ai/vision-extract.ts:497` `visionExtractJSON` + tope de gasto `aiCostGuard` |
| Flujo «papel» | `components/admin/comandos-ia/papel/*`: `use-leer-papel.ts:57` → `/api/admin/comandos-ia/papel/entender` (OCR del navegador primero, $0); `lib/admin/comandos-ia/papel.ts:14` `TipoPapel = factura|yape|lista-precios|otro`; `entender/route.ts:192` `propuestaCompra` (empareja con el catálogo — emparejador interno **sin mapear**); `RevisarPapelModal.tsx:36` casos compra/cobro/precios; `SelectorProducto.tsx:80` busca en `/api/v1/products?q=` |
| Pantallas que crean venta/cotización | Cotizaciones: `components/admin/cotizaciones/NuevaCotizacionModal.tsx` (88 l.) → `PasoCliente` → `PasoItems.tsx` (143 l.; `:125` `TotalesPrevios` = sólo vista previa) → `VistaPreviaCotizacion.tsx` (= el paso «revisar antes de guardar»). POS y `PuntoCompraOrderCreator.tsx`: **fuera** (los tiene otro carril) |
| API | `POST /api/cotizaciones` `app/api/cotizaciones/route.ts:50` (admin, owner, manager), `:54` safeParse, `:85-91` totales en el servidor; `POST /api/cotizaciones/[id]/convertir` `:18` → `Order` (`:88` usa `tx.order.create` en la ruta: deuda de la regla 1, no se toca acá) |
| DB | `lib/db/cotizaciones.db.ts:180` `create`, `:305` `productosParaCotizar` |

**Bug que hereda:** `app/api/cotizaciones/route.ts:90` calcula `igv = subtotal * 0.18` fijo: ignora productos exonerados (Amazonía). Toca dinero → arreglo con `afectacionDe` (`lib/sunat/lineas-comprobante.ts:51`) + `reviewer`.

### 2.2 Contrato
```ts
// POST /api/ocr/pedido   requireAdmin(req, ["admin","owner","manager"])  (mismos roles que crear cotización)
const PedidoFotoRequest = z.object({ image: z.string().min(100).max(10_000_000) });
export interface PedidoLeido {
  cliente?: { nombre?: string; documento?: string };      // si el papel lo trae; nunca inventado
  items: Array<{
    textoLeido: string;          // «2 cj leche gloria»
    cantidad: number;
    precioLeido: number | null;  // referencia; NO se usa para el total
    productoId: number | null;   // emparejado del catálogo
    productoNombre: string | null;
    precioCatalogo: number | null;
    confianza: "alta" | "media" | "baja" | "sin_match";
    alternativas: Array<{ productoId: number; nombre: string; precio: number }>; // ≤3
  }>;
  costoIaUsd: number | null;
}
```
- Reusa `visionExtractJSON` + `aiCostGuard` igual que `ocr/invoice` (mismo tope de imagen y de tokens); prompt de «pedido/lista de un cliente».
- Emparejar: `lib/ventas/emparejar-pedido.ts` (NUEVO, puro: normaliza unidades «cj/caja», «doc/docena», tildes; puntaje por tokens) + `CotizacionesDB.productosPorTexto(tenantId, textos: string[], limite = 3)` (NUEVO en `lib/db/cotizaciones.db.ts`, cache por tenant; lectura, sin invalidate).
- Guardar = el `POST /api/cotizaciones` de siempre en BORRADOR: el servidor recalcula con el precio del catálogo. Nunca se crea una `Order` directa desde la foto; la venta sale con «Convertir» (existente).
- UI: botón «Desde foto» en `NuevaCotizacionModal.tsx` → `DesdeFotoPedido.tsx` (NUEVO) llena los ítems de `PasoItems` marcando en ámbar los de confianza baja/sin_match → el usuario corrige con el buscador → `VistaPreviaCotizacion` → Guardar.

### 2.3 Tests y verificación
- `__tests__/emparejar-pedido.test.ts` (nuevo): «2 cj leche gloria» → producto Leche Gloria, cantidad 2; texto sin match → `sin_match`; precio leído ≠ catálogo → gana catálogo.
- `__tests__/cotizaciones-estados.test.ts` (existe) sigue verde.
- Camino: `qaadmin` en `main` → Cotizaciones › Nueva › Desde foto → foto de una lista escrita a mano de 3 ítems → 3 filas emparejadas → Guardar → `GET /api/cotizaciones/<id>`: total = el del servidor. 1 captura (claro 1280).

---

## 3. Guía de remisión desde la GTF — FEATURE grande (schema aditivo = zona de peligro)

### 3.1 Qué existe
| Pieza | Dónde |
|---|---|
| Modelo | `GuiaRemision` `prisma/schema.prisma:3249`: placa, conductor nombre/DNI, transportista RUC/nombre, bultos, peso total/bruto, `puntoPartida`/`puntoLlegada` en TEXTO, `documentoRef`, `orderId`. **Faltan:** licencia, ubigeo de partida/llegada, modalidad, vínculo con la GTF. Ítems `:3283` (`unidad` NIU por defecto) |
| DB | `lib/db/guias-remision.db.ts:136` `siguienteNumero`, `:200` `create`, `:328` `update` (guardia TOCTOU), `:410` `anular` |
| API | `app/api/guias-remision/route.ts:40/:64` (admin, owner, manager, almacenero), `:68` safeParse |
| UI | `components/admin/guias-remision/*` (asistente `NuevaGuiaModal` + `GuiaPasoOrigen/Destino/Transporte/Revisar`, `use-nueva-guia.ts`, `imprimir-guia.ts` → botón «GRR SUNAT» en `GuiaDetalle.tsx:206`) |
| ¿Se envía a SUNAT? | **No.** `GuiaPasoOrigen.tsx:70` lo dice: «Todavía no se envía a SUNAT como guía electrónica». Sólo se imprime |
| Datos de la GTF | `lib/forestal/ctp-gtf-datos.ts`: `ubicacionSchema :73` (dirección + departamento/provincia/distrito en texto, sin código), destinatario `:262` (+ autorización), transportista `:272` (+ registro MTC), vehículo `:286` placa / `:292` placa del remolque / modo terrestre-fluvial, `:298-300` conductor, DNI, **licencia**; `:348` comprobante; `:364` `guiaRemisionNro` (casillero 29 de la GTF) |
| Dónde vive la GTF | `ForestCtpEntry.gtfDatos` (`schema.prisma:6874`, GTF de salida del CTP), `ForestGtf` (`:6758`, Libro TH: `conductor`, `conductorLicencia`, `placaVehiculo`, `destino`), `ForestGuiaGuardada`. Lectores: `lib/db/forest-ctp-despacho.db.ts`, `forest-gtf.db.ts`, `guias-guardadas.db.ts` (método exacto **sin mapear**) |
| Ubigeo | **Sí hay catálogo**: `lib/peru-ubigeo.ts` (paquete `ubigeo-peru`, 2.095 entradas INEI): `findDepartamentoByName :112`, `findProvinciaByName :117`, `findDistritoByName :122`, `bestMatchFromGeocode :148`. Origen fiscal en `TenantSunatConfig.ubigeo`. Que el catálogo de ubigeo SUNAT sea el INEI: **sin verificar** |
| Peso y bultos | La GTF **no trae peso** (sólo volumen PT/m³ y piezas); no hay densidad por especie en el repo (**sin mapear**). Bultos = paquetes del despacho (campo **sin mapear**) |

### 3.2 Contrato
```ts
// GET /api/guias-remision/desde-gtf?origen=ctp_salida|loth_gtf&id=<id>
//   requireAdmin(req, ["admin","owner","manager","almacenero"])
export interface BorradorGuiaDesdeGtf {
  borrador: CreateGuiaInput;          // el mismo body de POST /api/guias-remision
  faltan: Array<"pesoBruto" | "ubigeoPartida" | "ubigeoLlegada" | "licencia" | "destinatarioRuc">;
  avisos: string[];                   // «Ubigeo de llegada adivinado por nombre: Callería (250101)»
  guiaExistente: { id: string; numero: string } | null;   // ya hay una guía vigente de esa GTF
}
// lib/guias/desde-gtf.ts (NUEVO, puro)
export function guiaDesdeGtf(gtf: GtfDatos, ctx: { ubigeoFiscal: string | null; items: ItemDespacho[] }): BorradorGuiaDesdeGtf;
```
Mapa GTF → guía: `vehiculo.placa` → `vehiculoPlaca` (si `modo = fluvial`: aviso, la guía terrestre no aplica tal cual) · `vehiculo.conductor/conductorDni/licencia` → `conductorNombre/conductorDni/conductorLicencia` · `transportista.nombre/docNumero` → `transportistaNombre/Ruc` · `destinatario.*` → `destinatario*` + `puntoLlegada` + `ubigeoLlegada` (por nombre con `peru-ubigeo`) · origen = punto de partida de la GTF o, si falta, dirección fiscal + `TenantSunatConfig.ubigeo` · `comprobante.numero` → `documentoRef` · ítems = líneas del despacho (descripción = especie + medida, cantidad en PT primero, unidad **sin verificar** el código UN/ECE del pie tablar) · peso: lo escribe el usuario.

`POST /api/guias-remision` (existe) suma opcionales: `conductorLicencia`, `ubigeoPartida`/`ubigeoLlegada` (`/^\d{6}$/`), `modalidadTraslado` (`"01"|"02"`), `origenTipo`, `origenId`. 409 si ya hay una guía no anulada del mismo origen (`GuiasRemisionDB.getVigentePorOrigen(tenantId, origenTipo, origenId)`, NUEVO; con el mismo `invalidate` que use `create`).

**Schema (aditivo, carril 0):**
```prisma
model GuiaRemision {
  conductorLicencia String?
  ubigeoPartida     String?  // 6 dígitos
  ubigeoLlegada     String?
  modalidadTraslado String?  // "01" público | "02" privado
  origenTipo        String?  // "ctp_salida" | "loth_gtf"
  origenId          String?
  @@index([tenantId, origenTipo, origenId])
}
```
Devolver el N° de la guía a la GTF (`guia.guiaRemisionNro`, casillero 29) **no** se hace en esta fase: cambia el dato de la GTF (SERFOR).

### 3.3 Tests y verificación
- `__tests__/guia-desde-gtf.test.ts` (nuevo): GTF completa → placa/conductor/licencia/ubigeo llenos; distrito «Calleria» sin tilde → 250101; fluvial → aviso; sin destino → `faltan` lo dice.
- `__tests__/guias-remision-reglas.test.ts` (existe) verde.
- Camino: QA forestal → un despacho con GTF de salida → «Hacer guía de remisión» → asistente prellenado → escribir peso → Guardar → imprimir «GRR SUNAT» muestra licencia y ubigeo de 6 dígitos → `SELECT "origenId","ubigeoLlegada" FROM "GuiaRemision" WHERE "tenantId"=$1`. Botón de entrada en la pantalla de despacho: archivo **sin mapear**.

---

## 4. Carriles (archivos disjuntos)

| Carril | Agente | Archivos | Tamaño |
|---|---|---|---|
| 0 — schema (primero, una sola migración) | `database` (Opus) | `prisma/schema.prisma`, `prisma/migrations/<fecha>_alegra_detraccion_guia/migration.sql` | 2 · **DANGER** (§6). Sólo `ADD COLUMN … NULL` + 1 índice: expand sin contract. Migrar = SQL a mano → `aplicar-migracion-sesion.mjs` → `migraciones-cruce.mjs --verificar` → `migrate resolve --applied` (CLAUDE.md §7) |
| A — detracción | `backend` (Opus) + `security` + `reviewer` | `lib/sunat/detraccion.ts`*, `lib/sunat/nubefact-client.ts`, `lib/sunat/invoice-builder.ts`, `lib/integrations/sunat.ts`, `lib/db/sunat.db.ts`, `app/api/admin/sunat/generate-invoice/route.ts`, `lib/sunat.ts` (rechazo), `__tests__/sunat-detraccion.test.ts`*, `__tests__/sunat-invoice-builder.test.ts` | 9 · **DANGER** (dinero/tributos) |
| B — venta desde foto | `backend` (sonnet) + `frontend` (sonnet) | `app/api/ocr/pedido/route.ts`*, `lib/ventas/emparejar-pedido.ts`*, `lib/db/cotizaciones.db.ts`, `app/api/cotizaciones/route.ts` (IGV exonerado), `components/admin/cotizaciones/NuevaCotizacionModal.tsx`, `components/admin/cotizaciones/DesdeFotoPedido.tsx`*, `__tests__/emparejar-pedido.test.ts`* | 7 · FEATURE; `reviewer` por el arreglo del IGV |
| C — guía desde GTF | `backend` (sonnet) + `frontend` (sonnet) | `lib/guias/desde-gtf.ts`*, `lib/db/guias-remision.db.ts`, `app/api/guias-remision/route.ts`, `app/api/guias-remision/desde-gtf/route.ts`*, `components/admin/guias-remision/{use-nueva-guia.ts,NuevaGuiaModal.tsx,GuiaPasoOrigen.tsx,GuiaPasoDestino.tsx,GuiaPasoTransporte.tsx,imprimir-guia.ts}`, `__tests__/guia-desde-gtf.test.ts`* | 12 · FEATURE (depende del carril 0) |

`*` = nuevo (`ls` antes de crear). Ningún carril toca `lib/agenda/**`, `components/admin/administracion/**`, `app/api/admin/agenda/**`, `TabRouter.tsx`, `subvistas-modulos.ts`, `components/admin/inventario/{NuevoProductoDatos,EditarProductoDatos,ModalNuevoProducto}.tsx` ni el POS. Commits en fila al final (`git commit -F <msg> -- <archivos>`), tras `npm run test:guardianes`.

## 5. Riesgos
1. **No hay camino real de emisión** (0 comprobantes, 0 configs en todo el sistema): la detracción se puede construir y probar en tests, pero no por el camino del usuario hasta tener token Nubefact sandbox.
2. **Dos emisores** (Nubefact y UBL a mano en `lib/sunat.ts`): si una pantalla usa el viejo, la factura saldría como 0101 sin detracción → el viejo rechaza ventas sujetas.
3. **Venta de madera sin comprobante**: `anotarVentaDeGuia` anota la deuda pero no factura; el puente «venta de la guía → factura con detracción» es fase 2 (pantalla sin mapear).
4. **Productos de Blas todos `gravado`**: si Blas vende dentro de la Amazonía con exoneración, hoy se calcularía IGV y detracción de más.
5. IGV fijo 18 % en cotizaciones (`app/api/cotizaciones/route.ts:90`) y `prisma` directo en `convertir/route.ts:88` y `nubefact-client.ts:10` (deuda previa; sólo se arregla el IGV).

## 6. Decisiones de Brandon (máx. 2)
1. **¿La madera de Blas se vende exonerada (Amazonía) o gravada?** Recomendación: decidir por venta según el destino de la guía — dentro de la Amazonía exonerada y sin detracción; fuera, gravada 18 % + detracción **4 %** si es factura de más de **S/ 700** (Anexo II num. 7, desde 01-01-2015, R.S. 343-2014/SUNAT: https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones; umbral art. 8 R.S. 183-2004: https://www.sunat.gob.pe/legislacion/superin/2004/183.htm). Que el contador confirme que Blas cumple la Ley 27037.
2. **Activar la emisión real**: falta el token de Nubefact y el N° de la cuenta de detracciones de Blas en el Banco de la Nación (hoy 0 configuraciones). Recomendación: construir A/B/C ya (cálculo, aviso y guía impresa) y emitir cuando lleguen token sandbox + cuenta; la guía electrónica (GRE) a SUNAT, después.
