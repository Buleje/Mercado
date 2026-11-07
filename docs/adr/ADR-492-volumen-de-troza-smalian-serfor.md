# ADR-492 — Volumen de troza = Smalian SERFOR (0.7854 × Dm² × L); se retira la Smalian pura

- **Estado:** aceptado (2026-10-15).
- **Pedido por:** Brandon (15-10): «en general en la aplicación de Smalian quiero que se aplique el Smalian de SERFOR, que es algo multiplicando por 0.7854, y quita el otro Smalian que hay, porque esa es la pura y no me admiten».
- **Extiende:** ADR-360 (la guía se reproduce con el área del diámetro medio, ≤0,01 %), ADR-312/313 (importar de SERFOR, retrozado). **No toca:** ADR-440 (Oxapampina, pulgadas/pies → PT) ni el volumen del censo (0.7854 × DAP² × Hc × ff).
- **Schema:** ninguno. **Datos:** no se reescriben.

## Contexto (medido, sólo lectura, 15-10)

La app tenía dos «Smalian» y cinco copias de la buena:

| Fórmula | Cuenta | Dónde vivía |
|---|---|---|
| **Smalian SERFOR** | 0.7854 × ((D1+D2)/2)² × L | `smalianVolume` (`loth-constants.ts`, Libro TH) |
| Misma, con π/4 | π/4 × Dm² × L | `volumenHuber` (verificación y retrozado), `volumenHuberM3` (patio), `volumenSegunDimensiones` (GTF → ingresos), `cubicate` del alta CTP |
| Misma, copiada | 0.7854 × … inline | `LothGtfForm.tsx` |
| **Smalian pura** | ((π/4·D1² + π/4·D2²)/2) × L | `cubicarTroza` (Cubicador de trozas → `cubicarSegun` → cubicación comercial, cuenta y adelantos, import y plantilla Excel) y `volumenSmalian` (columna «Smalian» del modal Cuadrar guía) |

- La pura da **más** en toda troza cónica: 117/B (62 → 50 cm × 8,6 m) = 2,1425 contra 2,1182 de la guía (+1,15 %). SERFOR no la admite. El máximo real es mayor: en las 54 entradas del Libro TH de Blas llega a **+4,44 % por troza** y a +0,47 % en el total (94,4911 contra 94,0439 m³).
- π/4 contra 0.7854: 3 ppm (un dígito en el 4.º decimal en trozas grandes). Se unifica igual: una sola cifra.
- Datos guardados con la pura (`ForestCubicacionTrozas.formula = 'smalian'`): **Blas 0**; **main 3 con la pura**: CUB-2026-0002 y CUB-2026-0010 anuladas (4 trozas, 1,8769 → 1,8746 m³, S/ 622,22 → 621,40 si se recalcularan) y **CUB-2026-0011 en borrador** (0,3586 → 0,3584 m³): si se aplica tal cual, cobra con la pura. Es main (QA), sin plata real. La cuarta, CUB-2026-0028 (15-10), ya nació con SERFOR.

## Decisión

1. **Una sola fórmula de volumen de troza por dos diámetros + largo: `smalianVolume`** (firma intacta). Al lado, `volumenSerforCm(d1Cm, d2Cm?, largoM)` para quien mide en cm; sin D2 (o en 0) la troza es pareja (D2 = D1). Constante **0.7854 exacta, nunca π/4**.
2. **Se retira la Smalian pura**: `cubicarTroza` pasa a Smalian SERFOR; se eliminan `volumenSmalian`, `conicidadPct`, `VerificacionTroza.smalianM3` y la columna «Smalian» de Cuadrar guía.
3. **Todos delegan**: `volumenHuber` (verificación y retrozado), `volumenHuberM3`, `diametroEquivalenteCm` (0.7854 al revés), `volumenSegunDimensiones`, `cubicate` del alta CTP (las piezas van como largo total: un solo redondeo), `LothGtfForm`, y la plantilla Excel del Cubicador de trozas (`ROUND(0.7854*((D1+D2)/200)^2*L,4)`).
4. **En pantalla dice «Smalian SERFOR»** (selector del cubicador, cotejo con la GTF, Cuadrar guía, Anotar D1/D2, ficha de la troza, medición del fuste, importar líneas, ayudas). Los nombres de código `volumenHuber`, `huberM3`, `controlHuber`, `UMBRAL_HUBER` y la clave `"smalian"` quedan: renombrarlos ensucia el diff y no cambia ninguna cifra.
5. **Lo guardado no se reescribe.** La cubicación comercial congela `volumen`, `trozas[].volumen` y `monto` en el servidor; abrirla o valorizarla lee lo congelado. Sólo cambia si alguien la vuelve a guardar (el servidor recubica con la fórmula de hoy).
6. **El lote del Cubicador en el navegador** (localStorage, sin base) guarda un `m3` derivado: se recalcula de D1/D2/largo **al leer** (`recubicarLoteSmalian`) en el cubicador, el resumen, el reparto rolliza → aserrada y las dos calculadoras de rendimiento.

## Consecuencias

- Una cubicación nueva en Smalian da hasta ~1,2 % menos m³ que antes en trozas cónicas (y lo mismo en parejas): lo que se paga por m³ baja en esa proporción. Es la cifra que SERFOR acepta.
- El modal Cuadrar guía pierde la medida de «conicidad» (la diferencia entre las dos fórmulas): era información de la fórmula retirada.
- Test que fija la constante: `__tests__/forestal-cubicacion-trozas.test.ts` (62 y 50 cm × 4 m = 0,9852 m³; 100 cm × 100 m = 78,54 exacto, π/4 daría 78,5398).
