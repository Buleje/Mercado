"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MapPin, Plus, Trash2, Pencil, ArrowLeft, Home, Briefcase } from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { MensajeronBuscando } from "@/components/ui-system/illustrations";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

type AddressEntry = {
  id: string;
  label: string;
  address: string;
  reference: string;
  isDefault: boolean;
  type: "home" | "work" | "other";
};

// Demo data — MVP
const DEMO_ADDRESSES: AddressEntry[] = [
  {
    id: "addr_001",
    label: "Casa",
    address: "Jr. Ucayali 342, Pucallpa",
    reference: "Frente al mercado, reja azul",
    isDefault: true,
    type: "home",
  },
  {
    id: "addr_002",
    label: "Trabajo",
    address: "Av. Centenario 1280, Pucallpa",
    reference: "Edificio gris, piso 2",
    isDefault: false,
    type: "work",
  },
];

function AddressCard({
  addr,
  onDelete,
  onSetDefault,
}: {
  addr: AddressEntry;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const TypeIcon = addr.type === "home" ? Home : addr.type === "work" ? Briefcase : MapPin;

  return (
    <div
      className={cn(
        "bg-white dark:bg-card rounded-xl border p-4 transition-all duration-200",
        addr.isDefault
          ? "border-primary/30 dark:border-primary/40"
          : "border-gray-100 dark:border-card-border hover:border-gray-200 dark:hover:border-card-border/80"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
            addr.isDefault
              ? "bg-primary/10"
              : "bg-gray-50 dark:bg-surface"
          )}
        >
          <TypeIcon
            className={cn(
              "h-4 w-4",
              addr.isDefault ? "text-primary" : "text-muted"
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground">
              {addr.label}
            </span>
            {addr.isDefault && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
                Principal
              </span>
            )}
          </div>
          <p className="text-sm text-foreground">{addr.address}</p>
          <p className="text-[11px] text-muted mt-0.5">{addr.reference}</p>

          <div className="flex items-center gap-2 mt-3">
            {!addr.isDefault && (
              <button
                onClick={() => onSetDefault(addr.id)}
                className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Marcar como principal
              </button>
            )}
            <button className="text-[11px] font-semibold text-muted hover:text-foreground transition-colors flex items-center gap-1">
              <Pencil className="h-3 w-3" />
              Editar
            </button>
            <button
              onClick={() => onDelete(addr.id)}
              className="text-[11px] font-semibold text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DireccionesPage() {
  const { customer } = useCustomer();
  const [addresses, setAddresses] = useState<AddressEntry[]>(
    customer?.locations?.length
      ? customer.locations.map((loc, i) => ({
          id: loc.id,
          label: i === 0 ? "Principal" : `Direccion ${i + 1}`,
          address: loc.location,
          reference: loc.reference,
          isDefault: loc.id === customer.activeLocationId,
          type: "other" as const,
        }))
      : DEMO_ADDRESSES
  );

  const handleDelete = (id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSetDefault = (id: string) => {
    setAddresses((prev) =>
      prev.map((a) => ({ ...a, isDefault: a.id === id }))
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Direcciones", url: "https://www.buleje.pe/cuenta/direcciones" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* Hero */}
      <div
        className="pt-32 sm:pt-36 pb-8 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "#060a0d" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <nav
            aria-label="Migas de pan"
            className="flex items-center gap-1.5 text-[10px] text-white/35 mb-5"
          >
            <Link href="/" className="hover:text-white/60 transition-colors">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/cuenta" className="hover:text-white/60 transition-colors">
              Mi cuenta
            </Link>
            <span>/</span>
            <span className="text-white/55">Direcciones</span>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/cuenta"
              className="p-2 -ml-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                TU CUENTA
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight tracking-[-0.02em]">
                Direcciones de entrega
              </h1>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28">
        {/* Add button */}
        <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-card-border text-sm font-semibold text-muted hover:text-foreground hover:border-gray-300 dark:hover:border-card-border/80 transition-colors">
          <Plus className="h-4 w-4" />
          Agregar nueva direccion
        </button>

        {/* Addresses list */}
        {addresses.length > 0 ? (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <AddressCard
                key={addr.id}
                addr={addr}
                onDelete={handleDelete}
                onSetDefault={handleSetDefault}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-8 flex flex-col items-center gap-4 text-center">
            <MensajeronBuscando size={80} className="text-gray-300 dark:text-muted" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Sin direcciones guardadas
              </p>
              <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                Agrega una direccion de entrega para facilitar tus pedidos futuros.
              </p>
            </div>
          </div>
        )}

        {/* Note */}
        <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-muted shrink-0 mt-0.5" />
            <p className="text-xs text-muted leading-relaxed">
              Las direcciones guardadas se usaran automaticamente al realizar un nuevo pedido. Podes tener hasta 5 direcciones guardadas.
            </p>
          </div>
        </div>
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
