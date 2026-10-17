# ADR-475 — Detector de personas del mosaico: movimiento + zoom + D-FINE en un worker

- **Estado:** aceptado (2026-10-08). Construido y probado: 32 tests (`__tests__/camaras-movimiento.test.ts`, `__tests__/camaras-personas.test.ts`) y el recorrido del mosaico en `main` alimentado con cuadros reales de Blas (marca 3-4 personas con 59-70 %, guarda las fotos y avisa).
- **Relacionados:** ADR-471 (mosaico «Ver todas en vivo»), memoria `camaras-burbuja-y-personas-2026-10-07` (detector MediaPipe, fotos a Drive › Cámaras › Personas, `decidirFotoPersona`).
- **Pedido (Brandon, 08-10):** «en el modal de en vivo todas veo que no detecta personas; quiero que detecte el movimiento de las personas, la marque y les ponga la etiqueta y aviso […] puedes implementar APIs, traer directorios de IA u otros».

## Contexto

- Las 2 cámaras de Blas (Hik-Connect, 4G) cubren el patio y el aserradero enteros. En el video SD (768×432) una persona mide **10-25 px**.
- El detector del 07-10 (MediaPipe EfficientDet-Lite0 int8, cuadro entero reducido a 320×320) guardó **1 foto** en total. Medido sobre 8 cuadros reales sacados de las cámaras (`sacarFoto`, sólo lectura):

| Variante | Personas ≥0,5 en 8 cuadros | Tiempo por cuadro (procesador) |
|---|---|---|
| Lite0 entero (lo de antes) | 0 | 78 ms |
| Lite2 cortado en 5×3 | 1 | 3 050 ms |
| D-FINE-N entero | 0 | 410 ms |
| D-FINE-S entero a 640 | 2 | 1 333 ms |
| **Movimiento + recorte con zoom + D-FINE-S a 320** | **5 (0,55-0,67)** | ~500 ms por recorte |

- Los YOLO de Ultralytics (los más usados) son AGPL-3.0: no sirven en un SaaS cerrado. D-FINE (Peterande, 2024) y RF-DETR son Apache-2.0. Las versiones int8 de `onnx-community` usan `ConvInteger`, que onnxruntime-web en WASM no tiene: va el fp32.

## Decisión

1. **Movimiento primero** (`lib/camaras/movimiento.ts`, puro): cada cuadro en gris a 192 px contra un fondo de promedio móvil (aprende 0,08 por cuadro; 0,02 donde hay cambio, para que una persona quieta tarde en fundirse). Manchas = componentes conexas con tolerancia de 2 puntos, mínimo 3. Si cambia >35 % del cuadro (luz, IR de noche, la cámara gira) se reinicia el fondo.
2. **Zoom donde importa** (`vigia-camara.ts`): hasta 4 recortes cuadrados a 320 px, primero alrededor de las personas que ya se siguen (quien se queda quieto no se pierde) y después de las manchas. Sin recortes, un barrido del cuadro entero a 640 cada 30 s.
3. **D-FINE-S en un Web Worker** (`detector-dfine.worker.ts`, `motor-dfine.ts`): `onnxruntime-web/webgpu` 1.29.0 (MIT). Tarjeta gráfica si hay una REAL (se descarta el adaptador de respaldo de SwiftShader) y si la mirada de prueba tarda ≤2,5 s; si no, WASM en un hilo (sin aislamiento de origen no hay hilos). Confianza mínima 0,5. `localStorage["camaras:detector-cpu"]="1"` fuerza el procesador.
4. **Seguimiento** (`lib/camaras/seguimiento.ts`, puro): número estable por persona (IoU o centros a <1,5 cajas), «estimada» si no se la vio en la mirada, olvidada a los 8 s; la numeración vuelve a 1 cuando no queda nadie. Para decidir la foto sólo cuentan las vistas en la mirada (una estimada confirmaría sola un «apareció» falso).
5. **«Apareció» con ventana estirada:** `decidirFotoPersona(…, ventanaConfirmarMs)` = máx(5 s, 2,5 × lo que tardó la vuelta). Con 5 s fijos y D-FINE en el procesador, nadie aparecía nunca (0 fotos en 45 s con 2 personas marcadas).
6. **Pantalla** (`CajasEnVivo.tsx`): caja coral con «Persona N · NN %», punteada si es estimada, punto que late si es nueva; movimiento en punteado celeste sin etiqueta. Aviso: mensaje + pitido (WebAudio), 1 cada 20 s por cámara, interruptor «Aviso con sonido» recordado; suena también con el mosaico minimizado.
7. **Respaldo:** si el modelo o el motor no cargan, el vigía usa MediaPipe sobre el cuadro entero como antes (las cajas de movimiento se siguen dibujando).
8. **Archivos servidos desde el mismo origen** (`scripts/copy-onnx-assets.mjs`, `postinstall`): `public/onnxruntime/ort-wasm-simd-threaded.asyncify.{wasm,mjs}` (≈26 MB) y `public/modelos/dfine_s_obj2coco.onnx` (≈41,5 MB, revisión fija de Hugging Face + sha256, caché en `node_modules/.cache/buleje-modelos/`). Ignorados por git. Nunca rompe la instalación. La CSP ya permitía `'self'`, `'unsafe-eval'` y `worker-src 'self'`: sin tocar zona de peligro.

## Consecuencias

- **Primera carga pesada:** ≈67 MB por navegador (después lo sirve la caché HTTP). En el celular con datos móviles, sólo baja si alguien prende «Detectar personas».
- **Procesador:** sin tarjeta gráfica cada vuelta tarda 1-6 s con dos cámaras y un núcleo trabaja seguido mientras hay movimiento. Va en el worker: el panel no se traba.
- **SD limita:** en el cuadro entero a 640 casi nadie llega a 0,5; quien entra se ve por el movimiento. Con HD (botón ya existente) las personas miden el doble, a costa de datos 4G de la cámara.
- **Lo que sigue igual:** fotos a Drive › Cámaras › Personas, aviso de WhatsApp, zonas ignoradas (ahora también filtran el movimiento), «No pausar».

## Alternativas descartadas

- **YOLOv8/11 (Ultralytics):** mejores con objetos chicos, pero AGPL-3.0.
- **Subir cada cuadro a una IA en la nube (Claude visión):** caro por cuadro y con cajas imprecisas; queda para confirmar un aviso, no para dibujar en vivo.
- **Cortar el cuadro entero en pedazos con MediaPipe:** 3 s por cuadro y confianzas ≤0,5.
- **La detección de personas de la propia cámara (Hik-Connect):** depende del modelo de cámara y llega como alarma con retraso; no sirve para marcar en el video. Queda como mejora aparte.
