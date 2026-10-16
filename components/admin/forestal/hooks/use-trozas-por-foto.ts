"use client";

/**
 * «Medir por foto» (16-10, F1): la foto de la cara de la carga → una testa
 * por troza con su Ø → la tabla con el N° que imprimirá la guía → «Anotar a
 * mano». Nada se escribe en la base: lo que se pasa queda en el borrador del
 * despacho y recién se guarda al registrar la guía.
 *
 * El operador confirma todo (regla forestal: lo declarado lo confirma él):
 * toca una testa para elegirla, la ajusta de a 1 cm, la quita o agrega la que
 * faltó, y corrige D1, D2 y el largo en la tabla. D2 vacío = troza pareja
 * (ADR-492) y queda marcada en la guía.
 *
 * El medidor (OpenCV, 13 MB) se carga al abrir la ventana y se suelta un
 * minuto después de cerrarla (`motor-testas`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { leerMedida, type ArbolParaNumerar, type TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";
import {
  aTrozasAMano,
  codigosDeLaCarga,
  conDiametro,
  filasDeLaCarga,
  ordenDeLectura,
  radiosBuscados,
  resumenDeLaCarga,
  testaDeElipse,
  type CaraMedida,
  type CorreccionesDeLaCarga,
  type TestaPropuesta,
} from "@/lib/forestal/testas-medicion";
import { cargarMotorTestas, medirTestasDe, retenerMotorTestas, testaDondeToco } from "../camaras/motor-testas";

export type FasePorFoto = "inicio" | "midiendo" | "listo" | "sin_hoja" | "error";
export type CampoCorregible = keyof CorreccionesDeLaCarga;

interface MedidaVista {
  cara: CaraMedida;
  enderezada: Blob;
  url: string;
  ms: number;
}

export interface OpcionesPorFoto {
  /** Lo ya anotado a mano: las de la foto numeran DETRÁS. */
  previas: readonly TrozaAMano[];
  /** Los códigos de las trozas del libro que ya van en la guía. */
  ocupados: readonly string[];
  arboles?: ReadonlyMap<string, ArbolParaNumerar>;
  desdeInicial: number;
  especieInicial: string;
}

/** ¿Tocó dentro de esta testa? (con un 15 % de holgura: el dedo no es un puntero). */
function dentroDe(t: TestaPropuesta, x: number, y: number): number {
  const a = (t.anguloGrados * Math.PI) / 180;
  const dx = x - t.cx;
  const dy = y - t.cy;
  const u = dx * Math.cos(a) + dy * Math.sin(a);
  const v = -dx * Math.sin(a) + dy * Math.cos(a);
  return (u / (t.aPx * 1.15)) ** 2 + (v / (t.bPx * 1.15)) ** 2;
}

const mediana = (v: number[]): number => {
  const o = [...v].sort((p, q) => p - q);
  return o[Math.floor(o.length / 2)] ?? 0;
};

export function useTrozasPorFoto(o: OpcionesPorFoto) {
  const [motor, setMotor] = useState<"cargando" | "listo" | "error">("cargando");
  const [fase, setFase] = useState<FasePorFoto>("inicio");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [medida, setMedida] = useState<MedidaVista | null>(null);
  const [testas, setTestas] = useState<TestaPropuesta[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [especie, setEspecie] = useState(o.especieInicial);
  const [largo, setLargo] = useState("");
  const [correcciones, setCorrecciones] = useState<CorreccionesDeLaCarga>({});
  const [desde, setDesde] = useState(o.desdeInicial);
  /* La foto que se está midiendo: si eligió otra mientras tanto, la vieja no pisa. */
  const pedido = useRef(0);
  const nuevas = useRef(1);

  useEffect(() => {
    const soltar = retenerMotorTestas();
    let vivo = true;
    cargarMotorTestas().then(
      () => vivo && setMotor("listo"),
      (err: unknown) => {
        logger.warn("[trozas-por-foto] el medidor no cargó", { error: String(err) });
        if (vivo) setMotor("error");
      },
    );
    return () => {
      vivo = false;
      soltar();
    };
  }, []);
  useEffect(() => (medida ? () => URL.revokeObjectURL(medida.url) : undefined), [medida]);

  const elegir = useCallback(async (file: File) => {
    const n = ++pedido.current;
    setFoto(file);
    setFase("midiendo");
    setError(null);
    setAviso(null);
    setSeleccion(null);
    setAgregando(false);
    setCorrecciones({});
    try {
      const r = await medirTestasDe(file, "atras");
      if (n !== pedido.current) return;
      setMotor("listo");
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
      logger.warn("[trozas-por-foto] no se pudo medir la foto", { error: String(err) });
      setError(err instanceof Error ? err.message : "No se pudo medir la foto.");
      setFase("error");
    }
  }, []);

  const mmPorPx = medida?.cara.mmPorPx ?? 1;
  /** El radio con el que se busca una testa nueva: el de las otras o el medio del rango. */
  const radioTipico = useMemo(() => {
    if (testas.length) return mediana(testas.map((t) => (t.aPx + t.bPx) / 2));
    const r = radiosBuscados(mmPorPx);
    return (r.min + r.max) / 2;
  }, [testas, mmPorPx]);

  const tocar = useCallback(
    async (x: number, y: number) => {
      if (buscando) return;
      const cerca = testas
        .map((t) => ({ t, d: dentroDe(t, x, y) }))
        .filter((c) => c.d <= 1)
        .sort((p, q) => p.d - q.d)[0]?.t;
      if (cerca || !agregando) {
        setSeleccion(cerca?.id ?? null);
        setAgregando(false);
        return;
      }
      const id = `m${nuevas.current++}`;
      setBuscando(true);
      let nueva: TestaPropuesta | null = null;
      try {
        nueva = await testaDondeToco(x, y, radioTipico, id);
      } catch (err) {
        logger.warn("[trozas-por-foto] no se pudo buscar el borde", { error: String(err) });
      }
      /* Sin borde claro, va del tamaño de las otras y el operador la ajusta. */
      setAviso(nueva ? null : "No encontré el borde: la puse del tamaño de las otras. Ajústala con − y +.");
      const t =
        nueva ?? testaDeElipse({ cx: x, cy: y, ancho: radioTipico * 2, alto: radioTipico * 2, angulo: 0, puntos: 0 }, mmPorPx, id, "agregada");
      setTestas((prev) => ordenDeLectura([...prev, t]));
      setSeleccion(id);
      setAgregando(false);
      setBuscando(false);
    },
    [agregando, buscando, testas, radioTipico, mmPorPx],
  );

  const quitar = useCallback((id: string) => {
    setTestas((prev) => prev.filter((t) => t.id !== id));
    setSeleccion(null);
  }, []);

  /** ± cm sobre la elipse: lo tipeado en D1 se suelta (manda lo que se ve). */
  const ajustar = useCallback(
    (id: string, deltaCm: number) => {
      setTestas((prev) => prev.map((t) => (t.id === id ? conDiametro(t, t.dCm + deltaCm, mmPorPx) : t)));
      setCorrecciones((c) => {
        if (c.d1Cm?.[id] === undefined) return c;
        const resto = { ...c.d1Cm };
        delete resto[id];
        return { ...c, d1Cm: resto };
      });
    },
    [mmPorPx],
  );

  /** Lo que se tipea en la tabla: texto vacío vuelve a lo de la foto (D1, largo) o a «pareja» (D2). */
  const corregir = useCallback((campo: CampoCorregible, id: string, texto: string) => {
    const n = leerMedida(texto);
    setCorrecciones((c) => {
      const previo = { ...(c[campo] ?? {}) };
      if (n == null) delete previo[id];
      else previo[id] = n;
      return { ...c, [campo]: previo };
    });
  }, []);

  const otraFoto = useCallback(() => {
    pedido.current++;
    setFase("inicio");
    setFoto(null);
    setMedida(null);
    setTestas([]);
    setSeleccion(null);
    setError(null);
    setAviso(null);
  }, []);

  const { previas, ocupados, arboles } = o;
  const codigos = useMemo(
    () => codigosDeLaCarga(previas, testas.length, { ocupados, arboles, desde }),
    [previas, testas.length, ocupados, arboles, desde],
  );
  const largoM = leerMedida(largo);
  const filas = useMemo(
    () => filasDeLaCarga(testas, codigos, { largoM, especie }, correcciones),
    [testas, codigos, largoM, especie, correcciones],
  );
  const resumen = useMemo(() => resumenDeLaCarga(filas), [filas]);
  const paraLaGuia = useMemo(() => aTrozasAMano(filas), [filas]);

  return {
    motor,
    fase,
    error,
    aviso,
    foto,
    medida,
    testas,
    seleccion,
    setSeleccion,
    agregando,
    setAgregando,
    buscando,
    especie,
    setEspecie,
    largo,
    setLargo,
    desde,
    setDesde,
    codigos,
    filas,
    resumen,
    paraLaGuia,
    elegir,
    tocar,
    quitar,
    ajustar,
    corregir,
    otraFoto,
  };
}

export type TrozasPorFoto = ReturnType<typeof useTrozasPorFoto>;
