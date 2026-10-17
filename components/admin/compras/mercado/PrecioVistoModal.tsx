"use client";

import { useState } from "react";
import { Store } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import { FUENTES_MERCADO, type FuenteMercado, type MonedaMercado, type PrecioVisto } from "@/lib/compras/mercado";
import { limaDateKey } from "@/lib/utils";

const INPUT = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]";

const MONEDAS: { value: MonedaMercado; label: string }[] = [
  { value: "PEN", label: "Soles" },
  { value: "USD", label: "Dólares" },
];

export interface CasillaMercado {
  productId: string;
  productName: string;
  competidorId: string;
  competidorNombre: string;
  actual: PrecioVisto | null;
}

interface Props {
  casilla: CasillaMercado | null;
  onCerrar: () => void;
  onGuardar: (casilla: CasillaMercado, visto: PrecioVisto | null) => void;
}

interface Borrador {
  precio: string;
  moneda: MonedaMercado;
  fecha: string;
  fuente: FuenteMercado;
  responsable: string;
  nota: string;
}

function borradorDe(a: PrecioVisto | null, hoy: string): Borrador {
  return {
    precio: a ? String(a.precio).replace(".", ",") : "",
    moneda: a?.moneda ?? "PEN",
    // Un precio que se corrige suele ser uno que se volvió a ver: sin fecha guardada, hoy.
    fecha: a?.fecha ?? hoy,
    fuente: a?.fuente && a.fuente !== "otro" ? a.fuente : "visita",
    responsable: a?.responsable ?? "",
    nota: a?.nota ?? "",
  };
}

const FORM_ID = "precio-visto-form";

/**
 * Anotar lo que cobra un competidor por un producto (C38) con su origen: cuándo
 * y dónde se vio, en qué moneda y quién lo vio. Es una referencia: no toca
 * ningún precio ni costo del sistema.
 */
export default function PrecioVistoModal({ casilla, onCerrar, onGuardar }: Props) {
  const hoy = limaDateKey();
  const [b, setB] = useState<Borrador>(() => borradorDe(casilla?.actual ?? null, hoy));
  const [error, setError] = useState<string | null>(null);
  // Otra casilla = otro borrador (ajuste durante el render, sin efecto).
  const [de, setDe] = useState(casilla);
  if (casilla !== de) {
    setDe(casilla);
    setB(borradorDe(casilla?.actual ?? null, hoy));
    setError(null);
  }
  const cambiar = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const a = casilla?.actual ?? null;

  const guardar = () => {
    if (!casilla) return;
    const n = Number(b.precio.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) { setError("Escribe un precio mayor que cero."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) { setError("Elige el día en que lo viste."); return; }
    if (b.fecha > hoy) { setError("El día no puede ser después de hoy."); return; }
    onGuardar(casilla, {
      precio: Math.round(n * 100) / 100,
      moneda: b.moneda,
      fecha: b.fecha,
      fuente: b.fuente,
      ...(b.responsable.trim() ? { responsable: b.responsable.trim().slice(0, 80) } : {}),
      ...(b.nota.trim() ? { nota: b.nota.trim().slice(0, 200) } : {}),
      ...(a?.registradoPor ? { registradoPor: a.registradoPor } : {}),
    });
  };

  return (
    <AdminModal
      open={!!casilla}
      onClose={onCerrar}
      size="sm"
      icon={Store}
      title={casilla ? `Precio de ${casilla.competidorNombre}` : "Precio de la competencia"}
      description={casilla?.productName}
      footer={
        <ModalFooter
          error={error}
          nota={b.moneda === "USD" ? "En dólares se guarda, pero no entra en las cuentas: tu precio está en soles." : undefined}
        >
          {a && casilla && (
            <button type="button" onClick={() => onGuardar(casilla, null)} className={button({ variant: "ghost", className: "rounded-xl text-[var(--data-error-ink)]" })}>
              Quitar
            </button>
          )}
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary", className: "rounded-xl" })}>Cancelar</button>
          <button type="submit" form={FORM_ID} className={button({ variant: "primary", className: "rounded-xl px-5" })}>Guardar</button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); guardar(); }} className={`${MODAL_BODY} grid gap-3`}>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Precio" required>
            <input type="text" inputMode="decimal" autoFocus value={b.precio} onChange={(e) => cambiar("precio", e.target.value)} placeholder="4,50" className={`${INPUT} tabular-nums`} />
          </Field>
          <SegmentedControl<MonedaMercado> value={b.moneda} onChange={(v) => cambiar("moneda", v)} options={MONEDAS} size="lg" label="Moneda" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lo viste el">
            <input type="date" value={b.fecha} max={hoy} onChange={(e) => cambiar("fecha", e.target.value)} className={`${INPUT} tabular-nums`} />
          </Field>
          <Field label="Dónde">
            <select value={b.fuente} onChange={(e) => cambiar("fuente", e.target.value as FuenteMercado)} className={INPUT}>
              {FUENTES_MERCADO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Quién lo vio">
          <input type="text" value={b.responsable} onChange={(e) => cambiar("responsable", e.target.value)} maxLength={80} placeholder="Ej.: Rosa" className={INPUT} />
        </Field>
        <Field label="Nota">
          <input type="text" value={b.nota} onChange={(e) => cambiar("nota", e.target.value)} maxLength={200} placeholder="Ej.: en oferta hasta el domingo" className={INPUT} />
        </Field>
      </form>
    </AdminModal>
  );
}
