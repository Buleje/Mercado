"use client";

/**
 * Anotar un ingreso de cilindros: una compra (factura, grifo, guía) o lo que ya
 * había guardado al empezar el cuaderno (stock inicial). Muestra qué números
 * les tocan (C-05 a C-08) y avisa si con esto se pasa de lo declarado.
 */

import { useState } from "react";
import { ShoppingCart } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { UMBRAL_OSINERGMIN_GAL, rangoCilindros } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { AREA, CAMPO, PRIMARIO, SECUNDARIO, TONO_CAJA, TONO_TEXTO, gal, hoyLima, numDe, soles, cil } from "./compartido";
import type { CuadernoCombustible } from "./use-cuaderno-combustible";

export default function ModalIngreso({ c, onClose }: { c: CuadernoCombustible; onClose: () => void }) {
  const d = c.datos;
  const cfg = d?.config;
  // El grifo y el precio de la última compra: casi siempre se compra en el mismo.
  const ultima = [...(d?.ingresos ?? [])].filter((i) => i.tipo === "compra" && !i.anulado).sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))[0];
  const [tipo, setTipo] = useState<"compra" | "inicial">(d && d.ingresos.length === 0 ? "inicial" : "compra");
  const [fecha, setFecha] = useState(hoyLima);
  const [hora, setHora] = useState("");
  const [factura, setFactura] = useState("");
  const [guia, setGuia] = useState("");
  const [grifo, setGrifo] = useState(ultima?.grifo ?? "");
  const [ruc, setRuc] = useState(ultima?.grifoRuc ?? "");
  const [cilindros, setCilindros] = useState("1");
  const [galones, setGalones] = useState("");
  const [precio, setPrecio] = useState(ultima?.precioGal != null ? String(ultima.precioGal) : "");
  const [anotarGasto, setAnotarGasto] = useState(true);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!d || !cfg || !c.rec) return null;
  const nCil = Math.max(0, Math.trunc(numDe(cilindros) ?? 0));
  const galSugeridos = nCil * cfg.galPorCilindro;
  const nGal = numDe(galones) ?? galSugeridos;
  const nPrecio = numDe(precio);
  const monto = nPrecio != null ? Math.round(nPrecio * nGal * 100) / 100 : null;
  const cilDespues = c.rec.cilindrosConCombustible + nCil;
  const galDespues = Math.round((c.rec.saldoGal + nGal) * 100) / 100;
  const pasaMax = cilDespues > cfg.maxCilindros;
  const pasaOsinergmin = galDespues >= UMBRAL_OSINERGMIN_GAL;
  const esCompra = tipo === "compra";

  const guardar = async () => {
    setError(null);
    if (nCil < 1) return setError("¿Cuántos cilindros?");
    if (!(nGal > 0)) return setError("¿Cuántos galones?");
    if (esCompra && !factura.trim()) return setError("Falta el n.° de factura");
    if (esCompra && !grifo.trim()) return setError("Falta el grifo");
    if (ruc.trim() && !/^\d{11}$/.test(ruc.trim())) return setError("El RUC tiene 11 dígitos");
    setGuardando(true);
    const r = await c.anotarIngreso({
      tipo, fecha, hora: hora || null,
      factura: esCompra ? factura.trim() || null : null,
      grifo: grifo.trim() || null,
      grifoRuc: ruc.trim() || null,
      guia: guia.trim() || null,
      cilindros: nCil, galones: nGal, precioGal: nPrecio,
      notas: notas.trim() || null,
      anotarGasto: esCompra && anotarGasto,
    });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    toast.success(
      `Ingreso anotado: ${rangoCilindros(d.siguienteCilindro, nCil)}` +
        (r.data.gasto === "nuevo" ? " · gasto en Mi Plata" : r.data.gasto === "ya-estaba" ? " · la factura ya estaba en Mi Plata" : ""),
    );
    onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Ingreso de cilindros"
      description={`${cfg.producto} · ${cfg.galPorCilindro} gal por cilindro`}
      icon={ShoppingCart}
      size="lg"
      claveVentana="combustible-ingreso"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={SECUNDARIO} onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className={PRIMARIO} onClick={() => void guardar()} disabled={guardando} data-guardar-ingreso>
            {guardando ? "Guardando…" : "Guardar ingreso"}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-4", MODAL_BODY)} data-modal-ingreso>
        <SegmentedControl<"compra" | "inicial">
          value={tipo}
          onChange={setTipo}
          options={[{ value: "compra", label: "Compra con factura" }, { value: "inicial", label: "Stock inicial" }]}
          label="Tipo de ingreso"
          size="lg"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" required>
            <input type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
          </Field>
          <Field label="Hora" hint="Vacío = ahora (o mediodía si es otro día)">
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
          </Field>
          {esCompra && (
            <>
              <Field label="N.° de factura" required>
                <input value={factura} onChange={(e) => setFactura(e.target.value)} placeholder="F001-00012345" className={cn(CAMPO, "font-mono")} data-campo-factura />
              </Field>
              <Field label="Guía de remisión">
                <input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="T001-00004567" className={cn(CAMPO, "font-mono")} />
              </Field>
            </>
          )}
          <Field label="Grifo" required={esCompra}>
            <input value={grifo} onChange={(e) => setGrifo(e.target.value)} placeholder="Grifo Samaniego" className={CAMPO} data-campo-grifo />
          </Field>
          <Field label="RUC del grifo">
            <input value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" placeholder="11 dígitos" className={cn(CAMPO, "font-mono")} />
          </Field>
          <Field label="Cilindros" required>
            <input value={cilindros} onChange={(e) => setCilindros(e.target.value)} inputMode="numeric" className={cn(CAMPO, "tabular-nums")} data-campo-cilindros />
          </Field>
          <Field label="Galones" required hint={`Vacío = ${gal(galSugeridos)} (${nCil} × ${cfg.galPorCilindro})`}>
            <input value={galones} onChange={(e) => setGalones(e.target.value)} inputMode="decimal" placeholder={String(galSugeridos)} className={cn(CAMPO, "tabular-nums")} data-campo-galones />
          </Field>
          <Field label="Precio por galón (S/)" hint={monto != null ? `Monto: ${soles(monto)}` : undefined}>
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="27.30" className={cn(CAMPO, "tabular-nums")} data-campo-precio />
          </Field>
        </div>

        {esCompra && (
          <label className="flex items-start gap-2.5 text-sm text-[var(--text-primary)]">
            <input type="checkbox" checked={anotarGasto} onChange={(e) => setAnotarGasto(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
            <span>
              <span className="font-semibold">Anotar el gasto en Mi Plata</span>
              <span className="block text-[var(--text-tertiary)]">Si esa factura del grifo ya está anotada, la enlaza sin contarla dos veces.</span>
            </span>
          </label>
        )}

        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={AREA} />
        </Field>

        <div className={cn("rounded-xl border px-3 py-2.5 text-sm", TONO_CAJA[pasaOsinergmin || pasaMax ? "error" : "ok"])} data-vista-cilindros>
          <p className="font-semibold text-[var(--text-primary)]">
            Les toca: <span className="font-mono">{rangoCilindros(d.siguienteCilindro, nCil)}</span>
          </p>
          <p className={cn("mt-0.5", pasaOsinergmin || pasaMax ? cn("font-bold", TONO_TEXTO.error) : "text-[var(--text-secondary)]")}>
            Quedarías con {cil(cilDespues)} y {gal(galDespues)} (máx. declarado {cfg.maxCilindros}).
            {pasaOsinergmin ? ` Con ${UMBRAL_OSINERGMIN_GAL} gal o más pide Registro de Hidrocarburos de OSINERGMIN.` : pasaMax ? " Pasa lo declarado a SUNAT." : ""}
          </p>
        </div>
      </div>
    </AdminModal>
  );
}
