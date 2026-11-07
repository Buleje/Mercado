# Aviso de proveedor sancionado — prueba en pantalla y captura del folleto (04-11-2026)

Tenant QA forestal, sin escribir nada (el guardado del alta y la recepción van frenados con `espiar … true`).

- Alta: `QA_IP=10.9.0.x node scripts/qa-capturas.mjs --tenant inversiones-agroforestales-blas-sociedad-op-qa-ui --ruta "/admin?tab=ctp-libro-operaciones&vista=ingresos" --pasos-archivo .claude/autonomo/demo-aserraderos/aviso-sancionado/alta-pasos.json --anchos 1280 --temas claro --escala 2 --resumen`
  → el eval del paso 11 da el recuadro de la sección 4 (`sec`, en px CSS): recortar la captura con ese recuadro × 2 (+12 px de margen) = «19 Aviso proveedor sancionado.png».
  UNA vista por corrida: con varios anchos/temas en la misma corrida la página se mueve y el recorte cae en otra sección.
- Ficha: igual con `ficha-pasos.json` (sin `--escala`). En QA no hay guías por recepcionar: elige «Todas las del período», abre la ficha de `QA19-GTF-A1` y, SOLO en el navegador (`modificar`), le pone de titular a la C.N. San Luis y el permiso 25-PUC/P-MAD-A-018-07.
- Titular real de prueba: COMUNIDAD NATIVA SAN LUIS · RUC 20393286238 · permiso 25-PUC/P-MAD-A-018-07 (SERFOR 00046-2023-OSINFOR/08.2 del 27/02/2023 + lista roja de OSINFOR).
