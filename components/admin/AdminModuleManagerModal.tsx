"use client";

import { SectionTitle } from "@buleje/design-system";
/**
 * components/admin/AdminModuleManagerModal.tsx
 *
 * Modal de "Gestionar módulos": permite ocultar/mostrar tabs y eliminar
 * los datos de demo de cada módulo. Agrupa por categoría visible y muestra
 * la prioridad de cada módulo.
 *
 * Extraído de app/admin/page.tsx (Paso 5 del refactor — JSX components).
 */

import { CheckCircle, Eye, EyeOff, Loader2, X } from "@buleje/design-system/icons";
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
  core:   { label: "Esencial", cls: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/40 dark:text-[var(--data-error-500)]",         dot: "" },
  high:   { label: "Alta",     cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-orange-950/40 dark:text-[var(--data-warning-500)]", dot: "" },
  medium: { label: "Media",    cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/40 dark:text-[var(--data-warning-500)]",     dot: "" },
  low:    { label: "Normal",   cls: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",     dot: "" },
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
      <div className="modal-backdrop" onClick={onClose} />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
            <div>
              <SectionTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-lg">Gestionar módulos</SectionTitle>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">
                Activa, oculta o limpia datos de ejemplo por módulo
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5 text-[var(--text-secondary)]" />
            </button>
          </div>

          {/* Stats strip */}
          <div className="px-6 py-3 bg-[var(--surface-alt)] dark:bg-surface border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] space-y-2.5">
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-xl font-extrabold text-primary">{allowedTabs.length}</div>
                <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-semibold">Total</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-extrabold text-[var(--data-success-500)]">
                  {allowedTabs.length - hiddenTabs.size}
                </div>
                <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-semibold">Visibles</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-extrabold text-[var(--text-tertiary)]">{hiddenTabs.size}</div>
                <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-semibold">Ocultos</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-extrabold text-[var(--data-error-500)]">{demoCount}</div>
                <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-semibold">Con demo</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-semibold mr-1">Prioridad:</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/40 dark:text-[var(--data-error-500)]">Esencial</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-orange-950/40 dark:text-[var(--data-warning-500)]">Alta</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/40 dark:text-[var(--data-warning-500)]">Media</span>
              <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]">Normal</span>
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
                  <div className="flex items-center gap-2 px-6 py-2 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted sticky top-0 bg-[var(--surface-raised)] z-10">
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
                          "flex items-start gap-3 px-5 py-2.5 hover:bg-[var(--surface-alt)] dark:hover:bg-surface transition-colors",
                          isHidden && "opacity-50"
                        )}
                      >
                        <div
                          className={cn(
                            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 relative mt-0.5",
                            isHidden ? "bg-[var(--surface-sunken)] dark:bg-surface" : "bg-primary/10"
                          )}
                        >
                          {(() => {
                            const ModIcon = info?.icon ?? TabIcon;
                            return (
                              <ModIcon
                                className={cn("h-4 w-4", isHidden ? "text-[var(--text-tertiary)]" : info?.iconColor ?? "text-primary")}
                              />
                            );
                          })()}
                          {hasDemo && (
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--data-error-500)]" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                "text-sm font-bold",
                                isHidden ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]"
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
                              <span className="shrink-0 flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)] inline-block" />
                                Demo
                              </span>
                            )}
                          </div>
                          {info?.desc && (
                            <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted mt-0.5 leading-snug line-clamp-2">
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
                              className="text-xs font-semibold text-[var(--data-error-500)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
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
                                ? "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-tertiary)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] hover:text-[var(--data-success-500)]"
                                : "bg-primary/10 text-primary hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 hover:text-[var(--data-error-500)]"
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)]">
            {hiddenTabs.size > 0 ? (
              <button
                onClick={onClearAllHidden}
                className="text-sm font-semibold text-[var(--data-success-500)] hover:text-[var(--data-success-500)] flex items-center gap-1.5"
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
