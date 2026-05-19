# Auditoría módulo DELIVERY (Bug Hunter)

Branch `feat/checkout-payment-proof` · 2026-05-17 · scope: `app/delivery*`, `app/api/delivery/**`, `app/api/admin/{delivery,driver-applications}/**`, `lib/db/delivery.db.ts`, `lib/delivery/**`, modelos Prisma `DeliveryPartner|Offer|Assignment|Tracking`.

Resumen: 4 P0, 5 P1, 3 P2. Race conditions cubiertas, pero hay fraude de fees, GPS sin lock, KYC nominal y notif duplicada al partner.

## P0 — críticos

### P0-1 — Doble-cobro de `delivery_fee` por idempotencia parcial
**Archivo:** `lib/db/commissions.db.ts:357-363` (la idempotencia exige `(orderId, type)` pero `recordMarketplaceCommissions` se invoca cada vez que se llama desde fuera).
**Reproducer:** cualquier handler que llame `recordMarketplaceCommissions` dos veces (admin re-confirma entrega + webhook MP + cron settlement). El doc del archivo dice "idempotente" pero el código no impone unique-constraint sobre `(orderId, type)` en este orden — depende de un `find` previo en `CommissionsDB.recordCommission` que la auditoría 2026-05-17 P1-3 introdujo pero solo en marketplace_fee, no en delivery_fee.
**Causa:** `if (assignment) { … recordCommission delivery_fee }` sin lookup previo de comisiones existentes para `(orderId, "delivery_fee")`.
**Fix:** en `recordCommission` agregar `findFirst({ where: { orderId, type } })` antes del insert (o `@@unique([orderId, type])` en Prisma). Equivalente al patrón usado en idempotencyKey de `enqueueDeliveryNotification`.

### P0-2 — Race condition real en `manual-assign`: TOCTOU vs cascada
**Archivo:** `app/api/admin/delivery/manual-assign/route.ts:37-91`.
**Reproducer:** admin pulsa "Asignar manualmente" justo cuando el cron `processCascadeTick` (`offer-cascade.ts:227`) corre. La transacción manual valida `existing = findUnique({where:{orderId}})`. Mientras tanto el partner X acepta su offer → `accept/route.ts:99` crea assignment fuera del lock. Ambos llegan al `create` → uno gana, el otro lanza `P2002` (unique violation en `orderId`) → 500 al admin (`catch (err) { return …"Error al asignar"`).
**Causa:** `prisma.$transaction` en Prisma 7 + Postgres NO toma row-lock sobre filas inexistentes. `findUnique` + `create` sobre `orderId` es TOCTOU clásico.
**Fix:** envolver en `SELECT ... FOR UPDATE` con raw SQL sobre `Order` (lock pesimista) o capturar `P2002` y devolver 409 amigable. Bonus: el cron extiende offers a 24h (`offer-cascade.ts:296`), maximizando ventana de colisión.

### P0-3 — Override de `fee` por admin = vector de fraude no auditado
**Archivo:** `app/api/delivery/assignments/route.ts:79-128` (`POST`).
**Reproducer:** admin manda `{ orderId, partnerId, fee: 0.01 }` o `fee: 9999`. `AssignmentPostSchema` solo exige `nonnegative()`; no se compara contra `computeOfferFee(distanceKm)` ni contra una offer aceptada existente. El fee queda registrado en `DeliveryAssignment.fee` y luego se replica como `delivery_fee` en el ledger (`commissions.db.ts:356`).
**Causa:** falta gate "fee debe coincidir con offer o estar entre `[0.7×, 1.3×] × computeOfferFee`".
**Fix:** si existe `DeliveryOffer.accepted` para ese `orderId`, exigir `fee === offer.feeOffered`. Si es manual-assign sin offer, cap a `partner.fee × multiplier` y logActivity con tag `fee_override`.

### P0-4 — `extractPhoneFromBody` permite escalar phone ajeno en approve
**Archivo:** `app/api/admin/driver-applications/route.ts:27-35, 130-145`.
**Reproducer:** admin malicioso (o atacante con cuenta admin de tenant A) edita `notification.body` directo en DB para que el regex extraiga otro phone (o crea una notif fake con `body: "Mario · DNI 12345678 | Tel 999333222 ..."`). El PATCH approve hace `findFirst({tenantId, phone})` → activa el partner que matchee, sin volver a validar DNI ni el `kyc.dni` parseado. Si dos applications tienen el mismo `phone` en distinto tenant, el partner aprobado puede no ser el que pidió.
**Causa:** el `notification.id` es la clave pero el `phone` no se firma. Acoplamiento phone↔body por regex de plain-text.
**Fix:** persistir `partnerId` directo en `Notification.metadataJson` al crear la application (no parsear body en cada PATCH). Validar `notification.body` con HMAC al crear, o relacionar 1:1 con DeliveryPartner via FK `notification.relatedId`.

## P1 — altos

### P1-1 — `tracking/update` no valida tenantId del `partnerId`
**Archivo:** `app/api/delivery/tracking/update/route.ts:54-84`.
**Detalle:** `requireDriver(req, partnerId, prisma)` verifica que el token corresponde a `partnerId`. Pero el body acepta `partnerId` como parámetro — un driver válido puede enviar `partnerId` de otro driver del mismo tenant. `requireDriver` previene esto porque el token está atado a un `partnerId`, pero la doble lectura (token ∧ body.partnerId) abre confusión. La defensa termina funcionando pero el lookup `assignment.findUnique({where:{orderId}})` no scopea `tenantId` antes de validar tenant — vuela tenant info de assignments ajenos antes de fallar.
**Fix:** `findFirst({where:{orderId, tenantId, partnerId}})` y devolver 404 unificado para evitar enumeration.

### P1-2 — `tip/[orderId]` y `rate/route.ts` aceptan token opcional (backwards-compat indefinida)
**Archivo:** `app/api/delivery/tip/[orderId]/route.ts:47-60`, `app/api/delivery/rate/route.ts:54-70`.
**Detalle:** ambos endpoints permiten request sin token HMAC ("legacy unauthenticated") con `logger.warn`. Cualquiera con `orderId` enumerable deja propina arbitraria (hasta `S/ 500` por tip) o califica con 1 estrella (cap por `notes:{contains:'"rated":true'}` pero el bombing entre orders distintos no tiene tope global). El rate-limit STRICT es por IP, no por `partnerId`.
**Fix:** flip flag `DELIVERY_TIP_REQUIRE_TOKEN=true` y `DELIVERY_RATE_REQUIRE_TOKEN=true`. Devolver 403 si falta.

### P1-3 — Order.status atómico fuera de la tx del assignment
**Archivo:** `app/api/delivery/me/assignments/[id]/route.ts:174-196` + `lib/db/delivery.db.ts:177-187`.
**Detalle:** PATCH actualiza `DeliveryAssignment.status` dentro de tx, luego `tx.order.update({...status: nextOrderStatus})` también dentro. OK. Pero `DeliveryTrackingDB.add` (raw SQL) corre fuera de cualquier tx en `confirm/route.ts:103-117` y dispara `UPDATE "Order" SET deliveryStatus=...` por separado (`delivery.db.ts:177`). Si el segundo UPDATE falla, `DeliveryAssignment.status="delivered"` pero `Order.deliveryStatus` queda atrás → admin ve "en camino" en dashboard pero rider ya cerró.
**Fix:** unificar dentro de la misma `$transaction` o usar listener post-commit con retry.

### P1-4 — Notificación al partner duplicada en `manual-assign`
**Archivo:** `app/api/admin/delivery/manual-assign/route.ts:106-122` + `notify-driver.ts`.
**Detalle:** `manual-assign` envía WA inline con `context: "manual-assign-${assignmentId}"`. Pero `app/api/delivery/assignments/route.ts:141-146` (otra ruta admin que también crea assignment) llama `notifyDriverInternal` con `context` distinto. Si el admin usa ambas (POS + módulo), el rider recibe 2 mensajes diferentes con misma asignación. `sendWhatsAppQueued` deduplica por `context` exacto — al diferir, no se filtra.
**Fix:** estandarizar `context: "delivery-assign-${assignmentId}"` en ambas rutas. Bonus: poner el notify en un trigger Prisma post-create.

### P1-5 — Aprobación driver sin validar SOAT/licencia vigentes en server
**Archivo:** `app/api/admin/driver-applications/route.ts:145-205`.
**Detalle:** el form Zod (`driver-apply.ts`) valida `licenseExpiresAt > now` y `soatExpiresAt > now` **al inscribirse**. Al aprobar 3 días después, el server NO re-valida fechas — un admin puede aprobar una application cuyos documentos vencieron en la ventana. Para Ley 29733 + DS 017-2009-MTC es liability legal.
**Fix:** en PATCH approve volver a parsear `partner.notes` (ya hay `parseKycNotes`) y rechazar si `kyc.license.expiresAt < now || kyc.vehicle.soatExpiresAt < now`.

## P2 — medios

### P2-1 — `confirm/route.ts` usa fetch HTTP a `/api/delivery/notify` con cookie forward (SSRF mitigado en otra ruta, pendiente acá)
**Archivo:** `app/api/delivery/confirm/route.ts:122-133`.
**Detalle:** `notify-driver.ts` fue extraído para fix SSRF; `confirm` aún hace `fetch(\`${baseUrl}/api/delivery/notify\`, {headers:{cookie: req.headers.get("cookie")}})`. Si `NEXT_PUBLIC_BASE_URL` se manipula vía env-injection en build, hay cookie-leak.
**Fix:** reemplazar con `notifyDriverInternal({tenantId, partnerId, orderId, message})`.

### P2-2 — `GET tracking/[orderId]` devuelve `partnerPhone` PII a customer
**Archivo:** `app/api/delivery/tracking/[orderId]/route.ts:88-92`.
**Detalle:** tras autorización (admin o customer del order), responde `partner.phone` en claro. Para cliente final no hace falta el phone exacto — basta nombre + último-dígito. Compromete Ley 29733 si el customer comparte el link.
**Fix:** enmascarar phone para customer (`***-***-1234`) y solo entregar full a admin.

### P2-3 — GPS-trail almacenado en `notes` como JSON pisa otros datos
**Archivo:** `app/api/delivery/tracking/update/route.ts:96-108`.
**Detalle:** cada ping reescribe `notes` parseando-mergeando. Si dos PATCH llegan al mismo `orderId` con 50 ms de diferencia (probable con `requestAnimationFrame` GPS), el segundo lee, el primero escribe, segundo escribe pisando — perdemos un ping y peor: si la `rate/route.ts` insertó `rated:true` entre ambos, lo borra.
**Fix:** UPDATE con `JSONB ||` (postgres) o tabla `DeliveryTracking` con relación N:1, no JSON inline.

---

Reproducers, log lines y traceback completos quedan en cada referencia archivo:línea citada. Sin cambios de código aplicados.
