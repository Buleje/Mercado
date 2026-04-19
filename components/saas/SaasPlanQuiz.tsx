"use client";

import { useState } from "react";
import { ChevronRight, Sparkles, RotateCcw, Crown, Zap, Star, Gift } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  question: string;
  options: { label: string; value: number; emoji: string }[];
};

const QUESTIONS: Question[] = [
  {
    id: "products",
    question: "Cuantos productos manejas?",
    options: [
      { label: "Menos de 50", value: 0, emoji: "📦" },
      { label: "50 a 200", value: 1, emoji: "📦📦" },
      { label: "200 a 500", value: 2, emoji: "🏪" },
      { label: "Mas de 500", value: 3, emoji: "🏬" },
    ],
  },
  {
    id: "employees",
    question: "Cuantas personas trabajan contigo?",
    options: [
      { label: "Solo yo", value: 0, emoji: "👤" },
      { label: "2 a 5", value: 1, emoji: "👥" },
      { label: "6 a 15", value: 2, emoji: "👥👥" },
      { label: "Mas de 15", value: 3, emoji: "🏢" },
    ],
  },
  {
    id: "delivery",
    question: "Haces delivery a domicilio?",
    options: [
      { label: "No, solo en tienda", value: 0, emoji: "🏠" },
      { label: "A veces, por WhatsApp", value: 1, emoji: "📱" },
      { label: "Si, todos los dias", value: 2, emoji: "🛵" },
      { label: "Si, con varios repartidores", value: 3, emoji: "🚀" },
    ],
  },
];

type PlanResult = {
  plan: string;
  color: string;
  gradient: string;
  icon: React.ReactNode;
  description: string;
  price: string;
  cta: string;
};

const PLAN_RESULTS: Record<string, PlanResult> = {
  free: {
    plan: "Gratis",
    color: "text-gray-600",
    gradient: "from-gray-500 to-gray-600",
    icon: <Gift className="h-6 w-6" />,
    description: "Perfecto para empezar. Tendras todo lo basico para digitalizar tu bodega sin costo.",
    price: "S/ 0/mes",
    cta: "Empezar gratis",
  },
  pro: {
    plan: "Pro",
    color: "text-emerald-600",
    gradient: "from-emerald-500 to-indigo-600",
    icon: <Star className="h-6 w-6" />,
    description: "Tu negocio esta creciendo. Con Pro tendras mas productos, reportes avanzados y dominio personalizado.",
    price: "S/ 49/mes",
    cta: "Probar Pro 14 dias gratis",
  },
  business: {
    plan: "Business",
    color: "text-violet-600",
    gradient: "from-violet-500 to-purple-600",
    icon: <Zap className="h-6 w-6" />,
    description: "Para negocios serios. Multi-tienda, API, IA predictiva y todo ilimitado.",
    price: "S/ 149/mes",
    cta: "Probar Business 14 dias gratis",
  },
  enterprise: {
    plan: "Enterprise",
    color: "text-amber-600",
    gradient: "from-amber-500 to-orange-600",
    icon: <Crown className="h-6 w-6" />,
    description: "Cadena de tiendas o distribucion. Soporte dedicado, SLA y personalizacion total.",
    price: "Personalizado",
    cta: "Contactar ventas",
  },
};

function getRecommendation(answers: number[]): string {
  const total = answers.reduce((a, b) => a + b, 0);
  if (total <= 2) return "free";
  if (total <= 5) return "pro";
  if (total <= 7) return "business";
  return "enterprise";
}

export default function SaasPlanQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);

  const handleAnswer = (value: number) => {
    const newAnswers = [...answers, value];
    setAnswers(newAnswers);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      const plan = getRecommendation(newAnswers);
      setResult(PLAN_RESULTS[plan]);
    }
  };

  const reset = () => {
    setStep(0);
    setAnswers([]);
    setResult(null);
  };

  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Sparkles className="h-3 w-3" /> Quiz rapido
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Que plan necesitas?
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">3 preguntas. 15 segundos. Tu plan ideal.</p>
        </div>

        {!result ? (
          /* ── Preguntas ── */
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
            {/* Progress */}
            <div className="flex gap-2 mb-6">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 h-1.5 rounded-full transition-all",
                    i < step ? "bg-teal-500" : i === step ? "bg-teal-400" : "bg-gray-200 dark:bg-gray-700"
                  )}
                />
              ))}
            </div>

            <p className="text-xs text-gray-400 mb-2">Pregunta {step + 1} de {QUESTIONS.length}</p>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mb-5">
              {QUESTIONS[step].question}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUESTIONS[step].options.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handleAnswer(opt.value)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-all text-left group"
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-teal-700 dark:group-hover:text-teal-400">
                    {opt.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300 ml-auto group-hover:text-teal-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Resultado ── */
          <div className="text-center space-y-6">
            <div className={cn("inline-flex items-center justify-center h-16 w-16 rounded-2xl text-white mx-auto bg-gradient-to-br", result.gradient)}>
              {result.icon}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Tu plan ideal</p>
              <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white">{result.plan}</h3>
              <p className="text-2xl font-bold text-teal-600 mt-1">{result.price}</p>
            </div>

            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {result.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/registro"
                className={cn("px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg bg-gradient-to-r", result.gradient)}
              >
                {result.cta}
              </a>
              <button
                onClick={reset}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> Repetir quiz
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
