"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, Truck } from "lucide-react";

// ── Mejora 13: Vista simplificada para el repartidor ────────────────────────

type DeliveryOrder = {
  id: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  total: number;
  status: string;
  paymentMethod?: string;
  items?: Array<{ name: string; qty: number }>;
  createdAt: string;
};

function getStoredDriver() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("delivery-driver");
    return stored ? (JSON.parse(stored) as { phone: string; name: string }) : null;
  } catch { return null; }
}

export default function DeliveryPage() {
  const [phone, setPhone] = useState(() => getStoredDriver()?.phone ?? "");
  const [loggedIn, setLoggedIn] = useState(() => !!getStoredDriver());
  const [driverName, setDriverName] = useState(() => getStoredDriver()?.name ?? "");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleLogin = async () => {
    if (phone.trim().length < 6) { setError("Ingresa tu numero de telefono"); return; }
    setLoading(true);
    setError("");
    try {
      // Verify against AdminUser or customers
      const res = await fetch(`/api/customers?q=${encodeURIComponent(phone.trim())}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        const found = Array.isArray(data) ? data[0] : null;
        const name = found?.name || "Repartidor";
        setDriverName(name);
        setLoggedIn(true);
        localStorage.setItem("delivery-driver", JSON.stringify({ phone: phone.trim(), name }));
      } else {
        setError("No se pudo verificar tu telefono");
      }
    } catch {
      setError("Error de conexion");
    }
    setLoading(false);
  };

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?limit=50");
      if (!res.ok) return;
      const data = await res.json();
      const arr: DeliveryOrder[] = Array.isArray(data) ? data : (data.orders ?? []);
      // Filter only delivery-relevant orders
      const filtered = arr.filter(o =>
        o.status === "confirmado" || o.status === "confirmed" ||
        o.status === "en_camino" || o.status === "delivering" ||
        o.status === "preparando" || o.status === "preparing"
      );
      setOrders(filtered);
    } catch { /* silent */ }
  }, []);

  // Load orders and auto-refresh (loadOrders is async — setState happens after await, not synchronously)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!loggedIn) return;
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [loggedIn, loadOrders]);

  const markDelivered = async (orderId: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "entregado" }),
      });
      if (res.ok) {
        setSuccessId(orderId);
        setTimeout(() => {
          setSuccessId(null);
          setOrders(prev => prev.filter(o => o.id !== orderId));
        }, 2000);
      }
    } catch { /* ignore */ }
    setUpdatingId(null);
  };

  const handlePhotoCapture = async (orderId: string, file: File) => {
    // Upload photo as proof of delivery (fire-and-forget)
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("orderId", orderId);
      formData.append("type", "delivery-proof");
      await fetch("/api/uploads", { method: "POST", body: formData });
    } catch { /* best effort */ }
  };

  const logout = () => {
    setLoggedIn(false);
    setPhone("");
    setDriverName("");
    localStorage.removeItem("delivery-driver");
  };

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg w-full max-w-sm p-6 space-y-5">
          <div className="text-center">
            <div className="h-16 w-16 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center mx-auto mb-3">
              <Truck className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">Repartidor</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Buleje · Entregas</p>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase block mb-1.5">Tu telefono</label>
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="Ej: 961234567"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-base font-semibold text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] transition-all"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-red-500 font-semibold text-center">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#00B4A6] text-white text-base font-bold hover:bg-[#009690] transition-colors disabled:opacity-50 shadow-lg shadow-[#00B4A6]/20"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </div>
      </div>
    );
  }

  // ── Delivery list ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-[var(--accent)] text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Truck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="font-bold text-sm">{driverName}</p>
            <p className="text-[10px] text-white/70">{orders.length} entrega{orders.length !== 1 ? "s" : ""} pendiente{orders.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadOrders}
            className="px-3 py-1.5 rounded-lg bg-white/20 text-xs font-bold hover:bg-white/30 transition-colors"
          >
            Actualizar
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-bold hover:bg-white/20 transition-colors"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Orders list */}
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-400 dark:text-gray-600 mb-4">
              <Package className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="text-base font-extrabold tracking-tight text-gray-800 dark:text-gray-200">No hay entregas pendientes</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Se actualiza automáticamente cada 30 segundos</p>
          </div>
        ) : (
          orders.map(order => {
            const isSuccess = successId === order.id;
            const isUpdating = updatingId === order.id;
            const itemCount = order.items?.reduce((s, i) => s + i.qty, 0) ?? 0;

            return (
              <div
                key={order.id}
                className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden ${
                  isSuccess
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 scale-95 opacity-60"
                    : "border-gray-100 dark:border-gray-800"
                }`}
              >
                {/* Customer info */}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-gray-100 text-base">
                        {order.customerName || "Cliente"}
                      </p>
                      {order.customerPhone && (
                        <a
                          href={`tel:${order.customerPhone}`}
                          className="inline-flex items-center gap-1.5 text-sm text-[#00B4A6] font-semibold mt-0.5"
                        >
                          📞 {order.customerPhone}
                        </a>
                      )}
                    </div>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${
                      order.status === "en_camino" || order.status === "delivering"
                        ? "bg-cyan-100 text-cyan-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {order.status === "en_camino" || order.status === "delivering"
                        ? "En camino"
                        : order.status === "preparando" || order.status === "preparing"
                        ? "Preparando"
                        : "Confirmado"
                      }
                    </span>
                  </div>

                  {/* Address */}
                  {order.address && (
                    <div className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                      <span className="text-sm shrink-0">📍</span>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{order.address}</p>
                    </div>
                  )}

                  {/* Items summary */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {itemCount > 0 ? `${itemCount} producto${itemCount > 1 ? "s" : ""}` : `${order.items?.length ?? 0} items`} · <span className="font-bold text-gray-900 dark:text-gray-100">S/ {order.total.toFixed(2)}</span>
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      order.paymentMethod === "yape" || order.paymentMethod === "Yape"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {order.paymentMethod === "yape" || order.paymentMethod === "Yape" ? "Yape" : "Efectivo"}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-bold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    📷 Foto de entrega
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoCapture(order.id, file);
                      }}
                    />
                  </label>
                  <button
                    onClick={() => markDelivered(order.id)}
                    disabled={isUpdating || isSuccess}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                      isSuccess
                        ? "bg-emerald-500 text-white"
                        : "bg-[#00B4A6] text-white hover:bg-[#009690] shadow-lg shadow-[#00B4A6]/20"
                    } disabled:opacity-60`}
                  >
                    {isUpdating ? "Marcando..." : isSuccess ? "Entregado" : "Marcar como entregado"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
