"use client";

/**
 * Vale de salida: a qué máquina, con qué horómetro, cuántos galones, quién la
 * opera y su firma. Antes de guardar muestra de qué cilindro sale, cuánto
 * cuesta y cuántos gal/h rinde contra la meta de la máquina.
 */

import { useMemo, useState } from "react";
import { Fuel } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import LienzoFirma from "@/components/ui-system/LienzoFirma";
import { firmaEnCanvas } from "@/components/admin/adelantos/firma/hoja-firma";
import { TOLERANCIA_META, costoDeVale, problemaDeHorometro } from "@/lib/combustible/cuaderno";
import type { Trazo } from "@/lib/firma/trazos";
import { cn } from "@/lib/utils";
import { AREA, CAMPO, PRIMARIO, SECUNDARIO, TONO_CAJA, TONO_TEXTO, fechaIsoDe, gal, hoyLima, num1, numDe, soles } from "./compartido";
import type { CuadernoCombustible } from "./use-cuaderno-combustible";

export default function ModalVale({ c, onClose }: { c: CuadernoCombustible; onClose: () => void }) {
  const d = c.datos;
  const maquinas = c.maquinasActivas;
  const [maquinaId, setMaquinaId] = useState(maquinas[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoyLima);
  const [hora, setHora] = useState("");
  const [horometro, setHorometro] = useState("");
  const [galones, setGalones] = useState("");
  const [operador, setOperador] = useState("");
  const [notas, setNotas] = useState("");
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vales = useMemo(() => d?.vales ?? [], [d]);
  const operadores = useMemo(() => [...new Set(vales.map((v) => v.operador).filter((x): x is string => !!x))], [vales]);
  const maq = maquinas.find((m) => m.id === maquinaId) ?? null;
  // El último horómetro de la máquina: el del último vale, o el que tiene la ficha.
  const ultimoVale = vales
    .filter((v) => !v.anulado && v.maquinaId === maquinaId && v.horometro != null)
    .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))[0];
  const ultimoH = ultimoVale?.horometro ?? maq?.horometro ?? null;

  if (!d) return null;
  const iso = fechaIsoDe(fecha, hora);
  const nGal = numDe(galones);
  const nH = numDe(horometro);
  const sale = nGal != null && nGal > 0 ? costoDeVale(d, iso, nGal) : null;
  const problema = maquinaId ? problemaDeHorometro(vales, maquinaId, iso, nH) : null;
  const horas = nH != null && ultimoVale?.horometro != null && nH > ultimoVale.horometro ? Math.round((nH - ultimoVale.horometro) * 10) / 10 : null;
  const gph = horas && nGal ? Math.round((nGal / horas) * 100) / 100 : null;
  const meta = maq?.meta ?? null;
  const sobreMeta = gph != null && meta != null && gph > meta * (1 + TOLERANCIA_META);
  const saldoDespues = c.rec ? Math.round((c.rec.saldoGal - (nGal ?? 0)) * 100) / 100 : 0;

  const guardar = async () => {
    setError(null);
    if (!maquinaId) return setError("Elige la máquina");
    if (!(nGal != null && nGal > 0)) return setError("¿Cuántos galones?");
    if (operador.trim().length < 2) return setError("Falta el operador");
    if (problema) return setError(problema);
    setGuardando(true);
    const firma = trazos.length > 0 ? firmaEnCanvas(trazos, 600, 200).toDataURL("image/png") : null;
    const r = await c.anotarVale({
      fecha, hora: hora || null, maquinaId, horometro: nH, galones: nGal, operador: operador.trim(), firma, notas: notas.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    toast.success(`Vale anotado: ${gal(nGal)} a ${maq?.nombre ?? "la máquina"}${r.data.deCilindros.length ? ` (sale de ${r.data.deCilindros.join(", ")})` : ""}`);
    onClose();
  };

  const sinStock = (sale?.sinRespaldoGal ?? 0) > 0;
  return (
    <AdminModal
      open
      onClose={onClose}
      title="Vale de combustible"
      description="Salida del almacén a una máquina"
      icon={Fuel}
      size="lg"
      claveVentana="combustible-vale"
      footer={
        <ModalFooter error={error} nota={trazos.length === 0 ? "Sin firma del operador" : undefined}>
          <button type="button" className={SECUNDARIO} onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className={PRIMARIO} onClick={() => void guardar()} disabled={guardando || maquinas.length === 0} data-guardar-vale>
            {guardando ? "Guardando…" : "Guardar vale"}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-4", MODAL_BODY)} data-modal-vale>
        {maquinas.length === 0 ? (
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Primero agrega la máquina en la pestaña Flota (con su meta de gal/h).</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Máquina" required className="sm:col-span-2">
              <select value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)} className={CAMPO} data-campo-maquina>
                {maquinas.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}{m.placa ? ` · ${m.placa}` : ""}</option>
                ))}
              </select>
            </Field>
            <Field label="Fecha" required>
              <input type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            </Field>
            <Field label="Hora" hint="Vacío = ahora (o mediodía si es otro día)">
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
            </Field>
            <Field label="Horómetro" hint={ultimoH != null ? `Último: ${num1(ultimoH)}` : "Primera lectura de esta máquina"} error={problema ?? undefined}>
              <input value={horometro} onChange={(e) => setHorometro(e.target.value)} inputMode="decimal" placeholder={ultimoH != null ? String(ultimoH) : "0"} className={cn(CAMPO, "tabular-nums")} data-campo-horometro />
            </Field>
            <Field label="Galones" required>
              <input value={galones} onChange={(e) => setGalones(e.target.value)} inputMode="decimal" placeholder="30" className={cn(CAMPO, "tabular-nums")} data-campo-galones-vale />
            </Field>
            <Field label="Operador" required className="sm:col-span-2">
              <input value={operador} onChange={(e) => setOperador(e.target.value)} list="combustible-operadores" autoComplete="off" className={CAMPO} data-campo-operador />
            </Field>
            <datalist id="combustible-operadores">
              {operadores.map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
        )}

        {sale && (
          <div className={cn("space-y-0.5 rounded-xl border px-3 py-2.5 text-sm", TONO_CAJA[sinStock ? "error" : sobreMeta ? "aviso" : "ok"])} data-vista-vale>
            <p className="font-semibold text-[var(--text-primary)]">
              Sale de: <span className="font-mono">{sale.deCilindros.join(", ") || "—"}</span>
              {sale.costo > 0 && <span className="font-normal text-[var(--text-secondary)]"> · cuesta {soles(sale.costo)}</span>}
            </p>
            {sinStock && <p className={cn("font-bold", TONO_TEXTO.error)}>{gal(sale.sinRespaldoGal)} sin cilindro que los respalde: falta anotar una compra.</p>}
            {gph != null && (
              <p className={cn(sobreMeta ? cn("font-bold", TONO_TEXTO.aviso) : "text-[var(--text-secondary)]")}>
                Rinde {num1(gph)} gal/h en {num1(horas ?? 0)} h{meta != null ? ` · meta ${num1(meta)} gal/h${sobreMeta ? ": gasta de más, revisa fuga o desvío" : ""}` : ""}.
              </p>
            )}
            <p className="text-[var(--text-secondary)]">En el almacén quedan {gal(saldoDespues)}.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <span className="block text-sm font-bold text-[var(--text-secondary)]">Firma del operador{operador.trim() ? `: ${operador.trim()}` : ""}</span>
          <LienzoFirma trazos={trazos} onCambio={setTrazos} etiqueta={`Firma de ${operador.trim() || "el operador"}`} deshabilitado={guardando} />
        </div>

        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={AREA} />
        </Field>
      </div>
    </AdminModal>
  );
}
