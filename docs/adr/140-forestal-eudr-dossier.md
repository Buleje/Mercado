# ADR-140 — Dossier EUDR + geolocalización de origen del CTP

- **Estado:** Aceptado
- **Fecha:** 2026-07-18
- **Contexto:** ADR-124 (WoodEntry/origen), ADR-134/135 (cadena de custodia I1–I5), ADR-139 (cierre).

## Contexto

El Reglamento (UE) 2023/1115 (EUDR) prohíbe colocar madera en el mercado de la UE
sin **(a)** geolocalización de la parcela de cosecha, **(b)** una **Declaración de
Diligencia Debida (DDS)** y **(c)** prueba de que es *deforestation-free* (sin
deforestación después del 31-dic-2020) y legal. Para un aserradero **exportador**
esto es existencial.

El CTP ya responde la pregunta difícil ("¿de qué GTF/árbol salió esta tabla?") vía
los puentes N:M (`ForestCtpDespachoOrigen` → corridas → `ForestCtpConsumo` →
`WoodEntry`/GTF). Lo que **falta es el dato geográfico**: el origen es solo TEXTO
(`WoodEntry.originType/originCode/originRegion`), sin coordenadas.

## Decisión

1. **Geolocalización por origen (KV, sin migración).** La geo es estable por
   origen (una concesión no cambia de polígono por ingreso), así que se guarda por
   `originCode` en `PlatformSetting` key `ctp-origen-geo:{tenantId}` — patrón
   `ForestCtpFicha`/`ctp-cierre`. `ForestOrigenGeoDB` (get/set/distinctOrigins).
   No se duplica en cada `WoodEntry` ni se fabrica una migración por un dato de
   configuración estable.
2. **Generador de DDS por despacho** (`lib/forestal/eudr-dossier.ts`): camina la
   cadena YA existente (`trazabilidadCompleta` → corridas → GTF → WoodEntry →
   geo) y arma la DDS: producto, cantidad, país (PE), parcelas con coordenadas,
   especies/CITES, y una **evaluación de riesgo**.
3. **Riesgo negligible gateado** (espejo de `trazabilidadCompleta` gateando el
   certificado): `negligible` **solo si** la cadena está completa, todos los
   orígenes están geolocalizados y todos atestan sin-deforestación. Si hay huecos,
   `no_negligible` con los gaps explícitos — no se puede afirmar "apto para la UE"
   con la cadena rota o sin geo.
4. **DDS imprimible** (`eudr-print.ts`, patrón window.open→print) con veredicto,
   producto, tabla de parcelas (coordenadas WGS84), trazabilidad/legalidad y
   firma. Encabezado con la ficha del CTP (razón social/RUC/Código CTP/ARFFS).

## Consecuencias

- **+** Desbloquea la exportación a la UE: geolocalización + DDS sobre la cadena
  de custodia que el módulo ya tenía.
- **+** Cero migración; la geo reusa el patrón KV per-origen.
- **+** El riesgo no se puede declarar negligible con huecos (honesto ante EUDR).
- **−** El CTP compra a terceros: puede no tener las coordenadas del predio en
  mano. La UI las pide explícitamente por origen y marca los faltantes.
- **−** v1 no valida el polígono contra mapas de deforestación (Global Forest
  Watch / capas satelitales) — el atestado es declarativo del operador. Integrar
  una verificación satelital es follow-up.

## Alcance v1 vs follow-up

- **v1:** geo por punto (lat/lng) o polígono GeoJSON crudo + atestado df + DDS por
  despacho + riesgo gateado + imprimible.
- **Follow-up:** DDS por lote/período, verificación satelital del polígono,
  submission a TRACES, plumbing de la geo del LO-TH (`ForestCensusTree.utmX/utmY`,
  `ForestLothEntry.gpsLat/gpsLng`) al origen del CTP cuando la madera viene del
  propio bosque del titular.
