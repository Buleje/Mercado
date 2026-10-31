"use client";

/**
 * «Hoy toca» — lo que hay que hacer con los adelantos, una tarea por fila y su
 * botón al lado (25-10). Reemplaza al aviso «N adelantos sin control»: decía
 * cuántos y cuánto, pero no qué hacer. La regla vive en `lib/adelantos/hoy-toca.ts`
 * y la cuenta la hace el servidor (`/api/adelantos/resumen` → `hoyToca`).
 *
 * «Cobrar» abre la ficha del adelanto de más saldo AHÍ MISMO (la ficha trae
 * anotar entrega, recordar, poner vencimiento y atar a contrato, como las filas
 * del aviso de antes). Las demás llevan a su pestaña con el filtro puesto.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { CalendarClock, CheckCircle, HandCoins, PenLine, Phone, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { DIAS_QUIETO, type TareaHoy, type TipoTarea } from "@/lib/adelantos/hoy-toca";
import DetalleAdelantoModal from "../detalle/DetalleAdelantoModal";

/** Personas por cobrar a la vista; el resto, en Cobranza (más ya no es un aviso, es otra lista). */
const COBROS_A_LA_VISTA = 5;

const ICONO: Record<TipoTarea, LucideIcon> = {
  cobrar: HandCoins,
  "poner-fecha": CalendarClock,
  firmar: PenLine,
  telefono: Phone,
};

export default function HoyToca({
  tareas,
  onGoTab,
  onChange,
}: {
  /** `null`/ausente = el servidor no lo pudo contar: no se afirma nada. */
  tareas: readonly TareaHoy[] | null | undefined;
  onGoTab: (tab: string) => void;
  /** Recargar después de tocar un adelanto desde su ficha. */
  onChange: () => void;
}) {
  const [fichaId, setFichaId] = useState<string | null>(null);
  if (!tareas) return null;

  const cobros = tareas.filter((t) => t.tipo === "cobrar");
  const otras = tareas.filter((t) => t.tipo !== "cobrar");
  const aLaVista = [...cobros.slice(0, COBROS_A_LA_VISTA), ...otras];
  const restoCobros = cobros.length - Math.min(cobros.length, COBROS_A_LA_VISTA);

  const hacer = (t: TareaHoy) => {
    if (t.tipo === "cobrar" && t.adelantoId) setFichaId(t.adelantoId);
    else irAEnlace(t.href);
  };

  return (
    <section aria-label="Hoy toca" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-2 flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Hoy toca</CardTitle>
        <InfoTip
          title="Hoy toca"
          what={
            <span>
              Lo que hay que hacer con la plata que diste: cobrar lo que lleva {DIAS_QUIETO} días o más sin moverse (sin
              entregas ni una gestión de cobranza) o lo vencido, ponerle fecha de cobro, firmar el recibo y anotar el
              celular de quien te debe.
            </span>
          }
          affects={<span>Cada lunes a las 7 de la mañana te llega lo mismo por WhatsApp, correo y la campana.</span>}
          example={<span>Diste S/ 17,000 el 03/08 y no entregó nada: sale «Cobrar a Quispe · sin moverse hace 83 días».</span>}
        />
      </div>

      {aLaVista.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm font-semibold text-[var(--data-success-ink)]">
          <CheckCircle className="h-5 w-5 shrink-0" aria-hidden /> Todo en orden: nada que hacer hoy.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {aLaVista.map((t) => {
            const Icono = ICONO[t.tipo];
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <Icono
                  className={`h-5 w-5 shrink-0 ${t.tipo === "cobrar" ? "text-[var(--data-warning)]" : "text-[var(--text-tertiary)]"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {/* Dos líneas, no una: a 400 px «Poner fecha de co…» ya no decía qué hacer. */}
                  <span className="line-clamp-2 break-words text-base font-bold text-[var(--text-primary)]">{t.titulo}</span>
                  <span className="block text-sm text-[var(--text-secondary)]">{t.detalle}</span>
                </span>
                <button
                  type="button"
                  onClick={() => hacer(t)}
                  className={button({ variant: t.tipo === "cobrar" ? "primary" : "secondary", className: "shrink-0 rounded-xl px-4" })}
                  title={t.tipo === "cobrar" ? "Abre la ficha del adelanto: anota la entrega, recuérdale o ponle fecha" : undefined}
                >
                  {t.boton}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {restoCobros > 0 && (
        <button
          type="button"
          onClick={() => onGoTab("cobranza")}
          className="mt-1 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
        >
          Y {restoCobros} {restoCobros === 1 ? "persona más" : "personas más"} por cobrar: ver Cobranza
        </button>
      )}

      {fichaId && (
        <DetalleAdelantoModal
          adelantoId={fichaId}
          onClose={() => setFichaId(null)}
          onChange={onChange}
        />
      )}
    </section>
  );
}
