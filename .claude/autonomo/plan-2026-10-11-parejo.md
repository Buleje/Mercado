# «Todo parejo» + Mi Plata (11-10 mañana)

Pedido: memoria `panel-parejo-un-estilo-2026-10-11`; brief `scratchpad/brief-parejo.md`; reglas 10-11 en `.claude/rules/ui-components.md`.

## Medido antes (06:40, `node scripts/censo-ds-admin.mjs`)
tablas: DataTable 221 · tableAMano 53 · thEstilos 29 · tablasLocales 40 — modales: AdminModal 271 · overlayAMano 119 — botones: Button 305 · buttonAMano 4.749 · constantesBtn 183 · alturasBoton 28.
Mi Plata › Resumen: 1,21 pantallas; «Actualiza en 283s» suelto en la banda; título solo en su fila; 6 bloques desplegables apilados; `SeccionesNav` propio ≠ `BarraDeSecciones`.

## Tanda P1 (06:45)
plata-a (hub + Resumen + Resultado) · plata-b (Movimientos + Deudas) · plata-c (Préstamos, Adelantos, Activos, Reportes) · tablas (estilo único de DataTable + codemod; firmas en pantalla antes/después) · modales (AdminModal con tamaños + migrar ventanas a mano).
## Cola
P2: botones (codemod btn-constantes → button(), alturas a 48) · «muchos botones → ⋯» en los lugares con >25 botones del reporte `reports/orden-admin/noche-11-10.json` · aplicar lo de tablas/modales a los archivos de Mi Plata al cerrar P1.

## P1 guardada (08:35)
675c32cb8 Mi Plata (secciones en vez de 9 bloques apilados, barra común, hub con un «⋯», Gastos/Proyección/Impuestos en secciones, Préstamos/Activos/Cierres/Importar al patrón) · 691e13a49 ventanas (5 tamaños; 21 a mano → AdminModal; overlayAMano 119 → 96) · b5867df0b tablas (DataTable 14 px sin mayúsculas; tableAMano 53 → 1; firmas en pantalla 12 → 8) · 4b0d8b801 reglas 10-11 + secciones de Mi Plata en el buscador.
Decide Brandon: Préstamos «Tasa mensual %» que el servidor divide entre 12 (intereses 12× más bajos) · selector de mes del Resumen (los endpoints sólo leen el mes actual) · Adelantos con 7 pestañas (2 quedan ocultas a 1280).
Trinquete del censo ROJO desde antes de P1 (titulosLocales 23→28, constantesBtn 170→180, filtrosLocales 28→34, tablasLocales 34→39, kpisLocales 46→52): no corre en el pre-commit; bajarlos en P2.
- 11:10 Análisis Pro (pedido de Brandon): an-metricas (Métricas 1,51 pant) · an-prediccion (Predicción 1,56 con 7 tarjetas apiladas → secciones; Alertas 132 palabras → ⓘ).
- 12:30 guardado: 6e11df0f9 botones 48 px + locales (trinquete 5/5) · 12b65b8f2 Predicción en 4 secciones + Alertas en tabla · 219bba1ca Métricas en 3 secciones de 1 pantalla. Pendiente: endpoint de Cesta cae a datos de ejemplo (`buildDemo()`); mapa de calor ¿hora UTC?; 96 ventanas a mano; tasa de Préstamos (decide Brandon).
- 14:00 guardado: 1c7c3d3d8 ventanas restantes (a mano 96 → 42; las 42 no son ventanas) · 6339bbc29 préstamos: tasa mensual real (346,75), refinanciar que daba 400 siempre, roles de gestión en /api/prestamos/*, fechas de fin de mes. Decide Brandon: interés vencido al refinanciar; pago parcial que cierra la cuota.
