# ADR-382 — El m³ declarado a mano manda sobre la suma física de la línea

- **Fecha:** 2026-09-02
- **Estado:** aceptado (a pedido explícito de Brandon, con el riesgo asumido por escrito)
- **Contexto:** Resúmenes del cubicador · Distribución de rolliza sobre lo aserrado
- **Relacionado:** ninguna auditoría previa formal de este tramo — el bloqueo que se revierte acá salió de una conversación de sesión (2026-08-17), no de un ADR numerado; queda documentado ahora por primera vez.

## 1. El problema que destapó Brandon

`onEditarLinea` deja tipear piezas y m³ a mano para una línea (tipo/medida) ya
distribuida en un bloque. Hasta hoy, el `m3` tipeado sólo servía de **tope** para
la pasada de relleno (`llenarBloque`, Fase 0): el sistema tomaba piezas reales
hasta ese tope y el resultado —`AsignacionGrupo.m3`— era la suma física de esas
piezas, **nunca** el número tipeado.

El input, sin embargo, seguía mostrando el número tipeado para siempre (incluso
después de perder foco), así que la pantalla podía decir «7.197» en una línea
mientras el «Total del día» sumaba «5.377» — la suma real de las piezas que
entraron. Brandon lo encontró tipeando sus propios números reales y lo reportó
con captura: *"la suma es de 8 tantos pero pone 5.377... quiero que arregles"*.

## 2. Primer arreglo (revertido a medias por el punto 3)

La primera versión hizo que el input, al perder foco, mostrara `a.m3` (la suma
física real) en vez del número tipeado — así el input y el total volvían a
cuadrar, siempre. Verificado con captura: tipear "5" en una línea de 0.024 m³
reales lo hacía volver a "0.0236" solo, y el total del bloque seguía cerrando.

Ese arreglo **queda vigente por default** para cualquier bloque con una línea
que sólo tenga `m3` tipeado sin acompañarlo de una decisión explícita — no se
puede declarar un m³ que ninguna pieza real respalda, por la razón del punto 3.

## 3. Por qué existía el bloqueo (auditoría 2026-08-17)

La razón de fondo, ya citada en el código de `AgregarLineaBloque` y
`agregarBloqueSugerido`: una auditoría de sesión anterior (17-ago-2026)
encontró que un bloque de rolliza podía "amparar" más aserrada de la que la
troza dio físicamente, con sólo tipear un número mayor en el campo de
capacidad — el hueco exacto por el que se blanquea madera de otro origen en el
papel que ve el fiscalizador SERFOR. Ese hallazgo cerró la puerta a que
cualquier m³ mostrado en pantalla pudiera ser distinto del real, en cualquier
campo de la Distribución de rolliza.

## 4. La decisión de hoy: Brandon pide reabrirla, a conciencia

Brandon pidió explícitamente que, cuando él tipea piezas Y m³ a mano en una
línea, ese m³ quede **tal cual lo escribió** — no corregido contra la suma
física — y que fluya a los totales (bloque, día, especie) como si fuera el
real. Antes de tocar el código se le explicó la consecuencia exacta (un bloque
podría amparar más de lo que la troza dio, reabriendo el hueco del punto 3) y
se le mostró en vivo el número resultante ("Aserrada amparada: 5.121 m³ de
0.145 m³ producidos" — más amparado que lo que el lote entero produjo).
Respuesta textual: **"Sí, lo quiero así a propósito, asumo el riesgo."**

Esta es una decisión de negocio de Brandon, tomada con el número exacto de la
consecuencia delante — no una corrección de bug ni un criterio técnico de
Claude Code.

### Qué se implementó

`AsignacionGrupo` suma un campo `m3Declarado?: boolean`. En `llenarBloque`
(`lib/forestal/cubicacion-reparto.ts`), cuando la línea tiene un override de
`m3` (con o sin `piezas` acompañándolo), ese valor se escribe **directo** en
`g.m3`, pisando la suma física de `medidas` — que sigue mostrándose debajo tal
cual salió de las piezas reales, sin tocar. `d.usadoM3`/`d.libreM3` del bloque
se recalculan sumando `d.asignado` YA con los declarados aplicados (no el
`usado` físico de las pasadas internas), así el bloque, el día y la especie
siempre cuadran entre sí — aunque no cuadren contra la troza real. `libreM3`
puede dar **negativo a propósito**: es la única señal honesta de que se
declaró más de lo que ese bloque puede amparar.

`repartirPorDia` recibió el mismo criterio: una línea con `m3Declarado` va
entera a la jornada 1 (no hay piezas reales que repartir proporcional entre
días), sumando al total del día — sin este paso, el "Total del día" volvía a
mostrar 0 mientras el bloque decía "usa X", el mismo descuadre reaparecido un
nivel más abajo.

En la UI (`reparto-vistas.tsx`), la línea declarada lleva un badge
**"Declarado"** (ícono de alerta, tono warning) con tooltip explícito: *"m³
declarado a mano — no es la suma de las medidas reales de esta línea. Puede
amparar más de lo que estas piezas dieron físicamente: verificar antes de
declarar ante SERFOR."* El badge no es opcional ni se puede apagar — es la
trazabilidad mínima de que ese número no vino de una pieza medida.

## Consecuencias

### Positivas
- Brandon puede declarar el m³ que necesita para un bloque manual, sin pelear
  contra un "arreglo" que le devuelve otro número.
- Bloque, día y especie siempre sudan consistentes entre sí (nunca más un
  "7.197" en la fila contra un "5.377" en el total).
- El badge deja rastro visual permanente — nadie que mire la pantalla puede
  confundir un número declarado con uno medido.

### Negativas (aceptadas por Brandon)
- Los totales de página completa (`Aserrada amparada`, `% real` por bloque)
  pueden mostrar cifras físicamente imposibles (más amparado que lo producido,
  porcentajes de miles de por ciento) cuando hay una línea declarada. Es la
  consecuencia directa y esperada, no un bug — el número absurdo es la propia
  alarma.
- El Excel/PDF/Anexo 04 heredan `g.m3` tal cual (declarado); **no se auditó en
  esta sesión** si esas plantillas exponen `m3Declarado` con el mismo badge.
  Pendiente antes de imprimir un Anexo 04 con una línea declarada.
- `pieTablar` de una línea declarada sigue siendo el físico real (no se pidió
  declarar PT) — puede quedar desproporcionado contra el m³ declarado de la
  misma línea. No se resolvió, fuera del pedido explícito.

### Migraciones requeridas
Ninguna — `m3Declarado` es un campo opcional en memoria, no persiste en Prisma.
Las distribuciones ya guardadas (`ForestDistribucion` vía `overridesLinea` en
`BloqueRolliza`) recalculan `m3Declarado` al vuelo desde el mismo
`overridesLinea.m3` que ya guardaban — no hace falta backfill.

## Verificación

**Lib** — 74 tests existentes de `cubicacion-reparto.test.ts`, todos verdes sin
tocar ninguno (el comportamiento nuevo sólo se activa con un override de `m3`
explícito; ningún caso de test previo lo dispara). `tsgo --noEmit` y `eslint`
en 0 errores en los 3 archivos tocados.

**Pantalla**, dev, lote de prueba (Tornillo/Cedro/Bolaina):
1. Bloque Cedro, línea "Comercial" con real 0.0236 m³ → tipeo "5" → queda "5"
   (no se corrige solo).
2. Badge "Declarado" aparece junto a la línea, con el tooltip completo.
3. "Total del día 1" del bloque: 5.057 (0.057 real de Paq. larga + 5
   declarado) — cuadra con "usa 5.057" del bloque y con el header de especie
   Cedro ("usa 5.057 de 0.080 m³").
4. KPI inferior: "Aserrada amparada: 5.121 m³ de 0.145 m³ producidos" — número
   imposible, visible, sin ambigüedad.
5. `% real` del bloque y del total de la tabla saltan a 3,468.2 % y 1,945.0 %
   respectivamente — otra alarma visual que no se puede pasar por alto.

## 5. Segunda vuelta: bloques armados directo desde lo aserrado (sin rolliza)

Brandon pidió, en la misma sesión, poder crear un bloque de "Rolliza nueva" **sin llenar su m³ de rolliza** y usarlo igual para organizar lo ya aserrado con "Agregar tipo a este bloque" — piezas y/o m³ por tipo, en dos o más bloques, para que las medidas se repartan solas entre ellos.

Esto destapó dos bugs más en la misma mecánica de overrides:

**a) El bloque nunca corría `llenarBloque`.** `distribuirPorCapacidad` salteaba cualquier bloque con `libreM3 <= EPS` — un "Rolliza nueva" sin m³ tiene capacidad 0, así que ningún override (ni piezas, ni m³, ni declarado) llegaba a procesarse. Fix: el salteo ahora chequea primero si el bloque tiene algún `overridesLinea` activo; si tiene, corre igual aunque su capacidad sea 0.

**b) Piezas-solo (sin m³) en un bloque de capacidad 0 fabricaba un conteo fantasma — DOBLE CONTEO real.** Con el fix (a) puesto, un override de sólo piezas (sin declarar m³) seguía topado por `cap - usado` del bloque (0) en la Fase 0 — cero piezas reales podían entrar. La línea caía entonces en la rama "sin grupo real", que devolvía las piezas *pedidas* como si fueran las *asignadas*, sin descontarlas de `pendientes`. Resultado verificado en pantalla: pedir 6 piezas de Comercial (de 10 reales) las mostraba en el bloque nuevo, pero "Falta por distribuir" seguía contando las 10 originales — 16 piezas contadas donde sólo había 10 reales.

Esto es distinto del caso declarado (§1-4): piezas-solo nunca fabrica m³, mueve madera REAL entre bloques — no hay ningún motivo de compliance para toparlo contra una capacidad que el bloque nunca reclamó. Fix: `correrPasada` suma un parámetro `ignorarCapacidadBloque` — sólo se activa cuando el override es piezas-solo (`ovM3 == null`) **y** el bloque arrancó con `cap <= EPS` (nunca declaró rolliza propia). Con capacidad real declarada (>0), el tope de capacidad sigue mandando sin excepción — este bypass NO existe para bloques con rolliza real.

Con ambos fixes, verificado en pantalla (10 piezas reales de Comercial/Tornillo, bloque manual sin m³ de rolliza):
- Pedir 6 piezas → el bloque muestra 6 piezas, 80 PT, **0.189 m³ real** (no inventado).
- "Falta por distribuir de Tornillo" baja de 10 a **4** piezas de Comercial — sin duplicar.
- "Cuánto falta por distribuir" (agregado entre TODAS las especies) también cuadra: 11 piezas totales de Comercial (Tornillo+Cedro) − 6 distribuidas = 5 pendientes, exacto.
- KPI inferior: "Aserrada amparada: 0.189 m³ de 0.428 m³ producidos" y "Falta por distribuir: 0.239 m³" — 0.189 + 0.239 = 0.428, cierra exacto.

74 tests de `cubicacion-reparto.test.ts` verdes sin tocar ninguno — el bypass sólo se activa con la combinación exacta (piezas-solo + capacidad 0), inalcanzable por ningún caso de test previo.

## Alternativas evaluadas

| Opción | Por qué se descartó |
|---|---|
| Mantener el "snap-back" (arreglo del punto 2) para todos los casos | Es lo que Brandon pidió revertir explícitamente — cierra el caso de uso que necesita |
| Dejar que el m³ declarado se pierda en `repartirPorDia` (no tocar esa función) | Reabría el descuadre un nivel más abajo (Total del día ≠ usa del bloque) |
| Ocultar el badge para no "alarmar" al operario | Va directo contra la trazabilidad — el punto entero de blindar esto es que nunca se confunda un declarado con un medido |
| Bloquear el override si excede la capacidad del bloque | Contradice el pedido explícito ("nada de automático cuando yo lo pongo") — Brandon asumió el riesgo de que dé negativo |
