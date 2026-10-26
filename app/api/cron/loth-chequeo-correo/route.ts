import { NextResponse } from "next/server";
import { z } from "zod";
import { withCronAuth } from "@/lib/cron-auth";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestLothChequeoDB } from "@/lib/db/forest-loth-chequeo.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { sendReporteDiario } from "@/lib/email/resend";
import { registrarEnvioCorreo } from "@/lib/avisos-correo";
import { enmascararCorreo } from "@/lib/avisos-correo-tipos";
import { correoDelChequeoDeHoy, destinoDelCorreoChequeo } from "@/lib/forestal/loth-chequeo-correo-server";
import { planearCorreoChequeo, registroCambia } from "@/lib/forestal/loth-chequeo-correo";
import { logger } from "@/lib/logger";

/**
 * El correo del chequeo del Libro TH (26-10, Brandon: «que el chequeo te mande
 * un correo el día que aparece algo que puede multar»). Corre 07:00 de Lima.
 *
 * Por cada negocio con el Libro TH (`spec:forestal:loth-libro`), correo del
 * dueño y el interruptor «forestal» prendido: corre el chequeo avanzado y
 * manda UN correo sólo si hay algo NUEVO que puede multar (severidad multa, o
 * una advertencia con plazo a 7 días o menos). Qué es nuevo y la caducidad:
 * `loth-chequeo-correo`. Lo avisado se sella SÓLO si el correo salió; si
 * falló, mañana se reintenta. Cada envío queda en NotificationLog.
 *
 * Un negocio que falla no corta a los demás.
 *
 * `?probar=1` (o `?ensayo=1`): arma el correo de cada negocio y lo devuelve
 * (asunto, destino enmascarado, HTML) SIN enviar ni tocar el registro; corre el
 * chequeo aunque no haya correo o el interruptor esté apagado, para ver qué
 * diría. `&tenantId=` lo limita a un negocio.
 */

const QuerySchema = z.object({
  probar: z.enum(["0", "1"]).optional(),
  ensayo: z.enum(["0", "1"]).optional(),
  tenantId: z.string().trim().min(1).max(64).optional(),
});

interface Ensayo {
  tenantId: string;
  negocio: string | null;
  destino: string | null;
  sale: boolean;
  motivo: string | null;
  avisos: number;
  nuevos: number;
  asunto: string | null;
  sinLeer: string[];
  html: string | null;
}

const PRESUPUESTO_MS = 100_000;

export const GET = withCronAuth("loth-chequeo-correo", async (req) => {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  const probar = parsed.data.probar === "1" || parsed.data.ensayo === "1";
  const soloTenant = parsed.data.tenantId ?? null;
  const ahora = Date.now();
  const r = {
    probar,
    revisados: 0,
    sinEspecialidad: 0,
    sinCorreo: 0,
    apagados: 0,
    sinNovedad: 0,
    enviados: 0,
    fallidos: 0,
    fallaron: 0,
    /** Negocios que quedaron para mañana por el tope de tiempo. */
    pendientes: 0,
    ensayo: [] as Ensayo[],
  };

  const tenants = await ForestLothDB.tenantsConLibroTh();
  for (const [i, tenantId] of tenants.entries()) {
    if (soloTenant && tenantId !== soloTenant) continue;
    /* Tope de tiempo (~6 s por negocio; `maxDuration` 120 s en vercel.json): cortar a
       los 100 s con registro, no a ciegas por Vercel. Lo que queda se avisa mañana
       (nada se sella sin enviar). */
    if (Date.now() - ahora > PRESUPUESTO_MS) {
      r.pendientes = tenants.length - i;
      logger.warn("[cron/loth-chequeo-correo] tope de tiempo: quedan negocios para mañana", { pendientes: r.pendientes });
      break;
    }
    r.revisados += 1;
    try {
      if (!(await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro"))) {
        r.sinEspecialidad += 1;
        continue;
      }
      const destino = await destinoDelCorreoChequeo(tenantId);
      const motivo = !destino.correo ? "falta el correo del negocio" : !destino.activo ? "los avisos forestales por correo están apagados" : null;
      if (motivo && !probar) {
        if (!destino.correo) r.sinCorreo += 1;
        else r.apagados += 1;
        continue;
      }

      const d = await correoDelChequeoDeHoy(tenantId, destino.negocio, ahora);

      if (probar) {
        r.ensayo.push({
          tenantId,
          negocio: destino.negocio,
          destino: enmascararCorreo(destino.correo),
          sale: !motivo && d.correo != null,
          motivo: motivo ?? (d.correo ? null : d.plan.avisos.length > 0 ? "ya te avisé todo lo de hoy" : "nada que pueda multarte"),
          avisos: d.plan.avisos.length,
          nuevos: d.plan.nuevos.length,
          asunto: d.correo?.asunto ?? null,
          sinLeer: d.chequeo.sinLeer,
          html: d.correo?.html ?? null,
        });
        continue;
      }

      let salio = false;
      const correo = destino.correo;
      if (d.correo && correo) {
        const res = await sendReporteDiario(correo, d.correo.asunto, d.correo.html);
        const fallo = res?.error?.message ?? null;
        if (fallo) {
          r.fallidos += 1;
          logger.error("[cron/loth-chequeo-correo] correo NO enviado", { tenantId, err: fallo.slice(0, 200) });
        } else {
          salio = true;
          r.enviados += 1;
        }
        await registrarEnvioCorreo(tenantId, "forestal", correo, !fallo, fallo ?? d.correo.asunto);
      } else {
        r.sinNovedad += 1;
      }

      /* Bajo el candado se vuelve a planear con lo que haya guardado (otra corrida pudo sellar antes). */
      const { checks, sinLeer, hoy } = d.chequeo;
      await ForestLothChequeoDB.guardarAvisadosPorCorreo(tenantId, (actual) => {
        const p = planearCorreoChequeo({ checks, sinLeer, registro: actual, hoy });
        const siguiente = salio ? p.registroSiSale : p.registroSiNoSale;
        return registroCambia(actual, siguiente) ? siguiente : null;
      });
    } catch (err) {
      r.fallaron += 1;
      // Un negocio que falla no puede dejar sin aviso a los demás.
      logger.error("[cron/loth-chequeo-correo] tenant failed", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json(r);
});
