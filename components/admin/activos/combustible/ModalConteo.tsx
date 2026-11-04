"use client";

/**
 * Conteo físico del almacén (una vez por semana): cuántos cilindros tienen
 * combustible y cuántos galones hay, contra lo que dice el cuaderno a esa
 * hora. Lo contado manda: la diferencia queda anotada (faltante o sobrante).
 */

import { useState } from "react";
import { ClipboardCheck } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { libroAl } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { AREA, CAMPO, PRIMARIO, SECUNDARIO, TONO_CAJA, TONO_TEXTO, fechaIsoDe, gal, hoyLima, numDe, cil } from "./compartido";
import type { CuadernoCombustible } from "./use-cuaderno-combustible";

export default function ModalConteo({ c, onClose }: { c: CuadernoCombustible; onClose: () => void }) {
  const d = c.datos;
  const [fecha, setFecha] = useState(hoyLima);
  const [hora, setHora] = useState("");
  const [cilindros, setCilindros] = useState("");
  const [galones, setGalones] = useState("");
  const [contadoPor, setContadoPor] = useState("");
  const [testigo, setTestigo] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!d) return null;
  const libro = libroAl(d, fechaIsoDe(fecha, hora));
  const nCil = numDe(cilindros);
  const nGal = numDe(galones);
  const difGal = nGal != null ? Math.round((nGal - libro.saldoGal) * 100) / 100 : null;
  const difCil = nCil != null ? Math.trunc(nCil) - libro.cilindros : null;
  const tono = difGal == null || Math.abs(difGal) < 0.5 ? "ok" : difGal < 0 ? "error" : "aviso";

  const guardar = async () => {
    setError(null);
    if (nCil == null || nCil < 0) return setError("¿Cuántos cilindros con combustible contaste?");
    if (nGal == null || nGal < 0) return setError("¿Cuántos galones mediste?");
    if (contadoPor.trim().length < 2) return setError("Falta quién contó");
    setGuardando(true);
    const r = await c.anotarConteo({
      fecha, hora: hora || null, cilindros: Math.trunc(nCil), galones: nGal,
      contadoPor: contadoPor.trim(), testigo: testigo.trim() || null, notas: notas.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    const dg = r.data.difGal;
    toast.success(Math.abs(dg) < 0.5 ? "Conteo anotado: cuadra con el cuaderno" : `Conteo anotado: ${dg < 0 ? "faltan" : "sobran"} ${gal(Math.abs(dg))}`);
    onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Conteo del almacén"
      description="Lo contado manda: el cuaderno queda en lo que cuentes"
      icon={ClipboardCheck}
      size="md"
      claveVentana="combustible-conteo"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={SECUNDARIO} onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className={PRIMARIO} onClick={() => void guardar()} disabled={guardando} data-guardar-conteo>
            {guardando ? "Guardando…" : "Guardar conteo"}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-4", MODAL_BODY)} data-modal-conteo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" required>
            <input type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
          </Field>
          <Field label="Hora" hint="Vacío = ahora">
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
          </Field>
          <Field label="Cilindros con combustible" required>
            <input value={cilindros} onChange={(e) => setCilindros(e.target.value)} inputMode="numeric" className={cn(CAMPO, "tabular-nums")} data-campo-conteo-cil />
          </Field>
          <Field label="Galones medidos" required hint="Con la varilla, sumando todos los cilindros">
            <input value={galones} onChange={(e) => setGalones(e.target.value)} inputMode="decimal" className={cn(CAMPO, "tabular-nums")} data-campo-conteo-gal />
          </Field>
          <Field label="Contó" required>
            <input value={contadoPor} onChange={(e) => setContadoPor(e.target.value)} autoComplete="off" className={CAMPO} data-campo-conto />
          </Field>
          <Field label="Testigo">
            <input value={testigo} onChange={(e) => setTestigo(e.target.value)} autoComplete="off" className={CAMPO} />
          </Field>
        </div>

        <div className={cn("rounded-xl border px-3 py-2.5 text-sm", TONO_CAJA[tono])} data-vista-conteo>
          <p className="text-[var(--text-secondary)]">
            El cuaderno dice: <span className="font-semibold text-[var(--text-primary)]">{gal(libro.saldoGal)} · {cil(libro.cilindros)}</span>
          </p>
          {difGal != null && (
            <p className={cn("mt-0.5 font-bold", TONO_TEXTO[tono])}>
              {Math.abs(difGal) < 0.5 ? "Cuadra." : `${difGal < 0 ? "Faltan" : "Sobran"} ${gal(Math.abs(difGal))}`}
              {difCil != null && difCil !== 0 ? ` · ${difCil > 0 ? "+" : "−"}${cil(Math.abs(difCil))}` : ""}
            </p>
          )}
        </div>

        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={AREA} />
        </Field>
      </div>
    </AdminModal>
  );
}
