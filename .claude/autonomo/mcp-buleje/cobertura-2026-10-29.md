# MCP «buleje» — cobertura CRUD (architect, 29-10-2026)

> Diseño, sin código. Base: 70 herramientas en `tools/mcp-buleje/src/herramientas/*.mjs` (se cargan solas con `readdirSync` en `servidor.mjs:56-65`: un archivo nuevo NO se registra en ningún lado). Formato de DefHerramienta: `adelantos.mjs` / `ctp.mjs`.
> Regla de tipo: plata, stock/saldo de madera, cambio de estado, borrar/anular = `confirmar`; crear/editar sin plata = `escritura`. «sin verificar» = no lo leí; el carril lo confirma con `grep -n` antes de escribir.

## 1. Uso real (ActivityLog, últimos 30 días, 1 SELECT READ ONLY por negocio)

| Blas (`cmpxiv6p4000bohvzwl6bnfpv`) | n | main (`main`) | n |
|---|---|---|---|
| cámaras (video nube 245, PTZ 52, micrófono 20) | 317 | login_success | 5407 |
| `rrhh_asistencia_corregir` | 86 | `loth_linea_create` | 241 |
| `loth_linea_create` | 66 | `ctp_planta_zona_delete/set/asignar` | 89/35/20 |
| `ctp_ingreso_trozas_add` · `_validate` · `_create` | 31·16·15 | `loth_linea_annul` | 82 |
| `ctp_import` · `ctp_import_permiso` | 16·11 | Order UPDATE/CREATE/DELETE | 73/28/26 |
| `rrhh_colaborador_crear` · `_tarifa_guardar` · `_editar` · `puesto_crear` | 12·10·3·4 | `ctp_plantacion_update` | 58 |
| `ctp_linea_create` · `_marcar_usado` · `_produccion_declarada` · `ctp_consumos_set` | 10·8·5·4 | cubicación trozas guardar/borrar/aplicar/anular | 46/25/17/17 |
| `ctp_anexo04_emit` | 8 | cubicación (vieja) create/delete | 43/41 |
| `agenda_actividad_crear` · `_editar` | 7·5 | `compra` Cancelar | 33 |
| lote aserrío create/inventario/trozas_add/consumir | 4·5·4·4 | `loth_gtf_create` · `_importar` | 27·17 |
| `ctp_contrato_update` · `ctp_parte_upsert` · `gtf_talonario_forma_crear` · `ctp_plan_alta` | 4·3·3·3 | `ctp_plan_alta/baja` | 24/25 |
| `loth_linea_delete` · `loth_gtf_al_ctp` · `loth_plan_preliminar_crear` | 3·3·5 | adelanto Crear/Cancelar · Customer CREATE/UPDATE | 20/21 · 23/45 |

Lectura: en Blas el chat sirve sobre todo para **asistencia, LO-TH, ingresos/trozas, RRHH (alta y tarifa), CTP y Anexo 04**. `main` mezcla bodega (pedidos, clientes, compras, adelantos) con mucho QA forestal (LO-TH, plantas, cubicación). Cámaras = video/PTZ en vivo: **fuera de alcance del chat** (P2 a lo sumo «camara_estado», rutas sin verificar).

## 2. Qué ya existe vs. qué falta (por módulo)

| Módulo | Ya existe | Falta (P1 en **negrita**) |
|---|---|---|
| Ventas / caja / tesorería | ventas_listar/ver/resumen, venta_registrar/devolver, caja_ver/movimiento/cerrar_turno, cierre_diario, tesoreria_movimiento/transferir | — (completo para el chat) |
| Pedidos | pedidos_listar/ver, pedido_estado | — |
| Clientes / fiado | clientes_ver, cliente_ver/crear/editar, fiados_ver, fiado_cobrar | cliente_borrar |
| Inventario / productos | stock_ver (lee `/api/products`), stock_ajustar/_lote, stock_movimiento, conteo_iniciar | **producto_ver, producto_crear, producto_editar**, producto_borrar |
| Compras / proveedores | compras_listar, compra_registrar, proveedor_guardar | **compra_ver, compra_cancelar**, compra_recibir, compra_borrar, proveedor_borrar |
| Adelantos | adelantos_ver, adelanto_dar/anular/nota | — |
| RRHH | rrhh_ver, asistencia_marcar, pago_semana_pagar | **trabajador_ver, trabajador_crear, trabajador_editar, tarifa_guardar, puesto_crear**, trabajador_estado, trabajador_cesar, trabajador_reingresar, puesto_editar, asistencia_masiva, asistencia_nota, pago_semana_deshacer · arreglo **asistencia_marcar** |
| Tareas / notas / agenda | tareas_*, notas_*, agenda_hoy, actividad_ver | **agenda_actividades_ver, agenda_actividad_crear, agenda_actividad_editar**, agenda_actividad_borrar |
| Documentos | docs_buscar, doc_ver/subir/papelera | — |
| CTP | ctp_ver, ctp_registrar, ctp_anular | **ctp_marcar_usado, ctp_declarar_produccion**, ctp_corregir_linea, ctp_consumos_fijar |
| Ingresos / trozas | madera_ingresos_ver/_total, madera_ingreso_registrar | **ingreso_ver, ingreso_trozas_cargar, ingreso_validar, ingreso_editar, ingreso_anular, ingreso_costo**, ingreso_recepcionar, ingreso_rechazar, ingreso_borrar, ingreso_cuadrar |
| Lotes / producción | lotes_ver (**roto**, §5) | **lote_crear, lote_trozas_agregar, lote_consumir, lote_jornada_registrar**, lote_editar, lote_troza_quitar, lote_cerrar, lote_reabrir, lote_borrar |
| LO-TH | — (nada) | **loth_ver, loth_linea_anotar, loth_linea_anular, loth_linea_borrar**, loth_lineas_borrar |
| GTF / Anexo 04 | gtf_ver, anexos_ver, gtf_anular | **anexo04_emitir, gtf_crear** |
| Cubicaciones | cubicaciones_ver/guardar/borrar (tabla VIEJA `/cubicaciones`) | **cubicaciones_trozas_ver, cubicacion_trozas_guardar, cubicacion_trozas_aplicar, cubicacion_trozas_anular, cubicacion_trozas_borrar**, cubicacion_trozas_editar |
| Directorio / fletes / permisos / especies / trámites / plantaciones / planes | — | **directorio_ver, parte_guardar, permisos_ver, permiso_editar**, parte_borrar, fletes_ver, flete_anotar, flete_pago, flete_borrar, permiso_crear, especies_ver, especie_guardar, tramites_ver, tramite_guardar, tramite_borrar, plantaciones_ver, plantacion_guardar, planes_ver |

## 3. Herramientas nuevas por archivo (3 carriles con archivos disjuntos)

Convención de columnas: **P** · **tipo** (por qué) · **método ruta** (handler) · **cuerpo** (nombres EXACTOS del Zod) · **roles** · **filtros GET** · **previa** (GET que da el nombre real). El usuario «claude» es `admin`: todo lo de abajo lo alcanza salvo que diga ⚠.

---

### CARRIL A — forestal libros: `ctp.mjs` (existe) · `loth.mjs` · `lotes.mjs` · `ingresos.mjs` (nuevos)

#### A1. `loth.mjs` (nuevo, grupo `loth`, `soloEn: ["forestal"]`, spec `spec:forestal:loth-libro`)

| herramienta | P | tipo | método ruta | cuerpo | roles | filtros / previa |
|---|---|---|---|---|---|---|
| loth_ver | P1 | lectura | GET `/api/admin/forestal/loth` (`loth/route.ts:124`) | — | admin, almacenero, owner | `section` (`LOTH_SECTIONS`, `lib/forestal/loth-constants.ts:8`: tala, trozado, despacho_troza, consumo_troza, …resto sin verificar), `caratulaId`, `planId` (lo lee `permisoDelPedido`, `:185`), `search`, `includeAnnulled=1`, `limit`, `offset`; vistas: `stats=1`, `despachables=1`, `usoCenso=1`, `trozaCodes=1`, `available=<…>`, `trace=<código>`. Respuesta `{entries,total}` |
| loth_linea_anotar | P1 | confirmar (mueve el saldo del permiso y pasa el árbol del censo a talado) | POST `/api/admin/forestal/loth` (`route.ts:206`, `createSchema :36`) | `section` (oblig.), `caratulaId`, `planId`, `entryDate`, `treeCode`, `trozaCode`, `despachoCode`, `isRama`, `speciesCommon`, `speciesScientific`, `cites`, `diamMayorM`, `diamMenorM`, `lengthM`, `volumeM3`, `productType`, `quantity`, `unit` (m3\|kg\|unidad), `pieces`, `gtfNumber`, `discarded`, `consumoInterno`, `medicionCruda{forma cruzadas\|promedio, mayor[], menor[], totalM, descuentos[{tipo,metros}]}`, `marcadoFuste`, `marcadoTocon`, `observations`, `justificacionDmc` (T8), `motivoSobreCupo` (T9), `correctsLineNo`, `correctionNote`, `gpsLat`, `gpsLng`, `photoUrl`, `gpsOrigen` (telefono\|censo\|utm), `motosierrista`, `motosierristaId`, `horaTala` (HH:MM), resto del schema sin verificar | admin, almacenero, owner | previa: GET `loth?trace=<treeCode>` para mostrar el árbol del censo y si ya tiene tala. Clave de la ventana = `volumeM3` (m³). 66+241 usos: evaluar `confirmarSi` solo para tala/despacho |
| loth_linea_anular | P1 | confirmar (anular; devuelve el árbol «en pie») | PATCH `/api/admin/forestal/loth/[id]` (`[id]/route.ts:46`, `patchSchema :18`) | `action: "annul"`, `reason` (3-500) | ⚠ admin, owner | previa: **no hay GET por id**; usar GET `loth?search=<código>&includeAnnulled=1` y buscar el id (filasCompletas) |
| loth_linea_borrar | P1 | confirmar | DELETE `/api/admin/forestal/loth/[id]` (`[id]/route.ts:88`) | — | ⚠ admin, owner | misma previa |
| loth_lineas_borrar | P2 | confirmar | POST `/api/admin/forestal/loth/borrar-lineas` (`route.ts:40`, `bodySchema :26`) | `ids[]` (1..MAX_LINEAS_A_BORRAR), `incluirLoQueCuelga` | ⚠ admin, owner | la vista previa es POST `?vista=1` (no sirve como `previa`, que solo hace GET) |

#### A2. `ingresos.mjs` (nuevo, grupo `ingresos`, forestal, spec `ctp-libro`). Todas sobre PATCH `/api/admin/forestal/wood-entries/[id]` (`[id]/route.ts:203`, `patchSchema :98`, discriminado por `action`), ⚠ roles admin, owner. Previa común: GET `/api/admin/forestal/wood-entries/[id]` (`[id]/route.ts:177`, admin/almacenero/owner) → guía, proveedor, especie, volumen.

| herramienta | P | tipo | cuerpo |
|---|---|---|---|
| ingreso_ver | P1 | lectura | GET `[id]` (arriba) |
| ingreso_trozas_cargar | P1 | confirmar (piezas = stock) | `action:"trozas"`, `trozas[]` (1..`TOPE_TROZAS_POR_INGRESO`) de `{codificacion, especieComun, especieCientifica, dimensiones, largoM, diametroCm, d1Cm, d2Cm, cantidad, volumenM3}` (todos nullable). Clave = suma de `volumenM3` |
| ingreso_validar | P1 | confirmar (estado) | `action:"validate"` |
| ingreso_editar | P1 | escritura (solo pendientes) | `action:"update"`, `fields` (`updateFieldsSchema :35`): `entryDate`, `docType` (TIPOS_DOCUMENTO_LOCTP), `gtfNumber`, `gtfDate`, `gtfSeries`, `serforNumeroRegistro`, `providerName`, `providerDocument`, `providerDocumentType` (RUC\|DNI\|CE\|PASAPORTE), `originType` (concesion\|predio_privado\|comunidad_nativa\|reforestacion\|retroaserradero\|otro), resto sin verificar → `confirmarSi` si trae volumen o piezas |
| ingreso_anular | P1 | confirmar | `action:"annul"`, `reason` (3-500) |
| ingreso_costo | P1 | confirmar (plata; el handler lo restringe a admin/owner explícito, `:338`) | `action:"set_costo"`, `costoTotal` (0..99 999 999,99 o `null` = sin factura; nunca 0 por «no sé»), `moneda` (PEN\|USD) |
| ingreso_recepcionar | P2 | confirmar | `action:"recepcionar"`, `fecha` (AAAA-MM-DD), `aceptaVencida`, `motivoVencida` |
| ingreso_rechazar | P2 | confirmar | `action:"reject"`, `reason` |
| ingreso_borrar | P2 | confirmar | `action:"delete"` |
| ingreso_cuadrar | P2 | confirmar | `action:"cuadrar"`, `lado` (lista\|cabecera), `motivo` (≤500), `trozaId`, `cantidad`, `volumenM3` |

Filtros que ya acepta el GET de lista (`wood-entries/route.ts:323-400`) y que `madera_ingresos_ver` aún no pasa: `sort`, `dir`, `product[]`, `status[]`, `pago`, `trozas` → sumarlos (P2).

#### A3. `lotes.mjs` (nuevo, grupo `lotes`, forestal). Ruta única `/api/admin/forestal/lotes-aserrio` (`route.ts`), guard `:292` = admin, almacenero, owner + spec **`ctp-libro`**. Algunas acciones del PATCH tienen chequeo de rol propio (`:413-442`, sin verificar cuáles). Previa común: GET `?historia=<loteId>` (`:303`, 404 si no existe).

| herramienta | P | tipo | método · cuerpo |
|---|---|---|---|
| lotes_ver (MOVER aquí desde ctp.mjs, arreglada §5) | P1 | lectura | GET, query `status` (abierto\|consumido\|cerrado), `especie`, `limite` (1-500), `historia` |
| lote_crear | P1 | escritura (modo `abierto`); confirmar si `modo:"inventario"` (`confirmarSi`, mete m³) | POST `:323` `postSchema` por `modo`: `abierto{speciesCommon, speciesScientific, notes, ordenProduccion, tipoProductoConsumir, permiso}` · `inventario{speciesCommon, speciesScientific, volumenConsumidoM3, notes, paquetes[]}` |
| lote_trozas_agregar | P1 | confirmar (aparta piezas) | PATCH `:367` `accion:"agregar"` (`:149`), `loteId`, `trozaIds[]` (1-500) |
| lote_consumir | P1 | confirmar (T1: consumo por pieza) | `accion:"consumir"` (`:210`), `loteId`, `trozaIds[]?`, `fecha`, `observaciones` |
| lote_jornada_registrar | P1 | confirmar (consumo + producción en una tx) | `accion:"registrar-jornada"` (`:224`), `loteId`, `trozaIds[]` (1-500), `fecha`, `observaciones`, `exigirTodas`, `produccion{quantity, unit:"m3", pieces, productType, presentacion, codigoProducto, lineaProduccion, observations, paquetes[]}`. Clave = `produccion.quantity` m³ |
| lote_editar | P2 | escritura | `accion:"editar"` (`:164`), `loteId`, `speciesCommon`, `speciesScientific`, `ordenProduccion`, `tipoProductoConsumir`, `permiso`, `contratoId`, `notes` |
| lote_troza_quitar | P2 | confirmar | `accion:"quitar"` (`:154`), `loteId`, `trozaId` |
| lote_cerrar / lote_reabrir | P2 | confirmar | `accion:"cerrar"` (`:271`) / `"reabrir"` (`:281`), campos sin verificar |
| lote_borrar | P2 | confirmar | DELETE `:571`, ⚠ admin, owner, cuerpo sin verificar |

`sumar-corrida`, `quitar-corrida`, `vincular-corrida`, `sniffs`, `deshacer-forzado`: fuera del chat (flujos de pantalla con varios pasos).

#### A4. `ctp.mjs` (existe). PATCH `/api/admin/forestal/ctp` (`ctp/route.ts:991`), roles `RUTAS_PANEL["PATCH /api/admin/forestal/ctp"]` = ⚠ admin, owner (`lib/auth/roles-rutas-panel.ts:46`). Previa común: GET `?historial=<id>` o `?entryId=` (la que ya usa `ctp_anular`).

| herramienta | P | tipo | cuerpo |
|---|---|---|---|
| ctp_marcar_usado | P1 | confirmar (saldo) | `id`, `action:"marcar_usado"` (`:316`), resto sin verificar |
| ctp_declarar_produccion | P1 | confirmar | `id`, `action:"declarar_produccion"` (`:251`), resto sin verificar |
| ctp_corregir_linea | P2 | confirmar | `action:"corregir_linea"` (`:386`), sin verificar |
| ctp_consumos_fijar | P2 | confirmar (T1) | `/api/admin/forestal/ctp/consumos/route.ts` — método y cuerpo sin verificar |

Otras acciones del mismo PATCH, solo con pedido explícito: `set_venta` (plata), `cobrar_aserrio`/`_tanda` (plata), `emitir_gtf`, `completar_linea`, `apartar_producto`/`liberar_apartado`/`cambiar_apartado`, `asignar_permiso_masivo`, `declarar_apertura`.

---

### CARRIL B — forestal satélites: `gtf.mjs` · `cubicacion.mjs` (existen) · `directorio.mjs` (nuevo)

#### B1. `gtf.mjs`

| herramienta | P | tipo | método ruta | cuerpo | roles / previa |
|---|---|---|---|---|---|
| anexo04_emitir | P1 | confirmar (documento legal SERFOR) | POST `/api/admin/forestal/anexos` (`anexos/route.ts:132`, `saveSchema :61`; 201 nuevo / 200 si trae `id`) | `id?`, `numero`, `gtf`, `fecha` (AAAA-MM-DD), `empresa`, `firmante`, `documento`, `cargo`, `observaciones`, `unidadV` (pt\|m3, default pt), `modo` (oficial\|compacto), `especieGlobal`, `ctpEntryId`, `permiso`, `totalManualM3`, resto sin verificar (`:76-100`) | admin, almacenero, owner · previa GET `/api/admin/forestal/ctp?entryId=<ctpEntryId>` (volumen = clave, PT primero) |
| gtf_crear | P1 | confirmar | POST `/api/admin/forestal/gtf` (`gtf/route.ts:202`, `createSchema :37`) | `planId`, `gtfNumber` (oblig.), `gtfDate`, `tipo` (trozas\|producto), `titularName`, `tituloHabilitante`, `parcelaCorta`, `transportista` (oblig.), `transportistaDoc`, `conductor` (oblig.), `conductorLicencia`, `placaVehiculo`, resto sin verificar | roles del POST sin verificar (el archivo tiene admin/almacenero/owner y admin/owner) · previa GET `gtf?numero=` (sin verificar) |

#### B2. `cubicacion.mjs` (las 3 existentes van a la tabla VIEJA `/cubicaciones`; Blas y main usan la nueva `/cubicaciones-trozas`). Roles `ROLES_CUBICAR` = admin, almacenero, owner; `ROLES_PLATA` = admin, owner (`cubicaciones-trozas/_…:16-17`).

| herramienta | P | tipo | método ruta | cuerpo |
|---|---|---|---|---|
| cubicaciones_trozas_ver | P1 | lectura | GET `/api/admin/forestal/cubicaciones-trozas` y `/[id]` (`[id]/route.ts:22`) | filtros sin verificar |
| cubicacion_trozas_guardar | P1 | escritura; `confirmarSi` si trae precio (venta/compra) | POST `cubicaciones-trozas/route.ts` (`guardarCubicacionSchema`, `lib/forestal/cubicacion-cuenta.ts:120` o `guardarAserradaSchema` en `cubicacion-comercial-tipos`) | `fecha`, `formula` (smalian\|oxapampina), `diametros` (1\|2), `beneficiarioId` o `parteId` (uno obligatorio: `.refine(conPersona)`), `sentido` (compra\|venta), `gtfNumber`, `contratoId` (origen obligatorio: `.refine(conOrigen)`), `trozas[]` (`trozaEntradaComercialSchema`, ≥1), `notas`, `placa`, `chofer` |
| cubicacion_trozas_editar | P2 | escritura | PATCH `[id]/route.ts:36` (`editarCubicacionSchema :122`) | mismos campos parciales |
| cubicacion_trozas_aplicar | P1 | confirmar (escribe medidas en las trozas del libro) | `[id]/aplicar/route.ts` (método y cuerpo sin verificar) | — |
| cubicacion_trozas_anular | P1 | confirmar | `[id]/anular/route.ts` (sin verificar) | motivo sin verificar |
| cubicacion_trozas_borrar | P1 | confirmar | DELETE `[id]/route.ts:62` ⚠ `ROLES_PLATA` + `soloAdmin` | — |

#### B3. `directorio.mjs` (nuevo, grupo `directorio`, forestal). Specs: `ctp-libro` (directorio, fletes, contratos, especies), `tramites` (trámites, plantaciones), `loth-libro` (planes).

| herramienta | P | tipo | método ruta | cuerpo / filtros | roles |
|---|---|---|---|---|---|
| directorio_ver | P1 | lectura | GET `/api/admin/forestal/directorio` (`?id=`) + `/saldo`, `/trazabilidad` | `id` | admin, almacenero, owner |
| parte_guardar | P1 | escritura (`confirmarSi` si cambia documento/teléfono: regla de `filaIdentidad`) | POST `directorio/route.ts` (`postSchema` de `lib/forestal/directorio.ts`; `roles[]` de `ROLES_PARTE`, `:613`) | resto de campos sin verificar | admin, almacenero, owner |
| parte_borrar | P2 | confirmar | DELETE `directorio/route.ts` | — | ⚠ admin, owner (sin verificar por método) |
| permisos_ver | P1 | lectura | GET `/api/admin/forestal/contratos` (`balances`, `candidatos`, `todos`, `vincular`) y `/[id]` (`balance`, `desde`, `hasta`, `usos`, `volumen`) | — | admin, almacenero, owner |
| permiso_editar | P1 | escritura (`confirmarSi` en `estado` o `vigenciaHasta`: cambian lo que se puede extraer) | PATCH `/api/admin/forestal/contratos/[id]` | `codigo`, `alias`, `tipo` (TIPOS_CONTRATO), `estado` (ESTADOS_CONTRATO), `titularId`, `titularNombre`, `titularDoc`, `titularDocTipo`, `resolucionNumero`, `resolucionFecha`, `vigenciaDesde`, `vigenciaHasta`, `areaHa`, `region`, `provincia`, `distrito`, `arffs`, `planId`, `notas`; o `accion:"vincular"` | ⚠ admin, owner |
| permiso_crear | P2 | escritura | POST `/api/admin/forestal/contratos` | mismos campos | ⚠ admin, owner |
| fletes_ver | P2 | lectura | GET `/api/admin/forestal/fletes` (`?id=`) | — | admin, almacenero, owner |
| flete_anotar | P2 | escritura | POST `fletes/route.ts` (`postSchema`, `lib/forestal/fletes.ts`) | sin verificar | admin, almacenero, owner |
| flete_pago | P2 | confirmar (plata) | PATCH `fletes/route.ts` (`pagoSchema`: `id`, `estadoPago` ESTADOS_PAGO) | — | sin verificar |
| flete_borrar | P2 | confirmar | DELETE `fletes/route.ts` | — | ⚠ admin, owner |
| especies_ver | P2 | lectura | GET `/api/admin/forestal/especies` (`clave`, `libro`) | — | admin, almacenero, owner |
| especie_guardar | P2 | escritura (`unificar` = confirmar: exige `confirmar:true`) | POST/PATCH `especies/route.ts` (`accion`: grupos.guardar, restaurar, sembrar, unificar) | sin verificar | `ROLES_DE_PRECIOS` admin, owner, manager para precios |
| tramites_ver / tramite_guardar / tramite_borrar | P2 | l / e (`emitir:true` = confirmar) / c | GET·POST·DELETE `/api/admin/forestal/tramites` | `id?`, `asunto`, `formatoId`, `formatoNombre`, `expedienteAutoridad`, `notas`, `emitir` | lectura admin/almacenero/owner; escritura ⚠ admin, owner (sin verificar por método) |
| plantaciones_ver / plantacion_guardar | P2 | l / e | GET `/plantaciones` y `/[id]`; POST `plantaciones/route.ts` (`saveSchema`) | sin verificar | admin, almacenero, owner |
| planes_ver | P2 | lectura | GET `/api/admin/forestal/plan` (`active`, …) | — | admin, almacenero, owner |

Fuera de esta ronda: `plan` POST/PATCH/DELETE (alta/baja de PGMF/PMFI/PO/DEMA/PLANTACION), `plan/census` (el censo de Blas ya se borró una vez sin historial: memoria `blas-censo-borrado-06-10`), `ctp/planta` zonas (main 89+35+20, ruta sin verificar), importadores (`ctp_import`, `loth/importar-guia`): suben archivos, son de pantalla.

---

### CARRIL C — bodega y personas: `rrhh.mjs` · `tareas.mjs` · `inventario.mjs` · `compras.mjs` · `clientes.mjs` (todos existen)

#### C1. `rrhh.mjs`. Roles (`lib/rrhh/…:20-26`, archivo exacto: `grep -rn "export const RRHH_MARCAR" lib`): `RRHH_COMPLETO` = admin, owner · `RRHH_GESTION` = + manager · `RRHH_MARCAR` = + almacenero, cajero. Schemas en `lib/rrhh/schemas.ts`. Previa común: GET `/api/rrhh/colaboradores/[id]` (`[id]/route.ts:14`) → nombre + documento (`filaIdentidad`).

| herramienta | P | tipo | método ruta | cuerpo |
|---|---|---|---|---|
| **asistencia_marcar (ARREGLO)** | P1 | confirmar | PUT `/api/rrhh/asistencia` (`route.ts:62`, `guardarMarcasSchema :142`) | hoy manda `marcas[1]`; sumar `motivo` (`motivoCorreccionSchema :136`, lo pide «corregir», 86 usos) y `refrigerioMin` (0-240) de `marcaInputSchema` |
| trabajador_ver | P1 | lectura | GET `/api/rrhh/colaboradores/[id]` | — (RRHH_COMPLETO para ver sueldo) |
| trabajador_crear | P1 | escritura | POST `/api/rrhh/colaboradores` (`route.ts:53`, `colaboradorCrearSchema :50`, RRHH_GESTION) | `nombre` (2-120), `apodo`, `tipoDocumento` (TIPOS_DOCUMENTO), `documento`, `celular`, `direccion`, `contactoEmergenciaNombre`, `contactoEmergenciaCelular`, `puestoId`, `fechaIngreso`, `observaciones`, `fotoUrl` (https), `grupoSanguineo`, `alergias`, `eventual` (default false), `estado` (ACTIVO\|VACACIONES\|LICENCIA\|SUSPENDIDO), `beneficiarioId` y `tarifaInicial{modalidad HORA\|DIA\|SEMANA\|MES, monto, horasJornada}` (solo RRHH_COMPLETO) |
| trabajador_editar | P1 | escritura; `confirmarSi` si cambia `documento`/`celular` | PATCH `[id]/route.ts:34` (`colaboradorAccionSchema :72`) | `action:"editar"` + cualquier campo de arriba (parcial) |
| tarifa_guardar | P1 | confirmar (sueldo = plata de cada semana) | PUT `[id]/tarifas/route.ts:34` (`tarifaGuardarSchema :92`, RRHH_COMPLETO) | `modalidad` (MODALIDADES), `monto` (0..9 999 999), `horasJornada`, `vigenteDesde` (AAAA-MM-DD), `motivo` (≤300). Clave = `monto` |
| puesto_crear | P1 | escritura | POST `/api/rrhh/puestos` (`route.ts:31`, `puestoSchema :101`, RRHH_GESTION) | `nombre` (2-80), `descripcion`, `tarifaSugerida{modalidad, monto}`, `horasJornada`, `horaEntrada`, `toleranciaMin` (0-240), `orden` |
| puesto_editar | P2 | escritura | PATCH `/api/rrhh/puestos/[id]` (línea sin verificar) | `puestoSchema` parcial (sin verificar) |
| trabajador_estado | P2 | confirmar (estado) | PATCH `[id]` | `action:"cambiar_estado"`, `estado`, `sinPagoDesde` |
| trabajador_cesar | P2 | confirmar | PATCH `[id]` | `action:"cesar"`, `fechaCese`, `motivo` (3-300), `confirmar` |
| trabajador_reingresar | P2 | confirmar | PATCH `[id]` | `action:"reingresar"`, `fecha`, `tarifa` |
| asistencia_masiva | P2 | confirmar | POST `/api/rrhh/asistencia/masivo` (`masivoSchema :148`, RRHH_MARCAR) | `fecha`, `estado` (default PRESENTE), `entrada`, `salida`, `colaboradorIds[]` (vacío = todos), `sobrescribir` (default false), `nota` |
| asistencia_nota | P2 | escritura | PUT/DELETE `/api/rrhh/asistencia/nota` (`notaAsistenciaSchema`) | `colaboradorId`, `fecha`, `nota` (1-300) |
| pago_semana_deshacer | P2 | confirmar (plata) | DELETE `/api/rrhh/pago-semana` (`route.ts:105`, `DeshacerSchema :34`, RRHH_COMPLETO) | `colaboradorId`, `desde` |

`rrhh_ver` ya filtra colaboradores por `q`, `estado`, `incluirCesados`; falta `puestoId` y `campos` (`colaboradores/route.ts`).

#### C2. `tareas.mjs` — agenda (roles `lib/admin/agenda-acceso.ts`: leer `ROLES_LEER_AGENDA :17`; escribir `ROLES_ESCRIBIR_AGENDA :27` = admin, owner, tienda_owner, manager)

| herramienta | P | tipo | método ruta | cuerpo |
|---|---|---|---|---|
| agenda_actividades_ver | P1 | lectura | GET `/api/admin/agenda/actividades` (`route.ts:25`) | filtros sin verificar |
| agenda_actividad_crear | P1 | escritura | POST `actividades/route.ts:42` (`ActividadCrearSchema`, `lib/agenda/schemas.ts`, base `CAMPOS_ACTIVIDAD :191`) | `nombre`, `regla` (REGLAS_AGENDA, default manual), `objetivo`, `recurrencia`, `hora` (HH:MM\|null), `canales[]` (CANALES_AGENDA, default ["campana"]), `responsableRol` (ROLES_RESPONSABLE_AGENDA), `parametros` (según `regla`: `PARAMETROS_POR_REGLA`), `color` (COLORES_AGENDA, default info), `nota`, `activo` |
| agenda_actividad_editar | P1 | escritura | PATCH `actividades/[id]/route.ts:29` (`ActividadEditarSchema`) | parcial |
| agenda_actividad_borrar | P2 | confirmar | DELETE `actividades/[id]/route.ts` | — |

Previa: no hay GET por id → GET de la lista y buscar el id (`filasCompletas`). Ojo: `lista-blanca.mjs:5` (de `leer_get`) solo deja `agenda/hoy|calendario`; si la previa pasa por esa lista, sumar `agenda/actividades` (sin verificar si aplica a `previa`).

#### C3. `inventario.mjs`

| herramienta | P | tipo | método ruta | cuerpo | roles / previa |
|---|---|---|---|---|---|
| producto_ver | P1 | lectura | GET `/api/products/[id]` (`[id]/route.ts:81`) | — | admin, almacenero |
| producto_crear | P1 | escritura; `confirmarSi` si `stock > 0` | POST `/api/products` → delega en `/api/v1/products` POST (`v1/products/route.ts:142`, `ProductPostSchema :33`; responde con cabecera de «deprecated») | `name` (oblig.), `category` (oblig.), `price` (>0, oblig.), `image`, `unit`, `badge`, `description`, `stock`, `stockMin`, `stockMax`, `costPrice`, `barcode`, `type` (product\|service), `isPrepared`, `brand`, `sku`, `taxType` (gravado\|exonerado\|inafecto), `weightKg`, `dimensions`, `durationLabel`, `pricingUnit` (fijo\|hora\|m3\|unidad\|dia), `notes`, `specs[{label,value}]` | admin, almacenero · previa GET `/api/products?q=<name>` (duplicados por nombre/código) |
| producto_editar | P1 | escritura; `confirmarSi` si cambia `price`, `costPrice`, `stock` o `active` | PATCH `/api/products/[id]` (`[id]/route.ts:95`, `ProductUpdateSchema :15`) | `name`, `category`, `price`, `costPrice`, `image`, `unit`, `badge`, `barcode`, `stock`, `stockMin`, `stockMax`, `active`, `expiryDate`, `description`, `adjustReason`, `confirmarBajoPiso`, `durationLabel`, resto sin verificar | admin, almacenero · previa GET `[id]` |
| producto_borrar | P2 | confirmar | DELETE `[id]/route.ts:228` (`ProductsDB.delete`; borrado duro o lógico sin verificar) | — | admin, almacenero |

Lista de productos: `stock_ver` ya pega a `/api/products`; filtros del GET v1: `q`, `category`, `active`, `page`, `limit` (verificar que `stock_ver` pase `page`).

#### C4. `compras.mjs`

| herramienta | P | tipo | método ruta | cuerpo | roles |
|---|---|---|---|---|---|
| compra_ver | P1 | lectura | GET `/api/purchases/[id]` | — | admin, almacenero |
| compra_cancelar | P1 | confirmar (estado + deuda en Por pagar) | PATCH `/api/purchases/[id]` (`PatchSchema`, safeParse `:145`) | `status:"cancelado"`, `cancelReason` (obligatorio al cancelar, ≥3, ≤300) | admin, almacenero; con deuda, solo los roles de plata (`:21`, sin verificar cuáles) |
| compra_recibir | P2 | confirmar (stock) | mismo PATCH | `status` (pendiente\|parcial\|recibido), resto sin verificar | admin, almacenero |
| compra_borrar | P2 | confirmar | DELETE `/api/purchases/[id]` | — | ⚠ admin |
| proveedor_borrar | P2 | confirmar | DELETE `/api/suppliers/[id]` | — | ⚠ admin |

Filtros del GET `/api/purchases`: `numero`, `seguimiento` (los demás sin verificar). Previa: GET `/api/purchases/[id]` (proveedor, total = clave en S/).

#### C5. `clientes.mjs`

| herramienta | P | tipo | método ruta | roles |
|---|---|---|---|---|
| cliente_borrar | P2 | confirmar (Ley 29733, deja audit) | DELETE `/api/customers/[phone]` (`route.ts:274`) | ⚠ admin · previa GET `[phone]` + `filaIdentidad` |

## 4. GET con efectos
Heurística sobre los GET de agenda/hoy, rrhh/asistencia, rrhh/pago-semana, directorio, especies, loth, contratos, agenda/actividades, plantaciones, fletes: **0 escrituras** (`create|upsert|update|sembrar|registrar|guardar|marcar` dentro del GET). La única «vista previa» de borrado medida es POST (`loth/borrar-lineas?vista=1`): no puede ir en `previa`.

## 5. `lotes_ver` → 403 en qa-forestal (y también en Blas)
- vista por defecto `lotes` llama a `/api/admin/forestal/lotes`, que exige `spec:forestal:lotes` (`lotes/route.ts:62-67`). El rol no es el problema (`requireAdmin` admin/almacenero/owner, `:70`, incluye admin).
- Medido 29-10 en `TenantFeatureFlag`: QA y Blas tienen SOLO `ctp-libro`, `herramientas`, `loth-libro`, `tramites`. `spec:forestal:lotes` está apagado en los dos → **403 `specialization_disabled` siempre**.
- Los lotes que usa Blas son los de aserrío (`ForestLoteAserrio`, ADR-441) en `/lotes-aserrio`, que pide `ctp-libro` (encendido).
- Además la vista `aserrio` manda `id`, que el `Query` (`lotes-aserrio/route.ts:27`) no conoce: Zod lo descarta y vuelve la lista entera. El parámetro correcto es `historia`. Y no pasa `estado`/`especie`/`limite`.
- Arreglo (carril A): default `vista:"aserrio"`; `estado` → `status` como enum abierto|consumido|cerrado; `especie`; `limite`; `id` → `historia`; la vista `lotes` sale o avisa «módulo Lotes apagado en este negocio».

## 6. Riesgos
- Lo forestal escribe por endpoints que ya hacen cumplir I1-I6/T1 dentro de la tx: el MCP no tiene que recalcular nada, pero **nunca** debe mandar en lote lo que la pantalla manda de a uno sin que el endpoint lo acepte.
- `app/api/purchases/[id]/route.ts:96` usa `prisma.$transaction` directo en la ruta (regla 1): lo anoto para el hilo principal; no frena la herramienta.
- `tipos.mjs:54` lista los grupos en un JSDoc: los grupos nuevos (`loth`, `ingresos`, `lotes`, `directorio`) se suman ahí **una vez, en el cierre** (archivo compartido: ningún carril lo toca).
- Herramientas `confirmar` muy usadas (LO-TH 66/mes, asistencia 86/mes): una ventana por línea cansa. Propuesta para después: un `*_lote` con UNA ventana y la suma de m³ como clave.

## 7. Reparto

| carril | grupo / archivo | nuevas (l/e/c) |
|---|---|---|
| A | `loth.mjs` (nuevo) | 5 (1/0/4) |
| A | `ingresos.mjs` (nuevo) | 10 (1/1/8) |
| A | `lotes.mjs` (nuevo; recibe `lotes_ver` arreglada desde `ctp.mjs`) | 9 (0/2/7) |
| A | `ctp.mjs` | 4 (0/0/4) |
| B | `gtf.mjs` | 2 (0/0/2) |
| B | `cubicacion.mjs` | 6 (1/2/3) |
| B | `directorio.mjs` (nuevo) | 18 (7/7/4) |
| C | `rrhh.mjs` (+ arreglo `asistencia_marcar`) | 12 (1/5/6) |
| C | `tareas.mjs` | 4 (1/2/1) |
| C | `inventario.mjs` | 4 (1/2/1) |
| C | `compras.mjs` | 5 (1/0/4) |
| C | `clientes.mjs` | 1 (0/0/1) |
| **Total** | 12 archivos (4 nuevos) | **80 (14 l / 21 e / 45 c)**; P1 = 40 |

Con eso el catálogo pasa de 70 a 150 herramientas. Los carriles no comparten archivos; `tipos.mjs` (JSDoc de grupos) se toca al final.
