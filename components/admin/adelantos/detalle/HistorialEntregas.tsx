"use client";

/**
 * El historial de entregas de un adelanto (salió de `DetalleAdelantoModal`).
 *
 * Una entrega que salió de una cubicación de trozas (ADR-478) se rotula con lo
 * que la madera fue —«Madera · CUB-2026-0003 · 34 trozas · 2 140 PT»— y abre
 * sus medidas congeladas con «Ver medidas», en sólo lectura.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CardTitle } from "@buleje/design-system";
import { CheckCircle, Package, Ruler } from "@buleje/design-system/icons";
import type { DbAdelantoEntrega } from "@/lib/db/adelantos.db";
import { formatDate } from "@/lib/format";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import { fmtMon } from "../shared";
import { useMiRol } from "@/hooks/use-mi-rol";

/* El visor es del módulo forestal: se baja sólo cuando alguien lo abre. */
const VerCubicacion = dynamic(() => import("@/components/admin/forestal/cubicador-trozas-valorizar"), { ssr: false });

/** «… · 2 140 PT» → la fórmula: la unidad del volumen va en la descripción que escribe el servidor. */
const formulaDe = (descripcion: string | null | undefined) => (/\bm³/.test(descripcion ?? "") ? "smalian" : "oxapampina");
/* Los que pasan el GET de la cubicación (ROLES_CUBICAR + gestión): al analista, que lee Adelantos, el visor le daba 403. */
const VEN_MEDIDAS = new Set(["admin", "owner", "almacenero", "manager", "superadmin"]);

export default function HistorialEntregas({
  entregas, moneda, recibido,
}: {
  entregas: DbAdelantoEntrega[];
  moneda: string;
  recibido: boolean;
}) {
  const [cubicacion, setCubicacion] = useState<string | null>(null);
  const rol = useMiRol();
  /* Escape con las medidas abiertas cierra SÓLO las medidas. La ficha de abajo
     (`ModalShell`) escucha en `window` y Radix cierra las medidas en `document`
     (captura): al cerrarse, React quita cualquier oyente de este efecto ANTES
     de que el evento suba a `window` (medido 08-10: se cerraban las dos). Por
     eso se corta en `window` en captura, primero que nadie, y se cierra acá. */
  useEffect(() => {
    if (!cubicacion) return;
    const corta = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setCubicacion(null);
    };
    window.addEventListener("keydown", corta, true);
    return () => window.removeEventListener("keydown", corta, true);
  }, [cubicacion]);
  return (
    <div>
      <CardTitle className="mb-2 text-base font-extrabold text-[var(--text-primary)]">
        {recibido ? "Lo que le diste" : "Historial de entregas"} ({entregas.length})
      </CardTitle>
      {entregas.length === 0 ? (
        <p className="text-base text-[var(--text-tertiary)]">Todavía no hay entregas.</p>
      ) : (
        <ul className="space-y-2">
          {entregas.map((e) => {
            const madera = !!e.cubicacionId;
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-[var(--rule-soft)] px-4 py-3" data-cubicacion={e.cubicacionId ?? undefined}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--data-success)]/10 text-[var(--data-success)]">
                  {madera ? <Ruler className="h-4 w-4" /> : e.tipo === "PRODUCTO" ? <Package className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-[var(--text-primary)]" title={e.descripcion ?? undefined}>
                    {e.descripcion || (e.tipo === "PRODUCTO" ? `Producto #${e.productId}` : "Entrega")}
                  </p>
                  <p className="text-sm tabular-nums text-[var(--text-tertiary)]">
                    {formatDate(e.fecha)}
                    {e.cantidad != null && (madera ? ` · ${fmtVolumen(e.cantidad, formulaDe(e.descripcion))} en este adelanto` : ` · ${e.cantidad} u.`)}
                    {e.sumadoAStock && " · sumado al stock"}
                    {madera && rol != null && VEN_MEDIDAS.has(rol) && (
                      <>
                        {" · "}
                        <button type="button" onClick={() => setCubicacion(e.cubicacionId ?? null)} className="font-semibold text-[var(--accent-dark)] underline-offset-2 hover:underline dark:text-[var(--accent)]">
                          Ver medidas
                        </button>
                      </>
                    )}
                  </p>
                </div>
                {e.comprobanteUrl && (
                  <a href={e.comprobanteUrl} target="_blank" rel="noopener noreferrer" title="Ver comprobante" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail comprobante */}
                    <img src={e.comprobanteUrl} alt="comprobante" className="h-9 w-9 rounded-lg border border-[var(--rule-base)] object-cover" />
                  </a>
                )}
                <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--data-success)]">{fmtMon(e.valor, moneda)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {cubicacion && <VerCubicacion id={cubicacion} puedeAplicar={false} soloLectura aboveModals onCerrar={() => setCubicacion(null)} />}
    </div>
  );
}
