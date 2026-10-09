"use client";

/**
 * Las partes del arqueo guiado: conteo por denominación (billetes y monedas),
 * vouchers por medio (Yape, Plin, tarjeta) con su comparación, y la foto del
 * cajón. Salieron de CashRegisterTab al partirlo; el estado vive en el modal.
 */
import { useRef, type ReactNode } from "react";
import Image from "next/image";
import { Camera, X } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmt } from "./tipos";

export function FilasDeConteo({
  titulo,
  icono,
  valores,
  conteo,
  onCambiar,
  subtotalClase,
}: {
  titulo: string;
  icono: ReactNode;
  valores: number[];
  conteo: Record<string, number>;
  onCambiar: (valor: number, cantidad: number) => void;
  subtotalClase: string;
}) {
  const subtotal = valores.reduce((s, v) => s + v * (conteo[String(v)] ?? 0), 0);
  return (
    <div className="bg-[var(--surface-alt)] rounded-xl p-3 border border-[var(--rule-base)]">
      <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1 mb-2">
        {icono}
        {titulo}
      </span>
      <div className="space-y-2">
        {valores.map((v) => (
          <div key={v} className="flex items-center gap-3">
            <span className="text-xs font-bold text-[var(--text-secondary)] w-14 text-right">S/{v < 1 ? v.toFixed(2) : v}</span>
            <span className="text-[var(--text-tertiary)]" aria-hidden>
              ×
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              aria-label={`Cantidad de S/${v}`}
              value={conteo[String(v)] ?? ""}
              onChange={(e) => onCambiar(v, Number(e.target.value) || 0)}
              placeholder="0"
              className="w-20 px-2 min-h-9 rounded-xl border border-[var(--rule-base)] text-sm text-center text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:border-primary"
            />
            <span className="text-xs text-[var(--text-tertiary)] flex-1 text-right tabular-nums">= {fmt(v * (conteo[String(v)] ?? 0))}</span>
          </div>
        ))}
      </div>
      <p className={cn("mt-2 text-right text-xs font-bold", subtotalClase)}>Subtotal: {fmt(subtotal)}</p>
    </div>
  );
}

export type MedioArqueo = "efectivo" | "yape" | "plin" | "tarjeta";

export function VouchersPorMedio({
  tab,
  onTab,
  digitales,
  onDigital,
  efectivoContado,
  ventasPorMedio,
}: {
  tab: MedioArqueo;
  onTab: (t: MedioArqueo) => void;
  digitales: Record<"yape" | "plin" | "tarjeta", string>;
  onDigital: (m: "yape" | "plin" | "tarjeta", v: string) => void;
  efectivoContado: number;
  ventasPorMedio: Record<string, number>;
}) {
  const hayDigital = (["yape", "plin", "tarjeta"] as const).some((m) => Number(digitales[m]) > 0);
  const filas = [
    { method: "efectivo", contado: efectivoContado, esperado: ventasPorMedio["efectivo"] ?? 0 },
    ...(["yape", "plin", "tarjeta"] as const).map((m) => ({ method: m, contado: Number(digitales[m]) || 0, esperado: ventasPorMedio[m] ?? 0 })),
  ].filter((r) => r.contado > 0 || r.esperado > 0);

  return (
    <div className="bg-[var(--surface-alt)] rounded-xl p-3 border border-[var(--rule-base)]">
      <div className="flex gap-1 mb-3" role="tablist" aria-label="Medio a contar">
        {(["efectivo", "yape", "plin", "tarjeta"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={cn(
              "flex-1 min-h-9 rounded-lg text-sm font-bold transition-colors capitalize",
              tab === t ? "bg-primary text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "efectivo" ? (
        <p className="text-xs text-[var(--text-tertiary)]">Usa los conteos de billetes y monedas de arriba para el efectivo.</p>
      ) : (
        <Field label={`Total en vouchers ${tab === "tarjeta" ? "de tarjeta" : tab.charAt(0).toUpperCase() + tab.slice(1)}`} labelClassName="text-xs font-bold text-[var(--text-secondary)] mb-1 block">
          {(id) => (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold">S/</span>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.10"
                value={digitales[tab]}
                onChange={(e) => onDigital(tab, e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
          )}
        </Field>
      )}
      {hayDigital && (
        <div className="mt-3 pt-2 border-t border-[var(--rule-base)] space-y-1">
          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase">Comparación por medio</p>
          {filas.map((r) => {
            const diff = r.contado - r.esperado;
            const ok = Math.abs(diff) < 1;
            return (
              <div key={r.method} className="flex items-center justify-between text-xs">
                <span className="capitalize text-[var(--text-secondary)]">{r.method}</span>
                <span className={cn("font-bold", ok ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                  {ok ? "OK ✓" : `${diff >= 0 ? "+" : ""}${formatCurrency(diff)} ⚠`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FotoDelCajon({ foto, onFoto }: { foto: string | null; onFoto: (f: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-[var(--surface-alt)] rounded-xl p-3 border border-[var(--rule-base)]">
      <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1 mb-2">
        <Camera className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden /> Foto del cajón (opcional, recomendado)
      </span>
      {foto ? (
        <div className="relative inline-block">
          <Image src={foto} alt="Foto del cajón" width={200} height={120} className="object-cover rounded-lg border border-[var(--rule-base)]" unoptimized />
          <button
            type="button"
            aria-label="Quitar foto"
            onClick={() => onFoto(null)}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-[var(--data-error-500)] text-white flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full min-h-11 rounded-xl border border-dashed border-[var(--rule-base)] text-xs text-[var(--text-tertiary)] hover:border-primary hover:text-primary transition-colors"
        >
          Toca para tomar foto
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            onFoto(base64);
            try {
              localStorage.setItem(`arqueo-foto-${new Date().toISOString().slice(0, 10)}`, base64);
            } catch {
              /* almacenamiento lleno: la foto igual viaja en el cierre */
            }
          };
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
