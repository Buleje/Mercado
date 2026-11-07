"use client";

/**
 * Cierre: cómo quedó la inspección, la conclusión del inspector, quién firmó
 * por la planta y las dos salidas —cerrarla (queda de sólo lectura) o anularla
 * con su motivo—. Ninguna de las dos se deshace, por eso piden confirmar.
 */
import { useState } from "react";
import { Ban, Lock, Printer } from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { cn } from "@/lib/utils";
import { TARJETA, AVISO_AMBAR } from "@/components/admin/forestal/ctp-conteo-pasos";
import { CAMPO } from "./CampoNumero";
import { contarPorGravedad, filasConDiferencia } from "./inspeccion-datos";
import type { Inspeccion } from "./use-inspeccion";

const ROTULO = "space-y-1 text-sm font-medium text-[var(--text-secondary)]";

function Resumen({ s, faltan }: { s: Inspeccion; faltan: number | null }) {
  const b = s.borrador;
  if (!b) return null;
  const g = contarPorGravedad(b.hallazgos);
  const conDif = filasConDiferencia(b.aserrada);
  const sinContar = b.aserrada.filter((r) => r.contadoM3 == null).length;
  const filas: [string, string][] = [
    ["Trozas que faltan", faltan == null ? "No se contó" : String(faltan)],
    ["Productos con diferencia", `${conDif}${sinContar > 0 ? ` (${sinContar} sin contar)` : ""}`],
    ["Hallazgos", `${b.hallazgos.length}${b.hallazgos.length > 0 ? ` · ${g.error} errores, ${g.warning} avisos, ${g.info} datos` : ""}`],
  ];
  return (
    <dl className={cn(TARJETA, "space-y-2")}>
      {filas.map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-3">
          <dt className="text-sm text-[var(--text-secondary)]">{k}</dt>
          <dd className="text-base font-bold tabular-nums text-[var(--text-primary)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InspeccionCierre({ s, faltan, onImprimir }: { s: Inspeccion; faltan: number | null; onImprimir: () => void }) {
  const [confirmar, setConfirmar] = useState<"cerrar" | "anular" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const insp = s.insp;
  const b = s.borrador;
  if (!insp || !b) return null;

  const hacer = async (cual: "cerrar" | "anular") => {
    setError(null);
    const e = cual === "cerrar" ? await s.cerrar() : await s.anular(motivo);
    if (e) setError(e);
    else setConfirmar(null);
  };

  return (
    <div className="space-y-4">
      <CardTitle>Cierre de la inspección</CardTitle>
      <Resumen s={s} faltan={faltan} />

      <label className={cn(ROTULO, "block")}>
        Conclusión
        <textarea
          className={cn(CAMPO, "h-auto min-h-32 py-2")}
          value={b.conclusion}
          maxLength={4000}
          disabled={!s.editable}
          onChange={(e) => s.cambiar("conclusion", () => e.target.value)}
          placeholder="Ej.: El patio cuadra con el libro salvo 3 trozas de cumala sin guía."
        />
      </label>
      <label className={cn(ROTULO, "block")}>
        Responsable de la planta que acompañó
        <input
          className={CAMPO}
          value={b.responsablePlanta}
          maxLength={120}
          disabled={!s.editable}
          onChange={(e) => s.cambiar("responsablePlanta", () => e.target.value)}
          placeholder="Nombre y cargo"
        />
      </label>

      {error && <ErrorAlert title="No se pudo" description={error} />}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onImprimir}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimir acta
        </Button>
        {s.editable && confirmar === null && (
          <>
            <Button variant="primary" onClick={() => setConfirmar("cerrar")}>
              <Lock className="h-4 w-4" aria-hidden /> Cerrar inspección
            </Button>
            <Button variant="ghost" onClick={() => setConfirmar("anular")}>
              <Ban className="h-4 w-4" aria-hidden /> Anular
            </Button>
          </>
        )}
      </div>

      {s.editable && confirmar === "cerrar" && (
        <div className={cn(AVISO_AMBAR, "flex-col")} role="alertdialog" aria-label="Confirmar el cierre">
          <span>Al cerrarla ya no se puede cambiar nada: el acta queda como está.</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void hacer("cerrar")} disabled={s.accion !== null}>
              {s.accion === "cerrar" ? "Cerrando…" : "Sí, cerrar"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={s.accion !== null}>
              Seguir editando
            </Button>
          </div>
        </div>
      )}

      {s.editable && confirmar === "anular" && (
        <div className={cn(TARJETA, "space-y-3 border-2 border-[var(--data-error-500)]")} role="alertdialog" aria-label="Anular la inspección">
          <label className={cn(ROTULO, "block")}>
            Por qué la anulas
            <textarea
              className={cn(CAMPO, "h-auto min-h-24 py-2")}
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: Se abrió por error en otra planta."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void hacer("anular")} disabled={motivo.trim().length < 5 || s.accion !== null}>
              {s.accion === "anular" ? "Anulando…" : "Anular inspección"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={s.accion !== null}>
              No anular
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
