import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { construirAviso } from "@/lib/forestal/ctp-aviso-plazos";
import { documentosVencimientoDeFicha } from "@/lib/forestal/ctp-ficha-types";
import { logger } from "@/lib/logger";

/**
 * Aviso de plazos del Libro CTP (SERFOR).
 *
 * El Libro ya sabía marcar lo que estaba fuera de plazo, pero **sólo al abrir el
 * panel**: la guía llegaba el viernes, el dueño entraba el lunes y ya se había
 * pasado. Registrar fuera de los 2 días hábiles es de lo primero que mira una
 * fiscalización, así que el aviso tiene que salir a buscarlo a él.
 *
 * Corre una vez al día. Sólo interrumpe por lo accionable HOY: guías del monte
 * cuyo plazo está por vencerse o ya venció, producto despachado sin GTF de
 * salida, y saldos negativos. Lo ya registrado fuera de plazo se cuenta en el
 * panel pero no dispara WhatsApp: no se puede arreglar hoy, y un aviso que no se
 * puede accionar enseña a ignorar los avisos.
 *
 * Anti-spam: `NotificationCenterDB.createOrReuse` con ventana de 20 h, igual que
 * el cron de contratos.
 */

/** Tenants con algo en el libro forestal: al resto no hay que molestarlo. */
async function tenantsForestales(): Promise<string[]> {
  const [conGuias, conLibro] = await Promise.all([
    prisma.forestGtf.findMany({
      where: { deletedAt: null },
      select: { tenantId: true },
      distinct: ["tenantId"],
    }),
    prisma.forestCtpEntry.findMany({
      where: { deletedAt: null },
      select: { tenantId: true },
      distinct: ["tenantId"],
    }),
  ]);
  return [...new Set([...conGuias, ...conLibro].map((r) => r.tenantId))];
}

export const GET = withCronAuth("forestal-plazos", async () => {
  const hoy = new Date();
  const tenants = await tenantsForestales();

  let revisados = 0;
  let conAviso = 0;
  let whatsappEnviados = 0;
  let whatsappFallidos = 0;
  let sinTelefono = 0;

  for (const tenantId of tenants) {
    revisados += 1;
    try {
      const [guias, saldos, despachos] = await Promise.all([
        ForestGtfDB.sinIngresarAlCtp(tenantId),
        ForestCtpDB.saldos(tenantId),
        ForestCtpDB.list(tenantId, { section: "despacho" }),
      ]);

      const despachosSinGtf = despachos.entries.filter(
        (e) => !e.gtfNumber || !String(e.gtfNumber).trim(),
      ).length;

      // `tenantId` en las tablas forestales viene MIXTO: unas filas guardan el
      // cuid del tenant y otras el slug ("main"). Buscar sólo por `id` dejaba a
      // esos tenants sin teléfono y, por lo tanto, sin WhatsApp — el aviso se
      // creaba en la campana y nadie se enteraba.
      const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ id: tenantId }, { slug: tenantId }] },
        select: { id: true, ownerPhone: true, name: true },
      });

      // La Ficha CTP (KV) se guarda SIEMPRE con el cuid canónico
      // (`auth.tenantId` del endpoint `ctp-ficha`, nunca el slug) — hay que
      // resolverlo primero o un tenant cuyo `tenantId` de tabla es el slug
      // ("main") consultaría una clave que nunca existió y perdería sus
      // documentos vencidos en silencio.
      const ficha = await ForestCtpFichaDB.get(tenant?.id ?? tenantId);
      const { vencidosLabels: documentosVencidosLabels } = documentosVencimientoDeFicha(ficha, hoy.getTime());

      // Sin fecha de guía no hay plazo que calcular: se saltea en vez de
      // inventarle una fecha y avisar de un vencimiento que no existe.
      const conFecha = guias.filter((g) => g.gtfDate != null);
      if (conFecha.length !== guias.length) {
        logger.warn("[cron/forestal-plazos] guías sin gtfDate, no se evalúan", {
          tenantId,
          sinFecha: guias.length - conFecha.length,
        });
      }

      const aviso = construirAviso(
        {
          guiasSinIngresar: conFecha.map((g) => ({
            gtfNumber: g.gtfNumber,
            gtfDate: g.gtfDate as Date,
            titularName: g.titularName,
            volumenTotalM3: g.volumenTotalM3 ? Number(g.volumenTotalM3) : null,
          })),
          despachosSinGtf,
          saldosNegativos: saldos.materiaPrima.especiesEnNegativo,
          fueraDePlazo: 0,
          documentosVencidosLabels,
        },
        hoy,
        tenant?.name ?? undefined,
      );

      if (!aviso.hayQueAvisar) continue;
      conAviso += 1;

      await NotificationCenterDB.createOrReuse({
        tenantId,
        type: "CTP_PLAZO_SERFOR",
        severity: aviso.severidad,
        title: aviso.titulo,
        body: aviso.resumen,
        actionUrl: "/admin?tab=ctp-libro-operaciones",
        actionLabel: "Abrir el Libro CTP",
        dedupWindowHours: 20,
      });

      const phone = tenant?.ownerPhone?.replace(/\D/g, "");
      if (!phone || phone.length < 9) {
        sinTelefono += 1;
        logger.warn("[cron/forestal-plazos] tenant sin ownerPhone", { tenantId });
        continue;
      }

      const ok = await sendWhatsAppText(phone, aviso.whatsapp).catch((err) => {
        logger.error("[cron/forestal-plazos] whatsapp falló", {
          tenantId,
          err: String(err).slice(0, 200),
        });
        return false;
      });
      if (ok) whatsappEnviados += 1;
      else {
        whatsappFallidos += 1;
        logger.error("[cron/forestal-plazos] whatsapp NO enviado", { tenantId });
      }
    } catch (err) {
      // Un tenant que falla no puede dejar sin aviso a los demás.
      logger.error("[cron/forestal-plazos] tenant failed", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({
    ok: true,
    revisados,
    conAviso,
    whatsappEnviados,
    whatsappFallidos,
    sinTelefono,
  });
});
