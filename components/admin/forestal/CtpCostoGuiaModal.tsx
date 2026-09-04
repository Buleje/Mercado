"use client";

/**
 * «¿Cuánto pagaste por esta guía?» — el costo, en el momento en que se sabe.
 *
 * Medido en el tenant forestal: **0 % del patio valorizado** (0 m³ de 32.933) y
 * la rentabilidad del libro entero en S/ 0.00. La pantalla para cargar el costo
 * existe desde agosto, pero vive en la pestaña Rentabilidad: hay que acordarse
 * de ir. Y nadie va.
 *
 * Este modal aparece **al recepcionar la guía**, que es cuando la factura del
 * proveedor está sobre la mesa. No bloquea —«Después» cierra y la guía queda
 * recepcionada igual— porque el libro admite huecos: lo que no admite es
 * inventar un costo.
 *
 * El total se REPARTE entre los asientos de la guía en proporción a su volumen:
 * una GTF con dos especies son dos asientos (ADR-312) y el costo es uno solo.
 */

import { useMemo, useState } from "react";
import { Coins, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import {
  sugerirCostoPorM3,
  textoDeOrigen,
  type IngresoValorizable,
} from "@/lib/forestal/costo-sugerido";

const CAMPO =
  "h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-base tabular-nums text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que se necesita de la guía recién recepcionada. */
export interface GuiaACostear {
  gtfNumber: string;
  providerName: string | null;
  especie: string | null;
  volumenM3: number;
  /** Los asientos de la guía: entre ellos se reparte el total. */
  lineas: { id: string; volumeM3: number | string | null }[];
}

export default function CtpCostoGuiaModal({
  guia,
  historial,
  onGuardar,
  onClose,
}: {
  guia: GuiaACostear;
  /** Los ingresos que ya tienen costo: de ahí sale la sugerencia. */
  historial: readonly IngresoValorizable[];
  /** Guarda el costo de cada asiento. Devuelve `false` si algo falló. */
  onGuardar: (porAsiento: { id: string; costoTotal: number }[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [total, setTotal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sugerida = useMemo(
    () => sugerirCostoPorM3(historial, { especie: guia.especie, proveedor: guia.providerName }),
    [historial, guia.especie, guia.providerName],
  );

  const vol = guia.volumenM3 > 0 ? guia.volumenM3 : 0;
  const totalNum = total.trim() === "" ? null : Number(total);
  const valido = totalNum != null && Number.isFinite(totalNum) && totalNum > 0;
  /* El mismo dinero con dos caras, como el pie tablar ↔ m³ del modal de
     producción: la factura viene por el total y el precio se habla por m³. */
  const porM3 = valido && vol > 0 ? r2(totalNum / vol) : null;

  /**
   * El reparto entre asientos. Al último se le da el RESTO y no su proporción:
   * tres asientos de 1/3 redondeados dejarían un céntimo suelto, y el libro
   * tiene que sumar exactamente lo que dice la factura.
   */
  const reparto = useMemo(() => {
    if (!valido || guia.lineas.length === 0) return [];
    const vols = guia.lineas.map((l) => Math.max(0, Number(l.volumeM3) || 0));
    const suma = vols.reduce((a, b) => a + b, 0);
    let asignado = 0;
    return guia.lineas.map((l, i) => {
      const ultimo = i === guia.lineas.length - 1;
      const parte = ultimo
        ? r2(totalNum - asignado)
        : suma > 0
          ? r2((totalNum * vols[i]) / suma)
          : r2(totalNum / guia.lineas.length);
      asignado = r2(asignado + parte);
      return { id: l.id, costoTotal: parte, volumeM3: vols[i] };
    });
  }, [valido, totalNum, guia.lineas]);

  async function guardar() {
    if (!valido) return;
    setGuardando(true);
    setError(null);
    const ok = await onGuardar(reparto.map(({ id, costoTotal }) => ({ id, costoTotal })));
    setGuardando(false);
    if (ok) onClose();
    else
      setError(
        guia.lineas.length > 1
          ? "No se pudo guardar el costo de todos los asientos. Volvé a darle a Guardar: se reescribe, no se suma."
          : "No se pudo guardar el costo. La guía quedó recepcionada igual; se puede cargar desde Rentabilidad.",
      );
  }

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="default"
      icon={Coins}
      title="¿Cuánto pagaste por esta guía?"
      description={`${guia.gtfNumber}${guia.providerName ? ` · ${guia.providerName}` : ""} · ${guia.especie ?? "sin especie"} · ${vol.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³`}
      footer={
        <ModalFooter error={error}>
          {/* «Después» no es cancelar: la guía YA se recepcionó. El libro admite
              el hueco; lo que no admite es un costo inventado. */}
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Después
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={!valido || guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            Guardar el costo
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {/* La sugerencia sale del propio libro y DICE de dónde: un número sin
            origen se copia sin pensarlo. */}
        {sugerida && (
          <button
            type="button"
            onClick={() => setTotal(String(r2(sugerida.porM3 * vol)))}
            className="block w-full rounded-xl border-2 border-[var(--accent)]/40 bg-primary/10 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/20"
          >
            {/* Dos filas y no tres columnas: el texto de origen es una frase, y
                comprimido en una columna angosta se partía en cinco renglones. */}
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
                {soles(sugerida.porM3)} por m³
              </span>
              <span className="shrink-0 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                usar ({soles(r2(sugerida.porM3 * vol))})
              </span>
            </span>
            <span className="mt-0.5 block text-[var(--text-secondary)]">
              {textoDeOrigen(sugerida, guia.especie, guia.providerName)}
            </span>
          </button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-bold text-[var(--text-secondary)]">Total pagado (S/)</span>
            <input
              autoFocus
              type="number"
              min={0}
              step="0.01"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valido) void guardar();
              }}
              placeholder="0.00"
              className={CAMPO}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-bold text-[var(--text-secondary)]">Precio por m³ (S/)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              /* Sin volumen no hay precio unitario que valga: habilitado
                 multiplicaría por 0 y dejaría el total en «gratis». */
              disabled={vol <= 0}
              title={vol <= 0 ? "La guía no declara volumen: cargá el total" : undefined}
              value={porM3 ?? ""}
              onChange={(e) => {
                const p = Number(e.target.value);
                setTotal(e.target.value === "" || !Number.isFinite(p) ? "" : String(r2(p * vol)));
              }}
              placeholder="0.00"
              className={CAMPO}
            />
          </label>
        </div>

        {/* Con más de un asiento, se dice CÓMO se reparte: el operador cargó un
            número y en el libro van a quedar dos. */}
        {reparto.length > 1 && (
          <div className="rounded-xl border border-[var(--rule-base)] p-3 text-sm">
            <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Se reparte entre los {reparto.length} asientos de la guía, por volumen
            </p>
            <ul className="space-y-1">
              {reparto.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-2 text-[var(--text-secondary)]">
                  <span className="font-mono tabular-nums">{a.volumeM3.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³</span>
                  <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{soles(a.costoTotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-[var(--text-tertiary)]">
          Sin costo, lo que salga de esta madera no puede mostrar margen — el libro no lo inventa. Se puede cargar
          después desde <b className="text-[var(--text-secondary)]">Gestión → Rentabilidad</b>.
        </p>
      </ModalBody>
    </AdminModal>
  );
}
