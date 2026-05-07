"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from "react";
import { Search, Copy, Check, Trash2, Clock, Hash, Eye } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  name: string;
  price: number;
  category?: string;
};

type PostType = "oferta" | "nuevo" | "receta" | "motivacional";

type GeneratedPost = {
  id: string;
  text: string;
  type: PostType;
  productName: string;
  hashtags: string;
  createdAt: string;
};

// ── Constants ───────────────────────────────────────────────────────────────

const POST_TYPES: { value: PostType; label: string }[] = [
  { value: "oferta", label: "Oferta del dia" },
  { value: "nuevo", label: "Nuevo producto" },
  { value: "receta", label: "Receta / Uso" },
  { value: "motivacional", label: "Motivacional" },
];

const HASHTAGS =
  "#Buleje #Pucallpa #Ofertas #Abarrotes #Delivery #TiendaLocal";

const TYPE_COLORS: Record<PostType, string> = {
  oferta:
    "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",
  nuevo:
    "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  receta:
    "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  motivacional:
    "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
};

const LS_KEY = "buleje_post_history";

// ── Template generator ──────────────────────────────────────────────────────

function generateText(
  type: PostType,
  product: Product,
  prevPrice: string,
  customNote: string
): string {
  const prev = parseFloat(prevPrice);
  switch (type) {
    case "oferta":
      return (
        `OFERTA DEL DIA — ${product.name} a solo S/ ${Number(product.price).toFixed(2)}!` +
        (prev > 0 ? ` Antes S/ ${prev.toFixed(2)}.` : "") +
        ` Solo en Buleje. Pide por WhatsApp!`
      );
    case "nuevo":
      return `RECIEN LLEGADO — ${product.name}. Ya disponible en nuestra tienda. Ven a visitarnos o pide por WhatsApp!`;
    case "receta":
      return (
        `SABIAS QUE... con ${product.name} puedes preparar platos deliciosos?` +
        (customNote ? ` ${customNote}` : "") +
        ` Consiguelo en Buleje, Pucallpa.`
      );
    case "motivacional":
      return (
        `Gracias por confiar en Buleje. Cada compra apoya a una familia pucallpina.` +
        (customNote ? ` ${customNote}` : "") +
        ` Los esperamos!`
      );
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SocialPostGenerator() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [postType, setPostType] = useState<PostType>("oferta");
  const [prevPrice, setPrevPrice] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<GeneratedPost[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load products
  useEffect(() => {
    setLoadingProducts(true);
    fetch("/api/products?limit=200")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.products ?? []);
        setProducts(list);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  // Load history
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const saveHistory = useCallback((next: GeneratedPost[]) => {
    setHistory(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleGenerate = () => {
    if (!selectedProduct && postType !== "motivacional") return;
    const prod = selectedProduct ?? { id: 0, name: "Tienda", price: 0 };
    const text = generateText(postType, prod, prevPrice, customNote);
    setGeneratedText(text);
  };

  const handleCopy = () => {
    if (!generatedText) return;
    navigator.clipboard.writeText(generatedText + "\n\n" + HASHTAGS).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        // Save to history
        const entry: GeneratedPost = {
          id: Date.now().toString(),
          text: generatedText,
          type: postType,
          productName: selectedProduct?.name ?? "—",
          hashtags: HASHTAGS,
          createdAt: new Date().toISOString(),
        };
        saveHistory([entry, ...history].slice(0, 20));
      },
      () => {}
    );
  };

  const removeFromHistory = (id: string) => {
    saveHistory(history.filter((h) => h.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Generador de Posts
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Crea contenido para redes sociales en segundos
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-gray-50 dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
        >
          <Clock className="h-4 w-4" />
          Historial ({history.length})
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Form */}
        <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
          {/* Post type */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
              Tipo de post
            </label>
            <div className="grid grid-cols-2 gap-2">
              {POST_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setPostType(t.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition",
                    postType === t.value
                      ? "border-primary bg-primary text-white"
                      : "border-[var(--rule-base)] bg-gray-50 text-[var(--text-primary)] hover:border-primary/50 dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product search */}
          {postType !== "motivacional" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                Producto
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
                />
              </div>
              {search && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
                  {loadingProducts ? (
                    <p className="p-3 text-sm text-[var(--text-secondary)]">Cargando...</p>
                  ) : filteredProducts.length === 0 ? (
                    <p className="p-3 text-sm text-[var(--text-secondary)]">Sin resultados</p>
                  ) : (
                    filteredProducts.slice(0, 8).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedProduct(p);
                          setSearch(p.name);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-[var(--surface-sunken)]"
                      >
                        <span className="text-[var(--text-primary)]">
                          {p.name}
                        </span>
                        <span className="font-medium text-primary">
                          S/ {p.price?.toFixed(2)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {selectedProduct && (
                <p className="mt-1 text-xs text-primary">
                  Seleccionado: {selectedProduct.name} — S/{" "}
                  {Number(selectedProduct.price).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Prev price (oferta only) */}
          {postType === "oferta" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Precio anterior (opcional)
              </label>
              <input
                type="number"
                value={prevPrice}
                onChange={(e) => setPrevPrice(e.target.value)}
                placeholder="Ej: 5.50"
                className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
              />
            </div>
          )}

          {/* Custom note */}
          {(postType === "receta" || postType === "motivacional") && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Nota adicional
              </label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={2}
                placeholder="Agrega un detalle personal..."
                className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
              />
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!selectedProduct && postType !== "motivacional"}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            Generar post
          </button>
        </div>

        {/* Right: Preview */}
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
            <div className="mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-[var(--text-tertiary)]" />
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Preview — estilo Instagram
              </span>
            </div>
            {generatedText ? (
              <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--brand-ink)] p-5 dark:border-[var(--rule-base)]">
                <div className="mb-1 text-xs font-bold text-[var(--data-warning-500)]">
                  Buleje
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
                  {generatedText}
                </p>
                <p className="mt-3 text-xs text-[var(--data-success-500)]">{HASHTAGS}</p>
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-[var(--rule-base)]">
                <p className="text-sm text-[var(--text-tertiary)]">
                  Genera un post para verlo aqui
                </p>
              </div>
            )}
          </div>

          {generatedText && (
            <button
              onClick={handleCopy}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
                copied
                  ? "bg-[var(--accent-soft)] text-white"
                  : "bg-[var(--data-warning-500)] text-white hover:bg-[#e08c4a]"
              )}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copiado al portapapeles
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar texto + hashtags
                </>
              )}
            </button>
          )}

          {/* Hashtags */}
          <div className="flex flex-wrap gap-2">
            {HASHTAGS.split(" ").map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary dark:bg-primary/20 dark:text-[var(--data-success-500)]"
              >
                <Hash className="h-3 w-3" />
                {tag.replace("#", "")}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* History */}
      {showHistory && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <CardTitle className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            Historial de posts generados
          </CardTitle>
          {history.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No hay posts en el historial.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 rounded-lg border border-[var(--rule-soft)] p-3 dark:border-[var(--rule-base)]"
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      TYPE_COLORS[h.type]
                    )}
                  >
                    {POST_TYPES.find((t) => t.value === h.type)?.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--text-secondary)]">
                      {h.text}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                      {h.productName} —{" "}
                      {new Date(h.createdAt).toLocaleDateString("es-PE")}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromHistory(h.id)}
                    className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
