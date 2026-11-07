# ADR-453 — Mapa del Libro TH: la etapa de cada árbol y el planificador del monte

**Estado:** Aceptado y construido (2026-09-29).
**Relacionados:** ADR-305 (Libro TH, T1-T5), ADR-450 (la troza del CTP recuerda su árbol), memorias `loth-cartografia-2026-07-22`, `loth-predio-checklist-2026-08-03`.

## Contexto

Brandon (29-09), en la vista Mapa del Libro TH: «etiquetas para saber ahí en el mapa cuál está talado, trozado, en pie, despachado… con precisión» y «funciones autónomas que permitan definir rutas, realizar campamentos, etc. según la geografía y detalles del mapa».

Medido antes de construir:

- **Estado.** El símbolo del árbol decía su condición y el estado del CENSO (en pie / talado / descartado). No decía trozado ni despachado. Blas: el censo da 6 talados, pero el libro tiene tala de 4 árboles y trozado de 2 (2 «talados» del censo sin tala: QA vieja).
- **Tope de 500.** El mapa leía las líneas con `limit=500`: con un libro grande, la etapa se habría calculado sobre medio libro.
- **Despacho sin árbol.** Las líneas de despacho traen `trozaCode` sin `treeCode`: hay que cruzar troza → línea de Trozado → árbol.
- **Cartografía y geografía.** La cartografía (KV) ya guarda referencias (campamento, acopio) y vías (acceso, trocha, río), y ya había perfil de terreno (Open-Meteo) y faja marginal. Faltaba la geografía real: Blas no tiene ríos ni caminos dibujados.
- **Overpass (OpenStreetMap).** Responde 406 sin User-Agent y suele estar saturado. De los espejos, maps.mail.ru respondió.
- **La parcela de Blas está a 31,2 km de sus árboles del censo**: dato a corregir por el dueño.

## Decisión

### Etapa por árbol

1. La etapa se calcula en el **servidor** con TODAS las líneas vivas del plan: `ForestLothDB.estadoDeArboles` y `GET /loth/estado-arboles`. La función pura es `lib/forestal/loth-etapa-arbol.ts`.
2. **La cadena:** en pie → talado → trozado → despacho parcial → despachado → en el CTP (recepción viva, ADR-450). Aparte: semillero y descartado.
3. **Manda el libro, no el censo.** Si el censo dice otra cosa, se muestra un aviso y no se esconde. Un árbol que el libro ya despachó no se puede volver a talar desde el mapa.
4. **Etiqueta sobre cada punto** con código y etapa. Un colocador evita que se pisen y que queden bajo la leyenda, la escala o la ficha; se puede elegir código y etapa, sólo código o ninguna. Hay filtro por etapa, que también sirve de leyenda, y la historia del árbol en su ficha.

### Planificador del monte

1. **Geografía real del predio** (`GET /loth/geografia`):
   - El recuadro lo arma el SERVIDOR desde la parcela o el predio del tenant.
   - Ríos y caminos de OpenStreetMap vía Overpass, con espejos, User-Agent y timeout.
   - Grilla de altura de Open-Meteo.
   - Caché por tenant en `interno:loth-geografia:<tenant>`, que no viaja al layout. Si OSM falla, se usa la caché vieja con su fecha o un aviso; nunca un 500.
2. **Propuesta pura** (`lib/forestal/loth-planificador*.ts`):
   - **Patio de acopio.** Fuera de la faja marginal y con pendiente ≤ 12 %. Minimiza el arrastre ponderado por m³ + un peso fijo por metro de camino a abrir.
   - **Campamento.** Cerca del patio, con agua a ≤ 400 m y fuera de la faja.
   - **Trochas.** Prim-Dijkstra 0,4: +6 % de trocha, −18 % de arrastre frente al árbol mínimo puro, que serpentea. Penaliza pendiente y cruces de agua (primero lo seco, salvo una vuelta de más de 500 m).
   - **Camino de salida**, orden de tala de lo lejano a lo cercano y zonas no aptas (> 30 %).
   - Semilleros fuera: los del regente y los del POA.
3. **Todo es PROPUESTA.** Se ve punteada, el patio se arrastra y se recalcula, y sólo «Agregar al plano» la escribe en la cartografía, como referencias y vías `prop-…`, con deshacer. Lo dibujado no se pisa.

## Consecuencias

- Blas, corrida real: 54 árboles a planificar (11 semilleros del POA fuera), patio a ~474 m de arrastre medio, ~2,6 km de trochas, 0 cruces de agua. Con la parcela a 31 km, todos salen «fuera del área dibujada»: el mapa lo avisa con «Ver dónde están los árboles».
- «Agregar al plano» guarda el documento de cartografía entero, igual que «Guardar».
- Los pesos del planificador (camino por metro, 0,4) son valores de referencia, no del negocio: se ajustan con uso real.

## Alternativas descartadas

- **Etapa con las líneas del listado** (tope 500): mentía con un libro grande.
- **Pedir OSM desde el navegador**: la CSP no lo permite y expondría el recuadro sin control.
- **Árbol de expansión mínima puro**: trochas que serpentean y arrastres 50 % más largos.
