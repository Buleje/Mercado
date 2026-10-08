"use client";

/**
 * shared.tsx — helpers reutilizables del módulo Adelantos (ADR-117/118/121).
 * Extraídos de AdelantosModule.tsx para que AnalisisView (y otras vistas)
 * los compartan sin duplicar lógica de moneda ni estados vacíos.
 */

import { useEffect, type ComponentType, type ReactNode, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { InfoTip, type InfoTipProps } from "@/components/superadmin/_shared/InfoTip";
import { CardTitle } from "@buleje/design-system";
import { X } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";

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
  /** ADR-448: los pt del trabajo que se va a dar en un adelanto por servicio. */
  SERVICIO: "Por el servicio",
};

/** Pies tablares — dato de referencia, nunca plata: sin símbolo monetario. */
export function fmtPt(n: number): string {
  return `${formatNumber(n, { max: 2 })} pt`;
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

/**
 * Un total por moneda con cada moneda en su renglón y sin partirse: «S/ 573.00»
 * cortado en «S/» y «573.00» no se lee como plata (visto a 400 px, 28-09).
 */
export function MontosEnLineas({ map }: { map: Record<string, number> }) {
  return (
    <>
      {fmtMonedas(map).split(" · ").map((v) => (
        <span key={v} className="block whitespace-nowrap">
          {v}
        </span>
      ))}
    </>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-10 text-center">
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
  info,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /**
   * La ayuda del campo en un ⓘ al lado del rótulo, en vez de un pie de texto
   * (Brandon 24-09: «mucho texto por todos lados»). Sólo con `grupo`: un botón
   * dentro de un `<label>` le roba el clic al control.
   */
  info?: Pick<InfoTipProps, "what" | "affects" | "example">;
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
        {info ? (
          <span className="flex items-center gap-1.5">
            {titulo}
            <InfoTip title={label} {...info} />
          </span>
        ) : (
          titulo
        )}
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

/**
 * Anchos del shell. `lg` = detalle en 2 columnas; `xl` = ficha de persona;
 * `2xl` = el alta de adelanto: bloques a la izquierda + «La cuenta» fija a la
 * derecha (ADR-448). En rem explícito: `max-w-{sm..xl}` valen el doble acá.
 */
const ANCHOS = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-[900px]", xl: "max-w-[1180px]", "2xl": "max-w-[82.5rem]" } as const;

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide,
  size,
  footer,
  cuerpo = "normal",
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
  /**
   * `hundido`: el cuerpo va sobre el fondo hundido y cada bloque es una tarjeta
   * blanca. Con todo sobre blanco, un formulario de cinco bloques se leía como
   * un solo muro gris (alta de adelanto, Brandon 28-09: «lo veo feo»).
   */
  cuerpo?: "normal" | "hundido";
}) {
  /* Sin esto Tab se va a la pantalla de abajo y Escape no cierra. */
  const cajaRef = useRef<HTMLDivElement>(null);
  /* Escape ya lo maneja el atajo propio de esta pantalla: el hook pone
       el foco, la trampa de Tab y el scroll, no una segunda salida. */
  useModalAccesible(cajaRef, { onCerrar: onClose, cerrarConEscape: false });
  // La clave es la parte FIJA del título: «Liquidar la cuenta de Juan» y «… de
  // Rosa» son el mismo modal. Con el título entero se recordaba una posición por
  // persona (revisión 2026-09-25).
  const ventana = useVentanaDeModal(true, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: `adelantos-modal:${title.split(/ — | de /)[0]}`,
  });
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onClose(); }}>
      <div ref={cajaRef} tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex w-full ${ancho} max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]`}
      >
        <div {...ventana.asaProps} className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <CardTitle className="text-[length:var(--ts-xl)] font-bold tracking-tight text-[var(--text-primary)]">{title}</CardTitle>
            {subtitle && <div className="mt-0.5 text-sm font-medium text-[var(--text-tertiary)]">{subtitle}</div>}
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-5 w-5" />
            </button>
          </span>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto px-5 sm:px-6 ${
            cuerpo === "hundido" ? "bg-[var(--surface-sunken)] py-5 shadow-[inset_0_1px_0_0_var(--rule-soft)]" : "pb-5 pt-2"
          }`}
        >
          <div className="space-y-4">{children}</div>
        </div>
        {footer && (
          <div
            className={`shrink-0 px-6 py-4 shadow-[0_-1px_0_0_var(--rule-soft)] ${
              cuerpo === "hundido" ? "bg-[var(--surface-raised)]" : "bg-[var(--surface-sunken)]"
            }`}
          >
            {footer}
          </div>
        )}
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}

export function ModalActions({ onClose, onSubmit, saving, label }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2">
      <button onClick={onClose} className="h-12 flex-1 rounded-xl text-base font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]">Cancelar</button>
      <button onClick={onSubmit} disabled={saving} className="h-12 flex-1 rounded-xl bg-primary text-base font-semibold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:shadow-none">{saving ? "Guardando…" : label}</button>
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

