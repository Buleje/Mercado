"use client";

/**
 * El formulario del asiento manual o de apertura (ADR-529): fecha, glosa y
 * filas de líneas. El total que cuadra se calcula en vivo y no deja guardar si
 * no cuadra (el servidor valida igual). La apertura se precarga con
 * `apertura-sugerida`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { limaDateKey } from "@/lib/utils";
import { BASE_CONTABILIDAD, type Asiento, type AsientoManualEntrada, type TipoAsientoManual } from "@/lib/contabilidad/tipos";
import { useAccionContable } from "./use-contabilidad-acciones";

export interface FilaForm {
  id: number;
  cuenta: string;
  debe: string;
  haber: string;
  tercero: string;
}

const numero = (s: string): number => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

let siguienteId = 1;
const filaVacia = (): FilaForm => ({ id: siguienteId++, cuenta: "", debe: "", haber: "", tercero: "" });
const filaDe = (l: AsientoManualEntrada["lineas"][number]): FilaForm => ({
  id: siguienteId++,
  cuenta: l.cuenta,
  debe: l.debe > 0 ? String(l.debe) : "",
  haber: l.haber > 0 ? String(l.haber) : "",
  tercero: l.tercero ?? "",
});

export function useAsientoManual(open: boolean, tipo: TipoAsientoManual, fechaInicial: string, onGuardado: (a: Asiento) => void) {
  const [fecha, setFecha] = useState(fechaInicial);
  const [glosa, setGlosa] = useState("");
  const [filas, setFilas] = useState<FilaForm[]>([]);
  const [cargandoSugerido, setCargandoSugerido] = useState(false);
  const [avisoSugerido, setAvisoSugerido] = useState<string | null>(null);
  const { ejecutar, enviando, error, limpiar } = useAccionContable();

  // Cada vez que se abre: formulario limpio (y, si es apertura, con lo sugerido).
  useEffect(() => {
    if (!open) return;
    setFecha(fechaInicial || limaDateKey());
    setGlosa(tipo === "apertura" ? "Asiento de apertura" : "");
    setFilas([filaVacia(), filaVacia()]);
    setAvisoSugerido(null);
    limpiar();
    if (tipo !== "apertura") return;
    let vigente = true;
    setCargandoSugerido(true);
    fetch(`${BASE_CONTABILIDAD}/apertura-sugerida`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as AsientoManualEntrada) : null))
      .then((s) => {
        if (!vigente) return;
        if (s && s.lineas.length > 0) {
          setFilas(s.lineas.map(filaDe));
          if (s.glosa) setGlosa(s.glosa);
          if (s.fecha) setFecha(s.fecha);
          setAvisoSugerido("Precargamos lo que el sistema sabe (caja, stock, deudas). Revisa y corrige antes de guardar.");
        } else {
          setAvisoSugerido("No hay datos para sugerir: escribe tus saldos de inicio a mano.");
        }
      })
      .catch((err: unknown) => {
        if (vigente) setAvisoSugerido(`No se pudo traer la sugerencia (${String(err)}). Escribe los saldos a mano.`);
      })
      .finally(() => { if (vigente) setCargandoSugerido(false); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o cambiar de tipo
  }, [open, tipo]);

  const totales = useMemo(() => {
    const debe = filas.reduce((s, f) => s + numero(f.debe), 0);
    const haber = filas.reduce((s, f) => s + numero(f.haber), 0);
    return { debe: Math.round(debe * 100) / 100, haber: Math.round(haber * 100) / 100 };
  }, [filas]);
  const diferencia = Math.round((totales.debe - totales.haber) * 100) / 100;
  const llenas = filas.filter((f) => f.cuenta || f.debe || f.haber);
  const filasValidas = llenas.length >= 2 && llenas.every((f) => f.cuenta && (numero(f.debe) > 0) !== (numero(f.haber) > 0));
  const cuadra = Math.abs(diferencia) < 0.005 && totales.debe > 0;
  const puedeGuardar = cuadra && filasValidas && glosa.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !enviando;

  const cambiar = useCallback((id: number, parte: Partial<FilaForm>) => {
    setFilas((fs) => fs.map((f) => {
      if (f.id !== id) return f;
      const nueva = { ...f, ...parte };
      // Una línea es debe O haber: escribir en uno vacía el otro.
      if (parte.debe && numero(parte.debe) > 0) nueva.haber = "";
      if (parte.haber && numero(parte.haber) > 0) nueva.debe = "";
      return nueva;
    }));
  }, []);
  const agregar = useCallback(() => setFilas((fs) => [...fs, filaVacia()]), []);
  const quitar = useCallback((id: number) => setFilas((fs) => (fs.length > 2 ? fs.filter((f) => f.id !== id) : fs)), []);
  /** Pone en una fila lo que falta para cuadrar. */
  const completar = useCallback((id: number) => {
    setFilas((fs) => fs.map((f) => {
      if (f.id !== id) return f;
      const otros = fs.filter((x) => x.id !== id);
      const d = otros.reduce((s, x) => s + numero(x.debe), 0);
      const h = otros.reduce((s, x) => s + numero(x.haber), 0);
      const dif = Math.round((d - h) * 100) / 100;
      return dif >= 0 ? { ...f, debe: "", haber: dif > 0 ? String(dif) : "" } : { ...f, haber: "", debe: String(-dif) };
    }));
  }, []);

  const guardar = useCallback(async () => {
    if (!puedeGuardar) return;
    const cuerpo: AsientoManualEntrada = {
      fecha,
      glosa: glosa.trim(),
      tipo,
      lineas: llenas.map((f) => ({ cuenta: f.cuenta, debe: numero(f.debe), haber: numero(f.haber), tercero: f.tercero.trim() || null })),
    };
    const res = await ejecutar<Asiento>("POST", "asientos", cuerpo);
    if (res.ok) onGuardado(res.datos);
  }, [puedeGuardar, fecha, glosa, tipo, llenas, ejecutar, onGuardado]);

  return {
    fecha, setFecha, glosa, setGlosa, filas, totales, diferencia, cuadra, puedeGuardar,
    cambiar, agregar, quitar, completar, guardar, enviando, error, cargandoSugerido, avisoSugerido,
  };
}
