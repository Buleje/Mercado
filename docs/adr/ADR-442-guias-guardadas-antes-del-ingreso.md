# ADR-442 — Guías guardadas antes del ingreso, con sus papeles en la carpeta del titular

- **Fecha:** 2026-09-27
- **Estado:** aceptado (implementado)
- **Pedido por:** Brandon (27-09): «un apartado para guardar la guía con el N° de registro, el N° de GTF y todos sus datos, con los casilleros del modal de documentos; al hacer el ingreso de madera, que se pongan solos la factura, la guía de remisión, la guía, la lista de trozas y todo lo pre-guardado según el N° de registro; en Documentos, carpetas con el nombre del titular y su N° de permiso; si se elimina el ingreso, la guía y sus documentos se quedan».
- **Depende de:** ADR-438 (documentos de la guía: casilleros en el Drive por etiquetas) · ADR-312 (alta desde SERFOR) · ADR-421/425 (permiso = contrato del titular) · ADR-306/307 (Drive, carpetas en árbol, sync con Windows).

## Contexto (medido 2026-09-27)

- Los casilleros de ADR-438 exigían que la guía **ya estuviera en el libro** (404 si no había un `WoodEntry` vivo con esa GTF). Los papeles que llegan antes que el camión no tenían dónde ir, y al borrar el ingreso sus papeles quedaban en el Drive pero inalcanzables desde el libro.
- Blas: 12 guías, **12/12 con N° de registro SNIFFS**, 4 titulares, 4 permisos (uno de ellos con 8 guías). El N° de registro es el identificador que Brandon tiene a mano.
- Los papeles se guardaban en `Guías forestales (GTF)/<año>/<mes>`: lo de un mismo permiso quedaba repartido por meses.
- Los códigos de permiso llevan `/` (`19-SEC/REG-PLT-2021-017`), que es el separador de rutas de `createFolderTree`.

## Decisión

1. **Tabla nueva `ForestGuiaGuardada`** (migración `20260927_guias_guardadas_adr442`, EXPAND pura): N° de registro (normalizado), N° de GTF, fecha, titular (+ doc), permiso, contrato (ref suelta), ficha de SERFOR + cuándo se consultó, notas, baja lógica. Únicos **entre las vivas** por GTF y por N° de registro (índices parciales).
2. **Los papeles NO cuelgan de la fila**: siguen siendo documentos del Drive con las etiquetas de ADR-438 (`gtf:<N°>` + `casillero:<clave>`). El guard de los casilleros (`CtpGuiaDocumentosDB.datosDeGuia`) acepta la GTF de un ingreso **o** de una guía guardada. Consecuencia: al registrar el ingreso con esa GTF, los casilleros del ingreso muestran los papeles **sin copiar ni mover nada**; y borrar el ingreso no toca ni la guía ni sus papeles.
3. **«¿Ya entró al libro?» se deduce, no se guarda**: hay un `WoodEntry` vivo (no anulado) con la misma GTF o el mismo N° de registro. Un estado guardado quedaba «ingresada» después de borrar el ingreso.
4. **Enlace por N° de registro** (`GuiasGuardadasDB.alRegistrarIngreso`, en segundo plano desde `POST wood-entries` y `desde-serfor`): si el ingreso reconoce la guía por su N° de registro pero su GTF está escrita distinto, los papeles reciben también la etiqueta de la GTF del ingreso.
5. **La ficha de SERFOR la pide el servidor** (`consultarSerfor: true`). Con ficha, **el papel oficial manda** en GTF, titular, permiso y fecha (`fusionarConFicha`); lo tipeado sólo llena huecos y lo que se corrigió vuelve en `corregidos` para decírselo a la persona. Motivo: `desde-serfor` registra con esos mismos datos, y una GTF distinta dejaría los papeles fuera del ingreso.
6. **Respaldo sin SERFOR:** si SERFOR no responde al registrar, `desde-serfor` usa la ficha guardada con la guía (pedida por este servidor, nunca la del navegador) y lo avisa. «No encontrada» de SERFOR sigue frenando: la autoridad manda.
7. **Carpeta del titular:** `Guías forestales (GTF) / <titular> / <permiso> / GTF <N°>` (`carpetaGuiaPorTitular`), para los casilleros **y** para «Guardar en el expediente» (`metaArchivado`). Dos niveles porque un titular puede tener varios permisos. `/`, `\`, `: * ? " < > |` y marcas invisibles se limpian (`segmentoDeCarpeta`). La carpeta se crea al guardar la guía, antes de subir nada. Si se edita la GTF, el titular o el permiso, los papeles que seguían en la carpeta vieja se mudan y (GTF) se re-etiquetan y renombran.
8. **Rutas** `app/api/admin/forestal/guias/guardadas/**`: `GET ?estado=` (lista, por ingresar primero) · `GET ?buscar=` (por registro o GTF) · `POST` · `GET/PATCH/DELETE [id]`. Guard: `requireAdmin(admin, almacenero, owner)` → CSRF en escrituras → rate limit `DRIVE`/`DRIVE_READ` → `spec:forestal:ctp-libro`; `DELETE` sólo admin/dueño (`soloAdminODueno`). Auditoría `ctp_guia_guardada_{crear,editar,eliminar}`.
9. **Reglas de choque:** no se guarda una GTF/registro que ya tiene otra guía guardada viva (409 `ya_guardada` con su id) ni una que ya está en el libro (409 `ya_ingresada`). Con el ingreso ya registrado, la GTF y el registro de la guía no se cambian (le quitaría sus papeles).

## Ronda 2 (misma fecha; Brandon eligió las cuatro opciones del cierre)

10. **Vencimiento a la vista** (`lib/forestal/vencimiento-guia-guardada.ts`, chip `ctp-guia-vence-chip.tsx`): cada guía POR INGRESAR dice cuánto le queda según `fechaVencimiento` de su ficha de SERFOR («vence en 2 días», «vence hoy», «vencida hace 3 días»); sin ficha lo dice, no lo inventa. «Pronto» = `DIAS_VENCE_PRONTO` (2). La bandeja ordena por urgencia y avisa en el título. Medido en Blas: **11 de 12** guías llegaron después de vencer. Tonos alineados con la tabla de Ingresos (`CtpChipVencimiento`): «vencida» en ámbar como «vencida sin recibir» (el rojo es para la que YA entró vencida); «pronto» en azul.
11. **Guardar desde una foto**: `gtf-ocr` lee también `numeroRegistro` (vacío si no pasa `esNumeroRegistroValido`: nunca un número adivinado). En una guía nueva, «Leer de una foto» llena lo que falta, dispara la búsqueda en SERFOR y sube la misma foto al casillero GTF (si la foto dice otra GTF que la guardada, pide confirmar). **La lectura real no se midió en local** (sin clave de visión: `gtf-ocr` responde 503).
12. **Papeles viejos** (`CtpGuiaPapelesViejosDB`, `GET/POST …/guardadas/ordenar`, botón en el listado): los papeles de guías que quedaron en `año/mes` se mudan a titular › permiso › GTF y reciben las etiquetas de máquina que les falten. Sólo se quitan carpetas de año/mes vacías de verdad (sin subcarpetas ni documentos, tampoco en la papelera). Blas: 3 papeles pendientes.
13. **Permiso de otro negocio**: `WoodEntriesDB.create` y `createDesdeGtfSerfor` validaban el `contratoId` sólo por FK (global): un id de otro tenant se aceptaba. Ahora `contratoDelTenant` lo rechaza (422 `VALIDACION`). El MISMO hueco estaba en gastos (`finance.db`), adelantos, fletes y corridas del CTP (`forest-ctp.db`): ahí `contratoPropio` (`lib/db/contrato-propio.db.ts`) lo deja en `null` con aviso en el log (la pantalla sólo ofrece permisos propios; un id ajeno es un pedido armado a mano) y la corrida lo deduce del código del título. En `desde-serfor`, el permiso de una guía guardada que se dio de baja después se ignora y se deduce del código.
14. **Revisión de la ronda 2 (corregido):** el lector descarta como registro todo lo que tenga forma de GTF (también serie + número); un `null` del lector ya no tumba la lectura (tampoco la del alta de ingreso); la GTF leída une serie y número; sin GTF leída, la foto NO se sube sola (se pide confirmar: un dígito mal leído del registro traería otra guía).

## Consecuencias

- Lo que llega antes del camión se guarda y se ve en Documentos, ordenado por titular y permiso.
- El ingreso muestra los papeles solo; el formulario de ingreso reconoce la guía guardada y precarga sus datos (sin volver a consultar SERFOR para mostrarla).
- Los papeles subidos antes de esta decisión siguen en `año/mes`: no se mudan en bloque (se reconocen igual por sus etiquetas).
- La etiqueta sigue siendo editable desde el Drive (costo ya aceptado en ADR-438).

## Alternativas descartadas

- **Estado `ingresada` en la fila:** exigía sincronizar en cada alta, anulación, borrado y restauración de ingresos; deducirlo cuesta una consulta por lista.
- **Copiar los papeles al ingreso al registrar:** duplicaba archivos y dejaba dos versiones que se desincronizan al reemplazar una.
- **Carpeta única «titular · permiso»:** un titular con dos permisos quedaba en dos carpetas hermanas sin nada que las junte.
- **Guardar la guía en `localStorage`** (como la consulta SERFOR del alta): no sobrevive a otro navegador ni al celular del almacenero.

## Referencias

`prisma/schema.prisma` (`ForestGuiaGuardada`) · `lib/forestal/guias-guardadas.ts` (contrato + reglas puras, test `__tests__/forestal-guias-guardadas.test.ts`) · `lib/forestal/guias-guardadas-server.ts` · `lib/db/guias-guardadas.db.ts` · `lib/db/ctp-guia-documentos.db.ts` · `lib/forestal/documentos-guia.ts` (`carpetaGuiaPorTitular`) · `app/api/admin/forestal/guias/guardadas/**` · `app/api/admin/forestal/wood-entries/{route,desde-serfor/route}.ts` · ronda 2: `lib/forestal/vencimiento-guia-guardada.ts`, `components/admin/forestal/{ctp-guia-vence-chip,CtpGuiaDesdeFoto,CtpOrdenarPapelesViejos}.tsx`, `hooks/use-guia-desde-foto.ts`, `lib/db/ctp-guia-papeles-viejos.db.ts`, `app/api/admin/forestal/gtf-ocr/route.ts`.
