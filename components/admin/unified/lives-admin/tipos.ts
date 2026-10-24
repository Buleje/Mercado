/** Una transmisión como la devuelve `GET /api/admin/lives` (las fechas llegan en texto). */
export interface TransmisionDto {
  id: string;
  title: string;
  description: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduledFor: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  viewersPeak: number;
  viewersAvg: number;
  ordersGenerated: number;
  gmvSoles: string;
}

export interface EstadisticasLives {
  totalLives: number;
  averageViewers: number;
  conversionRate: number;
  totalGmvSoles: number;
}

export interface RespuestaLives {
  active: TransmisionDto[];
  upcoming: TransmisionDto[];
  past: TransmisionDto[];
  stats: EstadisticasLives;
}
