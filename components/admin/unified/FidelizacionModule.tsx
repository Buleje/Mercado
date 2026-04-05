"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Heart, Gift, Star, ListChecks } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const LoyaltyTab = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: S });
const PointsProgramTab = dynamic(() => import("@/components/admin/PointsProgramTab"), { loading: S });
const WishListAdminTab = dynamic(() => import("@/components/admin/WishListAdminTab"), { loading: S });
const LoyaltyRedeemTab = dynamic(() => import("@/components/admin/LoyaltyRedeemTab"), { loading: S });

const MODULE_ID = "fidelizacion";

const TABS = [
  { id: "fidelizacion", label: "Fidelización", icon: Heart },
  { id: "canjear", label: "Canjear Puntos", icon: Gift },
  { id: "puntos", label: "Programa Puntos", icon: Star },
  { id: "wishlist", label: "Wish Lists", icon: ListChecks },
];

export default function FidelizacionModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Fidelización"
        description="Programa de puntos, canje de premios y wish lists"
        icon={Heart}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "fidelizacion" && <LoyaltyTab />}
      {sub === "canjear" && <LoyaltyRedeemTab />}
      {sub === "puntos" && <PointsProgramTab />}
      {sub === "wishlist" && <WishListAdminTab />}
    </div>
  );
}
