"use client";

import { SectionTitle } from "@buleje/design-system";
import { useEffect, useState, useCallback, useMemo, useRef, useId } from "react";
import {
  Store, Package, CreditCard, Users, ShoppingCart,
  ArrowRight, X, Sparkles, Rocket, Check, ChevronRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StepStatus {
  productsDone: boolean;
  paymentDone: boolean;
  customersDone: boolean;
  salesDone: boolean;
  settingsDone: boolean;
}

interface WizardStep {
  id: keyof StepStatus;
  title: string;
  description: string;
  Icon: React.FC<{ className?: string }>;
  href: string;
}

// ── Pasos ─────────────────────────────────────────────────────────────────────

const STEPS: ReadonlyArray<WizardStep> = [
  {
    id: "settingsDone",
    title: "Personaliza tu bodega",
    description: "Nombre, logo y datos de contacto.",
    Icon: Store,
    href: "/admin#config",
  },
  {
    id: "productsDone",
    title: "Agrega tu primer producto",
    description: "Crea tu catálogo y empieza a vender.",
    Icon: Package,
    href: "/admin#productos",
  },
  {
    id: "paymentDone",
    title: "Configura los pagos",
    description: "Activa Yape, efectivo o tarjeta.",
    Icon: CreditCard,
    href: "/admin#config",
  },
  {
    id: "customersDone",
    title: "Registra tu primer cliente",
    description: "Para fidelizar y enviar promos.",
    Icon: Users,
    href: "/admin#clientes",
  },
  {
    id: "salesDone",
    title: "Haz tu primera venta",
    description: "Abre el POS y vende.",
    Icon: ShoppingCart,
    href: "/admin#pedidos",
  },
] as const;

// Whitelist de hrefs permitidos para navegación — previene open redirect futuro
const ALLOWED_HREFS = new Set(STEPS.map((s) => s.href));

// Sanitizar tenantSlug para uso en localStorage key
function safeStorageKey(slug: string): string {
  return `onboarding-completed-${slug.replace(/[^a-z0-9-]/gi, "_")}`;
}

// ── Confetti (solo celebración, usa tokens DS) ────────────────────────────────

function ConfettiOverlay() {
  // CSS vars no se pueden leer en background-color directamente desde style,
  // pero Tailwind puede consumirlos. Usamos clases con tokens.
  const tones = [
    "bg-[var(--accent)]",
    "bg-[var(--data-success-600)]",
    "bg-[var(--accent-muted)]",
    "bg-[var(--data-success-100)]",
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl motion-reduce:hidden">
      {Array.from({ length: 16 }).map((_, i) => {
        const tone = tones[i % tones.length];
        const left = `${(i * 6.2) % 100}%`;
        const delay = `${(i * 0.1) % 1.4}s`;
        const size = 5 + (i % 4) * 2;
        const shape = i % 3 === 0 ? "rounded-full" : i % 3 === 1 ? "rounded-sm rotate-45" : "rounded-none";
        return (
          <div
            key={i}
            className={cn("absolute animate-bounce", shape, tone)}
            style={{
              left,
              width: size,
              height: size,
              animationDelay: delay,
              animationDuration: `${0.9 + (i % 4) * 0.3}s`,
              top: `${(i * 9) % 90}%`,
              opacity: 0.85,
            }}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

// ── Step Row ──────────────────────────────────────────────────────────────────

function StepRow({
  step,
  done,
  index,
  onNavigate,
}: {
  step: WizardStep;
  done: boolean;
  index: number;
  onNavigate: (href: string) => void;
}) {
  const { Icon } = step;

  return (
    <button
      type="button"
      onClick={() => !done && onNavigate(step.href)}
      aria-disabled={done}
      aria-label={
        done
          ? `${step.title} (completado)`
          : `Paso ${index + 1}: ${step.title}. ${step.description}`
      }
      className={cn(
        "group relative w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]",
        done
          ? "bg-[var(--accent-soft)] border-[var(--accent)]/30 cursor-default"
          : "bg-[var(--surface-raised)] border-[var(--rule-base)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)]/40 active:scale-[0.99]"
      )}
      style={{ animation: `step-in 280ms ease-out ${index * 50}ms backwards` }}
    >
      <div
        className={cn(
          "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
          done
            ? "bg-[var(--accent-600,var(--accent))] text-white"
            : "bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white"
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-5 w-5" strokeWidth={3} /> : <Icon className="h-5 w-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[length:var(--ts-2xs)] font-bold tabular-nums",
              done ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
            )}
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3
            className={cn(
              "text-sm font-bold truncate",
              done ? "text-[var(--text-secondary)] line-through" : "text-[var(--text-primary)]"
            )}
          >
            {step.title}
          </h3>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-snug mt-0.5 truncate">
          {step.description}
        </p>
      </div>

      {done ? (
        <span className="flex-shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
          Listo
        </span>
      ) : (
        <ChevronRight
          className="flex-shrink-0 h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  tenantSlug: string;
  onClose: () => void;
}

export default function OnboardingWizard({ tenantSlug, onClose }: OnboardingWizardProps) {
  const [status, setStatus] = useState<StepStatus>({
    productsDone: false,
    paymentDone: false,
    customersDone: false,
    salesDone: false,
    settingsDone: false,
  });
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatingRef = useRef(false);

  // Fetch progress (con AbortController + cleanup)
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function checkProgress() {
      setLoading(true);
      setHasError(false);
      try {
        const [dashRes, settingsRes] = await Promise.all([
          fetch("/api/admin/dashboard", { signal: controller.signal }),
          fetch("/api/settings", { signal: controller.signal }),
        ]);
        if (!dashRes.ok) throw new Error(`dashboard ${dashRes.status}`);

        const data = await dashRes.json();
        const settings = settingsRes.ok ? await settingsRes.json() : {};

        const products: unknown[] = Array.isArray(data.products) ? data.products : [];
        const customers: unknown[] = Array.isArray(data.customers) ? data.customers : [];
        const sales: unknown[] = Array.isArray(data.sales) ? data.sales : [];

        // paymentMethods puede ser null/undefined/objeto — Object.values(pm ?? {}) protege ambos
        const pm = (settings && typeof settings === "object" ? settings.paymentMethods : null) ?? {};
        const hasPayment = Object.values(pm).some(Boolean);

        const businessName: string =
          typeof settings?.businessName === "string" ? settings.businessName : "";
        const slug: string =
          typeof settings?.slug === "string" ? settings.slug : tenantSlug;
        const settingsDone = businessName.trim() !== "" && businessName !== slug;

        if (!mounted) return;
        setStatus({
          productsDone: products.length >= 1,
          paymentDone: hasPayment,
          customersDone: customers.length >= 1,
          salesDone: sales.length >= 1,
          settingsDone,
        });
      } catch (err) {
        if (mounted && !(err instanceof DOMException && err.name === "AbortError")) {
          setHasError(true);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void checkProgress();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [tenantSlug]);

  // Detect all done
  useEffect(() => {
    const done = Object.values(status).every(Boolean);
    if (done && !loading) setAllDone(true);
  }, [status, loading]);

  // Body scroll lock + initial focus
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const completedCount = useMemo(
    () => Object.values(status).filter(Boolean).length,
    [status],
  );
  const pct = STEPS.length > 0 ? Math.round((completedCount / STEPS.length) * 100) : 0;

  const persistDismissed = useCallback(() => {
    try {
      localStorage.setItem(safeStorageKey(tenantSlug), "1");
    } catch {
      // localStorage bloqueado (incognito, quota) — no es crítico, onClose() es la fuente de verdad
    }
  }, [tenantSlug]);

  const handleNavigate = useCallback(
    (href: string) => {
      if (navigatingRef.current) return; // idempotente — previene doble click
      if (!ALLOWED_HREFS.has(href)) return; // safety: solo paths estáticos
      navigatingRef.current = true;
      persistDismissed();
      onClose();
      navTimerRef.current = setTimeout(() => {
        window.location.href = href;
      }, 150);
    },
    [persistDismissed, onClose],
  );

  const handleClose = useCallback(() => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    persistDismissed();
    onClose();
  }, [persistDismissed, onClose]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  // Keyboard: Escape + Tab focus trap
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <div
      className="modal-backdrop flex items-center justify-center p-4"
      style={{ zIndex: 9990 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleClose}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes step-in {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes wizard-pop {
            0%   { opacity: 0; transform: translateY(10px) scale(0.97); }
            100% { opacity: 1; transform: translateY(0)    scale(1); }
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes step-in   { from { opacity: 0; } to { opacity: 1; } }
          @keyframes wizard-pop { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>

      <div
        ref={dialogRef}
        className="relative w-full max-w-[420px] bg-[var(--surface-raised)] rounded-3xl border border-[var(--rule-base)] overflow-hidden shadow-[var(--shadow-xl)]"
        style={{ animation: "wizard-pop 280ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {allDone && <ConfettiOverlay />}

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="relative px-5 pt-5 pb-4 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center shadow-[var(--shadow-sm)]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
                }}
                aria-hidden="true"
              >
                {allDone ? (
                  <Rocket className="h-5 w-5 text-white" />
                ) : (
                  <Sparkles className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <SectionTitle
                  id={titleId}
                  className="text-base font-bold text-[var(--text-primary)] leading-tight truncate"
                >
                  {allDone ? "¡Tu bodega está lista!" : "Configura tu bodega"}
                </SectionTitle>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                  {allDone ? "Todo completado." : "5 pasos para empezar a vender."}
                </p>
              </div>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={handleClose}
              title="Saltar por ahora"
              aria-label="Cerrar"
              className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-[length:var(--ts-2xs)] font-semibold mb-1.5">
              <span className="text-[var(--text-secondary)]">
                {completedCount}/{STEPS.length} pasos
              </span>
              <span className="text-[var(--accent)] tabular-nums">{pct}%</span>
            </div>
            <div
              className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso de configuración"
            >
              <div
                className="h-full rounded-full transition-[width] duration-[var(--dur-slower)] ease-out"
                style={{
                  width: `${pct}%`,
                  background:
                    "linear-gradient(90deg, var(--accent) 0%, var(--data-success-600) 100%)",
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Steps / Error ───────────────────────────────────────────────── */}
        <div className="px-4 py-3 space-y-1.5 max-h-[50vh] overflow-y-auto">
          {hasError ? (
            <div className="p-4 rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 text-sm text-[var(--text-primary)]">
              <p className="font-semibold mb-1">No pudimos cargar tu progreso.</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Aún puedes seguir los pasos manualmente o cerrar esta guía.
              </p>
            </div>
          ) : loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[58px] rounded-xl bg-[var(--surface-sunken)] animate-pulse"
              />
            ))
          ) : (
            STEPS.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                done={status[step.id]}
                index={i}
                onNavigate={handleNavigate}
              />
            ))
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 flex items-center gap-2">
          {allDone ? (
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold text-white shadow-[var(--shadow-sm)] transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
              }}
            >
              <Rocket className="h-4 w-4" />
              ¡Empezar a vender!
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-lg"
              >
                Saltar
              </button>
              <button
                type="button"
                onClick={() => {
                  const first = STEPS.find((s) => !status[s.id]);
                  if (first) handleNavigate(first.href);
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold text-white shadow-[var(--shadow-sm)] transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
                }}
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
