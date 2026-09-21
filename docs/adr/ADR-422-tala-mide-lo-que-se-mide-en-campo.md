# ADR-422 — La Sección 1 (Tala) del LO-TH captura lo que se mide en el monte

- **Fecha:** 2026-09-21
- **Estado:** Aceptado
- **Área:** Forestal · LO-TH (`loth-*`)
- **Fuente primaria:** RDE N° 264-2019-MINAGRI-SERFOR-DE, Anexo 02 «Instrucciones para el
  registro de información», Sección 1: Tala, items 1-10.
  `https://faolex.fao.org/docs/pdf/per213939.pdf` (PDF oficial, leído 2026-09-20)

## Contexto

El formulario de la Sección 1 pedía tres números —Ø mayor, Ø menor y Longitud— y calculaba el
volumen por Smalian. Los tres campos existían y el cálculo era correcto, pero **ninguno de los
tres es un número que exista en el monte**:

1. **El diámetro que se consigna es un promedio** (items 6 y 7): «debe tomarse 2 o más medidas
   en dicha sección de forma cruzada para calcular un valor promedio. Ejemplo: si los diámetros
   de la sección mayor son 1.30 m y 1.10 m; el promedio que se consignará será 1.20 m». Quien
   mide con forcípula tiene **dos** números y tenía que promediarlos de cabeza, al lado del
   árbol. El campo ya lo insinuaba con un hint («Promedio 2 medidas») sin darle lugar al dato.
2. **La longitud es la aprovechable, no la total** (item 8): se descuentan aletas de la base,
   tramos con defecto y el despunte de copa. El ejemplo de la norma es literal: «la longitud
   total del fuste es de 15 metros, pero tiene 1 metro de descuento en la parte basal (culata)
   por presencia de aletas, entonces la longitud aprovechable es de 14 metros». El formulario
   pedía el 14 ya resuelto y perdía de dónde salía.
3. **Los diámetros y el volumen son condicionales** (Art. 4 y las notas de los items 6, 7 y 9):
   son obligatorios **sólo cuando el aserrío se realiza dentro del área de aprovechamiento**;
   la longitud se registra siempre. El considerando iii de la propia RDE lo dice al aprobar el
   formato. El formulario los exigía en los dos casos: **era más estricto que la norma**, que
   es otra forma de estar mal, porque un campo obligatorio que no corresponde empuja a inventar
   un número antes que a dejarlo vacío.
4. **El item 10 no es un campo libre**: tipifica cuatro casos y nombra **el término exacto**
   («descartado», «consumo interno») más el nombre científico en dos supuestos. Con un textarea
   salía «se descartó», «no sirve», «descarte» — el dato estaba y el fiscalizador que busca la
   palabra no lo encontraba.
5. **El item 3 pide marcado físico** «en el fuste y el tocón con materiales durables (placa
   metálica o plástica, pintura esmalte, etc.)». Es lo primero que un supervisor de OSINFOR
   verifica en campo y no existía en ninguna parte del libro.

Medido en el tenant real (`inversiones-agroforestales-blas-sociedad-anonima`, 2026-09-20): la
sección tala tiene 2 líneas, y `gpsLat`/`gpsLng`/`photoUrl` están en **0 usos** — la evidencia
de campo estaba construida y sin estrenar.

## Decisión

**1. Capturar las medidas crudas y derivar lo que el formato pide.** `lib/forestal/loth-tala.ts`
concentra la aritmética: `promedioCruzado()` (N medidas por sección, ignora vacías, `null` nunca
`0`), `calcularLongitud()` (total − descuentos tipificados) y `volumenDeMedidas()`. Lo que se
guarda sigue siendo **Ø promedio + longitud aprovechable + volumen**, que es exactamente lo que
exige el formato oficial: no se agregan columnas para las medidas crudas.

**2. Obligatoriedad según el modo de aprovechamiento.** `obligatoriedadTala(modo)` traduce el
Art. 4: con `despacho_trozas` sólo se exige la longitud; con `aserrio_en_area` también diámetros
y volumen. **Sin modo elegido se pide todo** —un campo de más se corrige, uno de menos se
fiscaliza— pero el aviso dice «elige qué haces con la troza» en vez de afirmar un modo que nadie
declaró.

**3. Trozado reusa el mismo componente con otra regla.** Sus items 6 y 7 repiten palabra por
palabra lo de las medidas cruzadas, pero su item 9 **no** trae la nota condicional (el volumen de
la troza va siempre) y su item 8 pide «la longitud de la troza», sin descuentos: las aletas ya se
descontaron sobre el fuste, en Tala. Restarlas otra vez sería descontar dos veces la misma
madera. De ahí `obligatoriedadTrozado()` y la prop `seccion` de `LothMedicionFuste`.

**4. Observaciones tipificadas.** `MOTIVOS_TALA` + `componerObservaciones()` escriben el término
que la norma nombra, sin pisar el texto libre de la persona.

**5. Dos columnas nuevas para el marcado físico.** `ForestLothEntry.marcadoFuste` y
`.marcadoTocon`, `Boolean @default(false)`. Migración `20260921000000_loth_marcado_fisico`,
**expand puro**: aditiva, con default, sin backfill y sin `NOT NULL`, así ninguna línea existente
cambia de significado — `false` es «no consta», no «no se marcó».

**6. El censo arranca la medición, no la reemplaza.** Al elegir el árbol, el DAP entra como
**primera medida cruzada** y la altura comercial como longitud total, con un aviso visible de que
son estimados del árbol en pie y hay que confirmarlos contra el tocón. Antes se copiaba el DAP en
Ø mayor **y** Ø menor a la vez: fingía dos medidas cruzadas que nadie tomó y daba un volumen
cilíndrico.

## Consecuencias

**A favor**
- El libro deja de pedir cuentas mentales: se anota lo que se mide.
- La exigencia del formulario coincide con la de la norma, en los dos sentidos.
- El término que el fiscalizador busca queda escrito tal cual.
- El marcado fuste/tocón pasa a ser un dato consultable, no una costumbre.
- Una sola fórmula de Smalian: el formulario tenía **su propia copia**, que es como se llega a
  que dos pantallas cubiquen distinto el mismo árbol. Ahora usa `smalianVolume` de
  `loth-constants`.

**En contra / a vigilar**
- Dos columnas más en un modelo ya ancho.
- Las medidas crudas (las dos cruzadas, los descuentos) **no se persisten**: viven en el
  formulario y se pierden al guardar. Se consigna el resultado, que es lo que el formato pide;
  si alguna vez hace falta auditar de dónde salió un promedio, habrá que persistirlas.
- `LothMedicionFuste` sirve a dos secciones con una prop: si aparece una tercera con reglas
  propias, conviene partirlo antes que encadenar condicionales.

## Alternativas consideradas

- **Dejar los tres campos y explicar en un tooltip.** Descartado: el hint «Promedio 2 medidas»
  ya existía y no evitaba la cuenta mental ni dejaba rastro de las medidas.
- **Persistir las medidas crudas en columnas nuevas.** Descartado por ahora: el formato oficial
  consigna el promedio, y agregar cuatro columnas para reconstruir una cuenta que la norma no
  pide es peso sin destinatario.
- **Exigir siempre diámetros y volumen «por las dudas».** Descartado: contradice el texto
  expreso de la norma y fabrica el dato inventado que la regla pretendía evitar.

## Verificación

Cargando en el navegador los ejemplos numéricos de la propia RDE y leyendo después la fila en la
base (no el formulario):

| Qué | Esperado por la norma | Guardado |
|---|---|---|
| Ø mayor de 1.30 y 1.10 | 1.20 m | `1.200` |
| Ø menor de 0.80 y 0.90 | 0.85 m | `0.850` |
| Longitud 15 m − 1 m de aletas | 14 m | `14.00` |
| Volumen Smalian | — | `11.5523` |
| Marcado fuste + tocón | — | `true` / `true` |
| Motivo «Descartado» + detalle | término exacto | `Descartado · hueco de base a copa`, `discarded=true` |

Dos defectos aparecieron **sólo** al guardar de verdad, invisibles para `tsc`, `eslint` y los
tests: el cliente Prisma cacheado del dev server descartaba en silencio las columnas nuevas
(hace falta reiniciar tras `prisma generate`), y una asignación posterior
(`if (fields.has("discarded")) payload.discarded = discarded`) pisaba el flag derivado de los
motivos con el checkbox que en tala ya no se muestra — la línea quedaba con «Descartado» escrito
en observaciones y `discarded=false`.

## Referencias

- `lib/forestal/loth-tala.ts` · `components/admin/forestal/LothMedicionFuste.tsx` ·
  `components/admin/forestal/LothTalaObservaciones.tsx` · `__tests__/loth-tala.test.ts`
- Migración `prisma/migrations/20260921000000_loth_marcado_fisico/`
- Skill `serfor-osinfor-compliance` · memoria `loth-seis-secciones-rde264-verificado`
- ADR-125 (LO-TH), ADR-305 (invariantes T1-T5)
