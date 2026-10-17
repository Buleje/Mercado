"use client";

/**
 * Aserrada: por producto, lo que el libro congelado dice que hay contra lo que
 * el inspector cuenta en la planta (m³ y piezas). Una tarjeta por producto: en
 * el celular se llena con el pulgar, sin tabla que se salga de la pantalla.
 */
import { useState } from "react";
import { Plus, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { ConteoAserrada } from "@/lib/superadmin/plantas-forestales/tipos";
import { TARJETA } from "@/components/admin/forestal/ctp-conteo-pasos";
import { m3, piezas } from "../formato";
import { CAMPO, CampoNumero } from "./CampoNumero";
import { diferenciaM3, TOLERANCIA_M3 } from "./inspeccion-datos";
import type { Inspeccion } from "./use-inspeccion";

const clave = (r: Pick<ConteoAserrada, "producto" | "especie">) => `${r.producto}|${r.especie ?? ""}`;

function Diferencia({ fila }: { fila: ConteoAserrada }) {
  const d = diferenciaM3(fila);
  if (d == null) return <span className="text-[var(--text-tertiary)]">Sin contar</span>;
  if (Math.abs(d) < TOLERANCIA_M3) return <span className="font-bold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">Cuadra</span>;
  const tono = d < 0 ? "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
  return (
    <span className={cn("font-bold tabular-nums", tono)}>
      {d < 0 ? "Faltan " : "Sobran "}
      {m3(Math.abs(d))}
    </span>
  );
}

function Fila({ fila, propia, editable, onCambiar, onQuitar }: {
  fila: ConteoAserrada;
  propia: boolean;
  editable: boolean;
  onCambiar: (f: Partial<ConteoAserrada>) => void;
  onQuitar: () => void;
}) {
  return (
    <li className={cn(TARJETA, "space-y-3")} data-aserrada-producto={fila.producto}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-base font-bold text-[var(--text-primary)]">{fila.producto}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {fila.especie ?? "Sin especie"} · Libro: <span className="font-semibold tabular-nums">{propia ? "no figura" : m3(fila.libroM3)}</span>
            {fila.libroPiezas != null && <> · {piezas(fila.libroPiezas)}</>}
          </p>
        </div>
        {propia && editable && (
          <Button variant="ghost" size="icon" onClick={onQuitar} aria-label={`Quitar ${fila.producto}`}>
            <Trash2 className="h-5 w-5" aria-hidden />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CampoNumero etiqueta="m³ contados" valor={fila.contadoM3} onValor={(n) => onCambiar({ contadoM3: n })} disabled={!editable} placeholder="—" />
        <CampoNumero etiqueta="Piezas contadas" valor={fila.contadoPiezas} entero onValor={(n) => onCambiar({ contadoPiezas: n })} disabled={!editable} placeholder="—" />
      </div>
      <p className="text-base">
        <Diferencia fila={fila} />
      </p>
    </li>
  );
}

function AgregarProducto({ onAgregar, existe }: { onAgregar: (producto: string, especie: string | null) => void; existe: (k: string) => boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [producto, setProducto] = useState("");
  const [especie, setEspecie] = useState("");
  const p = producto.trim();
  const e = especie.trim() || null;
  const repetido = p.length > 0 && existe(clave({ producto: p, especie: e }));
  if (!abierto) {
    return (
      <Button variant="secondary" onClick={() => setAbierto(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Producto que no está en el libro
      </Button>
    );
  }
  return (
    <div className={cn(TARJETA, "space-y-3")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-[var(--text-secondary)]">
          Producto
          <input className={CAMPO} value={producto} maxLength={200} onChange={(ev) => setProducto(ev.target.value)} placeholder="Tabla 1×8×10" />
        </label>
        <label className="space-y-1 text-sm font-medium text-[var(--text-secondary)]">
          Especie (si se sabe)
          <input className={CAMPO} value={especie} maxLength={80} onChange={(ev) => setEspecie(ev.target.value)} placeholder="Tornillo" />
        </label>
      </div>
      {repetido && <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">Ese producto ya está en la lista.</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={p.length < 2 || repetido}
          onClick={() => {
            onAgregar(p, e);
            setProducto("");
            setEspecie("");
            setAbierto(false);
          }}
        >
          Agregar
        </Button>
        <Button variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function InspeccionAserrada({ s }: { s: Inspeccion }) {
  const filas = s.borrador?.aserrada ?? [];
  const delLibro = new Set((s.insp?.libro.aserrada?.porProducto ?? []).map((p) => clave(p)));
  const sinLibro = !s.insp?.libro.aserrada;
  const cambiarFila = (k: string, f: Partial<ConteoAserrada>) =>
    s.cambiar("aserrada", (prev) => prev.map((r) => (clave(r) === k ? { ...r, ...f } : r)));

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <CardTitle>Aserrada por producto</CardTitle>
        <InfoTip
          title="Aserrada por producto"
          what="Lo que el libro tenía al abrir la inspección contra lo que cuentas en la planta."
          affects="Deja vacío lo que no contaste: sale «Sin contar», nunca como 0."
          example="Libro 12,000 m³, cuentas 11,500 → «Faltan 0,500 m³»."
        />
      </div>
      {sinLibro && <p className="text-sm text-[var(--text-tertiary)]">El libro no se pudo leer al abrir la inspección: anota lo que cuentes como producto propio.</p>}
      {filas.length === 0 && !sinLibro && <p className="text-sm text-[var(--text-tertiary)]">El libro no tenía aserrada al abrir la inspección.</p>}
      {filas.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filas.map((f) => (
            <Fila
              key={clave(f)}
              fila={f}
              propia={!delLibro.has(clave(f)) && f.libroM3 === 0}
              editable={s.editable}
              onCambiar={(c) => cambiarFila(clave(f), c)}
              onQuitar={() => s.cambiar("aserrada", (prev) => prev.filter((r) => clave(r) !== clave(f)))}
            />
          ))}
        </ul>
      )}
      {s.editable && (
        <AgregarProducto
          existe={(k) => filas.some((r) => clave(r) === k)}
          onAgregar={(producto, especie) =>
            s.cambiar("aserrada", (prev) => [...prev, { producto, especie, libroM3: 0, contadoM3: null, libroPiezas: null, contadoPiezas: null }])
          }
        />
      )}
    </section>
  );
}
