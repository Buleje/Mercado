# ADR-142 — Mapa de Planta del aserradero (gemelo espacial del CTP)

- **Estado:** Aceptado
- **Fecha:** 2026-07-19
- **Contexto:** ADR-124/127 (Libro CTP), ADR-140 (geo EUDR). Espeja el **Campo del
  cacao** (`CacaoCampoMapa`, mapa satelital de parcelas dibujadas), pedido por
  Brandon: "quiero el mismo mapa que el Campo, pero para mi aserradero".

## Contexto

El Libro CTP dice **cuánta** madera hay (ingresos, producción, despacho, saldos)
pero no **dónde** está físicamente en la planta. Un aserradero real tiene zonas
—recepción/GTF, patio de trozas, línea de sierra, secado, patio de producto,
rampa de despacho— y el operador razona espacialmente ("mové las trozas viejas del
patio A a la sierra"). No había representación espacial de la planta.

El cacao ya resolvió el problema análogo (dibujar el terreno en secciones sobre el
satélite). Traemos ese patrón al CTP.

## Decisión

Nueva sub-pestaña **«Planta»** del Libro CTP: un mapa satelital (Leaflet) donde se
dibujan las **zonas** de la planta como polígonos, cada una con **código + tipo +
nombre + notas**, coloreadas por tipo. El gemelo espacial del Libro.

1. **Tipos de zona** (`ZonaTipo`): entrada · patio_trozas · aserrado · secado ·
   patio_producto · despacho · oficina · otro — cada uno con color de token DS.
2. **Dibujo/edición** (adaptado de `CacaoCampoMapa`, sin leaflet-draw): dibujar
   click-a-click o por GPS o pegando coordenadas; editar vértices; medir
   distancia/área; ir-a-zona; pantalla completa; exportar GeoJSON; sat/calles.
   **Área en m²** (el aserradero se mide en m², no ha como el cacao).
3. **Contexto del Libro**: la vista muestra KPIs de lo que se mueve AHORA (materia
   prima en patio, producto terminado, despachado del período) leídos de `saldos`
   — así el mapa (dónde) y el Libro (cuánto) se ven juntos.

### Storage (sin migración)

KV `PlatformSetting` key `ctp-planta-zonas:{tenantId}` → `PlantaZona[]`, patrón
**ForestOrigenGeoDB / ForestCtpFicha**. Una zona es identidad estable de la planta,
no un movimiento del libro → no toca las tablas de trazabilidad ni fabrica una
migración (que necesita DIRECT_URL). `ForestPlantaZonaDB` (list/save/remove) con
`tenantId` 1er param. Auditado (`ctp_planta_zona_set` / `ctp_planta_zona_delete`).
Endpoint `/api/admin/forestal/ctp/planta` (GET/POST/PATCH/DELETE), guard
`spec:forestal:ctp-libro`, rate-limit GENEROUS bucket `ctp`, Zod safeParse.

## Consecuencias

- **+** El CTP gana una capa espacial: el operador ve y registra la geometría real
  de su planta, base para logística interna, seguridad y auditoría in-situ.
- **+** Cero migración (KV); reusa el motor de mapa ya probado del cacao.
- **+** GeoJSON exportable → SIG / plano de planta / expediente.
- **−** Las zonas y el inventario aún NO están ligados por fila: el mapa muestra el
  flujo AGREGADO del Libro, no "qué troza está en qué zona". Es el follow-up.

## Verificación

Server E2E (Playwright `page.request`): POST ×3 (patio_trozas/aserrado/despacho) →
200 con id; GET las lista; DELETE ×3 → 200. UI verificada en navegador light+dark:
mapa con las 3 zonas coloreadas por tipo + etiquetas (código·área·tipo·nombre) +
leyenda + KPIs del Libro (despachado 9.40) + lista agrupada + toolbar completa
(dibujar/editar/medir/coordenadas/exportar/satélite/pantalla completa). Data de
prueba restaurada (0 zonas tras el test).

## Follow-up

Ligar inventario ↔ zona (un `zonaId` opcional en `WoodEntry`/despacho → "en el
patio PT-01 hay X m³"), ruta de movimiento troza→sierra→despacho animada sobre el
mapa, y capacidad/ocupación por zona.
