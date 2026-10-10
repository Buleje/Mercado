import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { readStoredIds, type Product } from "@/components/admin/pos/pos-shared";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";
import { logger } from "@/lib/logger";
import { edadCatalogo, guardarCatalogo, leerCatalogo } from "@/components/admin/pos/pos-catalogo-offline";

/** Mientras se vende con la lista guardada, cada cuánto se vuelve a pedir la de verdad. */
const REINTENTO_CATALOGO_MS = 60_000;

/** Productos, caja/turno abiertos y favoritos del POS. */
export function usePOSCatalogo() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashRegisterOpen, setCashRegisterOpen] = useState<boolean | null>(null);
  const [favorites, setFavorites] = useState<number[]>(() => readStoredIds("pos-favorites"));
  const [, setRecentProducts] = useState<number[]>(() => readStoredIds("pos-recents"));
  /**
   * ¿Hay turno abierto? Hasta acá el turno no controlaba nada: sólo decidía si
   * se mostraba el strip de métricas. Una venta sin turno no tiene cajero
   * responsable — no entra en su cuadre ni en sus comisiones, y si al cierre
   * falta plata no hay a quién preguntarle.
   */
  const [turnoAbierto, setTurnoAbierto] = useState<boolean | null>(null);

  // Sin conexión: la última lista buena queda guardada por negocio (pos-catalogo-offline.ts);
  // si /api/products no responde, se vende con esa lista y la cabecera lo avisa con su hora.
  const claveCatalogo = tenantKey(useTenantSlug(), "pos-catalogo");
  const [catalogoGuardadoEn, setCatalogoGuardadoEn] = useState<string | null>(null);
  /** El último pedido de la lista falló: se reintenta solo (con o sin lista guardada). */
  const [catalogoFallo, setCatalogoFallo] = useState(false);
  const catalogoFalloRef = useRef(false);
  /** La lista vieja se avisa una vez por lista, no en cada reintento. */
  const avisoViejoDe = useRef<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("la respuesta no trae la lista");
      const activos = (data as Product[]).filter((p) => p.active);
      setProducts(activos);
      setCatalogoGuardadoEn(null);
      guardarCatalogo(claveCatalogo, activos);
      if (catalogoFalloRef.current) {
        toast.dismiss("pos-catalogo-viejo"); // el aviso de la lista vieja ya no aplica
        toast.success("Volvió internet: lista de precios al día", { id: "pos-catalogo-al-dia" });
      }
      catalogoFalloRef.current = false;
      setCatalogoFallo(false);
    } catch (err) {
      catalogoFalloRef.current = true;
      setCatalogoFallo(true);
      const guardado = leerCatalogo<Product>(claveCatalogo);
      if (guardado) {
        setProducts(guardado.items);
        setCatalogoGuardadoEn(guardado.guardadoEn);
        const edad = edadCatalogo(guardado.guardadoEn);
        if (edad.viejo && avisoViejoDe.current !== guardado.guardadoEn) {
          avisoViejoDe.current = guardado.guardadoEn;
          toast.warning(`Sin internet: vendes con la lista ${edad.etiqueta}`, {
            id: "pos-catalogo-viejo",
            duration: 15_000,
            description: "Tiene más de un día. Si cambiaste precios, cobra el de hoy: al volver internet, una venta pagada por debajo se rechaza.",
          });
        }
      }
      logger.warn("[pos] catálogo sin conexión", { error: String(err), respaldo: guardado?.items.length ?? 0 });
    }
    setLoading(false);
  }, [claveCatalogo]);

  const checkCashRegister = useCallback(async () => {
    try {
      const res = await fetch("/api/cash-registers");
      const data = await res.json();
      const open = data.find((r: { status: string }) => r.status === "abierta");
      setCashRegisterOpen(!!open);
    } catch { setCashRegisterOpen(false); }
  }, []);

  const checkTurno = useCallback(async () => {
    try {
      // El enum de Prisma es ABIERTO/CERRADO en mayúsculas: con "abierto" el
      // endpoint devuelve 503 (y la falla blanda de abajo lo tapaba en silencio).
      const res = await fetch("/api/turnos?status=ABIERTO", { credentials: "include" });
      if (!res.ok) { setTurnoAbierto(null); return; } // no se pudo saber: no se bloquea
      const data = await res.json();
      const lista = Array.isArray(data) ? data : (data.turnos ?? []);
      setTurnoAbierto(lista.length > 0);
    } catch {
      // Falla blanda a propósito: si no se puede consultar, la venta NO se
      // traba. Nunca frenar el mostrador por un fetch caído.
      setTurnoAbierto(null);
    }
  }, []);

  // Sin lista fresca: se vuelve a pedir apenas vuelve internet y, por si el wifi «conecta» pero no
  // hay salida (el evento online no llega), cada minuto. Antes la lista guardada quedaba hasta recargar.
  useEffect(() => {
    if (!catalogoFallo) return;
    const reintentar = () => void fetchProducts();
    window.addEventListener("online", reintentar);
    const timer = window.setInterval(reintentar, REINTENTO_CATALOGO_MS);
    return () => {
      window.removeEventListener("online", reintentar);
      window.clearInterval(timer);
    };
  }, [catalogoFallo, fetchProducts]);

  // [REMOVIDO] fetchHourlySales — ya existe en CashRegisterTab

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProducts();
      void checkCashRegister();
      void checkTurno();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProducts, checkCashRegister, checkTurno]);

  const addToRecents = useCallback((productId: number) => {
    setRecentProducts(prev => {
      const filtered = prev.filter(id => id !== productId);
      const updated = [productId, ...filtered].slice(0, 10);
      localStorage.setItem("pos-recents", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((productId: number) => {
    setFavorites(prev => {
      const updated = prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId].slice(0, 20);
      localStorage.setItem("pos-favorites", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { products, loading, fetchProducts, catalogoGuardadoEn, cashRegisterOpen, turnoAbierto, favorites, toggleFavorite, addToRecents };
}
