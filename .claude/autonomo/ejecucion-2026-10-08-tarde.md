# Ejecución del plan del 08-10 tarde (Brandon: «activa múltiples agentes y ejecuta todo lo planeado hoy»)

> Fuente: doc vivo https://claude.ai/code/artifact/69c4150b-fcb3-4fdd-8fd1-f1b2264aab4e (sólo filas **Aprobada** de hoy).
> PDF: Escritorio de Windows `Plan-de-mejoras-Buleje-2026-10-08.pdf`. Este archivo es el estado vivo de la ejecución.

## Reglas para todos los agentes

- **No hacer commits** ni `git stash` / `reset` / `checkout` / `restore`: los commits los hace un paso aparte en fila al cerrar la fase. Para ver la versión anterior: `git show HEAD:<archivo>`.
- Tocar **sólo** tus archivos. Antes de CREAR un archivo, `ls` la ruta (otros agentes trabajan en paralelo sobre el mismo checkout).
- Lo pesado SIEMPRE con candado: `flock /tmp/bsm-pesado.lock npm run typecheck`, `flock /tmp/bsm-pesado.lock npx vitest run <archivo>`, `flock /tmp/bsm-pesado.lock node scripts/qa-capturas.mjs …` (RAM: earlyoom mata tsc/chrome si van 3 a la vez).
- **Nunca escribir datos en Blas** (`cmpxiv6p4000bohvzwl6bnfpv`) salvo la migración de la fase 4 con su ensayo en seco. Probar en `main` (qaadmin / Qa-admin-1234). Leer Blas con `node scripts/sql-lectura.mjs` está bien.
- **Sin cambios de schema** en las fases 0-3. Zona de peligro (CLAUDE.md §6) no se toca salvo lo dicho en tu encargo.
- Verificar por el camino del usuario: 1 captura con `qa-capturas` (claro 1280) si cambia lo que se dibuja; vitest si hay lógica; `npm run typecheck` UNA vez al final.
- UI: tokens del DS, tuteo peruano, ⓘ en vez de párrafos (rule ui-components), ≤300 líneas por componente (si un archivo ya pasa, no lo hagas crecer: extrae).
- Devuelve «Para acelerar:» con lo que más turnos te costó.

## Datos medidos (no re-medir)

- Blas: 6 permisos (`ForestContrato`), 2 con titular «(por confirmar)», 0 con RUC/DNI. GTF LO-TH emitida 019-001-0000001: 22 trozas TORNILLO 20,303 m³, `planId` puesto, 0 con `gtfDatos.listaTrozasNro`, 0 ingresos en el CTP. 0 de 46 ítems renombrados (main: 4 de 70).
- Despacho LO-TH: las líneas no guardan medidas (0/22), el trozado sí (22/22 en Blas, 138/138 en main por `trozaCode`). `despachoCode` vacío 22/22. main: 138 trozas despachadas en 17 guías.
- Docs del plan de Blas (ADR-467): carpetas «Jefe - representante», «Registro de plantación - Resolución», «Títulos de propiedad» con 1 doc c/u; GTF→plan por `ForestGtf.planId` (3/3).
- Contactos: directorio forestal de Blas 11 fichas / 0 con teléfono; cuentas de adelantos 4 (1 con teléfono), 8 adelantos.
- Rendimiento Blas: 5 corridas, 11,6-37,5 %, promedio 24,7 % (sospecha de unidades).
- Cámaras Blas: 67 fotos de personas (todas del 08-10). Video H.265 1280×720; reproductor arranca `audio:false` y prende con `openSound()`.

## Fase 0 · Contratos (arquitectos, sólo leen; escriben su contrato en `.claude/autonomo/contratos-2026-10-08/`)

- **K1 codigo-unico.md** — Código único SIEMPRE `<código guía>-<correlativo corto>` (12A-0001); si dos talonarios con el mismo correlativo chocan, `12A-019/0001`. Reemplaza la regla «sólo si se repite» de ADR-474. Mapear TODO lo que guarda `trozaCode` (libro TH trozado/despacho/consumo, `ForestGtf.items[].code/codigoGuia`, CTP, etiquetas/QR, kárdex), generador al importar, migración de lo existente (Blas 22, main) con ensayo en seco + respaldo JSON, invariantes T1/T3, borrador de ADR, plan de tests.
- **K2 cubicacion-cuenta.md** — Guardar cubicaciones del Cubicador de trozas en el servidor y ligarlas a la cuenta de un proveedor/cliente (¿`AdelantoBeneficiario`? ¿`ForestParty`? decidir midiendo), con volumen, medidas y PLATA: precio por PT (¿ADR-430?) → monto que descuenta del adelanto. Modelo + migración expand-only, rutas con Zod, RBAC, auditoría, invalidación, borrador de ADR. Es dinero: marcar qué necesita reviewer Opus + security.
- **K3 camaras-trozas-personas.md** — (a) Marcadores grandes (15-20 cm, pocos módulos tipo ArUco) leídos del video: librería (licencia MIT/BSD/Apache, peso), dónde corre (worker del detector), resolución; (b) dónde guardar «trozas a la vista» por día y cómo «Consumir» abre el consumo del CTP (ADR-441) con esas trozas; (c) personas únicas SIN biometría: personal por chaleco (ADR-456 §3), visitas agrupadas por apariencia en «Visitante A, B…» del día; almacenamiento, retención, Ley 29733. Borrador de ADR.
- **K4 varios.md** — (a) ¿el 24,7 % de Blas es real o mezcla PT/m³? (cómo se calcula `rendimientoPct`); fuentes para «rendimiento en plata» (PT Oxapampa pagado, costo troza+flete+aserrío); (b) fuentes de datos del resumen interno R1-R4; (c) dónde guardar «contactos de envío» sin schema + cómo crear enlace de 7 días (`DocumentShare`); (d) cómo saber el dominio público del tenant para los QR (hoy `window.location.origin` en loth-labels, loth-pasaporte-print, ctp-certificado, ctp-gtf-print, lote-certificado); (e) lista de las ~24 pantallas con botón «Indicadores» (`useKpisPlegables` / `BotonIndicadores`) y cuáles lo ponen en una fila propia.

## Fase 1

- **T · Trámites / Relación de guías** (`lib/forestal/tramites-*.ts`, `components/admin/forestal/Tramite*.tsx`, `ForestalTramites.tsx`, `GuiasAFormatoBarra.tsx`, `hooks/use-tramite-desde-url.ts`, tests `__tests__/tramites-*`):
  1. Bloque permiso elegible: selector de los permisos (`ForestContrato`, reusar `SelectorContrato` / el permiso activo del chip como propuesta); al elegir, titular/RUC/representante salen del permiso. Aviso si el permiso no tiene titular confirmado o RUC (enlace a completarlo).
  2. El permiso manda: una guía de otro permiso → aviso y queda fuera (patrón «Incluirla igual» de las anuladas). Comparar por código de permiso normalizado, nunca por nombre del titular (los nombres difieren: «CCNN … CHINCHIGUANI» vs «COMUNIDAD NATIVA … CHINCHIHUANI»).
  3. «Traer de los libros» trae sólo las guías del permiso elegido.
  4. Un oficio por permiso: llegando desde la vista GTF con guías de 2+ permisos, aviso con un botón por permiso que arma su oficio con sólo sus guías.
  5. Lista de trozas = sólo su N°: en la carta y en el anexo, una línea por guía con `listaTrozasNro` o, si falta, el N° de la GTF (marcado para revisar en pantalla, no en el papel). Casilla «con detalle de trozas» → hoja aparte con cada troza.
  6. Totales por especie (m³ y trozas) + total al pie del anexo.
  7. Formato minimalista en los 29 formatos (`tramites-print.ts`): negro y grises, una raya fina, sin fondos ni pastillas de color; anuladas dicen «ANULADA».
  8. Campos vacíos resaltados en los 29: en el formulario, borde ámbar (tokens) en el obligatorio vacío; en la vista del papel, fondo amarillo suave sólo en pantalla (`@media print` sin nada). Se apaga al llenarlo.
  Listo: captura de la Relación prellenada en main con oficio sin verde y «Lista de trozas: N°»; tests de las funciones puras.

- **D · Libro TH › Despacho de trozas** (`LothLibroOperaciones.tsx` sólo COLS + cableado de la vista, `loth-seccion-*.tsx`, `LothSeccionTabla.tsx`, `LothSeccionBarra.tsx`, `LothSeccionKpis.tsx` sólo cifras de despacho, `LothLineaDetalleModal.tsx`, nuevo `LothDespachoPorGuia.tsx`, helpers `lib/forestal/loth-*`, lectura en `app/api/admin/forestal/loth/**` + `lib/db/forest-loth*.db.ts`):
  1. Columnas D1, D2, Largo y m³ en despacho leídas del trozado de esa troza (mismo plan/permiso: un código puede repetirse en otro permiso). Si la lectura es del servidor, el `serializar()` es whitelist (rule forestal-serfor). «Cód. despacho» oculta por defecto.
  2. Dos formatos: «Suelto» (una fila por troza) y «Por guía» (una fila por GTF con fecha, especie, trozas, m³, destino y estado en CTP; se despliega el desglose con D1/D2/L/m³ y total). Abre en «Por guía» y recuerda el último.
  3. Detalle de un despacho: especie, medidas, m³, árbol de origen, datos de la guía (destino, placa, transportista, conductor) y si ya entró al CTP. Acciones: Ver guía, Ver trazabilidad del árbol, Imprimir etiqueta, Ingresar al CTP, Copiar datos.
  4. Indicadores de Despacho con el m³ despachado.
  Listo: en main las medidas del despacho = las del trozado; «Por guía» muestra 17 guías; captura.

- **O · Herramientas › Cubicador de trozas en Oxapampina** (`CubicadorTrozas.tsx` + nuevos `cubicador-trozas-*.tsx`, `lib/forestal/cubicacion-trozas*.ts`, `ResumenTrozas.tsx`; en `lib/forestal/cubicacion-oxapampa.ts` sólo AGREGAR exportaciones, sin cambiar lo que usa el CTP; no romper los archivos de voz que comparte `CubicadorMadera`):
  1. Selector «Smalian (m³) | Oxapampina (PT)», recordado. Oxapampina: Ø en pulgadas, largo en pies, PT = Ø × Ø × L ÷ 24,5 con el mismo redondeo que ADR-440; sin m³.
  2. Un Ø por defecto (medido al medio de la troza) + interruptor «2 diámetros» → promedio. El pago/flete del CTP SIGUE exigiendo dos puntas (no tocar).
  3. Voz: con 1 Ø pares «Ø largo», con 2 Ø tríos.
  4. Totales, KPIs, Resúmenes y Excel en PT en modo Oxapampina; la comparación con la GTF (que está en m³) se oculta o se explica con ⓘ.
  5. Un lote por fórmula (no reinterpretar cm como pulgadas).
  Listo: 20″ × 12′ = 195,92 PT; 18″ y 22″ → 20″ → 195,92 PT; tests; captura.


## Fase 0 (repetida con la 2) · contratos con agentes sin tope de turnos

Los 4 arquitectos de la primera tanda se quedaron sin turnos (tope 40) antes de escribir. Se repiten con agentes generales: **escribir un primer borrador del contrato antes del turno 20** y completarlo después. K4 queda reducido a: (a) el 24,7 % de Blas y las fuentes del «rendimiento en plata»; (d) el dominio público del tenant para los QR. Lo demás de K4 lo resuelve cada constructor.

## Fase 2

- **G · Libro TH › Guías (GTF)** (`LothGtfView.tsx` —964 líneas: extraer, no crecer—, `gtf-acciones-menu.tsx`, `LothImportarGuias*.tsx`, el importador de guías del Libro TH (ADR-461) y su lector de la ficha SERFOR, nuevos `GtfDocumentosModal.tsx` / `lib/forestal/gtf-resumen-interno*.ts`, un componente compartido para «Enviar por WhatsApp», `LothGtfSeleccionBarra.tsx`, `CtpGuiasEmitidasBarra.tsx`, `LothGuiaTraslado.tsx`):
  1. Dos códigos SIEMPRE en la lista de trozas: «Código en la guía» y «Código único», en Datos, en el formulario de la guía y en lo impreso.
  2. Resumen interno nuevo (hoja A4 minimalista, distinta de la guía): R1 por especie y por árbol (trozas, m³, Ø y largo mín/prom/máx); R2 cuadre: lo que declara la guía vs suma de sus trozas vs el libro, con la diferencia; R3 dónde está cada troza hoy (despachada / recibida en el CTP / aserrada, con fecha; la de Blas: 22 despachadas, 0 recibidas); R4 saldo del permiso antes y después de esta guía. Funciones puras + tests. El QR sigue al patrón actual (la fase 3 unifica el dominio).
  3. Acción «Documentos del permiso» en el menú de la guía: modal con las carpetas del plan (ADR-467, por `ForestGtf.planId`): ver, descargar, imprimir, elegir varios.
  4. «Enviar por WhatsApp» desde ese modal: escribes el número o eliges un contacto (teléfonos de cuentas de adelantos, directorio forestal, clientes/proveedores); se crean enlaces que vencen en 7 días (reusar el share del Drive) y se abre `wa.me` con el mensaje. Los números usados se guardan como contactos de envío SIN schema (KV por tenant u otro lugar que ya exista). Son documentos con DNI: enlaces con vencimiento, sólo roles que hoy ven esas carpetas, auditoría.
  5. Al importar una guía, tomar el «N° de Lista de Trozas» de la ficha → `gtfDatos.listaTrozasNro`; se ve en Datos.
  6. Pendientes de la fase 1: `LothGtfSeleccionBarra` y `CtpGuiasEmitidasBarra` pasan el permiso de cada guía elegida para avisar «van N permisos → N oficios» antes de salir del libro; `LothGuiaTraslado` usa `claseFalta()` (ámbar visible en oscuro).
  7. El botón «Indicadores» de esta vista va en la misma fila que los demás botones (usa la API actual de `useKpisPlegables`; el agente I no la rompe).
  Listo: en main la lista de trozas muestra las dos columnas; el resumen interno trae R1-R4 con cifras que cuadran con SQL; el modal lista las carpetas del plan; captura.

- **I · «Indicadores» en una fila + permiso bien visible** (`kpis-plegables.tsx` sin romper `boton`/`panel`, las pantallas que lo usan —CtpAnalisis, CtpCompliancePanel, CtpConsumosSeccion2Kpis, CtpFletesView, CtpGtfIngresadasKpis, CtpGuiasEmitidasView, CtpHistoriaLoteView, CtpIngresosKpis, CtpPlantaIndicadores, CtpRadarResumen, CtpTableroControl, CtpTrozasPatio, LothCensoKpis, LothSeccionKpis + LothSeccionBarra, LothTableroEstados, camaras/HoyEnElPatio, ctp-lotes-indicadores, loth-extraccion-kpis, loth-rentabilidad-arboles, loth-rentabilidad-kpis, productos-disponibles-kpis, trozas-disponibles-kpis— sólo sus líneas de cabecera/botones; `LothPermisoChip.tsx`, `ContratoActivoChip.tsx`, el chrome compartido de los libros (`libro-chrome*`), `CtpGuiaDatosTab.tsx`, `CtpUbigeoSelects.tsx`. NO tocar `LothGtfView.tsx` (es de G) ni `LothLibroOperaciones.tsx` (es de A)):
  1. El botón «Indicadores» va en la misma fila que los otros botones de cada pantalla; nunca en una fila propia. Medir ANTES y DESPUÉS cuántos px sube la tabla en cada pantalla (script o `medir-orden-admin.mjs`) y reportar la tabla.
  2. Permiso elegido bien visible en el filtro de permisos del Libro TH y en sus hermanos (chip del permiso de trabajo del CTP y Herramientas): fondo lleno de acento con el permiso; con «Todos» queda discreto (hoy el punteado de 2 px se ve más fuerte que el filtro). Una franja «Viendo solo <permiso> · Ver todos» en el libro (en el chrome compartido) y un aviso breve al cambiar.
  3. `claseFalta()` en `CtpGuiaDatosTab` y `CtpUbigeoSelects` (ámbar visible en oscuro).
  Listo: tabla antes/después de las ~23 pantallas; capturas del chip con permiso (claro y oscuro).

- **A · Aprovechamiento + medidas del despacho en impreso/Excel** (la función que calcula el aprovechamiento y su archivo, `LothAprovechamiento*.tsx`, `LothLibroOperaciones.tsx` sólo su cableado, `app/api/admin/forestal/loth/export/**`, `lib/forestal/loth-print*.ts`):
  1. Cadena con proporción: Autorizado → Talado → Trozado → Despachado → Recibido en CTP, cada paso con su % del anterior y del autorizado, + tramo «entró con guía» para trozas que llegaron importadas sin tala (Blas: 0 talas vivas, 22 trozas 20,303 m³ → la cadena NO puede empezar en 0).
  2. Patio con antigüedad: m³ en patio + días de la troza más vieja; aviso pasado un tope (por defecto 30 días, ⓘ).
  3. Ritmo y fecha de término: m³ por semana y en qué fecha se termina lo autorizado vs la vigencia del permiso.
  4. Pendiente de la fase 1: el impreso y el Excel del libro traen las medidas del despacho (`loth/export` con `conTrozado`; `loth-print` lee `trozado`).
  Listo: cifras cruzadas con SQL en main y en Blas (sólo lectura); tests; captura de la banda.

- **H · Mejoras del arnés** (al final de la fase, cuando nadie usa el script): `scripts/qa-capturas.mjs` (1) cuando el login da 500, imprime el mensaje del servidor; (2) escribe siempre su reporte JSON a `<salida>/reporte.json` y acepta `--resumen` (sólo lo esencial por stdout); (3) paso `{"reglas": ["<sel>", "<propiedad>"]}` que lista las reglas CSS que tocan ese elemento y cuál gana.

## Fase 3

Resultado de la fase 2 (11:10): I `a0c8c2e35`, A `86c6ea690`, H `e66445239`. **G se cortó al final de su verificación sin reportar ni commitear** (todo su trabajo está en el árbol: 12 modificados + 16 nuevos; typecheck verde). Contratos K1-K4 escritos en `contratos-2026-10-08/`.

Lo que aprendió la fase 2 (aplicar): `qa-capturas` ya tiene `--resumen` y escribe `<salida>/reporte.json` (paso `{"reglas":[sel,prop]}` para saber qué regla CSS gana) · con la máquina cargada el login tarda ~36 s: si `qa-capturas` corta a los 30 s, reintentar una vez antes de diagnosticar · `pkill -f <nombre>` mata tu propio shell: filtrar por pid · Excel autenticado: `FLAGS=$(node scripts/dev-helpers/admin-auth.mjs --flags)` + `eval curl … $FLAGS` · el dev server se cuelga con swap: correr capturas con `flock /tmp/bsm-pesado.lock` y no más de 1 recorrido largo a la vez.

- **G′ · Cerrar Guías GTF** (los mismos archivos de G; nada más): repasar los 7 puntos de G contra el código, terminar lo que falte, correr `__tests__/forestal-gtf-*.test.ts`, `forestal-contactos-envio.test.ts` y `loth-gtf-acciones-bajas-ui.test.tsx`, 1 captura en main (dos columnas + resumen interno + modal de documentos). `LothGtfView.tsx` quedó en 472 líneas: bajarla de 300 si es extraer (no reescribir). Después: reviewer Opus + security Opus (ruta `contactos-envio`, enlaces del Drive con DNI, roles por carpeta, teléfonos = dato personal Ley 29733, auditoría).

- **Q · QR que no falla** (QR1-QR5 del doc + contrato K4 (d)). Archivos: `lib/forestal/loth-qr-troza.ts`, `loth-labels.ts`, `loth-troza-etiquetas.ts`, `loth-pasaporte-print.ts`, `loth-tablero-trozas.ts`, `ctp-gtf-print.ts`, `lote-certificado.ts`, `ctp-certificado.ts`, `eudr-expediente.ts`, `leer-escaneo-troza.ts`, `EscanerTrozas.tsx` + `escaner-trozas-partes.tsx`, `LothEscanerTroza*.tsx`, `app/verificar/**` (4 páginas), `lib/resolve-tenant.ts` (sólo el helper nuevo `tenantIdPublico`), ruta nueva `app/api/admin/tenant/url-publica`, hook `useBaseVerificacion`, el despacho del Libro TH (`lib/db/forest-loth-despacho.db.ts`, la vista Despacho). NO tocar `proxy.ts` ni `lib/middleware/**` (zona de peligro) ni los archivos de G′/R/C1.
  1. QR1: el QR lleva un identificador que no se repite entre permisos (id de la línea o permiso + código; elegir el que no rompa con «/» en la URL — ver P4 de K1) y `/verificar/...` lo resuelve; los QR viejos con sólo el código siguen abriendo.
  2. QR2: decisión (d) de K4 completa: `tenantIdPublico` en las 4 páginas públicas, `GET /api/admin/tenant/url-publica` (dominio propio > subdominio > `/t/<slug>`), `useBaseVerificacion()`, imprimir espera a la base (sin caer a `window.location.origin`). Los 4+ lugares que hoy arman el enlace con el origin del navegador pasan al hook.
  3. QR3: hoja de despacho por guía del Libro TH: trozas con D1/D2/Largo/m³ (del trozado, como la vista «Por guía») + 1 QR que abre la lista pública de esa guía (página pública nueva o extensión de `/verificar/despacho/[id]` — sin datos personales: ni DNI ni teléfonos).
  4. QR4: despachar escaneando: en Despacho de trozas, un modo «Escanear lo que sube al camión» (reusa `EscanerTrozas`) que va armando la lista y abre la guía/despacho con esas trozas puestas; avisa repetidas y las de otro permiso.
  5. QR5: etiquetas unificadas en blanco y negro (térmica): código grande, especie, m³ y QR legible sin internet (el QR lleva también el código en texto plano dentro del payload para la pistola). Medir el tamaño de módulo (px/módulo) de la etiqueta chica y subir el QR o bajar ECC si queda <2 px.
  6. Pendiente de A: `ForestLothDespachoDB.m3Despachado` llama a `trozadosDeCodigos` con tope 2000 sin tandas → mover las tandas DENTRO de `trozadosDeCodigos` (y quitar las de la ruta de export si sobran), con test.
  Listo: curl de `/verificar/...` con un QR de main y con uno de un tenant ≠ main (sólo lectura) → 200 con la troza correcta; captura de una etiqueta y de la hoja de despacho; tests. Después: security Opus (páginas públicas, resolución de tenant, datos que salen sin login) + reviewer sonnet.

- **C1 · Cámaras: sonido + «Ver movimiento»** (`components/admin/forestal/camaras/**` sólo lo necesario: `use-visor-nube.ts`, `reproductor-nube.ts`, `CajasEnVivo.tsx`, el mosaico y la vista individual, sus hooks/ajustes):
  1. s1 Sonido: seguir la cadena en el código (reproductor creado con `audio:false` en `use-visor-nube.ts`; `sonar()` en `reproductor-nube.ts` con openSound/closeSound; qué códec de audio manda la cámara y si el SDK/navegador lo reproduce). Arreglar lo que sea código; lo que dependa de la cámara (micrófono, «Video y audio», códec G.711/AAC) queda como pasos claros dentro de la app (un ⓘ junto al parlante cuando no llega audio) y como lista para Brandon. Las cámaras reales están sólo en Blas: NO escribir en Blas; probar en main lo que se pueda (que el botón cambie de estado, que el reproductor se cree con audio).
  2. s2: interruptor propio «Ver movimiento» (los recuadros celestes punteados de `CajasEnVivo.tsx`), recordado en este navegador, separado de «Detectar personas»; y el detector de personas también en la vista de una cámara sola.
  Listo: captura del mosaico en main con los dos interruptores; test del hook si hay lógica; lista de pasos para la prueba con el usuario de Blas. Después: reviewer sonnet.

- **R · Rendimiento** (e1-e6 del doc + K4 (a) + agregados de la fase 1). Archivos: `CalculadoraRendimiento.tsx` (y lo que se extraiga de ella), `CtpRendimientoLotes.tsx`, `CtpRadarRendimiento.tsx` + `lib/forestal/ctp-radar-rendimiento.ts` (estado «parcial»), nuevo `lib/forestal/rendimiento-plata.ts` (PURO, del contrato), su ruta de lectura si hace falta, `ForestalHerramientas.tsx` (texto de las pestañas), `ImportarTrozasModal.tsx`, `CubicacionResumenes.tsx`, `CubicadorTrozas.tsx` + `hooks/use-dictado-trozas.ts`. NO tocar `loth-rentabilidad-*` (Libro TH).
  1. e1: tabla y gráfico por especie y por corrida, con tendencia; e6: cada corrida se abre en el Libro CTP (deep link existente) y el informe sale en Excel y PDF.
  2. e2: rangos propios por especie aprendidos del histórico (con pocas corridas, decirlo: «3 corridas: rango provisional»); aviso cuando una corrida sale bajo lo suyo; estado «parcial» de K4 (lote con `finProceso` futuro → «Rendimiento parcial · lote en proceso hasta …», fuera del radar «bajo»).
  3. e3 + e4: rendimiento comercial (PT aserrado ÷ PT Oxapampa pagado) y costo por PT aserrado, con `faltantes` («falta el costo de la madera», etc.), nunca S/ 0; lo estimado con «≈». Blas hoy no tiene con qué: tiene que verse qué falta.
  4. e5: simulador: del lote del cubicador (rolliza) sale el PT aserrado esperado con el rendimiento real de cada especie (o el rango provisional).
  5. Agregados de la fase 1: plantilla de importar en pulgadas/pies para Oxapampina (`ImportarTrozasModal.tsx`), texto de la pestaña «Cubicador de trozas» (dice «Smalian»: ahora Smalian u Oxapampina), Resúmenes › Rolliza visible aunque no haya lote de aserrada, y el dictado de `CubicadorTrozas.tsx` a `hooks/use-dictado-trozas.ts`.
  Listo: cifras de Blas y main cruzadas con SQL (sólo lectura): 5 corridas, ponderado 25,13 %, las 5 «parcial»; tests del módulo puro; captura. Después: reviewer Opus (números y plata derivada).

- **V · Varios** (al final, cuando G′ y Q estén en git): Rentabilidad › Árboles del Libro TH con «Indicadores» en la fila (subir el hook a `LothRentabilidadView.tsx`); `ContratoActivoChip` publica la franja del permiso en el CTP; ver el ámbar de «falta» en oscuro en `CtpGuiaDatosTab`/`CtpUbigeoSelects` y la franja a 400 px; el QR del resumen interno de la GTF usa la base de Q; `qa-capturas`: primer login con 120 s de espera y aviso de cuánto lleva esperando el candado.

## Fase 4

Decisiones abiertas de los contratos: se toma el **default recomendado** de cada contrato y se anota en el doc para que Brandon lo revise (él elige «todas las opciones»; ninguna de estas borra datos).

- **U · Código único `12A-0001` + migración** (contrato `codigo-unico.md` entero; §4 = archivos). Defaults: P1 sólo trozas que entran desde una guía importada · P3 otro permiso con la misma numeración sigue bloqueado · P4 no aplica (el QR de la fase 3 va por id) · P5 el correlativo crece (12A-90002) · P6 se sigue pidiendo la casilla «son otras trozas». Orden del §5: módulo + DB class + script → ensayo y `--aplicar`/`--revertir` en **main** con guías importadas con el importador viejo → cambiar el importador → tests. **Blas: sólo el ensayo** (READ ONLY): deja el plan y el respaldo en `.claude/autonomo/respaldos/` y la huella en tu reporte; el `--aplicar` en Blas lo corre el hilo principal después de leer el plan. ADR nuevo con `/adr` (reemplaza §2 de ADR-474). Después: reviewer Opus.

- **M · Cubicación → cuenta con plata** (contrato `cubicacion-cuenta.md`; DANGER: schema + plata). Defaults B1-B7 de la tabla §9 (EXCEDIDO en el último adelanto · el más antiguo primero con opción de elegir · se permite 1 Ø con aviso «medido con 1 Ø» (Brandon: «1 Ø medido al medio»; el CTP sigue con 2 puntas) · precio por especie tipeado con «último precio» · cliente sólo contra adelanto RECIBIDO · guardar almacenero/admin/dueño, aplicar/anular admin/dueño · m³ Smalian con precio por m³). En tres pasos en fila:
  - **M1 · datos** (`database`, Opus): schema + SQL idempotente del §5; ensayo `BEGIN … ROLLBACK` por :5432; respaldo de cifras antes/después en `reports/respaldo-k2-<fecha>.json`; aplicar 2 veces (la 2.ª no cambia nada); `npx prisma generate`; `npm run dev:clean`. Nunca `SET SESSION`, nunca parchear Prisma.
  - **M2 · servidor** (`backend`, Opus): `lib/forestal/cubicacion-cuenta.ts` (puro + Zod), `lib/db/forest-cubicacion-trozas.db.ts`, los 3 puntos de `adelantos.db.ts`, guard doble de `guia-plata.db.ts`, 4 rutas, auditoría, tests del §6. ADR nuevo con `/adr`.
  - **M3 · pantallas** (`frontend`, Opus): `cubicador-trozas-guardar.tsx`, `cubicador-trozas-valorizar.tsx`, `hooks/use-cubicaciones-trozas.ts`, montar en `CubicadorTrozas.tsx`, rótulo de la entrega en `DetalleAdelantoModal.tsx`. Verificar en main: guardar → valorizar → aplicar contra un adelanto de prueba → saldo baja lo justo → anular → vuelve.
  Después: reviewer Opus + security Opus (aplicar/anular, IDOR, roles, doble pago).

- **P · Personas sin biometría** (contrato `camaras-trozas-personas.md` (c); §4 «Fase 4 · P»). Defaults: chaleco por color (sin marcador en la espalda todavía: eso viene con C2) · agrupar sólo por ropa, nunca cabeza ni altura · retención sin cambiar (365; se propone 60 a Brandon) · conteo por día y por hora + carpeta del día con una portada por visitante. Calibrar el umbral con las fotos reales de Blas (sólo lectura). Después: reviewer sonnet + security Opus (Ley 29733: qué se calcula, dónde se guarda, que la cabeza nunca se procese).

## Fase 5

- **C2 · Marcadores + «Trozas a la vista» + «Consumir»** (contrato `camaras-trozas-personas.md` (a) y (b); §4 «Fase 5 · C2»). Defaults: hoja A4 por troza (formato `marcador-a4`) · «Consumir» abre el lote mixto de ADR-441. Guardar los scripts del bench del contrato en `scripts/probar-marcadores.cjs`. La prueba a 3/5/8 m la hace Brandon con su usuario de Blas: deja la hoja de prueba imprimible y los pasos. Después: reviewer sonnet.

## Fases 2-5 (resumen)

- 2: G (GTF: dos códigos, resumen interno R1-R4, documentos del permiso + WhatsApp por enlace, N° de lista al importar) · I (Indicadores en una fila en ~24 pantallas + permiso elegido bien visible) · A (Aprovechamiento: cadena con % + «entró con guía», patio con antigüedad, ritmo y fecha de término).
- 3: Q (QR único con dominio público, hoja de despacho con QR, despachar escaneando, etiquetas unificadas; security) · C1 (cámaras: sonido + «Ver movimiento» + detector en vista individual) · R (Rendimiento por especie y corrida, rangos propios, plata, simulador).
- 4: U (código único + migración, con K1) · M (cubicación → cuenta con plata, con K2) · P (personas: conteo + visitantes, con K3).
- 5: C2 (marcadores + trozas a la vista + Consumir, con K3).

## Estado

| Fase | Estado | Commits |
|---|---|---|
| 1 | hecha 09:45 | 851f260c7 (T) · 8fc302937 (D) · 1771ecb3a (O) |
| 0 (repetida) + 2 | hecha 11:10 (G cortado → G′ en la 3) | a0c8c2e35 (I) · 86c6ea690 (A) · e66445239 (H); contratos K1-K4 |
| 3 | terminó 13:20 (workflow wf_a4e36bdb-8a3). G′ SIN commit (pre-commit cayó por el InfoTip de TrozasALaVista, ya arreglado por C2) y sus reviewer+security no devolvieron nada → relanzados 13:30 como Agent sueltos, igual que reviewer R, security Q y security P | 1dc55fcad (R) · 6df99c62c (Q) · 5153fa784 (C1) · 7559b15e3 (V) |
| 4 + 5 | lanzadas 11:45 EN PARALELO con la 3 (Brandon: «más rápido y más agentes»): U · M1→(M2‖M3)→M4 · P · C2 — ADR-477 U, 478 M, 479 P, 480 C2. U: migración APLICADA en Blas 13:31 por el hilo principal (respaldo 18-07-07, huella 71ccd7a8…; verificado 44 líneas `-0001`, 22/22 ítems con codigoGuia, /t/<blas>/verificar/1-0001 → TORNILLO). P sin commit (mismo InfoTip) → arreglo de security (CPU 46 s) + commit relanzados 13:40; OJO 631b2f729 de M arrastró 18 archivos de P staged. M: workflow terminó 13:55, reviewer M no aprobó (10 hallazgos, USD/pactados, guía a mano, doble pago) → arreglados en el mismo commit; verificador de esos arreglos lanzado 13:57 | a5fb3e427 (C2) · ec83eded5 (U) · 631b2f729 (M) |
| cierre | 13:30-14:00 revisiones relanzadas: security G′ (2 medias), reviewer G′ (media: resumen de la anulada suma la reemitida), reviewer R (grave: costo por PT ignora sin atribuir), security Q (2 bajas → fe093f765), security P (media CPU). Arreglos G′, R y P corriendo como Agent sueltos con su commit. Preguntas para Brandon: B1 (adelanto DADO EXCEDIDO: tope 422 / abono / liquidación paga), 2 códigos en la hoja SERFOR, retención 365→60, ROOT_DOMAIN/subdominio, reimprimir etiquetas de Blas, costos de Blas (K4 2-3) | af94fff97 (harness) · fe093f765 (Q seg) |

## Tanda 2 (pedidos de Brandon 14:45, «aplica con múltiples agents team»)

Workflow `wf_e0895d2a-012` (task wpi6ijvhx) lanzado 14:50: **I** ingreso CTP desde guía del LO-TH (ADR-481, contrato K5) · **D** documentos de cada guía en LO-TH/CTP/formatos (ADR-482, K6; security) · **C** cubicación comercial con descuentos: contrato K7 → C-DB → (C-BE ‖ C-FE-O LO-TH Oxapampina ‖ C-FE-A Despacho CTP aserrada) → C-V → reviewer+security (ADR-483). Agente aparte mide 6 ideas en Blas. Doc vivo: nuevo bloque «Pedidos de la tarde» (párrafo Avance ahora `mdaqgyth71e.33620`, tabla `mdaqgyth71e.33830`, filas 1-5 col 3 = Estado), rev 125.

## Tanda 3 (16:25) — workflow wf_54e6e30a-d96 (task w3k7gz351)
Commits previos de la tanda 2: a9ce2ae6e (C) · c5eb816f4 (I) · 34e1ae011 (D + veto security cerrado) · b88467a03 (harness) · 055769f24 (fotos 60 días + hueco confirmado).
Carriles: AV avisos (sonnet) · PL cubicación→cuenta sin adelanto + valorVenta (ADR-484) · PR corrida con su compra + especies sin ingreso (ADR-485) · QR corto (ADR-486, security) · CA carta Relación de guías con título del permiso + expediente + código REL- (ADR-487) · TI títulos iguales (medir → construir tras los otros).
Los agentes NO commitean: el hilo principal commitea al final por carril con `-- paths` (archivos + mensajeCommit del resultado).
Doc vivo: Avance = párrafos `mdaqgyth71e.35775` y `.36017` (rev 132); tabla tanda 2 `mdaqgyth71e.33830` filas 1-4 Hecho.
