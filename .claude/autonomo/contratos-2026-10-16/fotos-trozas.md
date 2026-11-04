# Contrato — Trozas por foto: de la cara de la carga a la Lista de trozas de la GTF (16-10-2026)

> Pedido (Brandon, 16-10): «tomar foto a los laterales del camión o la cara de los troncos y sacar de cada tronco su diámetro y asignar código según el correlativo que se quede, y hacer tabla; luego eso pasar a mi sistema de realización de GTF».
> Estado: **diseño + prototipo sintético**. No se tocó código de la app. Prototipo: `/tmp/claude-1000/-home-usuario-proyectos-Mercado/5e92813a-2d5b-4143-a2f8-b933cfce35f4/scratchpad/carril-k/` (`proto.cjs`, `hoja.cjs`, `emparejar.cjs`, `overlay-gira30.png`).

## 1. Lo que ya existe (se reusa) y lo que es nuevo

| Pieza | Dónde | Se reusa para |
|---|---|---|
| Alta a mano de trozas (especie, árbol, D1, D2, largo, cantidad; Smalian en vivo) | `components/admin/forestal/LothGuiaTrozaAMano.tsx:59`, montado en `LothGuiaTrozas.tsx:216` | la tabla por foto termina en las MISMAS filas a mano |
| Estado de las filas | `components/admin/forestal/hooks/use-trozas-a-mano.ts:35` (`agregar` :39, `quitar` :44, historial) | «Pasar a la guía» = agregar N filas (falta `agregarVarias`, 1 paso de deshacer) |
| Contrato de una troza a mano | `lib/forestal/loth-trozas-a-mano.ts:33` (`TrozaAMano`), `:69` (`trozaAManoSchema`, rango Smalian), `:104` (`medidasDelLibro`: Ø a 3 decimales en m, largo a 2) | sin cambios de forma; +1 campo opcional |
| Numeración | `lib/forestal/loth-trozas-a-mano.ts:205` `piezasAMano`: **1, 2, 3… por guía**, salta los códigos ocupados | hay que agregar «desde» (el correlativo que sigue) |
| Código único en el libro | `lib/forestal/codigo-unico-troza.ts:90` (`${cod}-${corr}`, ADR-474); `lib/db/forest-loth.db.ts:862-923` | se mantiene: la guía imprime «150», el libro guarda «150-0004» |
| Endpoint de despacho | `app/api/admin/forestal/loth/despacho-guia/route.ts:79` (`postSchema`, `aMano` :84), roles `["admin","owner"]` :231 | +`desde`, +`medidoPorFoto` |
| Smalian SERFOR | `lib/forestal/loth-constants.ts:204` `0,7854·((D1+D2)/2)²·L` (ADR-492) | igual; D1/D2 = **las dos puntas** («62 → 50 cm × 8,6 m», ADR-492 :19) |
| Papeles de la guía (6 casilleros) | `app/api/admin/forestal/guias/documentos/route.ts` (POST multipart `gtf, casillero, file`), casilleros en `lib/forestal/documentos-guia.ts:38` (`lista_trozas`), `:48` (`otros`) | fotos original + anotada, **sin almacenamiento nuevo** |
| Foto desde el monte con IA como propuesta | `components/admin/forestal/hooks/use-foto-hoja-monte.ts` (16-10; `LADO_MAX = 2000`) | mismo patrón: la máquina propone, la persona confirma |
| Fotos de carga firmadas (bucket privado) | `app/api/admin/forestal/fotos/route.ts` (4 MB, almacenero puede) | alternativa si la foto se sube antes de que exista la guía |
| OpenCV.js 5.0.0-release.1 en worker | `components/admin/forestal/camaras/motor-marcadores.ts:16` (`RUTA_OPENCV = "/opencv/opencv.js"`), `marcadores.worker.ts` (ArUco `DICT_4X4_250`) | el worker de testas carga el MISMO archivo |
| Hoja A4 con marcador de 180 mm | `lib/camaras/marcador-a4.ts:19` (`LADO_MARCADOR_A4_MM = 180`), `imprimir-marcadores.ts:73` (`imprimirHojaDePrueba`), diccionario `lib/camaras/aruco-4x4-250.ts` | la «hoja de escala» |
| onnxruntime-web + D-FINE en worker | `components/admin/forestal/camaras/motor-dfine.ts`, `detector-dfine.worker.ts` (ADR-475) | fase 4 (segmentar al tocar) |

**Nuevo**: el worker de testas (Hough + borde + elipse), la pantalla de medición, el emparejado de las dos caras, el correlativo que sigue por permiso.

## 2. Lo medido

### 2a. Fotos reales en la base: **no hay**
- `Document` con imagen, Blas + main, nombre/tags de troza|camión|carga|despacho|testa|foto: 3 (recibos, 1 GTF de QA, 1 «Patio de trozas» de cámara). En Blas, 250 imágenes = solo cuadros de cámaras de personas (08-10 → 16-10).
- `WoodEntry.photos`: 0 de 7 (Blas) y 0 de 3 (main). `ForestLothEntry.photoUrl`: 0 de 44.
- Ninguna foto de una cara de carga ni de una troza medida → **no hay error contra wincha todavía**. Lo de abajo es sintético.

### 2b. La hoja real (Lista de trozas N° 000006, GTF 19-000003, 19 trozas, códigos 131-149)
| Hecho | Cifra |
|---|---|
| Fila que no cierra con Smalian | **132**: papel 0,593 · Smalian 0,511 (+16,1 %, copiada de la 133) |
| Columna (10) sumada vs total escrito (11) | 9,998 vs **9,916** (el total se sacó bien; la fila 132 quedó mal escrita) · Smalian del repo 9,911 |
| Largos | 2,50-3,14 m; **18 de 19 a ±5 cm de 3,10** |
| Ø | 32-74 cm, promedio 45,8 |
| Sesgo de +1 / +2 / +3 cm en TODA troza | total +4,3 % / +8,7 % / +13,1 % |
| Escala mal 2 % / 5 % | total +4,0 % / +10,3 % |
| Códigos | correlativo que **sigue** (131…149), no reinicia en 1 por guía |

En Blas: Libro TH 22 trozas, Ø 41-110 cm, largo 2,33-3,77 (prom. 3,04), códigos `1-0001…22-0001` (hoy la numeración reinicia por guía). En las trozas de ingreso del CTP de Blas el largo **varía dentro de la misma guía** (5,22-9,30 m; desviación 0,46-1,91 m) → «largo fijo por carga» no sirve siempre: un largo por carga **editable por fila**.

### 2c. Prototipo sintético (OpenCV.js 5.0.0-release.1 en Node, WASM, 1 hilo)
**De dónde salió la foto**: escena generada (no una foto real): 3 cargas apiladas por gravedad en una tolva de 2,20 m, con Ø sacados de los 38 diámetros de la hoja real (±5 %, elipticidad ≤6 %), corteza de 1,2-2,7 cm, anillos, rajaduras, manchas y una correa cruzada; hoja A4 con ArUco de 180 mm en el tablero izquierdo (y derecho). Cámara 2000×1500, perspectiva frente / girado ~15° / ~30°, desenfoque σ 0,8-1,2, ruido, luz en degradé y JPEG calidad 70 (223-230 KB). **37 trozas** en total (14 + 12 + 11). Error contra la medida generada (borde de la madera, sin corteza).

Tubería: ArUco → homografía (4 u 8 esquinas) → foto enderezada a 1,5 mm/px → `HoughCircles` `HOUGH_GRADIENT_ALT` → 144 rayos por círculo buscando la caída madera→corteza → `fitEllipse` con 3 pasadas de descarte de puntos → Ø = (eje mayor + eje menor)/2.

| Toma | Hojas | Trozas vistas | Falsas | Error abs medio (cm) | Peor (cm) | ms/foto |
|---|---|---|---|---|---|---|
| frente | 1 | 36/37 | 1 | 0,52-1,01 | 1,95 | 377-648 |
| girada 15° | 1 | 36/37 | 0 | 0,08-0,35 | 1,56 | 379-469 |
| girada 30° | 1 | 36/37 | 0 | 0,11-0,51 | 1,09 | 356-402 |
| girada 30° | **2** | **37/37** | 0 | **0,12-0,33** | 1,65 | 354-435 |

- Con 1 hoja el sesgo llega a ±1 cm: las esquinas del ArUco salen en **píxel entero** (este build no trae `cornerSubPix`; `cornerRefinementMethod` no cambió nada). Con 2 hojas, una a cada lado, el sesgo baja a ≤0,12 cm.
- Hipótesis descartadas: «con 2 hojas sale peor» y «de frente no lee» eran un bug del prototipo (`ids` viene 1×N; se usaba solo la primera hoja leída, la lejana de 70 px → sesgo −1,2 cm). Corregido; lo de arriba es la corrida buena. **Lección**: la hoja lejana y chica (≤70 px) sesga ~1 cm → regla de la app: hoja ≥100 px de lado, si no «acércate».
- Superposición revisada a ojo (`overlay-gira30.png`): las 14 elipses caen sobre sus testas; la que corta la correa queda algo corrida.
- **Límite**: es una cota superior. Barro, sombras, testas escalonadas y corteza suelta van a empeorarlo; la cifra real sale solo con las fotos de §5.

### 2d. Geometría que ninguna foto arregla
Una testa a Δz detrás del plano de la hoja sale chica en Δz/z: a 3 m, una testa 6 cm adentro = −2 % de Ø = −4 % de volumen; 15 cm = −5 % de Ø = −10 % de volumen. Remedio: hoja pegada **sobre una testa central**, foto desde ≥4 m (la misma Δz pesa menos) y control con wincha (§3.5).

### 2e. Emparejar la cara de atrás con la de adelante (D1 y D2 son las dos puntas)
Simulación de 200 cargas: la cara de adelante, espejada, con la punta corrida σ por conicidad o curvatura; asignación húngara por posición.

| Corrimiento σ | Trozas bien emparejadas | Cargas sin un solo error |
|---|---|---|
| 3 cm | 100 % | 200/200 |
| 6 cm | 100 % | 200/200 |
| 10 cm | 99,8 % | 198/200 |
| 15 cm | 97,1 % | 170/200 |

## 3. Diseño

### 3.1 Flujo en el celular (MVP)
1. **Hoja de escala**: «Imprimir hojas de escala» (2 A4, ArUco 180 mm, ids **248** y **249**), mate, pegadas sobre dos testas, una a cada lado, a media altura.
2. **Foto de la cara de atrás** (horizontal, 3-5 m, sin zoom digital). La app avisa si no ve las 2 hojas o si alguna mide <100 px.
3. **Propuesta**: la foto enderezada con un círculo por testa y su número (150, 151…, en orden de lectura: de arriba abajo y de izquierda a derecha).
4. **Corregir**: tocar un círculo → ±1 cm / arrastrar el borde / «Quitar»; tocar donde no hay → «Agregar» (busca el borde alrededor del dedo); «Renumerar desde aquí».
5. **Cara de adelante (opcional, fase 2)**: segunda foto con las mismas hojas → emparejado → D1 = punta mayor, D2 = punta menor. Sin ella, D2 queda **vacía y pedida** en la tabla (nunca se inventa).
6. **Tabla**: Código · Especie (fijable) · D1 · D2 · Largo (uno por carga, editable por fila) · Volumen Smalian · marca «por foto». Totales en PT primero, después m³ y trozas.
7. **Control con wincha**: la app pide medir 3 trozas que elige al azar; muestra la diferencia. Si el promedio pasa de 1 cm, avisa en ámbar «la foto se está alejando de la wincha: revisa la hoja».
8. **«Pasar a la guía»**: las filas entran a «Anotar a mano» del despacho (`agregarVarias`, cantidad 1, `medidoPorFoto: true`) con el correlativo de arranque; al registrar la guía, la foto anotada va al casillero `lista_trozas` y las originales a `otros`.

### 3.2 Navegador o servidor
| Paso | Dónde | Por qué |
|---|---|---|
| ArUco, enderezar, Hough, elipses, emparejado | **navegador**, worker propio con `/opencv/opencv.js` | funciona sin señal una vez cacheado (3,75 MB gzip); 0,35-0,76 s por foto en el bench |
| Smalian, tabla, validación | navegador (vista previa) + **servidor** (el POST recalcula, regla 6) | anti-fraude: el total vale en el backend |
| Correlativo siguiente | servidor (GET del despacho) | el libro es la fuente |
| Fotos | `POST /api/admin/forestal/guias/documentos` | expediente de la guía ya existente |
| IA (claude-router) | **fuera del MVP**; fase 5 solo para contar o proponer cuando Hough no ve | no mide mm |

### 3.3 Contrato TS (nuevo `lib/forestal/testas-medicion.ts`, puro y con tests)
```ts
export const IDS_HOJA_ESCALA = [248, 249] as const;   // reservados «escala» dentro del rango 200-249 de ADR-480
export const LADO_HOJA_ESCALA_MM = 180;               // = LADO_MARCADOR_A4_MM
export const LADO_MIN_HOJA_PX = 100;                  // debajo, sesgo ~1 cm (bench)

export interface TestaPropuesta {
  id: string; cx: number; cy: number;                 // px de la foto ENDEREZADA
  ejeMayorCm: number; ejeMenorCm: number; anguloGrados: number;
  dCm: number;                                        // (mayor + menor) / 2, 1 decimal
  origen: "auto" | "agregada" | "ajustada"; puntosBorde: number;
}
export interface CaraMedida {
  cara: "atras" | "adelante"; mmPorPx: number; hojasLeidas: 1 | 2;
  ladoHojaPx: number[]; testas: TestaPropuesta[];
}
export interface FilaPorFoto {
  codigo: string; especie: string | null;
  d1Cm: number | null; d2Cm: number | null; largoM: number | null;
  origenD1: "foto" | "mano"; origenD2: "foto" | "mano" | null;
  testaAtras: string | null; testaAdelante: string | null;
}
export function ordenDeLectura(t: readonly TestaPropuesta[]): TestaPropuesta[];
export function emparejarCaras(atras: readonly TestaPropuesta[], adelante: readonly TestaPropuesta[], anchoMm: number): Array<[string, string | null]>; // húngaro
export function filasDeLaCarga(atras: CaraMedida, adelante: CaraMedida | null, desde: number, largoM: number | null, especie: string | null): FilaPorFoto[];
export function aTrozasAMano(f: readonly FilaPorFoto[]): { listas: TrozaAMano[]; faltan: { codigo: string; campo: "d1" | "d2" | "largo" | "especie" }[] };
```
Worker (`components/admin/forestal/camaras/testas.worker.ts`):
```ts
type PedidoTestas =
  | { tipo: "medir"; foto: ImageBitmap; cara: "atras" | "adelante" }
  | { tipo: "agregar"; x: number; y: number };        // borde alrededor del dedo
type RespuestaTestas =
  | { ok: true; cara: CaraMedida; enderezada: ImageBitmap; ms: number }
  | { ok: false; motivo: "sin_hoja" | "hoja_chica" | "opencv"; mensaje: string };
```

### 3.4 API (sin modelo nuevo de Prisma)
| Método · ruta | Cambio | Rol |
|---|---|---|
| GET `/api/admin/forestal/loth/despacho-guia` | + `siguienteCorrelativo: Record<planId \| "sin_permiso", number>` | sin cambio |
| POST mismo | + `desde?: z.number().int().min(1).max(99999)`; `aMano[].medidoPorFoto?: boolean` (opcional: compatible hacia atrás) | `requireAdmin(req, ["admin","owner"])` (igual) |
| POST `/api/admin/forestal/guias/documentos` | sin cambio (casillero `lista_trozas` / `otros`) | `ROLES_PAPELES_GUIA` |
| F3: GET/POST/PATCH `/api/admin/forestal/loth/medicion-carga` | carga medida en el monte, recogida en la oficina | `["admin","almacenero","owner"]` |

DB: `ForestLothDB.siguienteCorrelativo(tenantId, planId | null): Promise<number>` en `lib/db/forest-loth.db.ts` = mayor código numérico de la guía (`codigoDeLaGuia`) entre las trozas vivas del permiso + 1 (Blas hoy: 23). `piezasAMano(filas, ocupados, arboles, desde = 1)`. `medidoPorFoto` → texto en la observación de la línea (`observacionAMano`): «medido por foto, confirmado por <usuario>». F3: `ForestMedicionCargaDB` en KV `interno:medicion-carga:<tenantId>:<id>` (30 días) con `invalidate`. **Schema Prisma: ninguno.**

### 3.5 SERFOR y declaración jurada
La GTF es declaración jurada (pie de la hoja: Ley 27444 art. 34.3). La foto **propone**; la persona confirma cada fila; nada se registra sin «Pasar a la guía» + «Registrar». D1 y D2 quedan editables; la marca «por foto» va al libro; el control con wincha queda en la observación de la guía. La tabla la calcula el sistema: el error de la fila 132 no puede repetirse.

### 3.6 Fases
| Fase | Qué | Archivos | Gate |
|---|---|---|---|
| **F0** (sin código de la app) | Brandon manda las fotos de §5; correr el prototipo sobre ellas | `scripts/probar-testas.cjs` (gemelo de `probar-marcadores.cjs`) | error abs medio ≤1 cm y sesgo ≤0,5 cm contra la wincha. Si no llega, F1 sale como «contar y numerar» (círculos + código, Ø a mano) |
| **F1 MVP** — cara de atrás, D1 por foto | hoja de escala, worker, pantalla, tabla, correlativo, «Pasar a la guía», fotos al expediente | nuevos: `lib/forestal/testas-medicion.ts` + `__tests__/testas-medicion.test.ts`, `components/admin/forestal/camaras/testas.worker.ts`, `motor-testas.ts`, `components/admin/forestal/LothTrozasPorFoto.tsx` (≤300), `LothTrozasPorFotoLienzo.tsx`, `LothTrozasPorFotoTabla.tsx`, `hooks/use-trozas-por-foto.ts` · cambian: `LothGuiaTrozas.tsx:216` (botón «Medir con foto»), `hooks/use-trozas-a-mano.ts:39` (`agregarVarias`), `lib/forestal/loth-trozas-a-mano.ts:69,205`, `lib/db/forest-loth.db.ts:~870`, `app/api/admin/forestal/loth/despacho-guia/route.ts:79` + GET, `lib/camaras/marcador-a4.ts` / `imprimir-marcadores.ts` (hoja de escala 248/249) | typecheck + vitest de `testas-medicion` + 1 captura móvil + `scripts/probar-testas.cjs` con las fotos reales |
| **F2** — cara de adelante | emparejado húngaro → D1 y D2 por foto | `testas-medicion.ts` (`emparejarCaras`), `LothTrozasPorFoto.tsx` (paso 2) | ≥97 % bien emparejadas en las fotos reales |
| **F3** — del monte a la oficina | la guía se arma en la oficina (16-10): «Cargas medidas» recogidas desde el despacho | `app/api/admin/forestal/loth/medicion-carga/route.ts`, `lib/db/forest-medicion-carga.db.ts`, aviso en el despacho | `security` (rol almacenero, tenant) |
| **F4** — testas difíciles | segmentar al tocar (EfficientSAM o MobileSAM ONNX) cuando Hough no ve; largo por foto lateral con vara de 1 m | `components/admin/forestal/camaras/segmentar.worker.ts` | recall ≥95 % en fotos con barro o sombra |
| F5 (opcional) | IA del servidor solo para contar o proponer | `claude-router` | — |

### 3.7 Licencias
| Pieza | Licencia | Uso |
|---|---|---|
| OpenCV.js 5.0.0-release.1 (`@techstark/opencv-js`) | Apache-2.0 | ya es dependencia (ADR-480) |
| ArUco `DICT_4X4_250` | dentro de OpenCV (Apache-2.0); tabla propia en el repo | sí |
| onnxruntime-web | MIT | ya instalado |
| EfficientSAM / MobileSAM / SAM 2 (F4) | Apache-2.0 (verificar el LICENSE del checkpoint antes de bajarlo) | F4 |
| sharp (solo scripts) | Apache-2.0 | sí |
| Emparejado húngaro | código propio | sí |
| TimberVision (datos) | CC BY-NC-SA | **no** (comercial) |
| Ultralytics YOLOv8 | AGPL-3.0 | **no** (SaaS) |

## 4. Riesgos
1. **Testas escalonadas** (no coplanares): −2 % de Ø por cada 6 cm a 3 m → −4 % de volumen. Es el riesgo n.º 1 en un camión real. Remedio: hoja sobre una testa central, ≥4 m, control con wincha.
2. **D1/D2 = dos puntas** (ADR-492): una foto da una punta. Sin la cara de adelante, D2 se tipea. **Pregunta para Brandon**: en su lista, ¿d1/d2 son las dos puntas o dos medidas cruzadas de la misma cara? Si son cruzadas, una sola foto alcanza (ejes de la elipse) y F2 sobra.
3. **¿Con o sin corteza?** El prototipo mide el borde de la madera (sin corteza). Confirmar con la práctica del permiso.
4. **Fotos reales** (barro, sombra, rajaduras, testas tapadas, noche): el bench es una cota superior.
5. **Correlativo**: cambia cómo se numeran las trozas a mano desde ahora (sigue por permiso en vez de reiniciar en 1). Las 22 de Blas no se tocan; el código único de ADR-474 sigue igual.
6. **Ids 248/249** caen en el rango 200-249 (chalecos) de ADR-480: reservarlos en el ADR para que una cámara de patio no los lea como persona.
7. **Monte sin señal**: OpenCV.js (13,3 MB, 3,75 MB gzip) tiene que quedar en caché antes de salir.
8. **Declaración jurada**: nunca auto-registrar; la marca «por foto» y el control con wincha quedan escritos.

## 5. Fotos que debe mandar Brandon (F0)
- **Imprimir** 2 hojas de escala A4 (marcador 180 mm; hoy sirve `imprimirHojaDePrueba`), en papel mate o con mica mate, pegadas **sobre la testa** de una troza a cada lado de la carga, a media altura.
- **Juego A — precisión (1 carga, ~19 trozas)**: 3 fotos de la cara de atrás: de frente a 3 m, de frente a 5 m y girado ~30° a 4 m. Si se puede llegar, las mismas 3 de la cara de adelante. Celular horizontal, sin zoom, sin flash de día.
- **La verdad de esa carga**: su Lista de trozas medida con wincha (D de las dos puntas, en cm, como siempre) y el código escrito con tiza o crayón en cada testa, que se lea en la foto.
- **Juego B — robustez**: 5 fotos de otras cargas o rumas con las hojas puestas (barro, sombra, lluvia, una de noche con flash). Sin medir.
- **Largo (F4)**: 1 foto del costado del camión con una vara de 1 m pintada en franjas de 10 cm apoyada contra la carga.
- **Cómo pasarlas**: originales (WhatsApp las comprime), por el buzón «Para Claude» o el Drive. ~12 fotos + 1 lista medida.

## 6. ADR para pegar (lo escribe el hilo principal con `/adr`)
**ADR-XXX — Trozas por foto: escala con hoja ArUco, medición en el navegador y correlativo que sigue por permiso**
- **Contexto**: la Lista de trozas se anota troza por troza, a mano, y se pasa a la guía; la hoja real N° 000006 trae una fila copiada (132: 0,593 en vez de 0,511) y una columna que no suma su total. Brandon pide medir con fotos y numerar con el correlativo que sigue. No hay fotos reales de testas en la base; el bench sintético da 0,1-1 cm de error medio.
- **Decisión**: (1) escala con 2 hojas A4 ArUco 180 mm (ids 248/249 reservados «escala») pegadas sobre testas; (2) medición en el navegador con OpenCV.js 5.0.0-release.1 en un worker (Hough ALT + borde radial + `fitEllipse`), sin modelos AGPL ni NC; (3) la foto propone, la persona confirma; las filas entran como trozas a mano con `medidoPorFoto`; control con wincha de 3 trozas; (4) `desde` en el POST del despacho y `siguienteCorrelativo` por permiso en el GET; (5) fotos al expediente de la guía (`lista_trozas` / `otros`); sin cambios de schema.
- **Alternativas descartadas**: TimberVision (CC BY-NC-SA) y YOLOv8 (AGPL); medir con IA de visión (no mide mm); una sola hoja (sesgo de hasta 1 cm con esquinas enteras); largo fijo por carga sin edición (en Blas varía 5,2-9,3 m dentro de una guía); columna nueva en `ForestLothEntry` para «por foto» (la observación alcanza).
