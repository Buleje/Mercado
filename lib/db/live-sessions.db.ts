/**
 * lib/db/live-sessions.db — STUB.
 *
 * Contrato de ADR-080 (Live Sessions broadcast). La migration de Prisma existe
 * (prisma/migrations/*_add_live_sessions/) pero aún NO está aplicada en la DB.
 * Hasta que `prisma migrate deploy` se ejecute, este stub mantiene el contrato
 * para compile-time + APIs responden 200 con arrays vacíos (graceful fallback).
 *
 * Al aplicar la migration + `prisma generate`, reemplazar este stub con la
 * implementación real que usa `prisma.liveSession`, `prisma.liveProduct`, etc.
 */

export type LiveStatus = "scheduled" | "live" | "ended" | "cancelled";
export type ModerationState = "approved" | "flagged" | "removed";
export type LiveViewerEventType =
  | "joined"
  | "left"
  | "heartbeat"
  | "product_click"
  | "add_to_cart"
  | "ordered";

export interface LiveSession {
  id: string;
  tenantId: string;
  storeId: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  status: LiveStatus;
  scheduledFor: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  streamUrl: string | null;
  recordingUrl: string | null;
  viewersPeak: number;
  viewersAvg: number;
  messagesCount: number;
  ordersGenerated: number;
  gmvSoles: string;
  categoryChips: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LiveProductRow {
  id: string;
  liveSessionId: string;
  tenantId: string;
  productId: number;
  featuredOrder: number;
  highlightedAt: Date | null;
  addedToCart: number;
  orderedCount: number;
  createdAt: Date;
}

export interface LiveChatMessageRow {
  id: string;
  liveSessionId: string;
  tenantId: string;
  userId: string | null;
  userName: string;
  message: string;
  moderationState: ModerationState;
  createdAt: Date;
}

export interface LiveSessionResult {
  session: LiveSession;
  products: LiveProductRow[];
  messages: LiveChatMessageRow[];
}

// Alias por compat: getById retorna LiveSessionResult (session + products + messages).
export type LiveSessionWithRelations = LiveSessionResult;

export interface LiveStats {
  viewersNow: number;
  messagesCount: number;
  addToCartCount: number;
  orderedCount: number;
}

export interface AdminLiveStats {
  totalLives: number;
  averageViewers: number;
  conversionRate: number;
  totalGmvSoles: number;
}

interface ScheduleSessionInput {
  title: string;
  description?: string | null;
  scheduledFor: Date | string;
  thumbnailUrl?: string | null;
  categoryChips?: string[];
  storeId?: string | null;
}

interface TrackViewerEventInput {
  eventType: LiveViewerEventType;
  userId?: string | null;
  anonymousId?: string | null;
  productId?: number | null;
  sessionId: string;
  tenantId?: string | null;
}

const EMPTY_STATS: LiveStats = {
  viewersNow: 0,
  messagesCount: 0,
  addToCartCount: 0,
  orderedCount: 0,
};

const EMPTY_ADMIN_STATS: AdminLiveStats = {
  totalLives: 0,
  averageViewers: 0,
  conversionRate: 0,
  totalGmvSoles: 0,
};

/**
 * Stub: devuelve datos vacíos / not-found para mantener contrato hasta que
 * `prisma migrate deploy` + `prisma generate` incorporen las tablas reales.
 */
export const LiveSessionsDB = {
  async listActive(_tenantId?: string | null): Promise<LiveSession[]> {
    return [];
  },
  async listScheduled(_tenantId?: string | null, _limitDays?: number): Promise<LiveSession[]> {
    return [];
  },
  async listPast(_tenantId?: string | null, _limit?: number): Promise<LiveSession[]> {
    return [];
  },
  async getById(
    _tenantId: string | null,
    _id: string,
  ): Promise<LiveSessionResult | null> {
    return null;
  },
  async scheduleSession(
    _tenantId: string,
    _data: ScheduleSessionInput,
  ): Promise<LiveSessionResult> {
    throw new Error("LiveSessionsDB.scheduleSession — stub: aplicar migration prisma primero");
  },
  async startLive(_tenantId: string, _id: string): Promise<LiveSessionResult> {
    throw new Error("LiveSessionsDB.startLive — stub");
  },
  async endLive(_tenantId: string, _id: string): Promise<LiveSessionResult> {
    throw new Error("LiveSessionsDB.endLive — stub");
  },
  async addProductToLive(
    _tenantId: string,
    _sessionId: string,
    _productId: number,
    _featuredOrder?: number,
  ): Promise<LiveProductRow> {
    throw new Error("LiveSessionsDB.addProductToLive — stub");
  },
  async highlightProduct(
    _tenantId: string,
    _sessionId: string,
    _productId: number,
  ): Promise<LiveProductRow | null> {
    return null;
  },
  async postChatMessage(
    _tenantId: string,
    _sessionId: string,
    _userId: string | null,
    _userName: string,
    _message: string,
  ): Promise<LiveChatMessageRow> {
    throw new Error("LiveSessionsDB.postChatMessage — stub");
  },
  async listChatMessages(
    _tenantId: string | null,
    _sessionId: string,
    _since?: Date | string | null,
    _limit?: number,
  ): Promise<LiveChatMessageRow[]> {
    return [];
  },
  async trackViewerEvent(_data: TrackViewerEventInput): Promise<void> {
    // fire-and-forget, no-op
  },
  async getLiveStats(_tenantId: string | null, _sessionId: string): Promise<LiveStats> {
    return EMPTY_STATS;
  },
  async getAdminStats(_tenantId: string): Promise<AdminLiveStats> {
    return EMPTY_ADMIN_STATS;
  },
};
