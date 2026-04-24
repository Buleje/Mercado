"use client";

/**
 * AccountPicker — Cards radio-style para elegir entre cuentas guardadas
 * en este dispositivo. La última agregada queda check por default.
 *
 * Botón "Iniciar sesión con otra cuenta" abre el gate `/checkout/auth`
 * con returnTo=/checkout/datos para seguir el flow editorial.
 */

import { useRouter } from "next/navigation";
import { useCustomer, type Customer } from "@/contexts/customer-context";
import { CheckCircle2, Plus, Trash2, User, Phone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AccountPickerProps {
  /** Callback cuando el usuario selecciona una cuenta del picker. */
  onSelect?: (customer: Customer) => void;
  /** Ruta a donde volver tras login exitoso de cuenta nueva. */
  returnTo?: string;
}

export default function AccountPicker({
  onSelect,
  returnTo = "/checkout/datos",
}: AccountPickerProps) {
  const router = useRouter();
  const { customer, accounts, switchAccount, removeAccount } = useCustomer();
  const activePhone = customer?.phone?.replace(/\D/g, "") ?? null;

  const handlePick = (acc: Customer) => {
    if (!acc.phone) return;
    const ok = switchAccount(acc.phone);
    if (ok && onSelect) onSelect(acc);
  };

  const handleAddNew = () => {
    const qs = new URLSearchParams({ returnTo, newAccount: "1" }).toString();
    router.push(`/checkout/auth?${qs}`);
  };

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-8 space-y-5">
      <div>
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-1.5">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-8 rounded-full bg-[var(--accent)]"
          />
          <User className="h-3 w-3" strokeWidth={2} aria-hidden />
          Tus cuentas
        </p>
        <h2 className="text-xl sm:text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
          Elige con cuál comprás hoy
        </h2>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          {accounts.length} {accounts.length === 1 ? "cuenta guardada" : "cuentas guardadas"}{" "}
          en este dispositivo. La última es la predeterminada.
        </p>
      </div>

      <ul role="radiogroup" aria-label="Cuentas guardadas" className="space-y-3">
        {accounts.map((acc) => {
          const accPhone = acc.phone?.replace(/\D/g, "") ?? "";
          const isActive = accPhone === activePhone;
          return (
            <li key={accPhone}>
              <div
                className={cn(
                  "group relative flex items-center gap-4 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer",
                  isActive
                    ? "border-2 border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_6px_20px_-12px_var(--accent)]"
                    : "border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                )}
                onClick={() => handlePick(acc)}
                role="radio"
                aria-checked={isActive}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePick(acc);
                  }
                }}
              >
                {/* Avatar con iniciales */}
                <span
                  className={cn(
                    "inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-black shrink-0",
                    isActive
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--accent-soft)] text-[var(--accent)]",
                  )}
                  aria-hidden
                >
                  {getInitials(acc.name)}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-base sm:text-lg font-bold tracking-[-0.01em] text-[var(--text-primary)] truncate">
                    {acc.name}
                  </p>
                  {acc.phone && (
                    <p className="mt-0.5 text-sm text-[var(--text-tertiary)] tabular-nums inline-flex items-center gap-1.5">
                      <Phone className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                      +51 {acc.phone}
                    </p>
                  )}
                </div>

                {/* Checkmark corner */}
                {isActive ? (
                  <span
                    aria-hidden
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white shrink-0"
                  >
                    <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--rule-base)] shrink-0"
                  />
                )}

                {/* Eliminar — visible al hover sobre inactivas, no en la activa */}
                {!isActive && (
                  <button
                    type="button"
                    aria-label={`Eliminar cuenta ${acc.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (acc.phone) removeAccount(acc.phone);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-7 w-7 inline-flex items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Agregar otra cuenta */}
      <button
        type="button"
        onClick={handleAddNew}
        className={cn(
          "group w-full inline-flex items-center gap-3 rounded-2xl border-2 border-dashed p-4 sm:p-5",
          "border-[var(--rule-base)] bg-[var(--surface-sunken)]/50",
          "hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all",
          "text-left",
        )}
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-tertiary)] group-hover:bg-[var(--accent)] group-hover:text-white group-hover:border-[var(--accent)] transition-colors shrink-0">
          <Plus className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="flex-1">
          <p className="text-base font-bold tracking-[-0.01em] text-[var(--text-primary)]">
            Iniciar sesión con otra cuenta
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
            Agrega otro Gmail o número — quedará disponible para futuras compras.
          </p>
        </div>
      </button>
    </section>
  );
}
