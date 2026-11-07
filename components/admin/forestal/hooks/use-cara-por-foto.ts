"use client";

/**
 * Una cara de la carga en «Medir por foto» (16-10): la foto, lo que midió el
 * worker y lo que corrige el operador (elegir, ajustar de a 1 cm, quitar o
 * agregar la testa que faltó). F2 usa dos: la de atrás da D1 y la de
 * adelante, D2 (`use-trozas-por-foto` las empareja).
 *
 * F4 (Brandon 16-10, «tocar la troza que no ve»): tocar donde no hay una testa
 * la recorta desde el toque (`segmentar-toque.ts`, en el worker), con corteza.
 * Si ahí no hay un borde redondo no se agrega nada: un toque en el piso no
 * inventa una troza. «Agregar troza» sigue poniéndola aunque no vea el borde.
 *
 * Las testas que agrega el operador llevan `m1, m2…` atrás y `am1, am2…`
 * adelante: nunca chocan con las del medidor (`t1…` / `a1…`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { conDiametro, ordenDeLectura, radiosBuscados, testaDeElipse, type CaraMedida, type TestaPropuesta } from "@/lib/forestal/testas-medicion";
import { medirTestasDe, testaDondeToco } from "../camaras/motor-testas";

export type FasePorFoto = "inicio" | "midiendo" | "listo" | "sin_hoja" | "error";
type LadoDeLaCarga = CaraMedida["cara"];

export interface MedidaVista {
  cara: CaraMedida;
  enderezada: Blob;
  url: string;
  ms: number;
}

/**
 * ¿Tocó dentro de esta testa? ≤ 1 = sí. Con holgura: un 15 % o `holguraPx` (px
 * de la foto que equivalen a medio dedo en la pantalla), lo que sea más.
 */
function dentroDe(t: TestaPropuesta, x: number, y: number, holguraPx: number): number {
  const a = (t.anguloGrados * Math.PI) / 180;
  const dx = x - t.cx;
  const dy = y - t.cy;
  const u = dx * Math.cos(a) + dy * Math.sin(a);
  const v = -dx * Math.sin(a) + dy * Math.cos(a);
  return (u / Math.max(t.aPx * 1.15, t.aPx + holguraPx)) ** 2 + (v / Math.max(t.bPx * 1.15, t.bPx + holguraPx)) ** 2;
}

const mediana = (v: number[]): number => {
  const o = [...v].sort((p, q) => p - q);
  return o[Math.floor(o.length / 2)] ?? 0;
};

/** `alMedir`: avisa que el medidor respondió (estable: un setter o un `useCallback` sin dependencias). */
export function useCaraPorFoto(lado: LadoDeLaCarga, alMedir?: () => void) {
  const [fase, setFase] = useState<FasePorFoto>("inicio");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [medida, setMedida] = useState<MedidaVista | null>(null);
  const [testas, setTestas] = useState<TestaPropuesta[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  /* La foto que se está midiendo: si eligió otra mientras tanto, la vieja no pisa. */
  const pedido = useRef(0);
  const nuevas = useRef(1);
  const prefijo = lado === "adelante" ? "am" : "m";

  useEffect(() => (medida ? () => URL.revokeObjectURL(medida.url) : undefined), [medida]);

  const elegir = useCallback(
    async (file: File) => {
      const n = ++pedido.current;
      setFoto(file);
      setFase("midiendo");
      setError(null);
      setAviso(null);
      setSeleccion(null);
      setAgregando(false);
      try {
        const r = await medirTestasDe(file, lado);
        if (n !== pedido.current) return;
        alMedir?.();
        if (!r.ok) {
          setMedida(null);
          setTestas([]);
          setFase("sin_hoja");
          return;
        }
        setMedida({ cara: r.cara, enderezada: r.enderezada, url: URL.createObjectURL(r.enderezada), ms: r.ms });
        setTestas(r.cara.testas);
        nuevas.current = 1;
        setFase("listo");
      } catch (err) {
        if (n !== pedido.current) return;
        logger.warn("[trozas-por-foto] no se pudo medir la foto", { error: String(err), lado });
        setError(err instanceof Error ? err.message : "No se pudo medir la foto.");
        setFase("error");
      }
    },
    [lado, alMedir],
  );

  const mmPorPx = medida?.cara.mmPorPx ?? 1;
  /** El radio con el que se busca una testa nueva: el de las otras o el medio del rango. */
  const radioTipico = useMemo(() => {
    if (testas.length) return mediana(testas.map((t) => (t.aPx + t.bPx) / 2));
    const r = radiosBuscados(mmPorPx);
    return (r.min + r.max) / 2;
  }, [testas, mmPorPx]);

  /**
   * Un toque en (x, y) px de la foto. `holguraPx` = medio dedo (22 px de la
   * pantalla) en px de la foto: tocar cerca del borde de una testa la elige.
   * Fuera de toda testa, recorta la que hay ahí; si no hay borde redondo, sólo
   * con «Agregar troza» la pone del tamaño de las otras.
   */
  const tocar = useCallback(
    async (x: number, y: number, holguraPx = 0) => {
      if (buscando) return;
      const cerca = testas
        .map((t) => ({ t, d: dentroDe(t, x, y, holguraPx) }))
        .filter((c) => c.d <= 1)
        .sort((p, q) => p.d - q.d)[0]?.t;
      if (cerca) {
        setSeleccion(cerca.id);
        setAgregando(false);
        return;
      }
      const forzada = agregando;
      const habiaElegida = seleccion != null;
      const id = `${prefijo}${nuevas.current}`;
      setBuscando(true);
      let nueva: TestaPropuesta | null = null;
      try {
        nueva = await testaDondeToco(x, y, radioTipico, id, lado);
      } catch (err) {
        logger.warn("[trozas-por-foto] no se pudo buscar el borde", { error: String(err), lado });
      }
      /* Un borde que encierra el centro de otra testa no es una troza que faltó: abraza a las vecinas. */
      const halla = nueva;
      if (halla && testas.some((t) => dentroDe(halla, t.cx, t.cy, 0) <= 1)) nueva = null;
      setBuscando(false);
      setAgregando(false);
      if (!nueva && !forzada) {
        setSeleccion(null);
        setAviso(habiaElegida ? null : "Ahí no vi el borde de una troza. Si falta una, toca «Agregar troza» y después la troza.");
        return;
      }
      nuevas.current++;
      /* Sin borde claro, va del tamaño de las otras y el operador la ajusta. */
      setAviso(nueva ? null : "No encontré el borde: la puse del tamaño de las otras. Ajústala arrastrando su borde o con − y +.");
      const t =
        nueva ?? testaDeElipse({ cx: x, cy: y, ancho: radioTipico * 2, alto: radioTipico * 2, angulo: 0, puntos: 0 }, mmPorPx, id, "agregada");
      setTestas((prev) => ordenDeLectura([...prev, t]));
      setSeleccion(id);
    },
    [agregando, buscando, seleccion, testas, radioTipico, mmPorPx, prefijo, lado],
  );

  const quitar = useCallback((id: string) => {
    setTestas((prev) => prev.filter((t) => t.id !== id));
    setSeleccion(null);
  }, []);

  const ajustar = useCallback(
    (id: string, deltaCm: number) => setTestas((prev) => prev.map((t) => (t.id === id ? conDiametro(t, t.dCm + deltaCm, mmPorPx) : t))),
    [mmPorPx],
  );

  const otraFoto = useCallback(() => {
    pedido.current++;
    setFase("inicio");
    setFoto(null);
    setMedida(null);
    setTestas([]);
    setSeleccion(null);
    setError(null);
    setAviso(null);
    setAgregando(false);
  }, []);

  return { lado, fase, error, aviso, foto, medida, testas, seleccion, setSeleccion, agregando, setAgregando, buscando, elegir, tocar, quitar, ajustar, otraFoto };
}

export type CaraPorFoto = ReturnType<typeof useCaraPorFoto>;
