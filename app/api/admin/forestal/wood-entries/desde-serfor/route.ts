import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { GuiasGuardadasDB } from "@/lib/db/guias-guardadas.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { esNumeroRegistroValido, normalizarNumeroRegistro } from "@/lib/forestal/serfor-gtf";
import { consultarGtfEnSerfor } from "@/lib/forestal/serfor-gtf-fetch";
import { repartirGtfEnIngresos } from "@/lib/forestal/serfor-gtf-a-ingresos";
import { gtfDatosDesdeSerfor } from "@/lib/forestal/serfor-gtf-a-datos";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { ORIGEN_SERFOR, regionDeSerfor } from "@/lib/forestal/serfor-origen";
import type { WoodOriginType } from "@/lib/generated/prisma/client";
import { documentoDelTitular } from "@/lib/forestal/serfor-titular";

/**
 * POST /api/admin/forestal/wood-entries/desde-serfor
 *
 * Registra una GTF completa en el libro: **un ingreso por especie declarada**,
 * con su lista de trozas, todo en una transacción (ADR-312).
 *
 * El cuerpo trae el **N° de registro**, no la ficha: la ficha la vuelve a pedir
 * este endpoint. Aceptar la que manda el navegador sería aceptar cualquier
 * ficha —un POST a mano metería al libro una guía inexistente con el sello de
 * "verificado en SERFOR" puesto por nosotros—, y la verificación que no hace el
 * servidor no es verificación.
 */

/** Hasta cuántos días vale la ficha guardada con la guía si SERFOR no responde
 *  (ADR-442): una GTF vence en días y SERFOR puede anularla después. */
const FICHA_GUARDADA_MAX_DIAS = 30;

const Body = z.object({
  numeroRegistro: z.string().trim().min(1).max(30),
  /** Lo que la guía NO trae y el CTP sí necesita. */
  entryDate: z.coerce.date().optional(),
  ctpProductCode: z.string().trim().max(60).nullable().optional(),
  humidityPct: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/**
 * El documento del proveedor que guarda el libro: el del TITULAR, o nada.
 *
 * Antes tomaba primero `rucInstancia` —el RUC de la ATFFS o del Gobierno
 * Regional que REGISTRÓ la guía— y lo guardaba como si fuera del proveedor:
 * medido 2026-09-25 en Blas, 26 de 26 ingresos, y el RUC 20562836927 en dos
 * titulares distintos. Ahora sale de `documentoDelTitular` (el del propietario
 * del producto, sólo si es el mismo titular); si la guía no lo trae, va vacío.
 */
function docDelTitular(
  gtf: Parameters<typeof documentoDelTitular>[0],
): { providerDocument: string | null; providerDocumentType: "RUC" | "DNI" | null } {
  const d = documentoDelTitular(gtf);
  return { providerDocument: d?.numero ?? null, providerDocumentType: d?.tipo ?? null };
}

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_IA", "forestal:gtf-serfor-alta");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    if (!habilitado) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }
    const numero = normalizarNumeroRegistro(parsed.data.numeroRegistro);
    if (!esNumeroRegistroValido(numero)) {
      return NextResponse.json(
        { error: "numero_invalido", message: "El N° de registro va con sus guiones, como lo imprime la guía. Ejemplo: 2-25-0002326." },
        { status: 400 },
      );
    }

    // 1 · La ficha, pedida por el servidor. La guía guardada antes (ADR-442),
    //     si la hay, aporta el permiso elegido y el respaldo sin SERFOR.
    const [consulta, guardada] = await Promise.all([
      consultarGtfEnSerfor(numero),
      GuiasGuardadasDB.filaPor(auth.tenantId, { numeroRegistro: numero }),
    ]);
    let gtf: GtfSerfor;
    let fichaGuardada = false;
    /* Un 200 de mantenimiento llega `ok` con estado «sin_respuesta»: para el
       respaldo cuenta igual que SERFOR caído. */
    const serforCaido = !consulta.ok || consulta.resultado.estado === "sin_respuesta";
    if (serforCaido) {
      /* ADR-442: si SERFOR no responde y la guía se guardó antes con su ficha
         —pedida por ESTE servidor, nunca la del navegador—, se registra con
         esa. El camión no espera a que SERFOR vuelva. */
      const vigente =
        guardada?.serforGtf &&
        guardada.serforConsultadaEn &&
        Date.now() - guardada.serforConsultadaEn.getTime() <= FICHA_GUARDADA_MAX_DIAS * 86_400_000;
      if (!guardada || !vigente) {
        const mensaje = consulta.ok ? (consulta.resultado.mensaje ?? "SERFOR no respondió.") : consulta.mensaje;
        return NextResponse.json(
          {
            error: "serfor_sin_respuesta",
            message: guardada?.serforGtf
              ? `${mensaje} La ficha guardada con la guía tiene más de ${FICHA_GUARDADA_MAX_DIAS} días: vuelve a intentar cuando SERFOR responda.`
              : mensaje,
          },
          { status: 502 },
        );
      }
      gtf = guardada.serforGtf as unknown as GtfSerfor;
      fichaGuardada = true;
    } else if (!consulta.ok || consulta.resultado.estado !== "encontrada" || !consulta.resultado.gtf) {
      return NextResponse.json(
        { error: "guia_no_encontrada", message: (consulta.ok && consulta.resultado.mensaje) || "SERFOR no encontró esa guía." },
        { status: 404 },
      );
    } else {
      gtf = consulta.resultado.gtf;
    }

    // 2 · Repartir en ingresos: uno por especie, con sus trozas.
    const reparto = repartirGtfEnIngresos(gtf);
    if (!reparto.ok) {
      return NextResponse.json({ error: "guia_incompleta", message: reparto.motivo }, { status: 422 });
    }
    if (!gtf.gtfNumber?.trim()) {
      return NextResponse.json(
        { error: "guia_incompleta", message: "La guía no trae su N° de GTF. Cárgala a mano." },
        { status: 422 },
      );
    }

    const permisoGuardadoVigente =
      guardada?.contratoId && (await ForestContratoDB.get(auth.tenantId, guardada.contratoId))
        ? guardada.contratoId
        : null;

    // 3 · Los datos del documento que el libro guarda como cabecera.
    const regionCatalogo = regionDeSerfor(gtf.departamento);
    const originType = (ORIGEN_SERFOR[(gtf.origenRecurso ?? "").toUpperCase()] ?? "otro") as WoodOriginType;
    const aFecha = (f: string | null) => {
      const m = (f ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`) : null;
    };

    const creados = await WoodEntriesDB.createDesdeGtfSerfor(auth.tenantId, {
      entryDate: parsed.data.entryDate ?? new Date(),
      docType: "GTF",
      serforNumeroRegistro: gtf.numeroRegistro || numero,
      serforGtf: gtf as unknown as Record<string, unknown>,
      // La MISMA ficha leída como cuerpo de guía (ADR-336): propietario del
      // producto, destinatario y transportista quedan consultables, no sólo
      // dentro del blob. Se calcula acá —en el servidor, con la ficha que el
      // servidor pidió— y no en el navegador.
      gtfDatos: gtfDatosDesdeSerfor(gtf) as unknown as Record<string, unknown>,
      gtfNumber: gtf.gtfNumber.trim(),
      gtfDate: aFecha(gtf.fechaExpedicion),
      providerName: gtf.titular?.trim() || "Sin titular declarado",
      // El documento del TITULAR (nunca el RUC de la instancia que registra),
      // con su tipo deducido del número que se guarda.
      ...docDelTitular(gtf),
      originType,
      originCode: gtf.numeroTitulo ?? null,
      // El permiso que se eligió al guardar la guía; sin él, el servidor lo
      // deduce del código del título (como siempre).
      // Si ese permiso se dio de baja después (el código se puede volver a
      // cargar con otro id), se deduce del código del título: el modo SERFOR
      // no tiene selector de permiso y un 422 dejaba la guía sin poder entrar.
      contratoId: permisoGuardadoVigente ?? undefined,
      originSourceNumber: gtf.numeroResolucion ?? null,
      // "Otra" no es una región: en la columna del libro se guarda vacío.
      originRegion: regionCatalogo && regionCatalogo !== "Otra" ? regionCatalogo : null,
      originDistrict: gtf.distrito ?? null,
      ctpProductCode: parsed.data.ctpProductCode ?? null,
      humidityPct: parsed.data.humidityPct ?? null,
      notes: parsed.data.notes ?? null,
      lineas: reparto.ingresos.map((l) => {
        // La especie del catálogo aporta el nombre científico y la bandera CITES
        // (que la guía no declara). Si no está en el catálogo, vale lo que dice
        // el documento: no se descarta una especie por no tenerla fichada.
        const cat = findSpeciesByCommonName(l.especieComun);
        return {
          especieComun: l.especieComun,
          especieCientifica: l.especieCientifica ?? cat?.scientificName ?? null,
          cites: cat?.cites ?? false,
          unit: "m3",
          // La presentación viaja por línea: una guía puede amparar trozas de
          // una especie y piezas de otra.
          presentacion: l.presentacion,
          volumenM3: l.volumenM3,
          piezas: l.piezas,
          trozas: l.trozas,
        };
      }),
      createdBy: auth.username ?? "unknown",
    });

    /* ADR-442: los papeles de la guía guardada pasan a este ingreso (sólo hace
       falta si la GTF quedó escrita distinto; con la misma, ya aparecen). Si
       la guía se guardó a mano, recibe ahora la ficha oficial: así su carpeta
       y la del «Guardar en el expediente» son la misma. */
    GuiasGuardadasDB.alRegistrarIngreso(
      auth.tenantId,
      { gtfNumber: gtf.gtfNumber.trim(), serforNumeroRegistro: gtf.numeroRegistro || numero },
      auth.username ?? "unknown",
      fichaGuardada ? null : gtf,
    ).catch((err) => logger.error("[wood-entries.desde-serfor] enlazar guía guardada failed", { error: String(err) }));
    if (fichaGuardada && guardada) {
      /* Un ingreso con la ficha guardada no es uno verificado en vivo: queda
         dicho en la auditoría, con la fecha de esa ficha. */
      auditCtp({
        tenantId: auth.tenantId,
        action: "ctp_guia_guardada_editar",
        entity: "ForestGuiaGuardada",
        entityId: guardada.id,
        detail: `SERFOR no respondió: la GTF ${gtf.gtfNumber} entró al libro con la ficha guardada el ${guardada.serforConsultadaEn?.toISOString().slice(0, 10) ?? "s/f"}`,
        user: auth.username ?? "unknown",
      });
    }

    return NextResponse.json({
      ok: true,
      fichaGuardada,
      ingresos: creados.map((e) => ({
        id: e.id,
        libroNro: e.libroNro,
        especie: e.speciesCommonName,
        volumeM3: Number(e.volumeM3),
        pieces: e.pieces,
      })),
      gtfNumber: gtf.gtfNumber,
      numeroRegistro: gtf.numeroRegistro || numero,
      trozas: reparto.ingresos.reduce((a, l) => a + l.trozas.length, 0),
      avisos: fichaGuardada
        ? [
            ...reparto.avisos,
            `SERFOR no respondió: se registró con la ficha guardada el ${guardada?.serforConsultadaEn?.toISOString().slice(0, 10) ?? "s/f"}.`,
          ]
        : reparto.avisos,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof CtpInvariantError) {
      return NextResponse.json({ error: e.code, message: e.message, detail: e.detail }, { status: 409 });
    }
    logger.error("[wood-entries.desde-serfor] error", {
      err: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.slice(0, 900) : undefined,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
