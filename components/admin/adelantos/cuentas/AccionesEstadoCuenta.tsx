"use client";

/**
 * WhatsApp + PDF del estado de cuenta de una persona (ADR-412 §5).
 *
 * El detalle línea a línea NO viaja con el resumen (`/api/adelantos/cuentas`
 * ya es pesado para un tenant grande): se pide bajo demanda, recién al tocar
 * un botón, a `/api/adelantos/cuentas/estado`.
 *
 * Esa ruta puede rechazar con motivo (409 si la persona y la parte no son la
 * misma cuenta, 404 si la parte no existe): el mensaje del servidor se
 * muestra TAL CUAL, junto al botón que falló — no un genérico que esconde
 * por qué.
 */

import { useState } from "react";
import { FileDown, MessageCircle } from "@buleje/design-system/icons";
import { useSettingsSafe } from "@/contexts/settings-context";
import { logger } from "@/lib/logger";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { resumenWhatsApp, type LineaEstadoCuenta, type TotalesEstadoCuenta, type DatosPago } from "@/lib/adelantos/estado-cuenta-unificado";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";

type DetalleApi = { lineas: LineaEstadoCuenta[]; totales: TotalesEstadoCuenta; pago: DatosPago | null };
type Accion = "whatsapp" | "pdf";
type ResultadoDetalle = { ok: true; detalle: DetalleApi } | { ok: false; message: string };

const MENSAJE_GENERICO = "No se pudo armar el estado de cuenta";

async function pedirDetalle(persona: CuentaPersona): Promise<ResultadoDetalle> {
  const params = new URLSearchParams();
  if (persona.beneficiarioId) params.set("beneficiario", persona.beneficiarioId);
  if (persona.parteId) params.set("parte", persona.parteId);
  if (!params.toString()) return { ok: false, message: MENSAJE_GENERICO };
  try {
    const res = await fetch(`/api/adelantos/cuentas/estado?${params.toString()}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch((err) => {
        logger.warn("[AccionesEstadoCuenta] respuesta de error sin JSON", { error: String(err) });
        return null;
      });
      return { ok: false, message: body?.message ?? MENSAJE_GENERICO };
    }
    return { ok: true, detalle: (await res.json()) as DetalleApi };
  } catch {
    return { ok: false, message: MENSAJE_GENERICO };
  }
}

const btnCls =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50";

/** El motivo del error, en el tono de advertencia del DS (AA: -700 claro / -500 oscuro). */
function MotivoError({ mensaje }: { mensaje: string }) {
  return (
    <span role="alert" className="min-w-0 break-words text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
      {mensaje}
    </span>
  );
}

export default function AccionesEstadoCuenta({ persona }: { persona: CuentaPersona }) {
  const settings = useSettingsSafe();
  const [cargando, setCargando] = useState<Accion | null>(null);
  const [errores, setErrores] = useState<Record<Accion, string | null>>({ whatsapp: null, pdf: null });

  const conDetalle = async (accion: Accion): Promise<DetalleApi | null> => {
    setCargando(accion);
    setErrores((e) => ({ ...e, [accion]: null }));
    const r = await pedirDetalle(persona);
    setCargando(null);
    if (!r.ok) {
      setErrores((e) => ({ ...e, [accion]: r.message }));
      return null;
    }
    return r.detalle;
  };

  const mandarWhatsApp = async () => {
    const detalle = await conDetalle("whatsapp");
    if (!detalle) return;
    const resumen = resumenWhatsApp(persona.nombre, detalle.lineas, detalle.totales, detalle.pago);
    const url = enlaceWhatsAppConTexto(persona.telefono, resumen);
    if (!url) {
      setErrores((e) => ({ ...e, whatsapp: `${persona.nombre} no tiene teléfono cargado` }));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const descargarPdf = async () => {
    const detalle = await conDetalle("pdf");
    if (!detalle) return;
    const { descargarEstadoDeCuenta } = await import("@/lib/adelantos/pdf-estado-cuenta");
    await descargarEstadoDeCuenta({
      negocio: settings?.businessName ?? null,
      persona: persona.nombre,
      documento: persona.documento,
      lineas: detalle.lineas,
      totales: detalle.totales,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={mandarWhatsApp}
        disabled={!persona.telefono || cargando !== null}
        aria-label={persona.telefono ? `Mandar el estado de cuenta a ${persona.nombre} por WhatsApp` : `${persona.nombre} no tiene teléfono cargado`}
        title={persona.telefono ? undefined : "Sin teléfono cargado"}
        className={btnCls}
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        {cargando === "whatsapp" ? "Armando…" : "WhatsApp"}
      </button>
      {/* El motivo tiene que VERSE, no sólo estar en el `title` (eso pide
          hover, inútil en el celular donde se manda el WhatsApp). */}
      {!persona.telefono && <span className="text-xs text-[var(--text-tertiary)]">Sin teléfono</span>}
      {errores.whatsapp && <MotivoError mensaje={errores.whatsapp} />}

      <button
        type="button"
        onClick={descargarPdf}
        disabled={cargando !== null}
        aria-label={`Descargar el estado de cuenta de ${persona.nombre} en PDF`}
        className={btnCls}
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        {cargando === "pdf" ? "Generando…" : "PDF"}
      </button>
      {errores.pdf && <MotivoError mensaje={errores.pdf} />}
    </div>
  );
}
