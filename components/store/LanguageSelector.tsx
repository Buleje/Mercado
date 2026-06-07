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
import { Globe } from "@buleje/design-system/icons";

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
          "border-[var(--accent)] text-[var(--accent)] dark:text-[#14C2C2] dark:border-[#14C2C2]",
          "hover:bg-[var(--accent)]/10",
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
        "bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="font-semibold text-[var(--text-primary)] text-sm">
          Idioma / Simi
        </h3>
      </div>

      <div className="flex rounded-xl overflow-hidden border border-[var(--rule-base)]">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setLang(opt.value)}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold transition-colors",
              lang === opt.value
                ? "bg-[var(--accent-600,var(--accent))] text-white"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700"
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
              className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-[var(--surface-sunken)]"
            >
              <span className="text-xs text-[var(--text-tertiary)] capitalize">{key}</span>
              <span className="text-xs font-semibold text-[var(--text-primary)]">{value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
