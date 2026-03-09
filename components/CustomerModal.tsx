"use client";

import { useState, useEffect, useId, startTransition, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  X, MapPin, User, Home, Loader2,
  Pencil, Plus, CheckCircle2, Navigation, Maximize2, Trash2, Smartphone,
} from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";
import { sendOrder } from "@/lib/order-utils";
import type { SavedLocation } from "@/contexts/customer-context";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

// ── Helpers ───────────────────────────────────────────────────────────────────
function coordsFromLocation(loc: string) {
  const match = loc.match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/);
  if (match) return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  return { lat: -8.3791, lon: -74.5539 };
}

function mapEmbedSrc(lat: number, lon: number, delta = 0.015) {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${(lon - delta).toFixed(5)},${(lat - delta).toFixed(5)},${(lon + delta).toFixed(5)},${(lat + delta).toFixed(5)}&layer=mapnik&marker=${lat.toFixed(5)},${lon.toFixed(5)}`;
}

// ── Full-screen map modal ─────────────────────────────────────────────────────
function FullMapModal({
  coords,
  onClose,
  onPick,
}: {
  coords: { lat: number; lon: number };
  onClose: () => void;
  onPick?: (lat: number, lon: number, address: string) => void;
}) {
  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-9500 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <m.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="bg-white dark:bg-background rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl max-h-[95svh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="font-bold text-foreground text-sm sm:text-base">
                {onPick ? "Toca el mapa para seleccionar tu ubicación" : "Mapa completo — Pucallpa"}
              </span>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="h-5 w-5 text-muted" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LeafletMap
              lat={coords.lat}
              lon={coords.lon}
              zoom={15}
              height={480}
              onPick={onPick ? (lt, lg, addr) => { onPick(lt, lg, addr); onClose(); } : undefined}
            />
          </div>
          {onPick && (
            <p className="text-xs text-primary/80 px-4 py-2.5 bg-primary/5 font-medium">
              Toca cualquier punto del mapa para fijar tu dirección de entrega
            </p>
          )}
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}

// ── Location form ─────────────────────────────────────────────────────────────
function LocationForm({
  initial,
  onSave,
  onCancel,
  saveLabel = "Guardar ubicación",
}: {
  initial?: { location: string; reference: string };
  onSave: (loc: string, ref: string) => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [location, setLocation] = useState(initial?.location ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [mapCoords, setMapCoords] = useState(() => coordsFromLocation(initial?.location ?? ""));
  const [showFullMap, setShowFullMap] = useState(false);

  const useGeolocation = () => {
    if (!navigator.geolocation) return;
    setLoadingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setLocation(`Pucallpa — GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        setMapCoords({ lat, lon });
        setLoadingGeo(false);
      },
      () => {
        setLocation("Pucallpa, Ucayali");
        setLoadingGeo(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleLocationChange = (val: string) => {
    setLocation(val);
    setMapCoords(coordsFromLocation(val));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!location.trim() || !reference.trim()) return;
    onSave(location.trim(), reference.trim());
  };

  return (
    <>
      {showFullMap && (
        <FullMapModal
          coords={mapCoords}
          onClose={() => setShowFullMap(false)}
          onPick={(lt, lg, addr) => {
            setMapCoords({ lat: lt, lon: lg });
            setLocation(addr);
          }}
        />
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">
            Dirección / Ubicación
          </label>
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              required
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Ej: Jr. Ucayali 450, Pucallpa"
              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>

          <m.button
            type="button"
            onClick={useGeolocation}
            disabled={loadingGeo}
            whileHover={{ scale: loadingGeo ? 1 : 1.02 }}
            whileTap={{ scale: loadingGeo ? 1 : 0.97 }}
            className={cn(
              "mt-3 w-full flex items-center justify-center gap-2.5 rounded-xl py-3 font-semibold text-sm transition-all duration-200 border-2",
              loadingGeo
                ? "bg-primary/8 border-primary/15 text-primary/60 cursor-not-allowed"
                : "bg-primary/8 border-primary/25 text-primary hover:bg-primary hover:text-white hover:border-primary hover:shadow-lg hover:shadow-primary/25"
            )}
          >
            {loadingGeo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Obteniendo tu ubicación…
              </>
            ) : (
              <>
                <m.span
                  animate={{ y: [0, -3, 0], rotate: [0, 15, -15, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                >
                  <Navigation className="h-4 w-4" />
                </m.span>
                Usar mi ubicación actual (GPS)
              </>
            )}
          </m.button>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">Referencia</label>
          <div className="relative">
            <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej: Frente al parque, casa azul"
              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Toca el mapa para elegir ubicación
            </p>
            <button
              type="button"
              onClick={() => setShowFullMap(true)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              <Maximize2 className="h-3 w-3" />
              Expandir mapa
            </button>
          </div>
          <LeafletMap
            lat={mapCoords.lat}
            lon={mapCoords.lon}
            zoom={15}
            height={180}
            onPick={(lt, lg, addr) => {
              setMapCoords({ lat: lt, lon: lg });
              setLocation(addr);
            }}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-foreground hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
          >
            {saveLabel}
          </button>
        </div>
      </form>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CustomerModal() {
  const { showModal, closeModal, register, customer, openMode, findByPhone } = useCustomer();
  const { items, total, close: closeCart } = useCart();
  const idPrefix = useId();

  type View = "profile" | "phone-lookup" | "edit-info" | "edit-loc" | "add-loc";
  const [view, setView] = useState<View>("profile");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [phoneNotFound, setPhoneNotFound] = useState(false);
  const [editLocId, setEditLocId] = useState<string | null>(null);

  useScrollLock(showModal);

  useEffect(() => {
    if (showModal) {
      startTransition(() => {
        setName(customer?.name ?? "");
        setPhone(customer?.phone ?? "");
        setPhoneNotFound(false);
        setLookingUp(false);
        setView(customer ? (openMode === "profile" ? "profile" : "edit-info") : "phone-lookup");
      });
    }
  }, [showModal, openMode, customer]);

  const locations: SavedLocation[] = customer?.locations?.length
    ? customer.locations
    : customer
    ? [{ id: "default", location: customer.location, reference: customer.reference }]
    : [];

  const activeId = customer?.activeLocationId ?? locations[0]?.id ?? "default";

  const setActive = (id: string) => {
    if (!customer) return;
    const loc = locations.find((l) => l.id === id);
    if (!loc) return;
    register({ ...customer, location: loc.location, reference: loc.reference, locations, activeLocationId: id });
  };

  const handleSaveInfo = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const base = customer ?? { location: "", reference: "" };
    register({ name: name.trim(), phone: phone.trim() || customer?.phone, location: base.location, reference: base.reference, locations: customer?.locations, activeLocationId: customer?.activeLocationId });
    if (!customer) setView("add-loc");
    else setView("profile");
  };

  const handlePhoneLookup = async () => {
    const trimmed = phone.trim();
    if (!trimmed) return;
    setLookingUp(true);
    const found = await findByPhone(trimmed);
    setLookingUp(false);
    if (found) {
      register(found); // also closes modal
      return;
    }
    setPhoneNotFound(true);
    setTimeout(() => {
      setPhoneNotFound(false);
      setView("edit-info");
    }, 1200);
  };

  const pickPhone = async () => {
    try {
      // Contact Picker API — supported on Chrome Android
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contacts = await (navigator as any).contacts.select(["tel"], { multiple: false });
      if (contacts.length > 0 && contacts[0].tel?.length > 0) {
        setPhone(contacts[0].tel[0].replace(/\D/g, "").slice(-9));
      }
    } catch {
      // API not supported or user cancelled — silently ignore
    }
  };

  const handleSaveLoc = (loc: string, ref: string) => {
    if (!customer) {
      const id = `loc-${Date.now()}`;
      const saved = { name: name.trim(), phone: phone.trim() || undefined, location: loc, reference: ref, locations: [{ id, location: loc, reference: ref }], activeLocationId: id };
      register(saved);
      if (openMode === "order" && items.length > 0) {
        sendOrder(saved, items, total);
        closeCart();
      }
      closeModal();
      return;
    }
    if (view === "edit-loc" && editLocId) {
      const updated = locations.map((l) => l.id === editLocId ? { ...l, location: loc, reference: ref } : l);
      const newActiveLoc = editLocId === activeId ? { location: loc, reference: ref } : {};
      register({ ...customer, ...newActiveLoc, locations: updated, activeLocationId: activeId });
    } else {
      const id = `loc-${Date.now()}`;
      const updated = [...locations, { id, location: loc, reference: ref }];
      register({ ...customer, location: loc, reference: ref, locations: updated, activeLocationId: id });
    }
    setView("profile");
  };

  const handleDeleteLoc = (id: string) => {
    if (!customer || locations.length <= 1) return;
    const updated = locations.filter((l) => l.id !== id);
    const newActive = id === activeId ? updated[0].id : activeId;
    const activeLoc = updated.find((l) => l.id === newActive)!;
    register({ ...customer, location: activeLoc.location, reference: activeLoc.reference, locations: updated, activeLocationId: newActive });
  };

  const handleOrderSubmit = () => {
    if (!customer) return;
    if (openMode === "order" && items.length > 0) {
      sendOrder(customer, items, total);
      closeCart();
    }
    closeModal();
  };

  return (
    <AnimatePresence>
      {showModal && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-7000 bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          />
          <m.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 sm:inset-0 z-7001 flex items-end sm:items-center justify-center sm:p-4"
          >
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[95svh] flex flex-col overflow-hidden">

              {/* Drag handle — mobile only */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
                <div className="h-1 w-10 rounded-full bg-gray-200" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-primary/5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  {(view === "edit-loc" || view === "add-loc") && (
                    <button
                      onClick={() => setView(customer ? "profile" : "edit-info")}
                      className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors mr-1"
                      aria-label="Volver"
                    >
                      <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  {view === "edit-info" && !customer && (
                    <button
                      onClick={() => setView("phone-lookup")}
                      className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors mr-1"
                      aria-label="Volver"
                    >
                      <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      {view === "profile" && "👤 Mi perfil"}
                      {view === "phone-lookup" && "📱 Identificarte"}
                      {view === "edit-info" && (customer ? "✏️ Editar información" : "📋 Datos de entrega")}
                      {view === "edit-loc" && "📍 Editar dirección"}
                      {view === "add-loc" && (customer ? "➕ Nueva dirección" : "📍 Tu dirección")}
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      {view === "profile" && "Tus datos y direcciones guardadas"}
                      {view === "phone-lookup" && "Ingresa tu número para acceder o registrarte"}
                      {view === "edit-info" && (customer ? "Actualiza tu nombre" : "Solo la primera vez")}
                      {view === "edit-loc" && "Modifica esta dirección"}
                      {view === "add-loc" && (customer ? "Agrega una nueva dirección de entrega" : "¿Dónde te entregamos tu pedido?")}
                    </p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Cerrar">
                  <X className="h-5 w-5 text-muted" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 overscroll-contain px-4 sm:px-6 py-4 sm:py-5">
                <AnimatePresence mode="wait">

                  {/* Phone lookup view */}
                  {view === "phone-lookup" && (
                    <m.div key="phone-lookup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-5">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Número de celular</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <input
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handlePhoneLookup()}
                              placeholder="Ej: 987654321"
                              maxLength={15}
                              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={pickPhone}
                            title="Seleccionar de contactos"
                            className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary/8 border-2 border-primary/25 text-primary hover:bg-primary hover:text-white hover:border-primary transition-all shrink-0"
                          >
                            <Smartphone className="h-5 w-5" />
                          </button>
                        </div>
                        <p className="text-xs text-muted mt-1.5">Usamos tu número para guardar tus datos y agilizar futuros pedidos.</p>
                      </div>

                      {phoneNotFound && (
                        <m.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
                        >
                          <span className="text-amber-500 text-lg">📝</span>
                          <p className="text-sm font-semibold text-amber-700">Número nuevo — completemos tus datos</p>
                        </m.div>
                      )}

                      <button
                        type="button"
                        onClick={handlePhoneLookup}
                        disabled={lookingUp || !phone.trim()}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {lookingUp ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</>
                        ) : (
                          "Continuar →"
                        )}
                      </button>
                    </m.div>
                  )}

                  {/* Profile view */}
                  {view === "profile" && customer && (
                    <m.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-5">
                      {/* Name card */}
                      <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted font-medium">Nombre</p>
                            <p className="font-bold text-foreground">{customer.name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setView("edit-info")}
                          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                      </div>

                      {/* Phone card */}
                      {customer.phone && (
                        <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-100">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Smartphone className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted font-medium">Teléfono</p>
                            <p className="font-bold text-foreground">{customer.phone}</p>
                          </div>
                        </div>
                      )}

                      {/* Locations */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-bold text-foreground">Mis direcciones</p>
                          <button
                            onClick={() => setView("add-loc")}
                            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-all"
                          >
                            <Plus className="h-3.5 w-3.5" /> Nueva
                          </button>
                        </div>
                        <div className="space-y-2.5">
                          {locations.map((loc) => {
                            const isActive = loc.id === activeId;
                            const coords = coordsFromLocation(loc.location);
                            return (
                              <div
                                key={loc.id}
                                onClick={() => setActive(loc.id)}
                                className={cn(
                                  "w-full text-left flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer",
                                  isActive ? "border-primary bg-primary/5 shadow-sm" : "border-gray-100 hover:border-primary/30 hover:bg-gray-50"
                                )}
                              >
                                <div className={cn(
                                  "mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                                  isActive ? "border-primary bg-primary" : "border-gray-300"
                                )}>
                                  {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-white fill-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-sm font-semibold truncate", isActive ? "text-primary" : "text-foreground")}>{loc.location}</p>
                                  <p className="text-xs text-muted mt-0.5 flex items-center gap-1"><Home className="h-3 w-3 shrink-0" />{loc.reference}</p>
                                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200" style={{ height: 90 }}>
                                    <iframe src={mapEmbedSrc(coords.lat, coords.lon, 0.008)} width="100%" height="100%" style={{ border: 0, display: "block", pointerEvents: "none" }} title="mapa" />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 ml-1 mt-0.5">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setEditLocId(loc.id); setView("edit-loc"); }}
                                    className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                                    aria-label="Editar"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  {locations.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteLoc(loc.id); }}
                                      className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                                      aria-label="Eliminar"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {openMode === "order" && items.length > 0 && (
                        <button
                          type="button"
                          onClick={handleOrderSubmit}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark active:scale-[0.98] transition-all duration-200"
                        >
                          ✓ Confirmar y Enviar Pedido
                        </button>
                      )}
                    </m.div>
                  )}

                  {/* Edit name */}
                  {view === "edit-info" && (
                    <m.div key="edit-info" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      <form onSubmit={handleSaveInfo} className="space-y-5">
                        <div>
                          <label htmlFor={`${idPrefix}-name`} className="block text-sm font-semibold text-foreground mb-1.5">
                            Nombre Completo
                          </label>
                          <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <input
                              id={`${idPrefix}-name`}
                              type="text"
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Ej: María García"
                              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-1.5">Teléfono (opcional)</label>
                          <div className="relative">
                            <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <input
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="Ej: 987654321"
                              maxLength={15}
                              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                          </div>
                        </div>
                        <div className="flex gap-3">
                          {customer && (
                            <button type="button" onClick={() => setView("profile")} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-foreground hover:bg-gray-50 transition-colors">
                              Cancelar
                            </button>
                          )}
                          <button type="submit" className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20">
                            {customer ? "Guardar" : "Continuar →"}
                          </button>
                        </div>
                      </form>
                    </m.div>
                  )}

                  {/* Add / Edit location */}
                  {(view === "add-loc" || view === "edit-loc") && (
                    <m.div key="loc-form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      <LocationForm
                        initial={view === "edit-loc" ? locations.find((l) => l.id === editLocId) : undefined}
                        onSave={handleSaveLoc}
                        onCancel={() => setView(customer ? "profile" : "edit-info")}
                        saveLabel={view === "edit-loc" ? "Guardar cambios" : customer ? "Agregar dirección" : "Guardar y continuar"}
                      />
                    </m.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
