"use client";

/**
 * «Medir por foto» (16-10): la foto de la cara de la carga → una testa por
 * troza con su Ø CON corteza → la tabla con el N° que imprimirá la guía →
 * «Anotar a mano». Nada se escribe en la base: lo que se pasa queda en el
 * borrador del despacho y recién se guarda al registrar la guía.
 *
 * F2 (Brandon 16-10: «D2 por la otra cara»): la foto de atrás da D1 y,
 * si se toma, la de adelante da D2. `emparejarCaras` junta cada punta de
 * adelante con su troza de atrás; las dudosas se marcan y el operador las
 * corrige tocando («esta de adelante es la N° 7» → `fijarPareja`). Sin la
 * segunda foto, D2 vacío = pareja (ADR-492) y queda marcada en la guía.
 *
 * El operador confirma todo (regla forestal: lo declarado lo confirma él).
 * Lo que se dibuja y se toca (`medida`, `testas`, `codigos`, `tocar`…) es
 * de la cara que se está viendo (`vista`): el lienzo no sabe de caras.
 *
 * El medidor (OpenCV, 13 MB) se carga al abrir la ventana y se suelta un
 * minuto después de cerrarla (`motor-testas`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { leerMedida, type ArbolParaNumerar, type TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";
import {
  aTrozasAMano,
  codigosDeLaCarga,
  emparejarCaras,
  filasDeLaCarga,
  resumenDeLaCarga,
  type CaraMedida,
  type CorreccionesDeLaCarga,
} from "@/lib/forestal/testas-medicion";
import { cargarMotorTestas, retenerMotorTestas } from "../camaras/motor-testas";
import { useCaraPorFoto } from "./use-cara-por-foto";

export type { FasePorFoto } from "./use-cara-por-foto";
export type CampoCorregible = keyof CorreccionesDeLaCarga;
type LadoDeLaCarga = CaraMedida["cara"];

export interface OpcionesPorFoto {
  /** Lo ya anotado a mano: las de la foto numeran DETRÁS. */
  previas: readonly TrozaAMano[];
  /** Los códigos de las trozas del libro que ya van en la guía. */
  ocupados: readonly string[];
  arboles?: ReadonlyMap<string, ArbolParaNumerar>;
  desdeInicial: number;
  especieInicial: string;
}

/** Saca la corrección de un campo de una troza (lo que se ve en la foto vuelve a mandar). */
function sinCorreccion(c: CorreccionesDeLaCarga, campo: CampoCorregible, id: string): CorreccionesDeLaCarga {
  if (c[campo]?.[id] === undefined) return c;
  const resto = { ...c[campo] };
  delete resto[id];
  return { ...c, [campo]: resto };
}

export function useTrozasPorFoto(o: OpcionesPorFoto) {
  const [motor, setMotor] = useState<"cargando" | "listo" | "error">("cargando");
  const marcarMotorListo = useCallback(() => setMotor("listo"), []);
  const atras = useCaraPorFoto("atras", marcarMotorListo);
  const adelante = useCaraPorFoto("adelante", marcarMotorListo);
  const [vistaElegida, setVista] = useState<LadoDeLaCarga>("atras");
  const [especie, setEspecie] = useState(o.especieInicial);
  const [largo, setLargo] = useState("");
  const [correcciones, setCorrecciones] = useState<CorreccionesDeLaCarga>({});
  /** Lo que fijó el operador: id de atrás → id de adelante. */
  const [fijas, setFijas] = useState<Record<string, string | null>>({});
  const [desde, setDesde] = useState(o.desdeInicial);

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

  const { elegir: medirAtras, otraFoto: otraAtras } = atras;
  const { elegir: medirAdelante, otraFoto: otraAdelante } = adelante;
  /* Otra foto atrás = otras testas: lo corregido y lo fijado eran de la anterior. */
  const elegir = useCallback(
    (file: File) => {
      setCorrecciones({});
      setFijas({});
      setVista("atras");
      return medirAtras(file);
    },
    [medirAtras],
  );
  const elegirAdelante = useCallback(
    (file: File) => {
      setFijas({});
      setVista("adelante");
      return medirAdelante(file);
    },
    [medirAdelante],
  );
  const conAdelante = adelante.fase === "listo" && adelante.medida != null;
  const vista: LadoDeLaCarga = conAdelante ? vistaElegida : "atras";
  const cara = vista === "adelante" ? adelante : atras;

  const emparejado = useMemo(
    () =>
      conAdelante && atras.medida && adelante.medida
        ? emparejarCaras({ mmPorPx: atras.medida.cara.mmPorPx, testas: atras.testas }, { mmPorPx: adelante.medida.cara.mmPorPx, testas: adelante.testas }, fijas)
        : null,
    [conAdelante, atras.medida, atras.testas, adelante.medida, adelante.testas, fijas],
  );
  /** Id de adelante → su pareja de atrás. */
  const atrasDe = useMemo(() => new Map((emparejado?.parejas ?? []).flatMap((p) => (p.adelante ? [[p.adelante, p] as const] : []))), [emparejado]);

  const { previas, ocupados, arboles } = o;
  const codigosAtras = useMemo(
    () => codigosDeLaCarga(previas, atras.testas.length, { ocupados, arboles, desde }),
    [previas, atras.testas.length, ocupados, arboles, desde],
  );
  /** Adelante, cada punta lleva el N° de su troza de atrás («7?» si la pareja es dudosa, «—» si no tiene). */
  const codigosAdelante = useMemo(() => {
    const codigoDe = new Map(atras.testas.map((t, k) => [t.id, codigosAtras[k] ?? "—"]));
    return adelante.testas.map((t) => {
      const p = atrasDe.get(t.id);
      return p ? `${codigoDe.get(p.atras) ?? "—"}${p.dudosa ? "?" : ""}` : "—";
    });
  }, [atras.testas, codigosAtras, adelante.testas, atrasDe]);

  const largoM = leerMedida(largo);
  const filas = useMemo(
    () =>
      filasDeLaCarga(
        atras.testas,
        codigosAtras,
        { largoM, especie },
        correcciones,
        emparejado ? { testas: adelante.testas, parejas: emparejado.parejas } : undefined,
      ),
    [atras.testas, codigosAtras, largoM, especie, correcciones, emparejado, adelante.testas],
  );
  const resumen = useMemo(() => resumenDeLaCarga(filas), [filas]);
  const paraLaGuia = useMemo(() => aTrozasAMano(filas), [filas]);

  /** ± cm sobre la elipse: lo tipeado en ese D se suelta (manda lo que se ve). */
  const { ajustar: ajustarElipse } = cara;
  const ajustar = useCallback(
    (id: string, deltaCm: number) => {
      ajustarElipse(id, deltaCm);
      const deAtras = vista === "atras" ? id : atrasDe.get(id)?.atras;
      if (deAtras) setCorrecciones((c) => sinCorreccion(c, vista === "atras" ? "d1Cm" : "d2Cm", deAtras));
    },
    [ajustarElipse, vista, atrasDe],
  );

  /** Lo que se tipea en la tabla: texto vacío vuelve a lo de la foto (D1, D2, largo) o a «pareja» (D2). */
  const corregir = useCallback((campo: CampoCorregible, id: string, texto: string) => {
    const n = leerMedida(texto);
    setCorrecciones((c) => {
      const previo = { ...(c[campo] ?? {}) };
      if (n == null) delete previo[id];
      else previo[id] = n;
      return { ...c, [campo]: previo };
    });
  }, []);

  /** «Esta de adelante es la N° 7»: una punta de adelante va a una sola troza de atrás. `null` = que decida el emparejado. */
  const fijarPareja = useCallback((idAdelante: string, idAtras: string | null) => {
    setFijas((prev) => {
      const sig = Object.fromEntries(Object.entries(prev).filter(([a, b]) => b !== idAdelante && a !== idAtras));
      if (idAtras) sig[idAtras] = idAdelante;
      return sig;
    });
  }, []);

  /** «Otra foto» de la cara que se ve; la de adelante vuelve a «D2 = D1» hasta tomar otra. */
  const otraFoto = useCallback(() => {
    if (vista === "adelante") {
      otraAdelante();
      setFijas({});
      setVista("atras");
      return;
    }
    otraAtras();
  }, [vista, otraAdelante, otraAtras]);

  const dudosas = (emparejado?.parejas.filter((p) => p.dudosa).length ?? 0) + (emparejado?.sueltas.length ?? 0);

  return {
    motor,
    /** La fase de la foto de atrás: sin ella no hay tabla. */
    fase: atras.fase,
    error: atras.error,
    foto: atras.foto,
    atras,
    adelante,
    vista,
    setVista,
    codigosAtras,
    codigosAdelante,
    emparejado,
    atrasDe,
    dudosas,
    fijarPareja,
    elegirAdelante,
    /* Lo de la cara que se ve (el lienzo). */
    medida: cara.medida,
    testas: cara.testas,
    codigos: vista === "adelante" ? codigosAdelante : codigosAtras,
    seleccion: cara.seleccion,
    setSeleccion: cara.setSeleccion,
    agregando: cara.agregando,
    setAgregando: cara.setAgregando,
    buscando: cara.buscando,
    aviso: cara.aviso,
    tocar: cara.tocar,
    quitar: cara.quitar,
    ajustar,
    especie,
    setEspecie,
    largo,
    setLargo,
    desde,
    setDesde,
    filas,
    resumen,
    paraLaGuia,
    elegir,
    corregir,
    otraFoto,
  };
}

export type TrozasPorFoto = ReturnType<typeof useTrozasPorFoto>;
