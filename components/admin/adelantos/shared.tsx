"use client";

/**
 * shared.tsx — helpers reutilizables del módulo Adelantos (ADR-117/118/121).
 * Extraídos de AdelantosModule.tsx para que AnalisisView (y otras vistas)
 * los compartan sin duplicar lógica de moneda ni estados vacíos.
 */

import { useEffect, type ComponentType, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { X } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";

/**
 * Los cuatro estados de un adelanto, con su color.
 *
 * Vive acá y no en el módulo para que el detalle y la tabla —que ahora son
 * archivos propios— no tengan que importar `AdelantosModule` (sería circular).
 */
export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ABIERTO: { label: "Abierto", className: "bg-[var(--data-warning)]/15 text-[var(--data-warning)]" },
  LIQUIDADO: { label: "Liquidado", className: "bg-[var(--data-success)]/15 text-[var(--data-success)]" },
  EXCEDIDO: { label: "Excedido", className: "bg-[var(--data-info)]/15 text-[var(--data-info)]" },
  CANCELADO: { label: "Cancelado", className: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
};

/** Cómo se liquida el adelanto, en palabras que se puedan leer en una celda. */
export const MODALIDAD_LABEL: Record<string, string> = {
  CUENTA_CORRIENTE: "Cuenta corriente",
  ENTREGAS_PACTADAS: "Entregas pactadas",
  DESCUENTO_PLANILLA: "Descuento por planilla",
};

/** Formatea un monto en su moneda (USD con "$ ", resto vía formatCurrency = S/). */
export function fmtMon(n: number, moneda?: string | null): string {
  if (moneda === "USD") return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return formatCurrency(n);
}

/** "COMPRADO"/"VENDIDO" → cómo se lee, con el signo que orienta de qué lado
 *  del negocio está la madera. */
export const PT_TIPO_LABEL: Record<string, string> = {
  COMPRADO: "Comprado",
  VENDIDO: "Vendido",
};

/** Pies tablares — dato de referencia, nunca plata: sin símbolo monetario. */
export function fmtPt(n: number): string {
  return `${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })} pt`;
}

/**
 * Texto comparable: minúsculas y sin tildes.
 *
 * Quien busca en el mostrador escribe «maria», no «María». Sin esto, la persona
 * que uno tiene delante no aparece en su propia lista.
 */
export function sinTildes(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Suma montos agrupados por moneda → { PEN: x, USD: y }. */
export function sumByMoneda(items: { monto: number; moneda?: string | null }[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const it of items) { const cur = it.moneda || "PEN"; acc[cur] = (acc[cur] ?? 0) + it.monto; }
  return acc;
}

/** Renderiza un mapa de montos por moneda → "S/ X · $ Y" (solo monedas presentes). */
export function fmtMonedas(map: Record<string, number>): string {
  const keys = Object.keys(map).filter((k) => map[k] !== 0);
  if (keys.length === 0) return formatCurrency(0);
  return keys.map((k) => fmtMon(map[k], k)).join(" · ");
}

export function EmptyState({ icon: Icon, title, hint }: { icon: ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-3"><Icon className="h-6 w-6" /></div>
      <p className="text-base font-extrabold text-[var(--text-primary)]">{title}</p>
      <p className="text-base text-[var(--text-secondary)] mt-1">{hint}</p>
    </div>
  );
}

export function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] animate-pulse" />
      ))}
    </div>
  );
}

// ── Primitivos de modal ───────────────────────────────────────────────────────
// Movidos desde AdelantosModule para que el modal de alta pueda vivir en su
// propio archivo sin importar el módulo entero (sería circular).

/**
 * El campo de texto del módulo.
 *
 * Antes era `border-2` en gris fuerte sobre fondo elevado: con ocho campos en
 * pantalla, ocho rectángulos grises compitiendo entre sí y con las tarjetas que
 * los contienen. Ahora el campo se dibuja como un HUECO —fondo hundido, borde
 * de un pixel apenas visible— y el color aparece sólo al enfocar, que es cuando
 * importa. Menos líneas, la misma estructura.
 */
export const inputCls =
  "w-full h-12 px-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-base font-semibold text-[var(--text-primary)] outline-none transition-[border-color,box-shadow,background-color] focus:border-primary focus:bg-[var(--surface-raised)] focus:ring-4 focus:ring-primary/15";

export function Field({
  label,
  children,
  hint,
  grupo,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /**
   * El contenido son VARIOS controles (chips, botones), no uno solo.
   *
   * Un `<label>` sólo puede apuntar a un control: envolviendo un grupo, el
   * lector de pantalla le pega el mismo nombre a todos los botones («Fecha del
   * adelanto Ayer 2026-08-…»). Con esto se rotula el grupo, no cada pieza.
   */
  grupo?: boolean;
}) {
  /* En minúscula y en tono de texto: el uppercase queda para los encabezados
     numerados de sección, que son los que ordenan la lectura. Con todo en
     mayúscula, nada destaca. */
  const titulo = <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>;
  const pie = hint ? <span className="block text-sm font-medium text-[var(--text-tertiary)]">{hint}</span> : null;
  if (grupo) {
    return (
      <div role="group" aria-label={label} className="space-y-1.5">
        {titulo}
        {children}
        {pie}
      </div>
    );
  }
  return (
    <label className="block space-y-1.5">
      {titulo}
      {children}
      {pie}
    </label>
  );
}

/** Anchos del shell. `lg` = detalle en 2 columnas; `xl` = formularios en 3 (alta). */
const ANCHOS = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-[900px]", xl: "max-w-[1180px]" } as const;

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide,
  size,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Legacy: equivale a size="md". */
  wide?: boolean;
  size?: keyof typeof ANCHOS;
  /**
   * Barra fija al pie. Existe porque las acciones dentro del cuerpo se van con
   * el scroll: en el alta de adelanto había que bajar para encontrar «Crear».
   */
  footer?: ReactNode;
}) {
  /**
   * Escape cierra. Es la regla de la casa para todo modal (click-fuera +
   * Escape) y acá faltaba: se salía sólo tocando el fondo.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ancho = ANCHOS[size ?? (wide ? "md" : "sm")];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex w-full ${ancho} max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">{title}</CardTitle>
            {subtitle && <div className="mt-0.5 text-sm font-medium text-[var(--text-tertiary)]">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2">
          <div className="space-y-4">{children}</div>
        </div>
        {footer && (
          <div className="shrink-0 bg-[var(--surface-sunken)] px-6 py-4 shadow-[0_-1px_0_0_var(--rule-soft)]">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function ModalActions({ onClose, onSubmit, saving, label }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2">
      <button onClick={onClose} className="h-12 flex-1 rounded-xl text-base font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]">Cancelar</button>
      <button onClick={onSubmit} disabled={saving} className="h-12 flex-1 rounded-xl bg-primary text-base font-bold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:shadow-none">{saving ? "Guardando…" : label}</button>
    </div>
  );
}

export function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  const color = tone === "success" ? "text-[var(--data-success)]" : tone === "warning" ? "text-[var(--data-warning)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

