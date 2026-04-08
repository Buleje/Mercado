import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * lib/db/delivery.db.ts — Bloque D1 del Marketplace (Delivery vivo)
 *
 * Cubre las 3 tablas nuevas del bloque D1:
 *   - DeliveryTracking   (historial de eventos del envío)
 *   - DeliveryRoute      (cabecera de la ruta del día del repartidor)
 *   - DeliveryRouteStop  (paradas ordenadas de la ruta)
 *
 * Y los 4 campos agregados a Order (D1.4):
 *   deliveryStatus | driverId | estimatedDeliveryAt | deliveredAt
 *   pickupLat | pickupLng | dropoffLat | dropoffLng
 *
 * Convenciones del proyecto respetadas:
 *   - tenantId como primer parámetro en TODAS las funciones
 *   - Nunca Prisma directo fuera de DB classes (esta es DB class → OK)
 *   - Fechas ISO strings en la superficie; Date internamente
 *   - Cache getOrSet + invalidateByPrefix tras writes
 *   - logger estructurado con requestId-friendly metadata
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryStatus =
  | "preparing"
  | "ready"
  | "picked_up"
  | "in_transit"
  | "nearby"
  | "delivered"
  | "failed"
  | "cancelled";

export type DeliveryActorType = "driver" | "system" | "admin" | "customer";

export type RouteStatus = "planned" | "in_progress" | "completed" | "cancelled";

export type RouteStopStatus = "pending" | "arrived" | "delivered" | "failed" | "skipped";

export type DbDeliveryTracking = {
  id: string;
  tenantId: string;
  orderId: string;
  status: DeliveryStatus;
  description: string | null;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  etaMinutes: number | null;
  actorId: string | null;
  actorType: DeliveryActorType;
  photoUrl: string | null;
  metadataJson: string | null;
  createdAt: string;
};

export type DbDeliveryRoute = {
  id: string;
  tenantId: string;
  storeId: string;
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  vehicleType: string;
  status: RouteStatus;
  plannedStartAt: string;
  actualStartAt: string | null;
  completedAt: string | null;
  totalStops: number;
  completedStops: number;
  totalDistanceM: number | null;
  optimizedByAi: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbDeliveryRouteStop = {
  id: string;
  tenantId: string;
  routeId: string;
  orderId: string;
  sequence: number;
  status: RouteStopStatus;
  address: string;
  addressDetail: string | null;
  lat: number | null;
  lng: number | null;
  customerName: string;
  customerPhone: string | null;
  estimatedArrivalAt: string | null;
  actualArrivalAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  proofPhotoUrl: string | null;
  proofSignatureUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toISO = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

/**
 * Prisma-less raw-SQL layer.
 *
 * Los modelos del bloque D1 viven en la migración MANUAL-marketplace-bloque-d1.sql
 * y todavía NO están en prisma/schema.prisma, porque el equipo aplica el SQL a mano
 * contra Supabase (ver reference_prisma_pgbouncer_workaround.md). Hasta que agreguen
 * los modelos al schema, esta DB class usa $queryRawUnsafe / $executeRawUnsafe
 * parametrizado para evitar SQL injection.
 */

// ─── DeliveryTrackingDB ───────────────────────────────────────────────────────

export const DeliveryTrackingDB = {
  /**
   * Agregar un evento de tracking al historial del envío.
   * Nunca se sobrescribe — cada llamada inserta una fila nueva.
   */
  async add(params: {
    tenantId: string;
    orderId: string;
    status: DeliveryStatus;
    description?: string;
    lat?: number;
    lng?: number;
    distanceM?: number;
    etaMinutes?: number;
    actorId?: string;
    actorType?: DeliveryActorType;
    photoUrl?: string;
    metadataJson?: string;
  }): Promise<DbDeliveryTracking> {
    const id = crypto.randomUUID();
    const now = new Date();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "DeliveryTracking"
         ("id","tenantId","orderId","status","description","lat","lng",
          "distanceM","etaMinutes","actorId","actorType","photoUrl","metadataJson","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      id,
      params.tenantId,
      params.orderId,
      params.status,
      params.description ?? null,
      params.lat ?? null,
      params.lng ?? null,
      params.distanceM ?? null,
      params.etaMinutes ?? null,
      params.actorId ?? null,
      params.actorType ?? "system",
      params.photoUrl ?? null,
      params.metadataJson ?? null,
      now,
    );

    // Propagar el status al Order (campo nuevo de D1.4)
    // — solo para los terminales/semi-terminales para no generar writes excesivos
    if (
      params.status === "delivered" ||
      params.status === "failed" ||
      params.status === "cancelled" ||
      params.status === "in_transit" ||
      params.status === "picked_up"
    ) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Order"
            SET "deliveryStatus" = $1,
                "deliveredAt" = COALESCE("deliveredAt", CASE WHEN $1 = 'delivered' THEN $2::timestamp ELSE NULL END)
          WHERE "id" = $3 AND "tenantId" = $4`,
        params.status,
        now,
        params.orderId,
        params.tenantId,
      );
    }

    invalidateByPrefix(`delivery:tracking:${params.tenantId}:${params.orderId}`);
    invalidateByPrefix(`delivery:tracking:latest:${params.tenantId}`);

    logger.info("[DeliveryTracking] event added", {
      tenantId: params.tenantId,
      orderId: params.orderId,
      status: params.status,
    });

    return {
      id,
      tenantId:     params.tenantId,
      orderId:      params.orderId,
      status:       params.status,
      description:  params.description ?? null,
      lat:          params.lat ?? null,
      lng:          params.lng ?? null,
      distanceM:    params.distanceM ?? null,
      etaMinutes:   params.etaMinutes ?? null,
      actorId:      params.actorId ?? null,
      actorType:    params.actorType ?? "system",
      photoUrl:     params.photoUrl ?? null,
      metadataJson: params.metadataJson ?? null,
      createdAt:    now.toISOString(),
    };
  },

  /**
   * Timeline completo de un envío — más reciente primero.
   * Cacheado 30 s porque los clientes hacen polling cada 10 s.
   */
  async listByOrder(tenantId: string, orderId: string): Promise<DbDeliveryTracking[]> {
    const cacheKey = `delivery:tracking:${tenantId}:${orderId}`;

    return getOrSet(cacheKey, 30, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          orderId: string;
          status: string;
          description: string | null;
          lat: number | null;
          lng: number | null;
          distanceM: number | null;
          etaMinutes: number | null;
          actorId: string | null;
          actorType: string;
          photoUrl: string | null;
          metadataJson: string | null;
          createdAt: Date;
        }>
      >(
        `SELECT "id","tenantId","orderId","status","description","lat","lng",
                "distanceM","etaMinutes","actorId","actorType","photoUrl","metadataJson","createdAt"
           FROM "DeliveryTracking"
          WHERE "tenantId" = $1 AND "orderId" = $2
          ORDER BY "createdAt" DESC`,
        tenantId,
        orderId,
      );

      return rows.map((r) => ({
        id:           r.id,
        tenantId:     r.tenantId,
        orderId:      r.orderId,
        status:       r.status as DeliveryStatus,
        description:  r.description,
        lat:          r.lat,
        lng:          r.lng,
        distanceM:    r.distanceM,
        etaMinutes:   r.etaMinutes,
        actorId:      r.actorId,
        actorType:    r.actorType as DeliveryActorType,
        photoUrl:     r.photoUrl,
        metadataJson: r.metadataJson,
        createdAt:    r.createdAt.toISOString(),
      }));
    });
  },

  /**
   * Último evento de cada Order activo del tenant — para el dashboard en vivo del admin.
   */
  async latestPerOrder(
    tenantId: string,
    limit = 50,
  ): Promise<Array<DbDeliveryTracking & { customerName: string }>> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 200);
    const cacheKey = `delivery:tracking:latest:${tenantId}:${safeLimit}`;

    return getOrSet(cacheKey, 15, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          orderId: string;
          status: string;
          description: string | null;
          lat: number | null;
          lng: number | null;
          distanceM: number | null;
          etaMinutes: number | null;
          actorId: string | null;
          actorType: string;
          photoUrl: string | null;
          metadataJson: string | null;
          createdAt: Date;
          customerName: string;
        }>
      >(
        `SELECT DISTINCT ON (dt."orderId")
                dt."id", dt."tenantId", dt."orderId", dt."status", dt."description",
                dt."lat", dt."lng", dt."distanceM", dt."etaMinutes", dt."actorId",
                dt."actorType", dt."photoUrl", dt."metadataJson", dt."createdAt",
                o."customerName"
           FROM "DeliveryTracking" dt
           JOIN "Order" o ON o."id" = dt."orderId"
          WHERE dt."tenantId" = $1
            AND dt."status" NOT IN ('delivered','cancelled','failed')
          ORDER BY dt."orderId", dt."createdAt" DESC
          LIMIT $2`,
        tenantId,
        safeLimit,
      );

      return rows.map((r) => ({
        id:           r.id,
        tenantId:     r.tenantId,
        orderId:      r.orderId,
        status:       r.status as DeliveryStatus,
        description:  r.description,
        lat:          r.lat,
        lng:          r.lng,
        distanceM:    r.distanceM,
        etaMinutes:   r.etaMinutes,
        actorId:      r.actorId,
        actorType:    r.actorType as DeliveryActorType,
        photoUrl:     r.photoUrl,
        metadataJson: r.metadataJson,
        createdAt:    r.createdAt.toISOString(),
        customerName: r.customerName,
      }));
    });
  },
};

// ─── DeliveryRoutesDB ─────────────────────────────────────────────────────────

export const DeliveryRoutesDB = {
  /**
   * Crear una ruta vacía para un repartidor.
   * Las paradas se agregan después con DeliveryRouteStopsDB.addStop().
   */
  async create(params: {
    tenantId: string;
    storeId: string;
    driverId: string;
    driverName: string;
    driverPhone?: string;
    vehicleType?: string;
    plannedStartAt: Date | string;
    totalDistanceM?: number;
    notes?: string;
  }): Promise<DbDeliveryRoute> {
    const id = crypto.randomUUID();
    const now = new Date();
    const plannedStartAt =
      typeof params.plannedStartAt === "string"
        ? new Date(params.plannedStartAt)
        : params.plannedStartAt;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "DeliveryRoute"
         ("id","tenantId","storeId","driverId","driverName","driverPhone","vehicleType",
          "status","plannedStartAt","totalStops","completedStops","totalDistanceM",
          "optimizedByAi","notes","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'planned',$8,0,0,$9,false,$10,$11,$11)`,
      id,
      params.tenantId,
      params.storeId,
      params.driverId,
      params.driverName,
      params.driverPhone ?? null,
      params.vehicleType ?? "moto",
      plannedStartAt,
      params.totalDistanceM ?? null,
      params.notes ?? null,
      now,
    );

    invalidateByPrefix(`delivery:routes:${params.tenantId}`);

    logger.info("[DeliveryRoutes] created", {
      tenantId: params.tenantId,
      routeId: id,
      driverId: params.driverId,
    });

    return {
      id,
      tenantId:       params.tenantId,
      storeId:        params.storeId,
      driverId:       params.driverId,
      driverName:     params.driverName,
      driverPhone:    params.driverPhone ?? null,
      vehicleType:    params.vehicleType ?? "moto",
      status:         "planned",
      plannedStartAt: plannedStartAt.toISOString(),
      actualStartAt:  null,
      completedAt:    null,
      totalStops:     0,
      completedStops: 0,
      totalDistanceM: params.totalDistanceM ?? null,
      optimizedByAi:  false,
      notes:          params.notes ?? null,
      createdAt:      now.toISOString(),
      updatedAt:      now.toISOString(),
    };
  },

  /**
   * Cambiar el status de la ruta (planned → in_progress → completed/cancelled).
   * Setea timestamps automáticamente.
   */
  async setStatus(
    tenantId: string,
    routeId: string,
    status: RouteStatus,
  ): Promise<void> {
    const now = new Date();
    const startAtSet = status === "in_progress" ? ', "actualStartAt" = $3' : "";
    const completedAtSet =
      status === "completed" || status === "cancelled" ? ', "completedAt" = $3' : "";

    await prisma.$executeRawUnsafe(
      `UPDATE "DeliveryRoute"
          SET "status" = $1, "updatedAt" = $3${startAtSet}${completedAtSet}
        WHERE "id" = $2 AND "tenantId" = $4`,
      status,
      routeId,
      now,
      tenantId,
    );

    invalidateByPrefix(`delivery:routes:${tenantId}`);

    logger.info("[DeliveryRoutes] status changed", { tenantId, routeId, status });
  },

  /**
   * Rutas del día para el dashboard del admin.
   * Filtra por fecha (default: hoy) y opcionalmente por storeId.
   */
  async listToday(
    tenantId: string,
    opts: { storeId?: string; status?: RouteStatus } = {},
  ): Promise<DbDeliveryRoute[]> {
    const cacheKey = `delivery:routes:${tenantId}:today:${opts.storeId ?? "all"}:${opts.status ?? "all"}`;

    return getOrSet(cacheKey, 20, async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const whereStore = opts.storeId ? ` AND "storeId" = $4` : "";
      const whereStatus = opts.status
        ? ` AND "status" = $${opts.storeId ? 5 : 4}`
        : "";

      // Construir los args dinámicamente para mantener el orden
      const args: unknown[] = [tenantId, startOfDay, endOfDay];
      if (opts.storeId) args.push(opts.storeId);
      if (opts.status) args.push(opts.status);

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          storeId: string;
          driverId: string;
          driverName: string;
          driverPhone: string | null;
          vehicleType: string;
          status: string;
          plannedStartAt: Date;
          actualStartAt: Date | null;
          completedAt: Date | null;
          totalStops: number;
          completedStops: number;
          totalDistanceM: number | null;
          optimizedByAi: boolean;
          notes: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >(
        `SELECT "id","tenantId","storeId","driverId","driverName","driverPhone","vehicleType",
                "status","plannedStartAt","actualStartAt","completedAt",
                "totalStops","completedStops","totalDistanceM","optimizedByAi","notes",
                "createdAt","updatedAt"
           FROM "DeliveryRoute"
          WHERE "tenantId" = $1
            AND "plannedStartAt" >= $2
            AND "plannedStartAt" <  $3
            ${whereStore}${whereStatus}
          ORDER BY "plannedStartAt" ASC`,
        ...args,
      );

      return rows.map((r) => ({
        id:             r.id,
        tenantId:       r.tenantId,
        storeId:        r.storeId,
        driverId:       r.driverId,
        driverName:     r.driverName,
        driverPhone:    r.driverPhone,
        vehicleType:    r.vehicleType,
        status:         r.status as RouteStatus,
        plannedStartAt: r.plannedStartAt.toISOString(),
        actualStartAt:  toISO(r.actualStartAt),
        completedAt:    toISO(r.completedAt),
        totalStops:     r.totalStops,
        completedStops: r.completedStops,
        totalDistanceM: r.totalDistanceM,
        optimizedByAi:  r.optimizedByAi,
        notes:          r.notes,
        createdAt:      r.createdAt.toISOString(),
        updatedAt:      r.updatedAt.toISOString(),
      }));
    });
  },
};

// ─── DeliveryRouteStopsDB ─────────────────────────────────────────────────────

export const DeliveryRouteStopsDB = {
  /**
   * Agregar una parada al final de la ruta (auto-sequence) y actualizar el contador
   * totalStops de la ruta padre. Transaccional.
   */
  async addStop(params: {
    tenantId: string;
    routeId: string;
    orderId: string;
    address: string;
    addressDetail?: string;
    lat?: number;
    lng?: number;
    customerName: string;
    customerPhone?: string;
    estimatedArrivalAt?: Date | string;
    notes?: string;
  }): Promise<DbDeliveryRouteStop> {
    const id = crypto.randomUUID();
    const now = new Date();
    const estimatedArrivalAt =
      params.estimatedArrivalAt == null
        ? null
        : typeof params.estimatedArrivalAt === "string"
          ? new Date(params.estimatedArrivalAt)
          : params.estimatedArrivalAt;

    return prisma.$transaction(async (tx) => {
      // 1. Calcular la siguiente sequence para esta ruta
      const [seqRow] = await tx.$queryRawUnsafe<Array<{ next: number }>>(
        `SELECT COALESCE(MAX("sequence"), 0) + 1 AS next
           FROM "DeliveryRouteStop"
          WHERE "routeId" = $1`,
        params.routeId,
      );
      const sequence = Number(seqRow?.next ?? 1);

      // 2. Insertar la parada
      await tx.$executeRawUnsafe(
        `INSERT INTO "DeliveryRouteStop"
           ("id","tenantId","routeId","orderId","sequence","status","address","addressDetail",
            "lat","lng","customerName","customerPhone","estimatedArrivalAt","notes","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
        id,
        params.tenantId,
        params.routeId,
        params.orderId,
        sequence,
        params.address,
        params.addressDetail ?? null,
        params.lat ?? null,
        params.lng ?? null,
        params.customerName,
        params.customerPhone ?? null,
        estimatedArrivalAt,
        params.notes ?? null,
        now,
      );

      // 3. Incrementar el contador totalStops de la ruta padre
      await tx.$executeRawUnsafe(
        `UPDATE "DeliveryRoute"
            SET "totalStops" = "totalStops" + 1, "updatedAt" = $1
          WHERE "id" = $2 AND "tenantId" = $3`,
        now,
        params.routeId,
        params.tenantId,
      );

      invalidateByPrefix(`delivery:routes:${params.tenantId}`);
      invalidateByPrefix(`delivery:stops:${params.tenantId}:${params.routeId}`);

      return {
        id,
        tenantId:           params.tenantId,
        routeId:            params.routeId,
        orderId:            params.orderId,
        sequence,
        status:             "pending",
        address:            params.address,
        addressDetail:      params.addressDetail ?? null,
        lat:                params.lat ?? null,
        lng:                params.lng ?? null,
        customerName:       params.customerName,
        customerPhone:      params.customerPhone ?? null,
        estimatedArrivalAt: estimatedArrivalAt ? estimatedArrivalAt.toISOString() : null,
        actualArrivalAt:    null,
        completedAt:        null,
        failureReason:      null,
        proofPhotoUrl:      null,
        proofSignatureUrl:  null,
        notes:              params.notes ?? null,
        createdAt:          now.toISOString(),
        updatedAt:          now.toISOString(),
      };
    });
  },

  /**
   * Marcar una parada como entregada (o fallida/skipped).
   * Si es 'delivered', también incrementa completedStops en la ruta padre
   * y emite un DeliveryTracking.add('delivered') para el Order.
   */
  async markStop(params: {
    tenantId: string;
    stopId: string;
    status: RouteStopStatus;
    failureReason?: string;
    proofPhotoUrl?: string;
    proofSignatureUrl?: string;
    lat?: number;
    lng?: number;
  }): Promise<void> {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // 1. Leer la parada para conocer routeId + orderId
      const [stop] = await tx.$queryRawUnsafe<
        Array<{ routeId: string; orderId: string; status: string }>
      >(
        `SELECT "routeId","orderId","status"
           FROM "DeliveryRouteStop"
          WHERE "id" = $1 AND "tenantId" = $2`,
        params.stopId,
        params.tenantId,
      );
      if (!stop) throw new Error(`Parada ${params.stopId} no existe`);

      // 2. Actualizar la parada
      const completedSet =
        params.status === "delivered" || params.status === "failed" || params.status === "skipped"
          ? ', "completedAt" = $3'
          : "";
      const arrivedSet = params.status === "arrived" ? ', "actualArrivalAt" = $3' : "";

      await tx.$executeRawUnsafe(
        `UPDATE "DeliveryRouteStop"
            SET "status" = $1,
                "failureReason" = COALESCE($4, "failureReason"),
                "proofPhotoUrl" = COALESCE($5, "proofPhotoUrl"),
                "proofSignatureUrl" = COALESCE($6, "proofSignatureUrl"),
                "updatedAt" = $3
                ${completedSet}${arrivedSet}
          WHERE "id" = $2 AND "tenantId" = $7`,
        params.status,
        params.stopId,
        now,
        params.failureReason ?? null,
        params.proofPhotoUrl ?? null,
        params.proofSignatureUrl ?? null,
        params.tenantId,
      );

      // 3. Si terminó → bump completedStops en la ruta
      if (
        (params.status === "delivered" ||
          params.status === "failed" ||
          params.status === "skipped") &&
        stop.status !== "delivered" &&
        stop.status !== "failed" &&
        stop.status !== "skipped"
      ) {
        await tx.$executeRawUnsafe(
          `UPDATE "DeliveryRoute"
              SET "completedStops" = "completedStops" + 1, "updatedAt" = $1
            WHERE "id" = $2 AND "tenantId" = $3`,
          now,
          stop.routeId,
          params.tenantId,
        );
      }
    });

    // 4. Fuera de la transacción: emitir el tracking event del Order (si delivered/failed)
    if (params.status === "delivered" || params.status === "failed") {
      await DeliveryTrackingDB.add({
        tenantId: params.tenantId,
        orderId: (
          await prisma.$queryRawUnsafe<Array<{ orderId: string }>>(
            `SELECT "orderId" FROM "DeliveryRouteStop" WHERE "id" = $1`,
            params.stopId,
          )
        )[0]?.orderId ?? "",
        status: params.status === "delivered" ? "delivered" : "failed",
        description:
          params.status === "delivered"
            ? "Entregado en domicilio"
            : params.failureReason ?? "Entrega fallida",
        lat: params.lat,
        lng: params.lng,
        actorType: "driver",
        photoUrl: params.proofPhotoUrl,
      });
    }

    invalidateByPrefix(`delivery:stops:${params.tenantId}`);
    invalidateByPrefix(`delivery:routes:${params.tenantId}`);

    logger.info("[DeliveryRouteStops] marked", {
      tenantId: params.tenantId,
      stopId: params.stopId,
      status: params.status,
    });
  },

  /**
   * Listar paradas de una ruta ordenadas por sequence — para mostrar el itinerario.
   */
  async listByRoute(tenantId: string, routeId: string): Promise<DbDeliveryRouteStop[]> {
    const cacheKey = `delivery:stops:${tenantId}:${routeId}`;

    return getOrSet(cacheKey, 20, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          routeId: string;
          orderId: string;
          sequence: number;
          status: string;
          address: string;
          addressDetail: string | null;
          lat: number | null;
          lng: number | null;
          customerName: string;
          customerPhone: string | null;
          estimatedArrivalAt: Date | null;
          actualArrivalAt: Date | null;
          completedAt: Date | null;
          failureReason: string | null;
          proofPhotoUrl: string | null;
          proofSignatureUrl: string | null;
          notes: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >(
        `SELECT "id","tenantId","routeId","orderId","sequence","status","address","addressDetail",
                "lat","lng","customerName","customerPhone","estimatedArrivalAt","actualArrivalAt",
                "completedAt","failureReason","proofPhotoUrl","proofSignatureUrl","notes",
                "createdAt","updatedAt"
           FROM "DeliveryRouteStop"
          WHERE "tenantId" = $1 AND "routeId" = $2
          ORDER BY "sequence" ASC`,
        tenantId,
        routeId,
      );

      return rows.map((r) => ({
        id:                 r.id,
        tenantId:           r.tenantId,
        routeId:            r.routeId,
        orderId:            r.orderId,
        sequence:           r.sequence,
        status:             r.status as RouteStopStatus,
        address:            r.address,
        addressDetail:      r.addressDetail,
        lat:                r.lat,
        lng:                r.lng,
        customerName:       r.customerName,
        customerPhone:      r.customerPhone,
        estimatedArrivalAt: toISO(r.estimatedArrivalAt),
        actualArrivalAt:    toISO(r.actualArrivalAt),
        completedAt:        toISO(r.completedAt),
        failureReason:      r.failureReason,
        proofPhotoUrl:      r.proofPhotoUrl,
        proofSignatureUrl:  r.proofSignatureUrl,
        notes:              r.notes,
        createdAt:          r.createdAt.toISOString(),
        updatedAt:          r.updatedAt.toISOString(),
      }));
    });
  },
};
