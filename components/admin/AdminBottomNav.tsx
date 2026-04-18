"use client";

import React from "react";
import { LayoutDashboard, ShoppingCart, Package, Monitor, Menu } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Tab = string;

interface AdminBottomNavProps {
  currentTab: Tab;
  setTab: (tab: Tab) => void;
  toggleSidebar: () => void;
}

export default function AdminBottomNav({ currentTab, setTab, toggleSidebar }: AdminBottomNavProps) {
  const navItems = [
    { id: "panel-principal", label: "Inicio", icon: LayoutDashboard },
    { id: "pedidos", label: "Pedidos", icon: ShoppingCart },
    { id: "inventario-almacenes", label: "Mi stock", icon: Package },
    { id: "pos-caja", label: "Caja", icon: Monitor },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-[72px] bg-white/80 dark:bg-card/80 backdrop-blur-xl border-t border-[var(--rule-base)] dark:border-card-border flex items-center justify-around px-2 z-50 pb-[safe-area-inset-bottom]">
      {navItems.map((item) => {
        const isActive = currentTab === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "flex flex-col items-center justify-center w-20 h-full space-y-1.5 rounded-xl transition-all active:scale-95",
              isActive ? "text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--surface-sunken)]/50 dark:bg-[var(--accent)]/20" : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-surface/50"
            )}
          >
            <Icon className={cn("h-5 w-5", isActive ? "stroke-[2.5px]" : "stroke-2")} />
            <span className="text-[length:var(--ts-2xs)] font-medium leading-none">{item.label}</span>
          </button>
        );
      })}
      
      {/* Menu / More Button */}
      <button
        onClick={toggleSidebar}
        className="flex flex-col items-center justify-center w-20 h-full space-y-1.5 rounded-xl text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-surface/50 transition-all active:scale-95"
      >
        <Menu className="h-5 w-5 stroke-2" />
        <span className="text-[length:var(--ts-2xs)] font-medium leading-none">Menú</span>
      </button>
    </div>
  );
}
