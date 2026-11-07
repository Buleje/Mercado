/**
 * use-aplicar-variado — «Aplicar el desglose al lote» desde la Distribución
 * (ADR-463, Brandon 2026-10-02).
 *
 * Reemplaza en el lote del cubicador (`slugKey()`, la MISMA clave que escribe
 * el cubicador de Herramientas) cada fila Variado por sus piezas abiertas, con
 * una copia del lote de antes en `slugKey("-antes-variado")` para deshacer.
 * Mientras esa copia exista, la tarjeta ofrece «Deshacer».
 *
 * El desglose se recalcula AL TOCAR desde lo guardado —no desde lo que pinta
 * la pantalla—: si el lote cambió en otra pestaña, se abre lo que hay.
 * Después de escribir se avisa con un `storage` sintético: el de verdad sólo
 * llega a las OTRAS pestañas, y Resúmenes relee el lote con ese evento.
 */
import { useEffect, useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { recubicarPiezas, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { ApartadosAsignados } from "@/lib/forestal/cubicacion-apartados";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { slugKey } from "@/lib/forestal/sembrar-reparto";
import { aplicarDesgloseAlLote } from "@/lib/forestal/variado-aplicar";
import { desglosarVariado, type ConfigVariado } from "@/lib/forestal/variado-desglose";

const claveLote = () => slugKey();
const claveApartados = () => slugKey("-apartados");
const claveRespaldo = () => slugKey("-antes-variado");

export interface RespaldoVariado {
  /** El lote tal cual estaba guardado antes de abrir el Variado. */
  filas: PiezaCubicada[];
  apartados: ApartadosAsignados | null;
  salen: number;
  entran: number;
  paquetes: number;
  /** ISO de cuándo se aplicó. */
  fecha: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function leerTexto(clave: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(clave); } catch { return null; }
}

function parsear(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function leerApartados(raw: string | null): ApartadosAsignados | null {
  const v = parsear(raw);
  return esObjeto(v) ? (v as ApartadosAsignados) : null;
}

function leerRespaldo(): RespaldoVariado | null {
  const v = parsear(leerTexto(claveRespaldo()));
  if (!esObjeto(v) || !Array.isArray(v.filas)) return null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return {
    filas: v.filas as PiezaCubicada[],
    apartados: esObjeto(v.apartados) ? (v.apartados as ApartadosAsignados) : null,
    salen: n(v.salen),
    entran: n(v.entran),
    paquetes: n(v.paquetes),
    fecha: typeof v.fecha === "string" ? v.fecha : "",
  };
}

/** El `storage` del navegador sólo llega a las otras pestañas: éste es para ESTA. */
function avisarCambioDelLote() {
  try { window.dispatchEvent(new StorageEvent("storage", { key: claveLote() })); } catch { /* navegador sin StorageEvent: se ve al recargar */ }
}

export interface AplicarVariado {
  respaldo: RespaldoVariado | null;
  ocupado: boolean;
  error: string | null;
  aplicar: () => Promise<void>;
  deshacer: () => Promise<void>;
}

export function useAplicarVariado(bloques: readonly BloqueRolliza[], cfg: ConfigVariado): AplicarVariado {
  const { confirm } = useConfirm();
  const [respaldo, setRespaldo] = useState<RespaldoVariado | null>(leerRespaldo);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Otra pestaña aplicó o deshizo: la copia aparece o se va acá también. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === claveRespaldo()) setRespaldo(leerRespaldo());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const aplicar = async () => {
    if (ocupado) return;
    setError(null);
    const crudo = leerTexto(claveLote());
    const guardado = parsear(crudo);
    const lote = Array.isArray(guardado) ? recubicarPiezas(guardado as PiezaCubicada[]) : [];
    const apartados = leerApartados(leerTexto(claveApartados()));
    const des = desglosarVariado(lote, bloques, cfg);
    const r = aplicarDesgloseAlLote(lote, des, apartados ?? {});
    if (r.salen === 0) {
      setError("No hay filas Variado que se puedan abrir con lo cargado.");
      return;
    }
    const quedan = des.sinDesglosar.length;
    setOcupado(true);
    try {
      const ok = await confirm({
        title: "¿Abrir el Variado en el lote del cubicador?",
        description:
          `Salen ${plural(r.salen, "fila Variado", "filas Variado")} (${r.paquetes} paq. 6×6) y entran ${plural(r.entran, "fila", "filas")} con sus medidas y especies, repartidas por proporción.`
          + (quedan > 0 ? ` ${plural(quedan, "fila que no se pudo abrir se queda", "filas que no se pudieron abrir se quedan")} como Variado.` : "")
          + " Se guarda una copia del lote de antes: puedes deshacerlo desde acá.",
        intent: "warning",
        confirmLabel: "Sí, aplicar",
      });
      if (!ok) return;
      const copia: RespaldoVariado = {
        filas: guardado as PiezaCubicada[],
        apartados,
        salen: r.salen,
        entran: r.entran,
        paquetes: r.paquetes,
        fecha: new Date().toISOString(),
      };
      try {
        /* La copia primero: si el lote no llega a escribirse, deshacer deja lo mismo. */
        localStorage.setItem(claveRespaldo(), JSON.stringify(copia));
        localStorage.setItem(claveLote(), JSON.stringify(r.filas));
        localStorage.setItem(claveApartados(), JSON.stringify(r.asignados));
      } catch {
        setError("No se pudo guardar en este navegador (memoria llena o modo privado): el lote no cambió.");
        return;
      }
      setRespaldo(copia);
      avisarCambioDelLote();
    } finally {
      setOcupado(false);
    }
  };

  const deshacer = async () => {
    const copia = leerRespaldo();
    if (!copia) { setRespaldo(null); return; }
    if (ocupado) return;
    setError(null);
    setOcupado(true);
    try {
      const ok = await confirm({
        title: "¿Deshacer la apertura del Variado?",
        description: `El lote del cubicador vuelve a como estaba antes (${plural(copia.filas.length, "fila", "filas")}, con ${plural(copia.salen, "fila Variado", "filas Variado")}). Lo que cargaste o cambiaste en el cubicador después se pierde.`,
        intent: "warning",
        confirmLabel: "Sí, deshacer",
      });
      if (!ok) return;
      try {
        localStorage.setItem(claveLote(), JSON.stringify(copia.filas));
        if (copia.apartados) localStorage.setItem(claveApartados(), JSON.stringify(copia.apartados));
        else localStorage.removeItem(claveApartados());
        localStorage.removeItem(claveRespaldo());
      } catch {
        setError("No se pudo guardar en este navegador: el lote no cambió.");
        return;
      }
      setRespaldo(null);
      avisarCambioDelLote();
    } finally {
      setOcupado(false);
    }
  };

  return { respaldo, ocupado, error, aplicar, deshacer };
}
