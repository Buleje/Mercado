# Brief común — noche autónoma 17-10 (00:10 → 07:00 Lima)

Brandon (dueño, duerme): «implementa todas las mejoras, hallazgos y demás de los documentos a mi panel admin; todas tus propuestas y decisiones». Él delega las decisiones: **no preguntes nada**, decidí con el default sensato y anotalo.

## Fuente
Texto de los 4 PDF de auditoría (Codex, 15-10) en `.claude/autonomo/noche-17-10/pdf/`:
| Carril | PDF | Códigos | Carpetas propias (archivos disjuntos entre carriles) |
|---|---|---|---|
| ventas | `ventas.txt` | M01-M60 (y hallazgos H/O) | `components/admin/{pos,caja,fiados,comisiones}`, `app/api/admin/{caja,pos,fiados,comisiones}*`, sus `lib/db` |
| pedidos | `pedidos.txt` | P01-P48 | `components/admin/OrdersTab*`, `DeliveryTab*`, carpetas de pedidos/reparto/repartidores |
| compras | `compras.txt` | C01-C64 | `components/admin/{compra,compras,proveedores,cuentas-por-pagar,devoluciones-proveedor}` + sus APIs |
| comprobantes | `comprobantes.txt` | F01-F56 | `components/admin/{einvoice,notas-credito,guias-remision,cotizaciones}` + sus APIs |

`ventas.txt` págs. 13-15 también propone cosas de Pedidos y Comprobantes: esas M las hace el carril dueño del área (pedidos/comprobantes leen esas páginas). Si una propuesta exige tocar archivos de OTRO carril, no la toques: anotala en tu reporte como «→ carril X».

## Cómo trabajar
1. **Triage primero** (si tu carril aún no tiene `triage.md`): por cada código, comprobá en el código si ya existe (grep/LSP; el panel cambió mucho el 09-11/10: muchas cosas pueden estar hechas). Clasificá: `HACER` · `YA EXISTE` (con archivo:línea) · `DECIDE BRANDON` (plata dudosa, schema, cambia una regla de negocio) · `ZONA PELIGRO` (checkout, `lib/db/orders.db.ts` máquina de estados, `proxy.ts`, `lib/middleware`, `role-permissions.ts`, `prisma/schema.prisma`, `marketplace.db.ts`/comisiones cross-vendor) · `DESCARTAR` (por qué). Agrupá los `HACER` en **paquetes** de 5-10 por archivos cercanos, ordenados por prioridad del PDF (P1 primero) y por el «Lo primero que resolvería».
2. **Implementá** el paquete que te toca. Bugs reales primero (el PDF los marca como hallazgos verificados).
3. Patrón del panel (ADR-489, `.claude/rules/` de UI): una sola tabla/modal/botón por estilo, muchos botones → botón con opciones, controles en la fila del título, `?vista=` para subvistas, tokens del DS (sin hex), ≤300 líneas por componente, español de Perú con tuteo, sin IDs técnicos a la vista (buscadores por nombre/número).
4. Reglas críticas de CLAUDE.md: `lib/db/*.db.ts` (nunca prisma directo), Zod `safeParse`, `tenantId` primero, invalidar caché tras writes, totales en backend, `requireAdmin(req, roles)`, `.catch(err => logger…)`.
5. **Sin migraciones de schema** esta noche: si una mejora necesita columna nueva, buscá un campo `Json`/KV existente; si no hay, `DECIDE BRANDON` con el diseño.
6. Zona de peligro: si la mejora es clara y chica, hacela y marcala en el reporte con «PEDIR SECURITY» (el hilo principal manda `security`/`reviewer`). Nada de cambiar estados de pedidos, cobros, comisiones ni emisión SUNAT sin esa marca.

## Prohibido
- `git` que escribe: commit, add, stash, reset, checkout, restore, rebase. Solo `git diff`, `git status`, `git log`, `git show HEAD:<archivo>`. El hilo principal commitea.
- Matar `node`, borrar `.next`, reiniciar el dev (corre en :3000; auth en `/tmp/bsm-auth.env`).
- Crear un archivo sin `ls` antes (otro carril puede haberlo creado).
- Escribir en la base datos de verdad salvo lo que la UI haría al probar en el tenant `main` con datos QA; nunca emitir a SUNAT, pagar, ni mandar mensajes reales.

## Gates (economía)
- `npm run typecheck` UNA vez al final (los errores del archivo editado llegan solos tras cada Edit).
- `npx vitest related <archivos> --run` si tocaste lógica con test o escribiste uno (lógica nueva de dinero/estado = test nuevo).
- 1 captura si cambia lo que se dibuja: `node scripts/qa-capturas.mjs` (ver `--help`), leé 1 imagen (claro 1280).
- No `npm run lint` a mano.

## Entregables (en `.claude/autonomo/noche-17-10/carriles/<carril>/`)
- `triage.md` (si lo hiciste): tabla `Código | Qué pide (5-10 palabras) | Estado | Evidencia/archivos | Paquete`.
- `reporte-<paquete>.md`: tabla `Código | Hecho/No | Antes → Después (medido o visto)`; lo que quedó y por qué; marcas PEDIR SECURITY.
- `files-<paquete>.txt`: un archivo tocado por línea (rutas relativas al repo, incluye tests nuevos).
- `msg-<paquete>.txt`: mensaje Conventional en español (subject ≤100, cuerpo con los códigos hechos), y al final estas dos líneas:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HcrhJcFairSg7mmqMfxCUD
  ```
- Respuesta final en TEXTO ≤20 líneas: hechos, no hechos, typecheck, «Para acelerar:».
