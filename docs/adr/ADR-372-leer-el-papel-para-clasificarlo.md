# ADR-372 — Leer el papel para clasificarlo (capa de texto y visión)

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Despacho (`/api/admin/forestal/documentos/clasificar`,
  `lib/documents/extraer-texto.ts`, `lib/documents/transcribir-imagen.ts`,
  `CtpPapelesDespachoModal`)
- **Relacionados:** ADR-371 (clasificar los papeles del despacho), el analizador
  del Drive (`analyze-document.ts`, `vision-describe.ts`)

## Contexto

ADR-371 dejó la clasificación funcionando **con el nombre del archivo** y con el
texto que el navegador podía leer (sólo texto plano). Un PDF escaneado o una foto
del celular —que es como llega la mitad de los papeles— caía en «revisá».

El sistema ya sabía leer documentos: el Drive extrae texto de PDF con `unpdf` y
mira las fotos con visión. Lo que faltaba era **usar eso para clasificar**.

## Decisión

1. **La extracción sale de `analyze-document.ts` a `lib/documents/extraer-texto.ts`**
   y la comparten los dos. El mismo PDF tiene que leerse igual desde el buscador
   del Drive y desde el clasificador, o dirían cosas distintas del mismo papel.
2. **`POST /api/admin/forestal/documentos/clasificar`** prueba tres caminos, del
   más barato al más caro, y corta en el primero que sirve:
   1. **capa de texto** (PDF nativo, Word, Excel, .txt) — gratis y exacta;
   2. **visión sobre la página 1** si la capa vino vacía, o sea un escaneo;
   3. **visión sobre la imagen**, para fotos.
   Devuelve además `fuente` y `caracteres`: el operador ve si la etiqueta salió
   de leer el papel o de adivinar por el nombre.
3. **Para clasificar se pide TRANSCRIPCIÓN, no descripción.** Medido con
   `minicpm-v`: el prompt de descripción del Drive devolvió 490 caracteres de
   resumen y la clasificación quedó en «Otro», porque el clasificador busca las
   frases impresas del formato («GUÍA DE TRANSPORTE FORESTAL», «F001-…»). Por eso
   `transcribir-imagen` usa prompt propio contra el endpoint de visión, y sólo
   cae al camino del Drive si no hay endpoint propio.
4. **El modal clasifica en el servidor** y muestra «Leyendo el contenido…»
   mientras tanto; los archivos entran a la lista al toque con la etiqueta del
   nombre. Si el clasificador no contesta, se archiva igual con esa etiqueta:
   perder la subida porque el lector está caído sería cambiar lo importante por
   lo accesorio. Y la corrección del operador nunca se pisa con la del modelo.

### 4 · El bug que hacía imposible la visión sobre PDF (2026-08-08)

Al probar con un escaneo de verdad, **todo PDF sin capa de texto devolvía cero
caracteres en 0,4 s**: ni intentaba mirarlo.

`pdf.js` **se apropia** del buffer que recibe —lo transfiere al worker y el
original queda *detached*—. Como el endpoint primero prueba la capa de texto y
recién después dibuja la página, el segundo paso recibía un `ArrayBuffer` vacío y
moría con `Cannot perform Construct on a detached ArrayBuffer`. O sea: el camino
que existe **para** los escaneos fallaba **siempre**, y `tsc`, `eslint` y los
tests estaban verdes — es un bug de datos, no de tipos.

La copia se hace ahora **en la raíz** (`extractDocText`), no en cada llamador:
`analyze-document.ts` ya pasaba una copia, pero por costumbre y sin decir por qué,
así que el próximo consumidor habría vuelto a pisar la misma piedra.

De paso, el endpoint devuelve **`porQue`**: «no hay modelo de visión configurado»,
«no se pudo dibujar la página», «el modelo miró y no devolvió texto» se arreglan
de maneras distintas y sólo una es culpa del papel. Sin ese campo, diagnosticar
esto llevó tres corridas a ciegas.

### 5 · Un número leído a ojo no es el número

Sobre el mismo papel, la visión devolvió **`001-000025`** donde el escaneo dice
**`001-0000025`**: un cero de menos. Ese número entra al nombre del archivo en el
Drive y es por el que se busca el papel en una fiscalización.

Por eso, cuando la fuente es visión, el número se muestra en un **campo editable
marcado «se leyó de la imagen: confirmalo»**, y lo que el operador escribe gana
sobre lo que el modelo creyó leer. El **tipo** se sostiene con 85 de confianza
—«guía de transporte forestal» impreso en el encabezado no se confunde—; el
**número** no.

## Consecuencias

- Un PDF con capa de texto se clasifica en milisegundos y sin costo.
- Un escaneo o una foto cuestan una llamada de visión: por eso el endpoint tiene
  rate limit `MODERATE` y tope de 20 MB.
- La visión local es **lenta**: medido, 2 min 29 s por página con `minicpm-v` en
  la máquina de desarrollo. El techo quedó en 3 min y el botón de archivar se
  bloquea mientras hay archivos leyéndose.

## Verificación

**Capa de texto — verificado end-to-end** con PDFs reales contra el endpoint:
- `IMG_9912.pdf` (nombre inútil) → **GTF**, N° `001-0000025`, `fuente: "texto"`.
- `escaneo_0001.pdf` → **Guía de Remisión Remitente**, N° `T001-0000988`.
- `papel3.pdf` → **Resolución o Registro de Plantación**.

**Visión — verificada end-to-end** (2026-08-08, `minicpm-v` local, tenant real):

| Papel | Resultado | Fuente | Tiempo |
|---|---|---|---|
| PNG llamado `gtf-escaneada.png` | GTF · **95** · N° `001-0000025` | `vision-imagen` | 2 m 08 s |
| El mismo PNG llamado `IMG_4821.png` | GTF · **85** · «lo dice el contenido» | `vision-imagen` | ~2 m |
| PDF escaneado `DOC_20260808_0001.pdf` (imagen pegada, sin capa de texto) | GTF · **85** | **`vision-pdf`** | 39 s |

El nombre neutro es el caso que importa: **la visión sola alcanza**. Por el camino
del usuario (Playwright, tres archivos soltados juntos) la lectura de los tres
terminó en **104 s** y el PDF mostró «leído con visión (escaneo)» con su número a
confirmar. Sin errores de consola.

La transcripción y el render **se prueban con archivos, no con mocks**: el bug del
buffer detach (punto 4) pasó los tres gates estáticos y sólo apareció al soltar un
escaneo real.
