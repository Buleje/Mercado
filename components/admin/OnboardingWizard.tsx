"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Store, Package, CreditCard, Users, ShoppingCart,
  CheckCircle2, ArrowRight, X, ChevronRight, Sparkles,
} from "lucide-react";
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
  hrefLabel: string;
  color: string;
  bgLight: string;
  bgDark: string;
}

// ── Pasos ─────────────────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  {
    id: "settingsDone",
    title: "Personaliza tu tienda",
    description: "Agrega el nombre, logo y datos de contacto de tu bodega.",
    Icon: Store,
    href: "/admin#config",
    hrefLabel: "Ir a Configuración",
    color: "text-teal-600 dark:text-teal-400",
    bgLight: "bg-teal-50",
    bgDark: "dark:bg-teal-900/20",
  },
  {
    id: "productsDone",
    title: "Agrega tu primer producto",
    description: "Crea al menos un producto en tu catálogo para empezar a vender.",
    Icon: Package,
    href: "/admin#productos",
    hrefLabel: "Ir a Productos",
    color: "text-blue-600 dark:text-blue-400",
    bgLight: "bg-blue-50",
    bgDark: "dark:bg-blue-900/20",
  },
  {
    id: "paymentDone",
    title: "Configura método de pago",
    description: "Activa Yape, efectivo u otro método para recibir pagos.",
    Icon: CreditCard,
    href: "/admin#config",
    hrefLabel: "Ir a Configuración",
    color: "text-green-600 dark:text-green-400",
    bgLight: "bg-green-50",
    bgDark: "dark:bg-green-900/20",
  },
  {
    id: "customersDone",
    title: "Registra tu primer cliente",
    description: "Guarda el contacto de un cliente para personalizar la atención.",
    Icon: Users,
    href: "/admin#clientes",
    hrefLabel: "Ir a Clientes",
    color: "text-purple-600 dark:text-purple-400",
    bgLight: "bg-purple-50",
    bgDark: "dark:bg-purple-900/20",
  },
  {
    id: "salesDone",
    title: "Haz tu primera venta",
    description: "Registra una venta desde el punto de venta o desde pedidos.",
    Icon: ShoppingCart,
    href: "/admin#ventas-caja",
    hrefLabel: "Ir al POS",
    color: "text-orange-600 dark:text-orange-400",
    bgLight: "bg-orange-50",
    bgDark: "dark:bg-orange-900/20",
  },
];

// ── Confetti CSS ──────────────────────────────────────────────────────────────

function ConfettiOverlay() {
  const colors = ["#0f766e", "#f97316", "#14b8a6", "#f4d03f", "#e76f51", "#2d6a4f"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      {Array.from({ length: 30 }).map((_, i) => {
        const color = colors[i % colors.length];
        const left = `${(i * 3.4) % 100}%`;
        const delay = `${(i * 0.08) % 1.5}s`;
        const size = 6 + (i % 5) * 2;
        const shape = i % 3 === 0 ? "rounded-full" : i % 3 === 1 ? "rounded-sm rotate-45" : "rounded-none rotate-12";
        return (
          <div
            key={i}
            className={cn("absolute top-0 animate-bounce", shape)}
            style={{
              left,
              width: size,
              height: size,
              backgroundColor: color,
              animationDelay: delay,
              animationDuration: `${0.8 + (i % 4) * 0.3}s`,
              top: `${(i * 7) % 90}%`,
              opacity: 0.8,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{completed} de {total} completados</span>
        <span className="font-semibold text-[#0f766e]">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#0f766e] to-teal-400 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Step row ──────────────────────────────────────────────────────────────────

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
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-2xl border transition-all duration-200",
        done
          ? "bg-teal-50 dark:bg-teal-900/15 border-teal-100 dark:border-teal-800/40"
          : "bg-white dark:bg-gray-800/60 border-gray-100 dark:border-gray-700/60 hover:border-teal-200 dark:hover:border-teal-700"
      )}
    >
      {/* Step number / check */}
      <div
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm transition-colors",
          done
            ? "bg-teal-500 text-white"
            : cn(step.bgLight, step.bgDark, step.color)
        )}
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Icon className="h-4.5 w-4.5" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "text-sm font-semibold",
              done
                ? "text-teal-700 dark:text-teal-400 line-through opacity-70"
                : "text-gray-900 dark:text-gray-100"
            )}
          >
            {index + 1}. {step.title}
          </p>
          {done && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 flex-shrink-0">
              Completado
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
          {step.description}
        </p>
      </div>

      {/* Action */}
      {!done && (
        <button
          type="button"
          onClick={() => onNavigate(step.href)}
          className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[#0f766e] dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors min-h-[44px] px-2"
        >
          <span className="hidden sm:inline whitespace-nowrap">Ir</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

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
  const [allDone, setAllDone] = useState(false);

  // Fetch dashboard data to determine step completion
  useEffect(() => {
    async function checkProgress() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();

        const products: unknown[] = data.products ?? [];
        const customers: unknown[] = data.customers ?? [];
        const sales: unknown[] = data.sales ?? [];
        const settings = data.settings ?? {};

        // Detect payment methods: any truthy value in paymentMethods
        const pm = settings.paymentMethods ?? {};
        const hasPayment = Object.values(pm).some(Boolean);

        // Detect businessName differs from slug (store customized)
        const businessName: string = settings.businessName ?? "";
        const slug: string = settings.slug ?? tenantSlug;
        const settingsDone = businessName.trim() !== "" && businessName !== slug;

        setStatus({
          productsDone: products.length >= 1,
          paymentDone: hasPayment,
          customersDone: customers.length >= 1,
          salesDone: sales.length >= 1,
          settingsDone,
        });
      } catch {
        // On error, keep defaults (all false)
      } finally {
        setLoading(false);
      }
    }

    void checkProgress();
  }, [tenantSlug]);

  // Detect all done
  useEffect(() => {
    const done = Object.values(status).every(Boolean);
    if (done && !loading) setAllDone(true);
  }, [status, loading]);

  const completedCount = Object.values(status).filter(Boolean).length;

  const handleNavigate = useCallback((href: string) => {
    // Mark wizard done and navigate
    try {
      localStorage.setItem(`onboarding-completed-${tenantSlug}`, "1");
    } catch {}
    onClose();
    // Small delay so the modal closes before navigating
    setTimeout(() => {
      window.location.href = href;
    }, 150);
  }, [tenantSlug, onClose]);

  const handleClose = useCallback(() => {
    try {
      localStorage.setItem(`onboarding-completed-${tenantSlug}`, "1");
    } catch {}
    onClose();
  }, [tenantSlug, onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Guía de configuración inicial"
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {allDone && <ConfettiOverlay />}

        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-teal-50 to-white dark:from-teal-900/20 dark:to-gray-900 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-[#0f766e] flex items-center justify-center shadow-md">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                {allDone ? "¡Tu bodega está lista!" : "Configura tu bodega"}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {allDone
                  ? "Completaste todos los pasos. Ya puedes operar al 100%."
                  : "Sigue estos pasos para empezar a vender desde hoy."}
              </p>
            </div>
            {/* Skip / close */}
            <button
              type="button"
              onClick={handleClose}
              title="Saltar por ahora"
              className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <ProgressBar completed={completedCount} total={STEPS.length} />
          </div>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {loading ? (
            // Skeleton
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
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

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex items-center gap-3">
          {allDone ? (
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#0f766e] hover:bg-[#0d5f58] text-white text-sm font-bold transition-colors shadow-md"
            >
              <Sparkles className="h-4 w-4" />
              ¡Empezar a vender!
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-2 min-h-[44px]"
              >
                Saltar por ahora
              </button>
              <button
                type="button"
                onClick={() => {
                  // Navigate to the first incomplete step
                  const first = STEPS.find((s) => !status[s.id]);
                  if (first) handleNavigate(first.href);
                }}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#0f766e] hover:bg-[#0d5f58] text-white text-sm font-bold transition-colors shadow-md"
              >
                Continuar configurando
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
