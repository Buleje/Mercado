"use client";

/**
 * Lo declarado a SUNAT (informe técnico): producto, galones por cilindro,
 * cuántos cilindros se guardan a la vez, el cupo del año, la proyección mes a
 * mes y quién responde por el cuaderno. Contra esto se miden los avisos.
 */

import { useState } from "react";
import { Settings2 } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { nombreMes } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { CAMPO, PRIMARIO, SECUNDARIO, TONO_TEXTO, gal, numDe } from "./compartido";
import type { CuadernoCombustible } from "./use-cuaderno-combustible";

export default function ModalAjustes({ c, onClose }: { c: CuadernoCombustible; onClose: () => void }) {
  const cfg = c.datos?.config;
  const [producto, setProducto] = useState(cfg?.producto ?? "");
  const [galPorCil, setGalPorCil] = useState(String(cfg?.galPorCilindro ?? 55));
  const [maxCil, setMaxCil] = useState(String(cfg?.maxCilindros ?? 4));
  const [cupo, setCupo] = useState(cfg?.cupoAnualGal != null ? String(cfg.cupoAnualGal) : "");
  const [proy, setProy] = useState<string[]>(cfg?.proyeccionCilindros?.map(String) ?? Array.from({ length: 12 }, () => ""));
  const [responsable, setResponsable] = useState(cfg?.responsable ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cfg) return null;
  const g = numDe(galPorCil) ?? 0;
  const proyNums = proy.map((p) => numDe(p));
  const hayProy = proyNums.some((n) => n != null);
  const totalCil = proyNums.reduce<number>((s, n) => s + (n ?? 0), 0);
  const nCupo = numDe(cupo);
  const pasaCupo = hayProy && nCupo != null && totalCil * g > nCupo;

  const guardar = async () => {
    setError(null);
    const nMax = numDe(maxCil);
    if (producto.trim().length < 2) return setError("Falta el producto");
    if (!(g > 0)) return setError("Galones por cilindro: un número mayor que 0");
    if (nMax == null || nMax < 1 || !Number.isInteger(nMax)) return setError("Cilindros máximos: un número entero");
    if (hayProy && proyNums.some((n) => n == null || n < 0 || !Number.isInteger(n))) return setError("La proyección va en cilindros enteros, los 12 meses");
    setGuardando(true);
    const r = await c.guardarAjustes({
      producto: producto.trim(),
      galPorCilindro: g,
      maxCilindros: nMax,
      cupoAnualGal: nCupo,
      proyeccionCilindros: hayProy ? proyNums.map((n) => n ?? 0) : null,
      responsable: responsable.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    toast.success("Lo declarado quedó guardado");
    onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Lo declarado a SUNAT"
      description="Contra esto se miden los avisos y el reporte del mes"
      icon={Settings2}
      size="lg"
      claveVentana="combustible-ajustes"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={SECUNDARIO} onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className={PRIMARIO} onClick={() => void guardar()} disabled={guardando} data-guardar-ajustes>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-4", MODAL_BODY)} data-modal-ajustes>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Producto" required>
            <input value={producto} onChange={(e) => setProducto(e.target.value)} className={CAMPO} />
          </Field>
          <Field label="Responsable del cuaderno" hint="Quien firma el reporte">
            <input value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CAMPO} data-campo-responsable />
          </Field>
          <Field label="Galones por cilindro" required>
            <input value={galPorCil} onChange={(e) => setGalPorCil(e.target.value)} inputMode="decimal" className={cn(CAMPO, "tabular-nums")} />
          </Field>
          <Field label="Cilindros guardados a la vez (máx.)" required hint={g > 0 ? `= ${gal((numDe(maxCil) ?? 0) * g)}` : undefined}>
            <input value={maxCil} onChange={(e) => setMaxCil(e.target.value)} inputMode="numeric" className={cn(CAMPO, "tabular-nums")} />
          </Field>
          <Field label="Cupo anual inscrito (gal)" className="sm:col-span-2">
            <input value={cupo} onChange={(e) => setCupo(e.target.value)} inputMode="decimal" placeholder="5500" className={cn(CAMPO, "tabular-nums")} data-campo-cupo />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-[var(--text-secondary)]">Proyección: cilindros por mes</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-campo-proyeccion>
            {proy.map((p, i) => (
              <label key={nombreMes(i + 1)} className="block">
                <span className="mb-1 block text-xs font-semibold capitalize text-[var(--text-tertiary)]">{nombreMes(i + 1).slice(0, 3)}</span>
                <input
                  value={p}
                  onChange={(e) => setProy((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  inputMode="numeric"
                  aria-label={`Cilindros de ${nombreMes(i + 1)}`}
                  className={cn(CAMPO, "px-2 text-center tabular-nums")}
                />
              </label>
            ))}
          </div>
          {hayProy && (
            <p className={cn("mt-2 text-sm", pasaCupo ? cn("font-bold", TONO_TEXTO.error) : "text-[var(--text-secondary)]")}>
              Total: {totalCil} cilindros = {gal(totalCil * g)}
              {nCupo != null ? ` · cupo ${gal(nCupo)}${pasaCupo ? ": la proyección pasa el cupo" : ""}` : ""}
            </p>
          )}
        </fieldset>
      </div>
    </AdminModal>
  );
}
