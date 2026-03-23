 
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useMemo,
} from "react";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Lang = "es" | "qu";

type TranslationKey =
  | "products"
  | "cart"
  | "buy"
  | "search"
  | "price"
  | "delivery"
  | "welcome"
  | "categories"
  | "add"
  | "total"
  | "order"
  | "cancel"
  | "confirm"
  | "empty_cart"
  | "loading";

type Translations = Record<TranslationKey, string>;

// ── Dictionary ────────────────────────────────────────────────────────────────

const DICT: Record<Lang, Translations> = {
  es: {
    products: "Productos",
    cart: "Carrito",
    buy: "Comprar",
    search: "Buscar",
    price: "Precio",
    delivery: "Delivery",
    welcome: "Bienvenido",
    categories: "Categorias",
    add: "Agregar",
    total: "Total",
    order: "Pedido",
    cancel: "Cancelar",
    confirm: "Confirmar",
    empty_cart: "Tu carrito esta vacio",
    loading: "Cargando...",
  },
  qu: {
    products: "Mikunakuna",
    cart: "Apana",
    buy: "Rantiy",
    search: "Maskay",
    price: "Chanin",
    delivery: "Pusay",
    welcome: "Allin Hamuyki",
    categories: "Yupaykuna",
    add: "Yapay",
    total: "Llapan",
    order: "Mañakuy",
    cancel: "Saqiy",
    confirm: "Chiqaychay",
    empty_cart: "Apanayki ch'uya",
    loading: "Llamk'achkasqa...",
  },
};

// ── Context ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bodega_lang";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: "es",
  setLang: () => {},
  t: (key) => DICT.es[key],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "es" || stored === "qu") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((key: TranslationKey) => DICT[lang][key], [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLanguage(): LangContextValue {
  return useContext(LangContext);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LanguageSelectorProps {
  className?: string;
  compact?: boolean;
}

export default function LanguageSelector({ className, compact = false }: LanguageSelectorProps) {
  const { lang, setLang } = useLanguage();

  const options: { value: Lang; label: string; native: string }[] = [
    { value: "es", label: "Espanol", native: "ES" },
    { value: "qu", label: "Quechua", native: "QU" },
  ];

  if (compact) {
    return (
      <button
        onClick={() => setLang(lang === "es" ? "qu" : "es")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors",
          "border-[#2d6a4f] text-[#2d6a4f] dark:text-[#52b788] dark:border-[#52b788]",
          "hover:bg-[#2d6a4f]/10",
          className
        )}
        aria-label="Cambiar idioma"
      >
        <Globe className="w-3.5 h-3.5" />
        {lang === "es" ? "QU" : "ES"}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-[#2d6a4f]" />
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
          Idioma / Simi
        </h3>
      </div>

      <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setLang(opt.value)}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold transition-colors",
              lang === opt.value
                ? "bg-[#2d6a4f] text-white"
                : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            )}
          >
            {opt.native} — {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(Object.entries(DICT[lang]) as [TranslationKey, string][])
          .slice(0, 6)
          .map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800"
            >
              <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{key}</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-white">{value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
