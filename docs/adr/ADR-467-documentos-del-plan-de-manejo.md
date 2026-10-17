# ADR-467 — Documentos del plan de manejo: carpetas del Drive + campos por carpeta + lo que falta

- **Estado:** aceptado e implementado (2026-10-04). Borrador del 29-09 con el número 456, que ya era de Cámaras: el código quedó en un stash (rama `respaldo/stash-plan-documentos-2026-09-30`) y se rescató a la rama con este número. Tests: `forest-plan-documentos-db` (12, base real `main`), `plan-documentos-*`, `use-plan-documentos`, `loth-plan-form-documentos-alta`, `campos-personalizados-archivo-y-prefijo`, `documents-carpeta-ajena`.
- **Pedido (Brandon, 29-09):** «en plan de manejo, cuando se crea o edita, una sección para poner el registro de plantación o resolución, documentos del jefe, títulos de propiedad y demás documentos completos para consultar sólo ahí, bien ordenada; poder crear mis carpetas, campos y rellenarlos con PDF, imágenes y demás formatos».
- **Relacionados:** ADR-119 (vencimientos del Drive) · ADR-306 (`createFolderTree`) · ADR-426 (plan editar/eliminar) · ADR-427 (campos personalizados) · ADR-438/442 (etiquetas de máquina `gtf:` y carpeta titular › permiso › GTF).

## Contexto (medido 29-09, SELECT de sólo lectura)

| Tenant | Planes vivos | Permisos | Docs Drive | con vence | Carpetas | carpetas con tags | Campos pers. |
|---|---|---|---|---|---|---|---|
| Blas `cmpxiv6p4000bohvzwl6bnfpv` | 2 (PLANTACION 19-SEC/REG-PLT-2025-096 · PO PO-2026-001) | 6 | 12 | 0 | 5 (raíces: «CCNN SANTA ROSA DE CHIVIS», «Guías forestales (GTF)») | 0 | 0 |
| main | 1 | 7 | 21 | 3 | 52 | 0 | 15 (todos `qa.demo.*`) |
| QA forestal `…-op-qa-ui` | 1 | 1 | 0 | 0 | 0 | 0 | 0 |

- En Blas **0 documentos** con nombre u OCR de resolución / plan / plantación / título / partida / DNI / poder: no hay nada suelto que migrar ni que cambie de significado.
- El plan **no guarda ningún archivo** hoy: sólo `resolucionNumber`/`resolucionDate`/`representanteLegal`/`propietario*` como texto (`prisma/schema.prisma` ForestPlan). La ficha del permiso (`ForestContrato`) tampoco.
- Ya existe todo lo pesado: Drive (`DocumentsDB`, subida, versiones, OCR, vista previa, papelera, `expiresAt` + filtro «Por vencer» + widget del home + cron `documentos-vencimiento` con ventana 7 días), `DocumentFolder.tags` con índice GIN (sin uso: 0 carpetas con tags en los 3 tenants), `DocumentFolder.allowedRoles`, y ADR-427 (`CampoPersonalizado` con `formulario` string, `tipo` string, `orden`, `activo`, `soloParaRegistroId` = temporal, únicos parciales, patrón `pendientes` para el alta).

## Decisión

**Cero migración.** La sección es una VISTA sobre tres cosas que ya existen:

1. **Carpetas = carpetas reales del Drive.** Raíz por plan `Libro TH/<titular>/<N° del plan>` (segmentos con `segmentoDeCarpeta`, ≤80). La raíz se ancla por **etiqueta de máquina** `plan:<planId>` en `DocumentFolder.tags` (GIN) y cada subcarpeta por `plan-carpeta:<clave>`; el camino sólo se usa para crearla y como respaldo si alguien borró la etiqueta (se re-etiqueta). Así el dueño puede renombrar o mover la carpeta del plan en el Drive (p. ej. dentro de su «CCNN …») sin que la sección cree otra.
2. **La plantilla por negocio = filas de ADR-427.**
   - Carpetas de la plantilla: `CampoPersonalizado` con `formulario = "forestal.plan.documentos"` y `tipo = "carpeta"`. Permanente (`soloParaRegistroId = null`) = aparece en todos los planes; temporal (`= planId`) = carpeta sólo de ese plan. `orden` ordena, `activo=false` la quita de la plantilla (nunca borra la carpeta del Drive).
   - Campos de una carpeta: `formulario = "forestal.plan.documentos.<clave>"`, `registroId = planId`. Texto/número/fecha/opción/sí-no/nota se guardan en `CampoPersonalizadoValor` como hoy.
   - Tipo nuevo **`archivo`** (sólo válido bajo el prefijo `forestal.plan.documentos.`): NO tiene fila de valor. Sus archivos son los documentos de esa carpeta con la etiqueta `campo:<campoId>`. Un puntero en `valor` mentiría cuando el doc se borra en el Drive; la etiqueta viaja con el doc y no puede mentir.
   - La plantilla sugerida vive en código SÓLO como semilla: se escribe una vez al preparar el primer plan del negocio; después es de él.
3. **Vencimiento = `Document.expiresAt`.** No se crea un campo «Vence»: la fecha va en el archivo, y así entra sola al filtro «Por vencer», al widget del home y al cron de aviso (ADR-119). Estado de un casillero `archivo`: `falta` (0 docs) · `vencido` (algún `expiresAt` < hoy Lima) · `vence_pronto` (≤ 30 días) · `cargado`.
4. **«Lo que falta» = todo campo `archivo` activo** de las carpetas activas del plan (permanentes + temporales de ese plan). Avisa, no traba (regla de ADR-427).
5. **Datos que el plan YA tiene no se duplican:** la carpeta de resolución muestra `resolucionNumber`/`resolucionDate` del plan (lectura, con enlace al bloque «Documento aprobado»); la del jefe muestra `representanteLegal`/`propietarioNombre`.

### Plantilla sugerida (semilla)

| Carpeta (clave) | Documentos esperados (`archivo`) | Otros campos |
|---|---|---|
| Registro de plantación / Resolución (`resolucion`) | Resolución o constancia de registro | — (N° y fecha salen del plan) |
| Jefe / representante (`jefe`) | DNI del jefe o representante · Acta de elección o asamblea · Vigencia de poder | Cargo (texto) |
| Títulos de propiedad (`titulos`) | Título de propiedad o constancia de posesión | N° de partida registral (texto) |
| Otros (`otros`) | — | — |

### Crear un plan (todavía sin id)

Mismo patrón que campos y permiso en `LothPlanForm`: todo lo del alta queda **pendiente en memoria** (archivos como `File`, carpetas nuevas, valores). Al guardar: crear plan → `preparar` → carpetas nuevas → subir cada archivo (subida del Drive + PATCH de etiqueta `campo:` y `expiresAt`) → `guardarValoresPendientes` por formulario. El modal NO se cierra mientras sube: muestra «Subiendo 3 de 5», y si algo falla dice «el plan se guardó, 2 archivos no» con Reintentar (los `File` siguen en memoria). Cerrar con pendientes pide confirmación. Sin carpetas «borrador» huérfanas en el Drive.

### Permisos

Las rutas nuevas espejan `app/api/admin/forestal/plan/route.ts`: lectura `["admin","almacenero","owner"]`, escritura `["admin","owner"]`. La raíz y **cada** subcarpeta llevan `allowedRoles = ["admin","owner","almacenero"]`: el Drive hereda la restricción sólo de la carpeta DIRECTA (`documents.db.ts:351`), así que ponerla en la raíz no alcanza. `MODULO_POR_FORMULARIO` y `EXISTE_REGISTRO` resuelven el prefijo `forestal.plan.documentos.*` como `forestal.plan` (hoy un formulario sin entrada queda ABIERTO a todo rol).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Tabla nueva `ForestPlanDocumento` con archivos propios | Duplica el Drive (subida, versiones, OCR, vista previa, papelera, vencimientos) y deja los papeles del plan fuera del buscador. |
| Columna `ForestPlan.carpetaDocumentosId` como ancla | Robusta, pero pide migración en zona de peligro por un dato que la etiqueta con respaldo por camino ya resuelve. Queda como plan B si las etiquetas de carpeta dan problemas. |
| Tabla nueva para la plantilla de carpetas | `CampoPersonalizado` ya tiene clave, nombre, descripción, orden, activo, baja, temporal/permanente y únicos parciales. |
| Valor del campo `archivo` = `documentId` en `valor` | Puntero colgado cuando el doc va a la papelera; no admite varios archivos (DNI frente y dorso). |
| Carpeta «borrador» en el Drive para el alta | Deja huérfanos si el alta se abandona; el repo ya resolvió el alta con pendientes. |
| `createFolderTree` como ancla (por nombre) | Renombrar en el Drive crearía otra carpeta; además corta a 80 y busca por nombre entero (trampa de ADR-442). |

## Consecuencias

- Las etiquetas `plan:`, `plan-carpeta:` y `campo:` son de máquina: el Drive debe esconderlas como chips (hoy muestra todas las etiquetas). Quitar `campo:` a mano desde el Drive saca el archivo de su casillero (queda en «Otros archivos de la carpeta»).
- Subcarpetas creadas a mano en el Drive dentro de la raíz aparecen como carpetas sin plantilla; se pueden «adoptar» (se les pone clave).
- El aviso de WhatsApp por vencimiento depende del cron `documentos-vencimiento`, que según memoria `avisos-plazos-canal-caido` no corre en producción: la sección y el filtro «Por vencer» sí funcionan.
- Riesgo que ya existía y conviene cerrar aparte: `POST /api/admin/documents` no verifica que `folderId` sea del tenant (`app/api/admin/documents/route.ts:122`).
