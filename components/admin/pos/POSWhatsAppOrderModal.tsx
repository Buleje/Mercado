"use client";

import { useState, useCallback } from "react";
import { ShoppingBasket, MessageCircle } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/components/admin/pos/pos-shared";

interface POSWhatsAppOrderModalProps {
  showWhatsAppOrder: boolean;
  setShowWhatsAppOrder: (v: boolean) => void;
  products: Product[];
  handleAddFromSearch: (productId: number, quantity?: number) => void;
}

/** Pega el mensaje del cliente y arma el carrito con lo que encuentra. */
export default function POSWhatsAppOrderModal({ showWhatsAppOrder, setShowWhatsAppOrder, products, handleAddFromSearch }: POSWhatsAppOrderModalProps) {
  const [waText, setWaText] = useState("");
  const [waParsedItems, setWaParsedItems] = useState<{ raw: string; qty: number; search: string; matches: Product[]; selected: Product | null }[]>([]);

  const parseWhatsAppOrder = useCallback((text: string) => {
    if (!text.trim()) { setWaParsedItems([]); return; }

    // Limpiar frases peruanas comunes
    const cleaned = text
      .replace(/quiero\s+pedir/gi, "")
      .replace(/mándame|mandame|necesito|ponme|dame|envíame|enviame/gi, "")
      .replace(/por\s+favor|porfa|porfavor/gi, "")
      .replace(/también|tambien/gi, ",")
      .replace(/\s+y\s+/gi, ", ");

    // Dividir por comas, puntos y comas, saltos de linea, puntos
    const lines = cleaned.split(/[,;.\n]+/).map(l => l.trim()).filter(l => l.length > 2);
    const results: typeof waParsedItems = [];

    // Fuzzy match: cada char de query existe en orden en text
    const fuzzyMatch = (query: string, text: string): boolean => {
      const q = query.replace(/\s+/g, "").toLowerCase();
      const t = text.toLowerCase();
      let qi = 0;
      for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) qi++;
      }
      return qi === q.length && q.length >= 3;
    };

    for (const line of lines) {
      // Extraer cantidad con unidad opcional
      const match = line.match(
        /^(\d+\.?\d*)\s*(kilos?|kg|litros?|l|unid(?:ades?)?|packs?|cajas?|docenas?|bolsas?|botellas?|latas?|sobres?|paquetes?)?\s*(?:de\s+)?(.+)$/i
      );
      let qty = 1;
      let searchTerm = line;

      if (match) {
        qty = parseFloat(match[1]) || 1;
        searchTerm = match[3]?.trim() || line;
      } else {
        // Intentar formato inverso: "arroz x 3"
        const matchInv = line.match(/^(.+?)\s*[x×]\s*(\d+\.?\d*)$/i);
        if (matchInv) {
          searchTerm = matchInv[1].trim();
          qty = parseFloat(matchInv[2]) || 1;
        } else {
          // Sin número: "cebollas" -> qty 1
          searchTerm = line.replace(/^\d+\s*/, "").trim() || line;
        }
      }

      // Buscar producto en catalogo (incluye fuzzy)
      const searchLower = searchTerm.toLowerCase();
      const matches = products.filter(p => {
        const pName = p.name.toLowerCase();
        // Coincidencia directa
        if (pName.includes(searchLower) || searchLower.includes(pName)) return true;
        // Cada palabra del search aparece en el nombre
        if (searchLower.split(/\s+/).every(word => pName.includes(word))) return true;
        // Fuzzy match
        if (fuzzyMatch(searchLower, pName)) return true;
        return false;
      }).slice(0, 5);

      results.push({
        raw: line,
        qty,
        search: searchTerm,
        matches,
        selected: matches.length === 1 ? matches[0] : null,
      });
    }
    setWaParsedItems(results);
  }, [products]);

  return (
      <AdminModal open={showWhatsAppOrder} onClose={() => setShowWhatsAppOrder(false)} title="Pedido por WhatsApp" icon={MessageCircle}>
          <div className={MODAL_BODY}>
            <p className="text-xs text-[var(--text-secondary)] mb-3">Pega aqui el mensaje del cliente y el sistema encontrara los productos:</p>

            <textarea
              value={waText}
              onChange={e => { setWaText(e.target.value); parseWhatsAppOrder(e.target.value); }}
              placeholder={"Ej: 2 arroz, 3 leche gloria, 1 aceite\no: dame 5 huevos y 2 gaseosas"}
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40 resize-none font-mono"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- se abre para pegar el mensaje de WhatsApp de inmediato
              autoFocus
            />

            {waParsedItems.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold text-[var(--text-secondary)]">Productos encontrados</p>
                {waParsedItems.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                    {item.selected || item.matches.length === 1 ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[var(--data-success-500)] font-bold text-xs shrink-0">x{item.qty}</span>
                          <span className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{(item.selected || item.matches[0]).name}</span>
                        </div>
                        <span className="text-sm font-bold text-primary shrink-0">{formatCurrency((item.selected || item.matches[0]).price * item.qty)}</span>
                      </div>
                    ) : item.matches.length > 1 ? (
                      <div>
                        <p className="text-xs text-[var(--data-warning-ink)] font-bold mb-1.5">&quot;{item.search}&quot; — {item.matches.length} opciones:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.matches.map(m => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setWaParsedItems(prev => prev.map((p, i) => i === idx ? { ...p, selected: m } : p));
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:border-primary hover:text-primary transition-colors"
                            >
                              {m.name} · {formatCurrency(Number(m.price))}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--data-error-500)] font-bold">&quot;{item.search}&quot; — No encontrado</p>
                    )}
                  </div>
                ))}

                {(() => {
                  const resolved = waParsedItems.filter(i => i.selected || i.matches.length === 1);
                  const total = resolved.reduce((s, i) => s + ((i.selected || i.matches[0])?.price ?? 0) * i.qty, 0);
                  return (
                    <div className="pt-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-[var(--text-primary)]">Total estimado: <span className="text-primary">{formatCurrency(total)}</span></span>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{resolved.length}/{waParsedItems.length} items</span>
                      </div>
                      <button
                        onClick={() => {
                          for (const item of resolved) {
                            const product = item.selected || item.matches[0];
                            if (product) {
                              for (let i = 0; i < item.qty; i++) handleAddFromSearch(product.id);
                            }
                          }
                          setShowWhatsAppOrder(false);
                          setWaText("");
                          setWaParsedItems([]);
                        }}
                        disabled={resolved.length === 0}
                        className="w-full min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <ShoppingBasket className="h-4 w-4" /> Agregar todo al carrito
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
      </AdminModal>
  );
}
