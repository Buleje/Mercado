/**
 * POST /api/cash-registers/yape — un Yape que llegó al celular, a la caja abierta.
 *
 * Lo llama el programa de la PC (`tools/mcp-buleje/yape-caja.mjs`) con la sesión
 * del panel. El negocio sale SIEMPRE del JWT, nunca del cuerpo. La ruta decide
 * si se anota o queda pendiente para que Brandon lo mire:
 *   · `sin_turno`           no hay caja abierta (o se cerró mientras llegaba);
 *   · `fuera_de_turno`      el aviso es de antes de abrir la caja de ahora (con `forzar`
 *                           —«Anotar igual»— va a la caja de ahora, fechado a su apertura);
 *   · `venta_yape_parecida` ya hay una venta por Yape del mismo monto ±10 min
 *                           (con `forzar` —«Es otro pago igual»— se anota igual).
 * `sin_turno` queda pendiente siempre, con o sin `forzar`.
 * Repetir el mismo aviso nunca deja una 2.ª fila (`idDeYapeEntrante`).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import {
  CashRegistersMovementsDB,
  idDeYapeEntrante,
  montoDesdeCentimos,
} from "@/lib/db/cash-registers-movements.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { ApiError, toErrorPayload } from "@/lib/api-error";

const YapeEntranteSchema = z.object({
  llave: z.string().regex(/^[a-f0-9]{32,64}$/), // hash de contenido
  montoCentimos: z.number().int().positive().max(500_000),
  pagador: z.string().trim().min(1).max(80),
  codigo: z.string().regex(/^\d{3}$/).optional(),
  nroOperacion: z.string().regex(/^\d{4,20}$/).optional(),
  recibidoEn: z.string().datetime(),
  forzar: z.boolean().optional(), // «Es otro pago igual» / «Anotar igual»
});

type MotivoPendiente = "sin_turno" | "fuera_de_turno" | "venta_yape_parecida";

export type YapeEntranteResp =
  | { estado: "anotado" | "ya_estaba"; movimientoId: string; cajaId: string }
  | { estado: "pendiente"; motivo: MotivoPendiente; detalle?: string };

const HORA_LIMA = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function pendiente(motivo: MotivoPendiente, detalle: string): NextResponse {
  return NextResponse.json({ estado: "pendiente", motivo, detalle } satisfies YapeEntranteResp);
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "cash-registers-yape"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo no es JSON" }, { status: 400 });
    }
    const parsed = YapeEntranteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }

    const tenantId = auth.tenantId;
    const d = parsed.data;
    const monto = montoDesdeCentimos(d.montoCentimos);
    const recibidoEn = new Date(d.recibidoEn);
    const movimientoId = idDeYapeEntrante(tenantId, d.llave);

    /* Primero «¿ya está?»: un reintento de un Yape anotado contesta lo mismo
       aunque la caja se haya cerrado después. */
    const ya = await withDbRetry(() => CashRegistersMovementsDB.buscarYapeEntrante(tenantId, movimientoId));
    if (ya) {
      return NextResponse.json({ estado: "ya_estaba", movimientoId: ya.id, cajaId: ya.cashRegisterId } satisfies YapeEntranteResp);
    }

    const caja = await withDbRetry(() => CashRegistersMovementsDB.cajaAbiertaParaYape(tenantId));
    if (!caja) return pendiente("sin_turno", `No hay caja abierta para anotar el Yape de S/ ${monto}.`);
    /* «Anotar igual» de un Yape que llegó antes de abrir: va a la caja de ahora con la hora
       de su apertura, para que el arqueo y «Cuentas» del día lo cuenten dentro del turno. */
    const antesDeAbrir = recibidoEn.getTime() < caja.openedAt.getTime();
    if (antesDeAbrir && !d.forzar) {
      return pendiente(
        "fuera_de_turno",
        `El Yape de S/ ${monto} llegó a las ${HORA_LIMA.format(recibidoEn)}, antes de abrir la caja (${HORA_LIMA.format(caja.openedAt)}).`,
      );
    }
    if (!d.forzar) {
      const parecida = await withDbRetry(() =>
        CashRegistersMovementsDB.ventaYapeParecida(tenantId, { montoCentimos: d.montoCentimos, recibidoEn }),
      );
      if (parecida) {
        return pendiente(
          "venta_yape_parecida",
          `Ya hay una venta por Yape de S/ ${monto} a las ${HORA_LIMA.format(parecida.cuando)}: puede ser este mismo pago.`,
        );
      }
    }

    const descripcion = [
      `Yape de ${d.pagador}`,
      d.codigo ? `cód. ${d.codigo}` : null,
      d.nroOperacion ? `op. ${d.nroOperacion}` : null,
      antesDeAbrir ? `llegó ${HORA_LIMA.format(recibidoEn)}, antes de abrir la caja` : null,
    ].filter(Boolean).join(" · ");

    const r = await withDbRetry(() =>
      CashRegistersMovementsDB.anotarYapeEntrante(tenantId, {
        cajaId: caja.id,
        movimientoId,
        montoCentimos: d.montoCentimos,
        descripcion,
        recibidoEn: antesDeAbrir ? caja.openedAt : recibidoEn, // max(llegada, apertura)
      }),
    );
    if (r.estado === "caja_cerrada") {
      return pendiente("sin_turno", `La caja se cerró mientras llegaba el Yape de S/ ${monto}.`);
    }

    if (r.estado === "anotado") {
      logActivity(
        "Crear", "movimiento_caja",
        `Yape entrante de S/${monto} — ${descripcion}${d.forzar ? " (anotado igual)" : ""}`,
        r.movimientoId, auth.username, undefined, tenantId,
      ).catch((err) => logger.error("[cash-yape] activity log falló", { error: String(err) }));
    }

    return NextResponse.json(r satisfies YapeEntranteResp, { status: r.estado === "anotado" ? 201 : 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      const { payload, status } = toErrorPayload(e);
      return NextResponse.json(payload, { status });
    }
    logger.error("[cash-yape] POST error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
