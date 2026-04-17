"use client";

/**
 * components/admin/AdminModuleManagerModal.tsx
 *
 * Modal de "Gestionar módulos": permite ocultar/mostrar tabs y eliminar
 * los datos de demo de cada módulo. Agrupa por categoría visible y muestra
 * la prioridad de cada módulo.
 *
 * Extraído de app/admin/page.tsx (Paso 5 del refactor — JSX components).
 */

import { CheckCircle, Eye, EyeOff, Loader2, X } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { Tab } from "../../app/admin/_lib/tabs.types";

export type ModulePriority = "core" | "high" | "medium" | "low";

export interface ModuleInfo {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  priority: ModulePriority;
  desc: string;
  tip: string;
}

export interface AllTabsItem {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export interface VisibleCategory {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tabs: readonly Tab[];
}

export interface DemoModuleMeta {
  label: string;
  api?: string;
}

export interface AdminModuleManagerModalProps {
  open: boolean;
  onClose: () => void;
  allowedTabs: readonly Tab[];
  hiddenTabs: Set<Tab>;
  onToggleHide: (id: Tab) => void;
  onClearAllHidden: () => void;
  visibleCategories: readonly VisibleCategory[];
  allTabs: readonly AllTabsItem[];
  moduleInfo: Partial<Record<Tab, ModuleInfo>>;
  demoModules: Partial<Record<Tab, DemoModuleMeta>>;
  clearedDemoTabs: Set<Tab>;
  demoClearing: Tab | null;
  onClearDemoData: (id: Tab) => void;
}

const PRIORITY_CONFIG: Record<ModulePriority, { label: string; cls: string; dot: string }> = {
  core:   { label: "Esencial", cls: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",         dot: "" },
  high:   { label: "Alta",     cls: "bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400", dot: "" },
  medium: { label: "Media",    cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",     dot: "" },
  low:    { label: "Normal",   cls: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",     dot: "" },
};

export function AdminModuleManagerModal({
  open,
  onClose,
  allowedTabs,
  hiddenTabs,
  onToggleHide,
  onClearAllHidden,
  visibleCategories,
  allTabs,
  moduleInfo,
  demoModules,
  clearedDemoTabs,
  demoClearing,
  onClearDemoData,
}: AdminModuleManagerModalProps) {
  if (!open) return null;

  const demoCount = Object.keys(demoModules).filter((t) => !clearedDemoTabs.has(t as Tab)).length;

  return (
    <div className="fixed inset-0 z-100 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--rule-base)] dark:border-card-border">
            <div>
              <h2 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Gestionar módulos</h2>
              <p className="text-xs text-gray-400 dark:text-muted mt-0.5">
                Activa, oculta o limpia datos de ejemplo por módulo
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Stats strip */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border space-y-2.5">
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-xl font-extrabold text-primary">{allowedTabs.length}</div>
                <div className="text-[length:var(--ts-2xs)] text-gray-400 uppercase font-semibold">Total</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-extrabold text-emerald-600">
                  {allowedTabs.length - hiddenTabs.size}
                </div>
                <div className="text-[length:var(--ts-2xs)] text-gray-400 uppercase font-semibold">Visibles</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-extrabold text-gray-400">{hiddenTabs.size}</div>
                <div className="text-[length:var(--ts-2xs)] text-gray-400 uppercase font-semibold">Ocultos</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-extrabold text-red-500">{demoCount}</div>
                <div className="text-[length:var(--ts-2xs)] text-gray-400 uppercase font-semibold">Con demo</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[length:var(--ts-2xs)] text-gray-400 font-semibold mr-1">Prioridad:</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">Esencial</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">Alta</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">Media</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">Normal</span>
            </div>
          </div>

          {/* Tab list */}
          <div className="overflow-y-auto flex-1 py-2">
            {visibleCategories.map((category) => {
              const catTabs = category.tabs.filter((t) => allowedTabs.includes(t));
              if (catTabs.length === 0) return null;
              const CatIcon = category.icon;

              return (
                <div key={category.id} className="mb-1">
                  <div className="flex items-center gap-2 px-6 py-2 text-[length:var(--ts-2xs)] font-bold text-gray-400 dark:text-muted sticky top-0 bg-white dark:bg-card z-10">
                    <CatIcon className="h-3 w-3" />
                    <span>{category.label}</span>
                  </div>

                  {catTabs.map((tabId) => {
                    const tabInfo = allTabs.find((t) => t.id === tabId);
                    if (!tabInfo) return null;
                    const TabIcon = tabInfo.icon;
                    const isHidden = hiddenTabs.has(tabId);
                    const hasDemo = !!demoModules[tabId] && !clearedDemoTabs.has(tabId);
                    const isClearing = demoClearing === tabId;
                    const info = moduleInfo[tabId];
                    const pCfg = info ? PRIORITY_CONFIG[info.priority] : null;

                    return (
                      <div
                        key={tabId}
                        className={cn(
                          "flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-surface transition-colors",
                          isHidden && "opacity-50"
                        )}
                      >
                        <div
                          className={cn(
                            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 relative mt-0.5",
                            isHidden ? "bg-gray-100 dark:bg-surface" : "bg-primary/10"
                          )}
                        >
                          {(() => {
                            const ModIcon = info?.icon ?? TabIcon;
                            return (
                              <ModIcon
                                className={cn("h-4 w-4", isHidden ? "text-gray-400" : info?.iconColor ?? "text-primary")}
                              />
                            );
                          })()}
                          {hasDemo && (
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                "text-sm font-bold",
                                isHidden ? "text-gray-400" : "text-gray-800 dark:text-foreground"
                              )}
                            >
                              {tabInfo.label}
                            </span>
                            {pCfg && (
                              <span
                                className={cn(
                                  "shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full",
                                  pCfg.cls
                                )}
                              >
                                {pCfg.dot}
                                {pCfg.label}
                              </span>
                            )}
                            {hasDemo && (
                              <span className="shrink-0 flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                                Demo
                              </span>
                            )}
                          </div>
                          {info?.desc && (
                            <p className="text-[length:var(--ts-xs)] text-gray-500 dark:text-muted mt-0.5 leading-snug line-clamp-2">
                              {info.desc}
                            </p>
                          )}
                          {info?.tip && (
                            <p className="text-[length:var(--ts-xs)] text-primary/70 dark:text-primary/60 mt-0.5 leading-snug">
                              {info.tip}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          {hasDemo && (
                            <button
                              onClick={() => onClearDemoData(tabId)}
                              disabled={isClearing}
                              className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Eliminar datos"}
                            </button>
                          )}
                          <button
                            onClick={() => onToggleHide(tabId)}
                            title={isHidden ? "Mostrar módulo" : "Ocultar módulo"}
                            className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                              isHidden
                                ? "bg-gray-100 dark:bg-surface text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600"
                                : "bg-primary/10 text-primary hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500"
                            )}
                          >
                            {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--rule-base)] dark:border-card-border">
            {hiddenTabs.size > 0 ? (
              <button
                onClick={onClearAllHidden}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5"
              >
                <CheckCircle className="h-4 w-4" />
                Mostrar todos ({hiddenTabs.size})
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
