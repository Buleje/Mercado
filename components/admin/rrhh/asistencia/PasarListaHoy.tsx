"use client";

/**
 * PasarListaHoy — «Pasar lista en un toque» (Brandon 30-10), pensada para el celular.
 *
 * Todos arrancan en «Presente»; un toque cambia a Faltó / Tardanza / Medio día y
 * «Guardar lista» manda UNA llamada al masivo por cada estado, siempre con
 * `sobrescribir: false`: a quien ya tiene marca hoy no se le toca nada (sólo se
 * muestra). Botones de 48 px. Se abre con `?tab=rrhh&vista=asistencia&pasar=hoy`.
 */

import { useState } from "react";
import { ArrowLeft, CheckCheck } from "@buleje/design-system/icons";
import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { toast } from "sonner";
import { useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { cn, limaDateKey } from "@/lib/utils";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import type { EstadoAsistencia } from "@/lib/rrhh/tipos";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META, pluralizar } from "../rrhh-ui";
import { useCuentasDelDia } from "./use-cuentas-del-dia";

const OPCIONES: readonly { estado: EstadoAsistencia; texto: string }[] = [
  { estado: "PRESENTE", texto: "Presente" },
  { estado: "FALTA", texto: "Faltó" },
  { estado: "TARDANZA", texto: "Tardanza" },
  { estado: "MEDIO_DIA", texto: "Medio día" },
];

/** Marca seleccionada de cada opción: el color del estado, con borde para no depender sólo del color. */
const CLASE_ELEGIDA: Record<string, string> = {
  PRESENTE: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  FALTA: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  TARDANZA: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  MEDIO_DIA: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
};

export default function PasarListaHoy({ onSalir, onCambioPersonal }: { onSalir: () => void; onCambioPersonal?: () => void }) {
  const hoy = limaDateKey();
  const { hoja, loading, error, guardando, masivo, recargar } = useRrhhAsistencia(hoy, hoy);
  const { puestos } = useRrhhPuestos();
  const { sinMarcar, marcadosIncluidos, marcasDelDia } = useCuentasDelDia(hoja, hoy, puestos);
  /** Sólo lo que se apartó de «Presente»; el resto es Presente. */
  const [elegidos, setElegidos] = useState<Record<string, EstadoAsistencia>>({});
  const [enviando, setEnviando] = useState(false);

  const estadoDe = (id: string): EstadoAsistencia => elegidos[id] ?? "PRESENTE";
  const elegir = (id: string, estado: EstadoAsistencia) =>
    setElegidos((prev) => {
      const { [id]: _quitar, ...resto } = prev;
      return estado === "PRESENTE" ? resto : { ...resto, [id]: estado };
    });

  const guardar = async () => {
    setEnviando(true);
    try {
      const porEstado = new Map<EstadoAsistencia, string[]>();
      for (const c of sinMarcar) {
        const e = estadoDe(c.id);
        porEstado.set(e, [...(porEstado.get(e) ?? []), c.id]);
      }
      let guardadas = 0;
      for (const [estado, colaboradorIds] of porEstado) {
        const res = await masivo({ fecha: hoy, estado, colaboradorIds, sobrescribir: false });
        if (!res.ok) return; // el hook ya avisó con un toast; lo que no se guardó sigue en la lista
        guardadas += res.creadas;
      }
      toast.success(`Lista guardada: ${pluralizar(guardadas, "persona", "personas")}`);
      setElegidos({});
      onCambioPersonal?.();
      onSalir();
    } finally {
      setEnviando(false);
    }
  };

  if (loading) return <LoadingState message="Cargando la lista de hoy..." />;
  if (error || !hoja) {
    return (
      <AvisoRrhh tono="error" accion={<button type="button" onClick={recargar} className={BOTON.chico}>Reintentar</button>}>
        {error ?? "No se pudo cargar la lista."}
      </AvisoRrhh>
    );
  }

  const faltan = sinMarcar.length;
  const faltaron = sinMarcar.filter((c) => estadoDe(c.id) !== "PRESENTE").length;

  return (
    <div className="mx-auto w-full max-w-xl space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSalir} aria-label="Volver a la asistencia" className={BOTON.icono}>
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <SectionTitle>Pasar lista de hoy</SectionTitle>
          <p className="text-sm capitalize text-[var(--text-secondary)]">{etiquetaDia(hoy, hoy)}</p>
        </div>
      </div>

      {faltan === 0 ? (
        <AvisoRrhh tono="info" icono={CheckCheck}>
          <p className="font-semibold">La lista de hoy ya está completa.</p>
          <p className="text-[var(--text-secondary)]">Si hay que corregir a alguien, se hace en la hoja del día.</p>
        </AvisoRrhh>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          Todos salen <strong className="text-[var(--text-primary)]">Presente</strong>. Toca solo a quien faltó o llegó tarde.
        </p>
      )}

      <ul className="space-y-2" aria-label="Personas por marcar">
        {sinMarcar.map((c) => {
          const actual = estadoDe(c.id);
          return (
            <li key={c.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5">
              <p className="px-1 pb-2 font-semibold text-[var(--text-primary)]">
                {c.apodo || c.nombre}
                {c.puesto && <span className="ml-2 text-sm font-normal text-[var(--text-tertiary)]">{c.puesto.nombre}</span>}
              </p>
              <div role="group" aria-label={`Asistencia de ${c.apodo || c.nombre}`} className="grid grid-cols-4 gap-1.5">
                {OPCIONES.map((o) => {
                  const activa = actual === o.estado;
                  return (
                    <button
                      key={o.estado}
                      type="button"
                      aria-pressed={activa}
                      onClick={() => elegir(c.id, o.estado)}
                      className={cn(
                        "h-12 min-w-0 rounded-lg border px-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                        activa ? CLASE_ELEGIDA[o.estado] : "border-[var(--rule-base)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      {o.texto}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {marcadosIncluidos.length > 0 && (
        <section aria-label="Ya marcados hoy" className="space-y-1.5">
          <CardTitle>Ya marcados hoy ({marcadosIncluidos.length})</CardTitle>
          <ul className="flex flex-wrap gap-1.5">
            {marcadosIncluidos.map((c) => {
              const marca = marcasDelDia.find((m) => m.colaboradorId === c.id);
              const meta = marca ? ESTADO_ASISTENCIA_META[marca.estado] : null;
              return (
                <li key={c.id} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm", meta?.claseChip ?? "bg-[var(--surface-sunken)]")}>
                  <span className="font-semibold">{c.apodo || c.nombre}</span>
                  {meta && <span>· {meta.label}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {faltan > 0 && (
        <div className="sticky bottom-[4.75rem] z-10 pt-1 sm:bottom-3">
          <button type="button" onClick={() => void guardar()} disabled={enviando || guardando} className={cn(BOTON.primario, "h-12 w-full text-base shadow-[var(--shadow-md)]")}>
            <CheckCheck className="h-5 w-5" aria-hidden />
            Guardar lista ({faltan}
            {faltaron > 0 ? `, ${pluralizar(faltaron, "con novedad", "con novedad")}` : ""})
          </button>
        </div>
      )}
    </div>
  );
}
