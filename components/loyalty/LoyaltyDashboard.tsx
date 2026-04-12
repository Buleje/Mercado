"use client";

/**
 * components/loyalty/LoyaltyDashboard.tsx
 *
 * Dashboard de fidelidad gamificado para el cliente.
 *
 * Flujo:
 *   1. El cliente ingresa su teléfono peruano (+51 9XXXXXXXX)
 *   2. Fetch a GET /api/loyalty/[phone]
 *   3. Renderiza: balance, nivel, barra de progreso, historial, recompensas
 *
 * Reglas CLAUDE.md:
 *   - "use client" solo en este componente (no en la página)
 *   - Nunca Prisma directo — usa fetch a la API REST
 *   - safeParse de Zod para validar la respuesta
 *   - Totales no se calculan aquí — vienen del backend
 *   - Touch targets mínimo 44x44px en mobile
 *   - Dark mode: todas las clases tienen variante dark:
 */

import {
  useState,
  useCallback,
  useTransition,
  useId,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  Loader2,
  Trophy,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  Smartphone,
  Gift,
  ShoppingCart,
} from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import LoyaltyLevelBadge, {
  getLevelFromPoints,
  getLevelProgress,
  getPointsToNextLevel,
  getNextLevel,
  LEVEL_META,
  type LoyaltyLevel,
} from "@/components/loyalty/LoyaltyLevelBadge";

// ── Schemas de validación Zod ─────────────────────────────────────────────────

/**
 * Forma del objeto que devuelve GET /api/loyalty/[phone].
 * usamos safeParse — nunca .parse() (CLAUDE.md #2).
 */
const AutoDiscountTierSchema = z.object({
  minPurchases: z.number(),
  percent: z.number(),
  label: z.string(),
});

const AutoDiscountSchema = z.object({
  totalOrders: z.number(),
  currentTier: z.string(),
  currentPercent: z.number(),
  nextTier: z
    .object({
      label: z.string(),
      percent: z.number(),
      ordersNeeded: z.number(),
    })
    .nullable(),
  allTiers: z.array(AutoDiscountTierSchema),
});

const LoyaltyResponseSchema = z.object({
  phone: z.string().optional(),
  name: z.string().optional(),
  loyaltyPoints: z.number().default(0),
  loyaltyTier: z.string().default("bronce"),
  totalSpent: z.number().optional().default(0),
  referralCode: z.string().nullable().optional(),
  creditBalance: z.number().optional().default(0),
  autoDiscount: AutoDiscountSchema.optional(),
});

const RewardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  pointsCost: z.number(),
  type: z.string(),
  value: z.number(),
  icon: z.string(),
});

type LoyaltyData = z.infer<typeof LoyaltyResponseSchema>;
type Reward = z.infer<typeof RewardSchema>;

// ── Validación del teléfono peruano ───────────────────────────────────────────

const PhoneInputSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .min(9, "Ingresa un número de 9 dígitos")
      .max(11, "Número muy largo")
      .regex(/^(51)?9\d{8}$/, "Debe ser un celular peruano (9XXXXXXXX)"),
  );

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Si ya tiene prefijo 51, lo dejamos; si no, lo añadimos
  return digits.startsWith("51") ? digits : `51${digits}`;
}

// ── Formateadores ─────────────────────────────────────────────────────────────

function formatPoints(n: number): string {
  return n.toLocaleString("es-PE");
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-PE", {
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function formatPhone(raw: string): string {
  // Formatea "51987654321" → "+51 987 654 321"
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("51") ? digits.slice(2) : digits;
  if (local.length === 9) {
    return `+51 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+51 ${local}`;
}

// ── Sub-componente: Balance Card ──────────────────────────────────────────────

interface BalanceCardProps {
  data: LoyaltyData;
  level: LoyaltyLevel;
}

function BalanceCard({ data, level }: BalanceCardProps) {
  const points = data.loyaltyPoints ?? 0;
  const progress = getLevelProgress(points);
  const toNext = getPointsToNextLevel(points);
  const nextLevel = getNextLevel(level);
  const nextMeta = nextLevel ? LEVEL_META[nextLevel] : null;

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
      {/* Cabecera con gradiente de marca */}
      <div
        className="px-5 py-6 text-white"
        style={{
          background:
            "linear-gradient(135deg, #009690 0%, #00B4A6 55%, #33C4B8 100%)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Puntos y nombre */}
          <div>
            {data.name && (
              <p className="text-sm text-white/70 font-medium mb-0.5">
                Hola, {data.name.split(" ")[0]}
              </p>
            )}
            <p className="text-4xl font-black tabular-nums leading-none">
              {formatPoints(points)}
            </p>
            <p className="text-sm text-white/60 mt-1">puntos acumulados</p>
          </div>

          {/* Badge de nivel */}
          <div className="shrink-0">
            <LoyaltyLevelBadge level={level} size="md" showTooltip />
          </div>
        </div>

        {/* Barra de progreso al siguiente nivel */}
        {nextMeta && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-white/65 mb-1.5">
              <span>
                Progreso a{" "}
                <span className="font-bold text-white/85">
                  {nextMeta.label}
                </span>
              </span>
              <span>
                {formatPoints(points)} / {formatPoints(LEVEL_META[nextLevel!].minPoints)} pts
              </span>
            </div>
            <div
              className="h-2.5 rounded-full overflow-hidden bg-white/15"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progreso al nivel ${nextMeta.label}`}
            >
              <div
                className="h-full rounded-full bg-white/80 transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-white/50 mt-1.5">
              {toNext > 0
                ? `Faltan ${formatPoints(toNext)} pts para ${nextMeta.label} ${nextMeta.emoji}`
                : `¡Ya eres ${nextMeta.label}!`}
            </p>
          </div>
        )}

        {/* Nivel máximo */}
        {!nextMeta && (
          <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <span className="text-lg">🏆</span>
            <p className="text-xs text-white/80 font-medium">
              Nivel máximo alcanzado — ¡eres VIP Diamante!
            </p>
          </div>
        )}
      </div>

      {/* Métricas secundarias */}
      <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700/60 border-t border-gray-100 dark:border-gray-700/60">
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">
            Total gastado
          </p>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
            S/ {(data.totalSpent ?? 0).toFixed(0)}
          </p>
        </div>
        {data.creditBalance !== undefined && data.creditBalance > 0 ? (
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">
              Crédito
            </p>
            <p className="text-sm font-bold text-[color:var(--color-primary)]">
              S/ {data.creditBalance.toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">
              Teléfono
            </p>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 tabular-nums">
              {data.phone ? formatPhone(data.phone) : "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-componente: Escalera de niveles ───────────────────────────────────────

interface LevelLadderProps {
  currentLevel: LoyaltyLevel;
}

function LevelLadder({ currentLevel }: LevelLadderProps) {
  const levels: LoyaltyLevel[] = ["bronce", "plata", "oro", "diamante"];

  return (
    <section aria-labelledby="levels-heading">
      <h2
        id="levels-heading"
        className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3"
      >
        Niveles del programa
      </h2>
      <div className="space-y-2">
        {levels.map((lvl) => {
          const meta = LEVEL_META[lvl];
          const isActive = lvl === currentLevel;
          return (
            <div
              key={lvl}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                isActive
                  ? cn(
                      meta.bgColor,
                      meta.borderColor,
                      "ring-1",
                      meta.ringColor,
                    )
                  : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700/60",
              )}
            >
              <span className="text-xl shrink-0" role="img" aria-hidden="true">
                {meta.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-bold",
                    isActive ? meta.textColor : "text-gray-800 dark:text-gray-200",
                  )}
                >
                  {meta.label}
                  {isActive && (
                    <span className="ml-2 text-xs font-medium text-[color:var(--color-primary)]">
                      (tu nivel actual)
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {meta.maxPoints !== undefined
                    ? `${meta.minPoints} – ${meta.maxPoints} pts`
                    : `${meta.minPoints}+ pts`}
                </p>
              </div>
              {isActive && (
                <Trophy
                  className="h-4 w-4 shrink-0 text-[color:var(--color-primary)]"
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Sub-componente: Historial de transacciones ────────────────────────────────

interface Transaction {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
}

interface TransactionListProps {
  transactions: Transaction[];
}

/**
 * Mapea el campo `reason` de la DB a un texto legible en español.
 * Los valores provienen de LoyaltyReason del backend.
 */
function reasonLabel(reason: string): string {
  const MAP: Record<string, string> = {
    purchase: "Compra",
    referral: "Referido",
    birthday: "Cumpleaños",
    manual_earn: "Ajuste manual",
    redeem_discount: "Canje — descuento",
    redeem_delivery: "Canje — delivery gratis",
    redeem_product: "Canje — producto",
    manual_redeem: "Canje manual",
  };
  return MAP[reason] ?? reason;
}

function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 px-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-200 dark:border-gray-700">
        <Gift
          className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Aún no tienes transacciones
        </p>
        <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">
          ¡Haz tu primera compra para ganar puntos!
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Historial de puntos">
      {transactions.map((tx) => {
        const isEarn = tx.amount > 0;
        return (
          <li
            key={tx.id}
            className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-900 px-4 py-3"
          >
            {/* Icono earn / redeem */}
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                isEarn
                  ? "bg-emerald-50 dark:bg-emerald-900/25"
                  : "bg-red-50 dark:bg-red-900/25",
              )}
              aria-hidden="true"
            >
              {isEarn ? (
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500 dark:text-red-400" />
              )}
            </div>

            {/* Descripción */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {reasonLabel(tx.reason)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {formatDate(tx.createdAt)}
              </p>
            </div>

            {/* Puntos */}
            <p
              className={cn(
                "text-sm font-extrabold tabular-nums shrink-0",
                isEarn
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500 dark:text-red-400",
              )}
              aria-label={`${isEarn ? "Ganaste" : "Canjeaste"} ${Math.abs(tx.amount)} puntos`}
            >
              {isEarn ? "+" : "−"}{formatPoints(Math.abs(tx.amount))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ── Sub-componente: Catálogo de recompensas ───────────────────────────────────

interface RewardCatalogProps {
  rewards: Reward[];
  currentPoints: number;
}

function RewardCatalog({ rewards, currentPoints }: RewardCatalogProps) {
  if (rewards.length === 0) return null;

  return (
    <section aria-labelledby="rewards-heading">
      <h2
        id="rewards-heading"
        className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3"
      >
        Canjea tus puntos
      </h2>
      <ul className="space-y-2">
        {rewards.map((reward) => {
          const canRedeem = currentPoints >= reward.pointsCost;
          const missing = reward.pointsCost - currentPoints;
          return (
            <li
              key={reward.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                canRedeem
                  ? "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700/60"
                  : "bg-gray-50/80 dark:bg-gray-800/30 border-gray-100 dark:border-gray-700/40 opacity-70",
              )}
            >
              {/* Icono de la recompensa */}
              <span
                className="text-2xl shrink-0 leading-none"
                role="img"
                aria-label={reward.name}
              >
                {reward.icon}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">
                  {reward.name}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {reward.description}
                </p>
              </div>

              {/* Costo y estado */}
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    "text-sm font-extrabold tabular-nums",
                    canRedeem
                      ? "text-[color:var(--color-primary)]"
                      : "text-gray-400 dark:text-gray-500",
                  )}
                >
                  {formatPoints(reward.pointsCost)} pts
                </p>
                {canRedeem ? (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    Disponible
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Faltan {formatPoints(missing)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
        Para canjear, pídelo al momento de pagar o escríbenos por WhatsApp.
      </p>
    </section>
  );
}

// ── Componente principal: LoyaltyDashboard ────────────────────────────────────

export default function LoyaltyDashboard() {
  // Identificadores únicos para accesibilidad
  const phoneInputId = useId();
  const phoneErrorId = useId();

  // Estado del formulario de teléfono
  const [rawPhone, setRawPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Estado de los datos
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [fetchError, setFetchError] = useState("");

  // useTransition para no bloquear la UI durante la carga
  const [isPending, startTransition] = useTransition();

  // ── Fetch de datos ──────────────────────────────────────────────────────────

  const fetchLoyalty = useCallback(
    async (phone: string) => {
      setFetchError("");

      startTransition(async () => {
        try {
          // Fetch en paralelo: loyalty + recompensas disponibles
          const [loyaltyRes, rewardsRes] = await Promise.all([
            fetch(`/api/loyalty/${encodeURIComponent(phone)}`, {
              headers: { "Cache-Control": "no-store" },
            }),
            fetch("/api/loyalty/redeem"),
          ]);

          // Manejar 404 (cliente no encontrado)
          if (loyaltyRes.status === 404) {
            setFetchError(
              "No encontramos ese número. Verifica que hayas comprado antes.",
            );
            setLoyaltyData(null);
            return;
          }

          if (!loyaltyRes.ok) {
            setFetchError("Error al obtener tus puntos. Intenta de nuevo.");
            return;
          }

          // Validar respuesta con safeParse (CLAUDE.md #2 — nunca .parse())
          const rawLoyalty: unknown = await loyaltyRes.json();
          const loyaltyParsed = LoyaltyResponseSchema.safeParse(rawLoyalty);
          if (!loyaltyParsed.success) {
            setFetchError("Respuesta inesperada del servidor.");
            return;
          }
          setLoyaltyData(loyaltyParsed.data);

          // Recompensas son opcionales — si fallan, no bloqueamos
          if (rewardsRes.ok) {
            const rawRewards: unknown = await rewardsRes.json();
            const rewardsParsed = z.array(RewardSchema).safeParse(rawRewards);
            if (rewardsParsed.success) {
              setRewards(rewardsParsed.data);
            }
          }
        } catch {
          setFetchError(
            "No pudimos conectar con el servidor. Revisa tu conexión.",
          );
          setLoyaltyData(null);
        }
      });
    },
    [],
  );

  // ── Submit del formulario ───────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setPhoneError("");
      setLoyaltyData(null);
      setFetchError("");

      // Validar con safeParse — nunca .parse()
      const validation = PhoneInputSchema.safeParse(rawPhone);
      if (!validation.success) {
        setPhoneError(validation.error.issues[0]?.message ?? "Número inválido");
        return;
      }

      fetchLoyalty(normalizePhone(rawPhone));
    },
    [rawPhone, fetchLoyalty],
  );

  const handleReset = useCallback(() => {
    setRawPhone("");
    setLoyaltyData(null);
    setFetchError("");
    setPhoneError("");
    setRewards([]);
  }, []);

  // ── Derivados ───────────────────────────────────────────────────────────────

  const currentPoints = loyaltyData?.loyaltyPoints ?? 0;
  const currentLevel = getLevelFromPoints(currentPoints);

  // La API devuelve transactions como parte del historial
  // Adaptamos la forma que viene del backend (puede venir como `transactions` o directamente)
  type RawTransaction = {
    id: string;
    amount: number;
    reason: string;
    createdAt: string;
  };
  const transactions: RawTransaction[] = (() => {
    if (!loyaltyData) return [];
    // El GET /api/loyalty/[phone] devuelve el objeto del cliente,
    // las transacciones pueden venir en un campo `transactions`
    const raw = loyaltyData as LoyaltyData & {
      transactions?: RawTransaction[];
    };
    return raw.transactions ?? [];
  })();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg mx-auto px-4 sm:px-0 pb-16">
      {/* ── Formulario de teléfono ──────────────────────────────────────────── */}
      <section
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm mb-6"
        aria-label="Consultar puntos"
      >
        <div className="flex items-center gap-2 mb-4">
          <Smartphone
            className="h-5 w-5 text-[color:var(--color-primary)] shrink-0"
            aria-hidden="true"
          />
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Ingresa tu celular para ver tus puntos
          </h2>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="flex gap-2">
            {/* Input de teléfono */}
            <div className="flex-1">
              <label htmlFor={phoneInputId} className="sr-only">
                Número de celular peruano
              </label>
              <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-[color:var(--color-primary)] focus-within:border-transparent transition-all">
                {/* Prefijo +51 */}
                <span className="flex items-center pl-3 pr-2 text-sm text-gray-400 dark:text-gray-500 select-none font-medium shrink-0">
                  +51
                </span>
                <input
                  id={phoneInputId}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="9XXXXXXXX"
                  value={rawPhone}
                  onChange={(e) => {
                    // Solo permitir dígitos y limitar a 9 caracteres
                    const v = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setRawPhone(v);
                    if (phoneError) setPhoneError("");
                  }}
                  aria-describedby={phoneError ? phoneErrorId : undefined}
                  aria-invalid={!!phoneError}
                  className="flex-1 bg-transparent py-3 pr-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 outline-none min-w-0"
                />
              </div>

              {/* Error de validación */}
              {phoneError && (
                <p
                  id={phoneErrorId}
                  role="alert"
                  className="mt-1.5 text-xs text-red-500 dark:text-red-400 flex items-center gap-1"
                >
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {phoneError}
                </p>
              )}
            </div>

            {/* Botón consultar — mínimo 44px de alto (touch target CLAUDE.md) */}
            <button
              type="submit"
              disabled={isPending || rawPhone.length < 9}
              className={cn(
                "min-h-[44px] min-w-[80px] px-4 rounded-xl text-sm font-bold text-white transition-all duration-200 shrink-0",
                "bg-[color:var(--color-primary)] hover:bg-[color:var(--color-primary-dark)] active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-offset-2",
              )}
              aria-label="Consultar mis puntos"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" aria-hidden="true" />
              ) : (
                "Ver"
              )}
            </button>
          </div>
        </form>
      </section>

      {/* ── Estado: cargando ────────────────────────────────────────────────── */}
      {isPending && (
        <div
          className="flex flex-col items-center justify-center py-16 gap-3"
          aria-live="polite"
          aria-label="Cargando tus puntos"
        >
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--color-primary)]" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Buscando tus puntos…
          </p>
        </div>
      )}

      {/* ── Estado: error de fetch ──────────────────────────────────────────── */}
      {!isPending && fetchError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/15 px-5 py-4 mb-6"
        >
          <AlertCircle
            className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-600 dark:text-red-300">
              {fetchError}
            </p>
            <button
              onClick={handleReset}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-500 dark:text-red-400 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Intentar con otro número
            </button>
          </div>
        </div>
      )}

      {/* ── Dashboard completo cuando hay datos ────────────────────────────── */}
      {!isPending && loyaltyData && (
        <div className="space-y-6" aria-live="polite">
          {/* Balance card principal */}
          <BalanceCard data={loyaltyData} level={currentLevel} />

          {/* Historial de transacciones */}
          <section aria-labelledby="history-heading">
            <div className="flex items-center justify-between mb-3">
              <h2
                id="history-heading"
                className="text-base font-bold text-gray-900 dark:text-gray-100"
              >
                Historial reciente
              </h2>
              {loyaltyData.phone && (
                <button
                  onClick={() => fetchLoyalty(loyaltyData.phone!)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-400 dark:text-gray-500 hover:text-[color:var(--color-primary)] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Actualizar historial"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <TransactionList transactions={transactions} />
          </section>

          {/* Escalera de niveles */}
          <LevelLadder currentLevel={currentLevel} />

          {/* Catálogo de recompensas */}
          <RewardCatalog rewards={rewards} currentPoints={currentPoints} />

          {/* CTA — seguir comprando */}
          <div className="text-center pt-2">
            <Link
              href="/tienda"
              className={cn(
                "inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-white",
                "bg-[color:var(--color-primary)] hover:bg-[color:var(--color-primary-dark)]",
                "shadow-lg shadow-[color:var(--color-primary)]/20 active:scale-95",
                "transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-offset-2",
                // Touch target mínimo
                "min-h-[48px]",
              )}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              Seguir comprando
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Gana más puntos con cada compra
            </p>
          </div>

          {/* Botón cambiar número */}
          <div className="text-center pb-2">
            <button
              onClick={handleReset}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2 transition-colors min-h-[44px] px-2"
            >
              Consultar otro número
            </button>
          </div>
        </div>
      )}

      {/* ── Estado vacío inicial (sin datos y sin error) ────────────────────── */}
      {!isPending && !loyaltyData && !fetchError && (
        <div className="text-center py-10 px-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--color-primary)]/10 dark:bg-[color:var(--color-primary)]/15 mb-4">
            <Trophy
              className="h-8 w-8 text-[color:var(--color-primary)]"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">
            Descubre tus puntos acumulados
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
            Ingresa tu número de celular para ver tu nivel, saldo y
            recompensas disponibles.
          </p>
        </div>
      )}
    </div>
  );
}
