"use client";

/**
 * Configurar la tarjeta de sellos (Más › Tarjeta de sellos): cuántas compras,
 * qué premio, desde qué día cuentan y la compra mínima. Se guarda en la regla
 * del programa (`/api/loyalty/sellos`, PUT); no cambia cómo se cobra.
 */
import { useEffect, useState } from "react";
import { Stamp } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { button } from "@/components/ui-system/button-variants";
import { SELLOS_MAX, SELLOS_MIN, type ConfigSellos } from "@/lib/loyalty/sellos";
import { limaDateKey } from "@/lib/utils";

const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";
const ETIQUETA = "text-sm font-semibold text-[var(--text-primary)]";

export function ModalSellos({
  open,
  config,
  onClose,
  onGuardar,
}: {
  open: boolean;
  config: ConfigSellos | null;
  onClose: () => void;
  onGuardar: (c: ConfigSellos) => Promise<string | null>;
}) {
  const [activo, setActivo] = useState(config?.activo ?? true);
  const [compras, setCompras] = useState(String(config?.compras ?? 10));
  const [premio, setPremio] = useState(config?.premio ?? "");
  const [desde, setDesde] = useState(config?.desde ?? limaDateKey());
  const [minimo, setMinimo] = useState(config?.minimo ? String(config.minimo) : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Montado siempre (desmontarlo al cerrar soltaba el foco a <body>): cada vez que se abre, lo guardado. */
  useEffect(() => {
    if (!open) return;
    setActivo(config?.activo ?? true);
    setCompras(String(config?.compras ?? 10));
    setPremio(config?.premio ?? "");
    setDesde(config?.desde ?? limaDateKey());
    setMinimo(config?.minimo ? String(config.minimo) : "");
    setError(null);
  }, [open, config]);

  const n = Number(compras);
  const valido = Number.isInteger(n) && n >= SELLOS_MIN && n <= SELLOS_MAX && premio.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(desde);

  const guardar = async () => {
    if (!valido) return;
    setGuardando(true);
    const e = await onGuardar({ activo, compras: n, premio: premio.trim(), desde, minimo: Math.max(0, Number(minimo) || 0) });
    setGuardando(false);
    if (e) setError(e);
    else onClose();
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Tarjeta de sellos"
      description="Compra tantas veces y la siguiente tiene premio. Cada compra cerrada con su celular es un sello."
      icon={Stamp}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={button({ variant: "ghost", className: "rounded-xl text-sm" })}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={!valido || guardando} className={button({ variant: "primary", className: "rounded-xl px-5 text-sm" })}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Interruptor enabled={activo} onChange={setActivo} label="Tarjeta activa" desc="Pausada, no se cuentan sellos ni se avisa el premio." />
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className={ETIQUETA}>Compras para el premio</span>
            <input type="number" inputMode="numeric" min={SELLOS_MIN} max={SELLOS_MAX} value={compras} onChange={(e) => setCompras(e.target.value)} className={CAMPO} />
          </label>
          <label className="space-y-1.5">
            <span className={ETIQUETA}>Compra mínima (S/)</span>
            <input type="number" inputMode="decimal" min={0} step="0.1" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Cualquiera" className={CAMPO} />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className={ETIQUETA}>Premio</span>
          <input type="text" maxLength={80} value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Ej.: un pan de molde gratis" className={CAMPO} />
        </label>
        <label className="block space-y-1.5">
          <span className={ETIQUETA}>Cuentan las compras desde</span>
          <input type="date" value={desde} max={limaDateKey()} onChange={(e) => setDesde(e.target.value)} className={CAMPO} />
          <span className="block text-sm text-[var(--text-tertiary)]">Cambiar la fecha empieza las tarjetas de cero.</span>
        </label>
        {error && <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>}
      </div>
    </AdminModal>
  );
}
