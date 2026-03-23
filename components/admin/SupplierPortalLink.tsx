 
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Link, Copy, MessageCircle, Eye, RefreshCw, Package, CheckCircle2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LowStockItem {
  productName: string;
  currentStock: number;
  minStock: number;
  unit: string;
  suggestedOrder: number;
}

interface PortalConfig {
  token: string;
  supplierName: string;
  createdAt: string;
  expiresAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "supplier_portal_configs";
const TOKEN_EXPIRY_HOURS = 72;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function buildPortalURL(token: string): string {
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}/portal/proveedor`
      : "https://bodega.vercel.app/portal/proveedor";
  return `${base}?token=${token}`;
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const MOCK_LOW_STOCK: LowStockItem[] = [
  { productName: "Arroz Costeño 5kg", currentStock: 3, minStock: 10, unit: "bolsas", suggestedOrder: 20 },
  { productName: "Aceite Primor 1L", currentStock: 1, minStock: 6, unit: "unidades", suggestedOrder: 12 },
  { productName: "Azucar Rubia 1kg", currentStock: 5, minStock: 12, unit: "bolsas", suggestedOrder: 24 },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierPortalLink() {
  const [configs, setConfigs] = useState<PortalConfig[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [lowStock] = useState<LowStockItem[]>(MOCK_LOW_STOCK);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setConfigs(load<PortalConfig[]>(STORAGE_KEY, []));
  }, []);

  const activeConfigs = useMemo(() => {
    const now = new Date();
    return configs.filter((c) => new Date(c.expiresAt) > now);
  }, [configs]);

  const generateLink = useCallback(async () => {
    if (!supplierName.trim()) return;
    setGenerating(true);

    await new Promise((r) => setTimeout(r, 600));

    const now = new Date();
    const expires = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    const config: PortalConfig = {
      token: generateToken(),
      supplierName: supplierName.trim(),
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };

    const next = [config, ...configs];
    setConfigs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSupplierName("");
    setGenerating(false);
  }, [supplierName, configs]);

  const copyLink = useCallback((token: string) => {
    navigator.clipboard.writeText(buildPortalURL(token)).catch(() => {});
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }, []);

  const sendWhatsApp = useCallback((config: PortalConfig) => {
    const url = buildPortalURL(config.token);
    const msg = encodeURIComponent(
      `Hola ${config.supplierName}! Te comparto el acceso a nuestro portal de proveedores:\n${url}\n\nEste link vence en 72 horas. Podras ver nuestro stock bajo y enviar una cotizacion.`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }, []);

  const deleteConfig = useCallback(
    (token: string) => {
      const next = configs.filter((c) => c.token !== token);
      setConfigs(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [configs]
  );

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#2d6a4f]/10">
            <Link className="w-5 h-5 text-[#2d6a4f]" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">
              Portal de proveedor
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Genera links temporales para que tus proveedores vean el stock bajo
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Generator */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            Nombre del proveedor
          </label>
          <div className="flex gap-2">
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Ej: Distribuidora Hernandez SAC"
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#2d6a4f]"
              onKeyDown={(e) => {
                if (e.key === "Enter") generateLink();
              }}
            />
            <button
              onClick={generateLink}
              disabled={!supplierName.trim() || generating}
              className="px-4 py-2.5 rounded-xl bg-[#2d6a4f] text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
            >
              {generating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Link className="w-4 h-4" />
              )}
              Generar link
            </button>
          </div>
        </div>

        {/* Preview toggle */}
        <button
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-[#2d6a4f] dark:text-[#52b788] hover:underline"
        >
          <Eye className="w-4 h-4" />
          {showPreview ? "Ocultar preview del portal" : "Ver preview del portal"}
        </button>

        {/* Preview */}
        {showPreview && (
          <div className="rounded-2xl border-2 border-dashed border-[#2d6a4f]/30 p-4 bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10">
            <p className="text-xs font-bold text-[#2d6a4f] dark:text-[#52b788] uppercase tracking-wider mb-3">
              Vista del proveedor
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">
              Productos con stock bajo — Bodega San Martin
            </p>
            <div className="space-y-2">
              {lowStock.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Stock actual: {item.currentStock} {item.unit}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Pedido sugerido</p>
                    <p className="font-bold text-[#2d6a4f] dark:text-[#52b788] text-sm">
                      {item.suggestedOrder} {item.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 mb-1">Formulario de cotizacion</p>
              <div className="h-8 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
            </div>
          </div>
        )}

        {/* Active links */}
        {activeConfigs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
              Links activos ({activeConfigs.length})
            </p>
            <div className="space-y-2">
              {activeConfigs.map((config) => {
                const url = buildPortalURL(config.token);
                const hoursLeft = Math.round(
                  (new Date(config.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)
                );
                return (
                  <div
                    key={config.token}
                    className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                          {config.supplierName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {url}
                        </p>
                        <p className="text-xs text-[#f4a261] mt-0.5">
                          Vence en {hoursLeft}h
                        </p>
                      </div>
                      <button
                        onClick={() => deleteConfig(config.token)}
                        className="text-xs text-red-500 hover:underline flex-shrink-0"
                      >
                        Revocar
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyLink(config.token)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-colors",
                          copiedToken === config.token
                            ? "bg-[#2d6a4f] text-white border-[#2d6a4f]"
                            : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[#2d6a4f] hover:text-[#2d6a4f]"
                        )}
                      >
                        {copiedToken === config.token ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar link
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => sendWhatsApp(config)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-green-500 text-white border border-green-500"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WhatsApp
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stock summary */}
        <div className="p-4 rounded-2xl bg-[#f4a261]/5 border border-[#f4a261]/20">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-[#f4a261]" />
            <p className="text-xs font-semibold text-[#f4a261]">
              {lowStock.length} producto{lowStock.length !== 1 ? "s" : ""} bajo stock incluido{lowStock.length !== 1 ? "s" : ""} en el portal
            </p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            El proveedor podra ver estos productos y enviar una cotizacion directamente.
          </p>
        </div>
      </div>
    </div>
  );
}
