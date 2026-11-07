# ADR-310: Papelera del drive — acciones en lote y retención de 30 días

- **Estado:** Aceptado (2026-07-30)
- **Relacionado:** ADR-306 (importador de carpetas), ADR-307 (sync carpeta Windows ↔ drive), ADR-119 (vencimientos de documentos)
- **Zona tocada:** `lib/db/documents.db.ts`, `app/api/admin/documents/{bulk,trash}/route.ts`, `app/api/cron/documentos-papelera/`, `hooks/use-documents.ts`, `components/admin/documentos/PapeleraView.tsx`

---

## Contexto

Tres cosas rotas en la misma superficie, encontradas al intentar borrar 265 archivos:

1. **El tope del endpoint era el techo de lo que se podía seleccionar.** Las acciones en lote
   (`delete`/`move`/`tag`/`favorite`/`status`) mandaban la selección entera en una request contra
   un Zod `max(200)`: elegir "todos" en una carpeta grande devolvía `400 invalid_body`
   (`Too big: expected array to have <=200 items`) y **no borraba nada**. Peor: el error llegaba
   como JSON crudo a la pantalla, y en dev como overlay rojo de Next (promesa sin manejar).
2. **La papelera no era una papelera.** Restaurar o eliminar era de a un botón por archivo: un
   borrado masivo hecho por error no se podía deshacer en la práctica, y no existía "vaciar".
3. **La papelera crecía para siempre.** El borrado es blando; lo borrado seguía ocupando el bucket
   y contando para la cuota del tenant hasta que alguien entrara a purgarlo archivo por archivo
   — o sea, nunca.

Además, dos costos ocultos: la auditoría en lote hacía un `INSERT` por id y cada fila guardaba la
lista **completa** de ids en su `metadata` (500 filas × 500 ids), y `favorite`/`status` iteraban
`findFirst + update` por documento.

## Decisión

1. **Un solo número para el tamaño del lote.** `lib/documents/bulk-limits.ts` exporta
   `IDS_POR_LOTE = 500`, que importan el cliente (parte la selección con `enLotes` y suma
   `affected`) y los dos endpoints de lote (documentos y carpetas). Cliente y servidor no se
   pueden desfasar; el tope deja de ser un límite de uso.
2. **Endpoint propio para la papelera** — `POST /api/admin/documents/trash`:
   `restore` (cualquier admin) y `purge` (**sólo admin/owner**: es la única acción del drive sin
   vuelta atrás). Con `todos: true`, `purge` se lleva la papelera completa del tenant de a
   `IDS_POR_LOTE` por llamada y devuelve `restantes`, y el cliente repite hasta cero.
3. **Retención de 30 días** — `lib/documents/papelera-retencion.ts` (puro) define
   `DIAS_RETENCION_PAPELERA` y el texto que muestra cada fila ("se borra solo en N días", en rojo
   a 3 días o menos). El cron diario `/api/cron/documentos-papelera` (09:20) usa **la misma
   constante**: el plazo que promete la pantalla es el que se cumple.
4. **Toda purga borra el storage antes que las filas.** `storagePathsOfDeleted` junta las rutas
   del documento y de sus versiones históricas; una vez borrada la fila no hay de dónde sacarlas y
   los archivos quedarían huérfanos ocupando el bucket.
5. **La papelera filtra por `deletedAt` en el propio componente.** No confía en la lista que le
   pasan (ver Consecuencias).
6. **Auditoría:** `DocumentsDB.logMany` = un `createMany` con el detalle compartido una sola vez,
   filtrando a los ids que existen (`documentId` es FK: un id inventado tumbaría el insert
   entero). En la purga el rastro no puede vivir en `DocumentAuditLog` —se va en cascada con el
   documento—, así que se registra en el `ActivityLog` del tenant.

## Consecuencias

- **Un componente destructivo no confía en lo que le pasan.** Al entrar a la vista, el listado de
  la papelera tarda en llegar y hasta entonces la lista en memoria es la de los archivos
  **activos**: se veían 42 documentos vivos bajo el cartel "sin liberar" y "Elegir todos" los
  marcaba para eliminar definitivamente. El servidor los ignora (todos los métodos de purga y
  restauración filtran `deletedAt: { not: null }`), pero la pantalla no tenía por qué ofrecerlo.
  Por lo mismo, los KPIs del drive se ocultan en esa vista: contaban la papelera como si fuera el
  drive.
- **Lo optimista se corrige con la verdad del servidor.** Si un lote falla después de que otro
  pasó, o si el servidor restaura menos de lo pedido, se re-pide el listado en vez de "deshacer"
  en pantalla algo que sí ocurrió.
- **`STRICT` (10 requests cada 15 min) no alcanzaba** para ordenar un drive: preset `DRIVE_BULK`
  (60 cada 15 min ≈ 30.000 documentos por ventana).
- **Riesgo asumido:** la retención borra sin preguntar a los 30 días. Se mitiga diciéndolo en la
  cabecera de la papelera y en cada fila, y el cron corre después del de vencimientos para no
  competir por la ventana.
- **Pendiente:** la retención es global (no configurable por tenant) y las **carpetas** siguen sin
  papelera — borrarlas es definitivo y suelta sus documentos a la raíz.

## Alternativas descartadas

- **Subir el tope del Zod y listo.** Deja el mismo bug esperando con una selección más grande, y
  un `updateMany` con 5.000 ids es un problema distinto. Partir en lotes escala igual con
  cualquier selección.
- **Purgar todo en una request.** Vaciar una papelera grande implica borrar objetos del storage:
  una sola request con miles de rutas se cuelga o se corta a mitad. Tandas + `restantes` se puede
  reanudar y muestra progreso real.
- **Retención configurable por tenant desde el día uno.** Sin nadie pidiéndola todavía, sólo
  agrega un lugar donde el número de la pantalla y el del cron se desincronicen.

## Referencias

- `lib/documents/bulk-limits.ts`, `lib/documents/papelera-retencion.ts`
- `__tests__/documentos-papelera-retencion.test.ts`
- Verificación: 500 documentos borrados desde la UI en una request; `purge` de activos devuelve
  `purged: 0` sin tocarlos; cron con 3 filas vencidas → `purgados: 3`, 2ª corrida → 0; sin
  `Authorization` → 401.
