# ADR-371 — Rellenar la guía con lo guardado y clasificar los papeles del despacho

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Despacho (`gtf-autocompletar`, `CtpDespachoGuiaModal`,
  `documento-clasificar`, `CtpPapelesDespachoModal`, `CtpEntriesTabla`)
- **Relacionados:** ADR-317 (la libreta), ADR-338 (la guía con forma de papel),
  ADR-367 (padrón en el campo), y el expediente del Drive
  (`ctp-archivar-documento`)

## Contexto

Dos fricciones del mismo momento —registrar la salida del camión—:

1. **Los veinte casilleros de la guía casi nunca son nuevos.** El propietario es
   el CTP, el destinatario es el comprador de siempre, el camión es el que viene
   todos los martes y los títulos son los de la Ficha. Todo eso ya está guardado
   y se re-tipeaba guía por guía.
2. **Los papeles del despacho no llegaban al expediente.** Un camión viaja con la
   GTF, su lista de productos, la guía de remisión, la factura, las guías de
   origen y la resolución del título. Llegan como PDFs y fotos con nombres tipo
   `IMG_20260808.jpg`, quedan en la máquina del que imprimió, y cuando aparece
   una fiscalización no están en ningún lado.

## Decisión

1. **Botón «Rellenar datos de la guía»**, al lado de Cerrar. `rellenarGuia()`
   (puro) baja la Ficha del CTP y **lo más usado de la libreta** —destinatario,
   transportista, conductor y vehículo—, arma la ruta (partida → llegada) y
   propone la vigencia. Dos reglas: **no inventa** (lo que no está guardado queda
   vacío y se nombra) y **no pisa** lo tipeado. No toca la lista de productos:
   ésa es la otra pestaña y otro acto.
2. **Acción «Papeles del despacho»** en la fila: se sueltan todos los archivos
   juntos y `clasificarDocumento()` (puro, 12 tests) propone qué es cada uno —
   GTF · Lista de Productos · Guía de Remisión Remitente/Transportista · Factura ·
   Boleta · Guía de Origen · Resolución o Registro de Plantación · Constancia
   SERFOR—, saca el número del documento y **archiva en el Drive** con etiqueta,
   la GTF y un nombre buscable (`GTF 001-0000025 · Factura · F001-00001234.pdf`).
3. **El contenido pesa más que el nombre** (85 vs 55 de confianza; los dos juntos,
   95): el nombre lo puso alguien apurado, el texto lo puso el sistema que emitió
   el papel. Debajo de **60** el archivo se marca «revisá» y su tipo queda en un
   selector: la clasificación **propone, no decide**. Un papel mal etiquetado en
   un expediente es un papel perdido.

### 1-bis · De dónde sale cada casillero (2026-08-08)

«Que todo esté rellenado, cada campo» obligó a mirar el formulario campo por
campo: el botón llenaba **8 de 41** y el aviso mentía. Tres causas y su decisión:

| Causa medida | Decisión |
|---|---|
| La bandeja de guías devuelve la guía **resumida** (número, destinatario, placa): `gtfDatos` nunca viajaba. El modal buscaba una llave en un cajón donde no estaba. | `GET …/guias-emitidas?**ultimaCompleta=1**` devuelve **una** guía —la última con datos— y no engorda la bandeja con 35 cuerpos completos de datos personales. |
| El transportista quedaba vacío aun con transporte **privado**, que por definición es el vehículo del titular. | Sin transportista en libreta ni guía previa y con transporte privado, **el transportista es el propio CTP**. No es un dato inventado: es lo que declara ese casillero. Con transporte **público** se pide la empresa. |
| El aviso decía «falta transportista, vehículo **o** conductor» teniendo al chofer cargado. Un aviso que nombra de más enseña a ignorarlo. | Un faltante por casillero, con **dónde** cargarlo («guardá el camión en la libreta y la próxima sale solo») y con la palabra del modo: por río es **matrícula**, no placa. |

Y una categoría nueva en el resultado: **`aProposito`** — los casilleros que
deben quedar en blanco (la casilla de DNI cuando la parte declara RUC, el
remolque, el CITES, la zona, la guía de remisión del transportista, la constancia
SNIFFS que recién existe al verificar). Nombrarlos evita que alguien los complete
con cualquier cosa «para que no quede nada vacío», que es exactamente lo que un
control lee como declaración falsa. Van en un desplegable del pie: seis motivos
ocupaban tres renglones de un modal que ya es largo.

**Fix colateral en la libreta:** el upsert **unía** roles siempre, así que un rol
puesto por error no se podía sacar nunca y esa parte se ofrecía para siempre como
transportista. Ahora la unión es sólo del alta rápida (match por documento); la
edición explícita (con `id`) fija la lista.

## Consecuencias

- El relleno dice qué completó y qué falta, con el motivo («no está guardado en
  la Ficha ni en la libreta»): así el operador sabe si le conviene cargar esa
  parte en la libreta para la próxima.
- Los papeles quedan en «Papeles de despacho (CTP)» del Drive, etiquetados por
  tipo y por GTF, que es como se los busca en una fiscalización.

## Límite conocido

Hoy sólo se lee el contenido de archivos de **texto plano**. Un PDF escaneado o
una foto se clasifican por el nombre y se marcan «revisá» — es correcto, pero no
es todavía la clasificación autónoma completa. El paso que falta es extraer el
texto (OCR / capa de texto del PDF) y pasárselo a la misma función: la lógica ya
está preparada para recibirlo, y ahí la confianza sube sola de 55 a 85.

## Verificación

Tenant real, contando campos del DOM (2026-08-08):

| | vacíos / total |
|---|---|
| Al abrir | **33 / 41** |
| Un click, antes del fix | 22 → 19 |
| Un click, con `ultimaCompleta` + propietario de respaldo | **9 / 41** |

Los 9 son los `aProposito` + el N° de comprobante (único de cada venta): no queda
un solo casillero rellenable en blanco. `faltantesGtf` —la validación que habilita
imprimir— da **0**. La segunda guía hereda la placa de la primera (`heredó la
placa: sí`), que es el circuito que hace que esto mejore solo con el uso. 9 tests
en `__tests__/forestal-gtf-autocompletar.test.ts`, incluido el que fija que el
**número** de comprobante nunca se hereda.

Verificación previa (2026-08-07): el modal pasó de «Faltan 6 datos» a completo —
no inventó lo que no había. **Papeles**: dos archivos, uno llamado
`IMG_20260808.txt` con una GTF adentro y otro `factura-escaneada.txt` con una
factura, se clasificaron por **contenido** como `GTF` (N° 001-0000025) y
`Factura` (N° F001-00001234). Sin errores de consola.
