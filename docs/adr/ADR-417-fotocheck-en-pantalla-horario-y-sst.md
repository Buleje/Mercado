# ADR-417 — Recursos Humanos: el fotocheck se ve antes de imprimirse, horario del puesto y datos de seguridad

- **Fecha:** 2026-09-15
- **Estado:** aceptado — migración aplicada el 2026-09-15 (4 columnas + 4 CHECK, en una transacción)
- **Pedido por:** Brandon — «en pestaña personal al poner fotocheck quiero que la tabla cambio a un formato de
  fotocheck y luego aparesca el boton para descargar en pdf, y dame tambien otras sugerencias varias de funciones y
  campos y demas elementos; en asistencia quiero que me des ideas y mejoras varias en general». De las sugerencias
  eligió las cuatro.
- **Depende de:** ADR-414 (Recursos Humanos) y ADR-416 (hoja semanal y fotocheck) — mismos roles, mismo cálculo de lo
  ganado, mismo PDF de fotocheck.

## Contexto (medido, 2026-09-15)

| Qué | Cifra / hecho | Fuente |
|---|---|---|
| Fotocheck | el botón descargaba el PDF **a ciegas**: no se veía nada antes de gastar papel | `PersonalView.tsx` (antes) |
| Fotos | **0 de 11** personas tienen foto → todos los fotochecks salen con las iniciales | `SELECT` sobre los dos tenants de Blas |
| Emergencia | **1 de 11** tiene contacto cargado; el dorso ya reservaba el bloque | `Colaborador`, `fotocheck-pdf.ts` |
| Tardanza | **5** marcas TARDANZA puestas a mano; **36 de 52** ya guardan hora de entrada | `SELECT` sobre `Asistencia` |
| Horario | `Puesto` tenía `horasJornada` pero **ninguna hora de entrada**: nada con qué comparar | `schema.prisma` |
| Días sin marcar | **8 de los 15** días de septiembre sin ninguna marca (01–07 y el 13) | `SELECT` por día |
| Correcciones | **10** marcas corregidas, **0** motivos: `motivoCorreccion` existe y ninguna pantalla lo pide | `Asistencia` |
| Lo ganado | `ganado.ts:8` declaraba «no resta adelantos», y la fila ya mostraba el saldo al lado | `ganado.ts`, `FilaGanado.tsx` |

## Decisión

### 1. El fotocheck se ve antes de imprimirse
`Fotochecks (N)` ya no descarga: cambia la tabla por las tarjetas (`FotochecksVista` + `TarjetaFotocheck`) y el botón
`Descargar PDF (N)` aparece ahí. Se elige quién entra con un tilde por persona, se ve frente y dorso, y se dice cuántas
hojas A4 salen (3 tarjetas por hoja, el `POR_HOJA` del PDF). Los filtros de la pantalla siguen mandando; los cesados
quedan fuera y se informan.

**La tarjeta no puede mentir.** `TarjetaFotocheck` recibe la MISMA `PersonaFotocheck` que alimenta al PDF y replica sus
medidas con container queries (cada tamaño es el del PDF ÷ 54 mm de ancho, en `cqw`), y la foto se pide con el mismo
`crossOrigin` que exige el canvas de jsPDF: una foto de un origen sin CORS no se ve en pantalla porque tampoco va a
entrar al papel. Verificado descargando el PDF de verdad: lo que mostraba el preview es lo que salió impreso.

### 2. Horario del puesto ⇒ la tardanza se juzga sola
`Puesto.horaEntrada` (TEXT «HH:MM», nullable) y `Puesto.toleranciaMin` (INT, default 10). Sin hora de entrada **no se
juzga nada**: la tardanza se sigue marcando a mano, como hasta hoy. Con horario, al tipear la hora de entrada la
pantalla propone TARDANZA y dice de cuánto fue; nunca pisa en silencio un estado que la persona puso a propósito.

### 3. Datos de seguridad en el dorso
`Colaborador.grupoSanguineo` (lista cerrada A+ … O-) y `Colaborador.alergias` (texto ≤ 200). En un aserradero el
fotocheck hace de credencial de seguridad y eso es lo que se lee en el momento. «No se sabe» y «ninguna» no son lo
mismo: sin dato no se imprime la etiqueta vacía.

### 4. Días abiertos y lo que queda por pagar
- La asistencia avisa qué días del mes quedaron sin ninguna marca, con un clic para ir a cerrarlos. El cálculo
  `sinMarcar` ya existía por persona (`ganado.ts`, `conteo-mes.ts`); faltaba «qué día no marcó nadie».
- «Lo ganado» muestra **queda por pagar** = ganado − adelantos abiertos, sólo para quien tiene cuenta de Adelantos
  vinculada. Es referencia, no una boleta, y el saldo de adelantos es a hoy (no del período): la pantalla lo dice.

## Migración

`prisma/migrations/adr-417-rrhh-horario-y-sst.sql`, aplicada con `scripts/apply-sql.mjs` (pooler, transacción atómica).
EXPAND puro: cuatro columnas aditivas, ningún dato existente cambia y el código viejo no las lee. Los CHECK están
verificados contra la base real: rechaza `'25:99'` como hora y `'O positivo'` como grupo (SQLSTATE 23514).

## Consecuencias

- Imprimir fotochecks deja de ser a ciegas: los huecos (sin foto, sin documento, sin nombre del negocio) se ven antes.
- La tardanza pasa a ser un dato derivable en vez de un criterio de quien marca — pero sólo donde haya horario cargado.
- Cuatro columnas nuevas que revertir es barato mientras nadie las cargue (el SQL trae el `DROP` comentado).
- Queda pendiente: pedir el motivo al corregir una marca (`motivoCorreccion`, 10 correcciones sin motivo) y dejar tocar
  el refrigerio (`refrigerioMin`, presente en las 52 marcas y en ninguna pantalla).
