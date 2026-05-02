"use client";

/**
 * AutoTranslator — traduce TODO el DOM cuando cambia el locale.
 *
 * Fixes 2026-05-02 (Brandon: "muchos elementos no cambian"):
 *   - Tracking per text-node con WeakMap (antes: attribute en el padre,
 *     que si tenía múltiples text-nodes solo recordaba el último).
 *   - Force re-walk completo al cambiar locale (no solo nodos nuevos).
 *   - Cada text-node guarda su `originalText` y su `lastTranslatedLocale`.
 *   - MutationObserver para nodos nuevos / async / modales.
 *   - LibreTranslate como fallback adicional (CORS-friendly).
 */

import { useEffect } from "react";
import { useLocale } from "@/contexts/locale-context";
import { autoTranslate, shouldTranslateNode } from "@/lib/i18n/auto-translator";

interface NodeMeta {
  original: string;
  lastLocale: string;
}

// Per-text-node memory. WeakMap → no leak cuando el nodo se desmonta.
const NODE_META = new WeakMap<Text, NodeMeta>();

export default function AutoTranslator() {
  const { locale } = useLocale();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const collectTextNodes = (root: Node): Text[] => {
      const out: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          shouldTranslateNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      });
      let n: Node | null = walker.nextNode();
      while (n !== null) {
        out.push(n as Text);
        n = walker.nextNode();
      }
      return out;
    };

    const translateNode = async (node: Text) => {
      // Capturar texto original la primera vez que vemos este nodo
      let meta = NODE_META.get(node);
      if (!meta) {
        const original = node.textContent ?? "";
        meta = { original, lastLocale: "es" };
        NODE_META.set(node, meta);
      }

      // Skip si ya está en el locale correcto
      if (meta.lastLocale === locale) return;

      if (locale === "es") {
        // Restaurar texto original
        if (node.textContent !== meta.original) {
          node.textContent = meta.original;
        }
        meta.lastLocale = "es";
        return;
      }

      // Preservar leading/trailing whitespace del original. Sin esto,
      // dos text-nodes adyacentes pueden quedar pegados ("BulejeTienda"
      // en lugar de "Buleje Tienda") si la API trim'ea su espacio.
      const original = meta.original;
      const leadingWS = original.match(/^\s*/)?.[0] ?? "";
      const trailingWS = original.match(/\s*$/)?.[0] ?? "";
      const trimmedOriginal = original.trim();
      if (trimmedOriginal.length === 0) {
        meta.lastLocale = locale;
        return;
      }

      const translatedRaw = await autoTranslate(trimmedOriginal, locale);
      const translated = leadingWS + translatedRaw.trim() + trailingWS;
      if (translated && translated !== node.textContent) {
        node.textContent = translated;
      }
      meta.lastLocale = locale;
    };

    const translateBatch = async (nodes: Text[]) => {
      // Procesa en chunks de 80 para no bloquear el thread con muchas
      // promesas en paralelo (MyMemory tiene rate limit por IP).
      const chunkSize = 80;
      for (let i = 0; i < nodes.length; i += chunkSize) {
        const chunk = nodes.slice(i, i + chunkSize);
        await Promise.all(chunk.map((n) => translateNode(n)));
      }
    };

    // Walk inicial — fuerza re-traducción de TODOS los nodos al cambiar locale
    const initial = collectTextNodes(document.body);
    void translateBatch(initial);

    // Observer para nodos nuevos (modales, contenido async, React rerenders)
    const obs = new MutationObserver((mutations) => {
      const newNodes: Text[] = [];
      for (const m of mutations) {
        if (m.type === "childList") {
          for (const added of Array.from(m.addedNodes)) {
            if (added.nodeType === Node.TEXT_NODE) {
              if (shouldTranslateNode(added)) newNodes.push(added as Text);
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              newNodes.push(...collectTextNodes(added));
            }
          }
        } else if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
          // React cambió el texto — refresh meta y re-traducir
          const text = m.target as Text;
          const meta = NODE_META.get(text);
          if (meta) {
            // Si el texto actual no es la traducción esperada, asumimos que
            // React rerenderizó con un texto NUEVO en español → actualizar
            // original y resetear locale para forzar re-traducción.
            const current = text.textContent ?? "";
            if (locale !== "es" && current !== meta.original) {
              // Detectar si el texto actual es justo una nueva versión en
              // español: si cambia significativamente, asumir nuevo original.
              meta.original = current;
              meta.lastLocale = "es";
            }
          }
          if (shouldTranslateNode(text)) newNodes.push(text);
        }
      }
      if (newNodes.length > 0) {
        void translateBatch(newNodes);
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      obs.disconnect();
    };
  }, [locale]);

  return null;
}
