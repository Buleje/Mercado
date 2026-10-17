# ADR-397 — «Traer del SNIFFS»: la programación de producción entra pegando la captura

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — «pegar una imagen del Detalle de la programación de producción
  del SNIFFS en el modal de inventario declarado y que se registren solos el tipo y el
  volumen».

## Contexto

El operador declara la corrida en el SNIFFS (SERFOR) y después la vuelve a tipear en el
libro: producto por producto, con sus m³. Es el paso donde el libro y lo declarado dejan
de cuadrar. La pantalla del SNIFFS ya trae todo: N° de lote, fechas, especie, volumen
consumido y el «Resumen de Producción por PMF y Producto».

Medido antes de decidir:

| Hecho | Consecuencia |
|---|---|
| Localmente no hay `OPENAI_API_KEY` ni `ANTHROPIC_API_KEY`; Groq no tiene ningún modelo con visión (listado 2026-09-08) | `lib/ai/vision-extract.ts` devuelve 503 acá: una feature sobre eso no se podía verificar |
| tesseract.js sobre la captura real (1415 px): a 1× pierde puntos decimales («9753»); a 2× lee las tres filas, el lote, las fechas y la especie sin un error (confianza 91, 1.9 s) | Para una CAPTURA (texto impreso nítido) no hace falta un modelo de visión |
| La CSP del panel: `script-src 'self' … 'strict-dynamic'` en prod, `connect-src 'self' …`, sin `worker-src` | El worker de tesseract desde CDN o desde `blob:` queda bloqueado; hay que autohospedar y declarar `worker-src 'self'` |

## Decisión

1. **OCR en el navegador con tesseract.js** (`lib/ocr/ocr-navegador.ts`): sin subir nada,
   sin clave, sin costo por imagen, funciona sin internet. Toda imagen menor a 2400 px se
   amplía con canvas antes de leerla (2× o 3×).
2. **Assets autohospedados en `public/tesseract/`** (worker, tres cores WASM «lstm», idioma
   `spa`) copiados por `scripts/copy-tesseract-assets.mjs` en `postinstall`; ≈22 MB
   regenerables, en `.gitignore`. `worker-src 'self'` en las dos CSP (proxy y fallback).
3. **Un solo parser para OCR y portapapeles** (`lib/forestal/sniffs-produccion-parse.ts`):
   el texto que sale del OCR y el que copia el navegador al seleccionar la tabla pasan por
   el mismo camino. Producto → catálogo `TIPOS_PRODUCTO_LOCTP` (sin acentos, el más largo
   gana); primer número después del producto = m³, segundo = % aprovechado. Un número sin
   punto y de 4+ dígitos se toma como milésimas y se **marca dudoso**; más producto que
   materia prima se marca, no se corrige.
4. **Nada entra sin revisar**: `CtpPegarSniffs` muestra las filas (producto editable,
   volumen editable, % del SNIFFS, lo leído crudo) y coteja contra el material — especie,
   volumen consumido, margen bajo el tope del 56 % — diciendo las diferencias. Al
   confirmar, cada fila es un paquete con el próximo código libre de la serie,
   presentación del producto, `cantidad: 0` (el resumen no trae piezas: no se inventan) y
   `observations: "Traído del SNIFFS · lote N"`. El tope del 56 % lo sigue aplicando
   `motivosParaGuardar` al guardar, como con cualquier paquete.
5. **Ctrl+V global en el modal**: una imagen se lee siempre (ningún campo la recibe); un
   texto sólo si parece esta pantalla y, con el foco en un campo, sólo si además es una
   tabla — pegar «Tornillo» en una observación no dispara nada.

## Alternativas descartadas

- **Modelo de visión (`vision-extract`)**: correcto para fotos de celular borrosas de un
  papel; para una captura es pagar por token lo que el navegador lee gratis, y no se podía
  verificar sin clave. Queda como paso siguiente para fotos, no para capturas.
- **Sólo texto copiado**: 100 % determinístico, pero el operador piensa en «la captura».
  Se aceptan los dos.

## Consecuencias

- Primera lectura en un navegador: descarga ~6.7 MB (core + idioma), después queda en
  caché. El worker se suelta al cerrar el modal.
- El mismo parser sirve para el paso 1 (armar el lote de inventario con lote, fechas,
  especie y volumen consumido de la misma captura): pendiente de wirear.
