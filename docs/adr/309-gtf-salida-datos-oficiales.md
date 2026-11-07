# ADR-309: GTF de salida — datos de las partes intervinientes y las tres impresiones

- **Estado:** Aceptado (2026-07-29)
- **Relacionado:** ADR-137 (GTF de salida formal: serie + correlativo), ADR-135 (despacho → origen), ADR-124 (especialización forestal)
- **Zona de peligro:** `lib/db/forest-ctp-despacho.db.ts`, `lib/forestal/ctp-gtf-print.ts`
- **Fuente normativa (verificada contra texto primario):**
  - **Ley N° 29763, art. 124** — la guía de transporte ampara la movilización, tiene **carácter de declaración jurada** y la emite el titular del derecho o su regente; el SERFOR aprueba el formato único.
  - **D.S. N° 018-2015-MINAGRI, art. 172** — emisores. Inciso **c)** el titular del centro de transformación, para productos de transformación primaria, "debiendo consignarse los datos establecidos en el formato que aprueba el SERFOR". Inciso **d)** la ARFFS a pedido del **propietario del producto que no es titular** del título habilitante ni del centro de transformación.
  - **RDE N° 122-2015-SERFOR-DE** — art. 3: **Arial**, prenumerada, **A4**, autocopiativo. Art. 4: el talonario se remite a la ARFFS, que **consigna una marca (visado)** en cada guía antes de su uso. Art. 5: **original + 2 copias**, con destino definido para cada una.
  - **RDE N° D000014-2024-MIDAGRI-SERFOR-DE** — formato vigente: mismas reglas de impresión + hoja de **registro de control** y 4 anexos.

---

## Contexto

El ADR-137 le dio a la GTF de salida un **número** trazable (serie autorizada por la ARFFS +
correlativo con lock). Pero el papel seguía llevando sólo el emisor, el producto y la cadena de
custodia. En un puesto de control eso no alcanza: lo que se compara es la **placa** contra la
carga, **a quién** se entrega, **quién** transporta y **con qué título** salió la madera. Ninguno
de esos datos se capturaba en el Libro, así que el operador los escribía a mano en el talonario
y el sistema no tenía registro de lo declarado.

El inciso d) del art. 172 obliga además a distinguir dos figuras que hasta ahora eran la misma:
el **emisor** (el CTP) y el **propietario del producto**, que puede ser un tercero cuyo material
el CTP sólo transformó.

## Decisión

1. **`ForestCtpEntry.gtfDatos Json?`** (migración `forest_ctp_entry_gtf_datos`) guarda el cuerpo
   de la guía por línea de despacho. JSON y no columnas: son ~20 campos de un documento cuyo
   formato oficial puede cambiar por RDE, y ninguno se filtra, agrupa ni suma.

2. **Contrato puro en `lib/forestal/ctp-gtf-datos.ts`** — `gtfDatosSchema` (Zod), `leerGtfDatos()`
   tolerante (nunca tira: devuelve defaults ante JSON viejo o basura), `faltantesGtf()`,
   `trasladoVigente()` y `COPIAS_GTF`. Campos: propietario (con `esElCtp`), destinatario,
   transportista (+ registro MTC), vehículo (placa/marca/tipo/conductor/DNI/licencia), traslado
   (partida/llegada/ruta/fechas), **títulos habilitantes propios de la guía**, permiso CITES y
   observaciones.

3. **Los títulos se guardan EN la guía**, copiados de la Ficha al abrirla. Una guía emitida tiene
   que seguir diciendo con qué título salió aunque la Ficha cambie después.

4. **Guardar admite huecos; imprimir el original no.** `faltantesGtf()` bloquea la impresión y
   enumera qué falta **con el motivo operativo** ("es lo primero que compara un puesto de
   control"), no con "campo obligatorio". Mismo criterio que el resto del libro: el acta admite
   huecos, el documento que se presenta ante la autoridad no.

5. **Tres impresiones con destino impreso** (art. 5): ORIGINAL (acompaña el transporte), COPIA 1
   (queda en el primer puesto de control) y COPIA 2 (la conserva el emisor), cada una en su hoja.
   Se agregan al papel el **texto de la declaración jurada** (art. 124), el recuadro del **visado
   de la ARFFS** (art. 4) y **Arial** como tipografía (art. 3).

6. **Cierre de período respetado:** `guardarGtfDatos` levanta `PERIODO_CERRADO` igual que el
   resto de las escrituras del libro — la guía de un mes cerrado no se retoca.

7. **El número de la guía se lee de la base** (`guiaDeDespacho`) y no de la fila que el cliente
   ya tenía: emitir la GTF lo cambia, y con la copia vieja una guía emitida se mostraba "sin
   emitir" (defecto encontrado al verificar, corregido en el mismo commit).

## Consecuencias

- **Positivas:** la guía de salida lleva todo lo que un control coteja y queda registrado en el
  Libro; el propietario del producto es una figura propia; la impresión respeta las reglas
  formales verificadas; auditado (`ctp_gtf_datos`).
- **Límite explícito y deliberado:** los campos exactos del formato viven en los **anexos
  gráficos** de la RDE D000014-2024, que gob.pe no sirve a un fetch. El documento **no se
  presenta como el formato oficial** — el pie dice que complementa, no reemplaza, el talonario
  visado por la ARFFS. Un papel que se hace pasar por el oficial es peor que ninguno.
- **Pendiente:** si algún día se integra el aplicativo GTF del SERFOR, `gtfDatos` es el payload
  natural; habría que mapear sus nombres de campo y agregar el estado de transmisión.

## Alternativas descartadas

- **Columnas nuevas por campo** (~20) → descartado: nada se consulta por esos campos y el formato
  puede cambiar por resolución; una migración por RDE es peor que un JSON validado con Zod.
- **Bloquear GUARDAR con la guía incompleta** → descartado: el transportista se define a última
  hora y forzarlo haría que el operador invente una placa. Se bloquea imprimir.
- **Reproducir el formato oficial "a ojo"** desde imágenes de guías → descartado: un documento que
  parece oficial sin serlo expone al titular en una fiscalización.
