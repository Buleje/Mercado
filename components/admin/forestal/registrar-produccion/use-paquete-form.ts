/**
 * El formulario de UN paquete de «Registrar producción»: sus campos, la serie
 * de códigos de la planta, «las de siempre» y el código que se propone.
 *
 * Movido tal cual desde `CtpRegistrarProduccionModal.tsx` (28-10, la ventana
 * pasó a tres pasos): mismo orden de estados y de efectos, para que lo que se
 * guarda salga idéntico.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { TIPOS_PRODUCTO_SALIDA, presentacionSugerida } from "@/lib/forestal/loctp-catalogos";
import {
  codigoCanonicoDePaquete,
  sugerirCodigoPaquete,
  type PaqueteBorrador,
} from "@/lib/forestal/produccion-paquetes";

export function usePaqueteForm({
  productoInicial,
  codigosUsados,
  paquetes,
}: {
  productoInicial?: string | null;
  /** Lo que la corrida ya declaró en tandas anteriores: no se repite. */
  codigosUsados: string[];
  /** Lo que ya está en el borrador de esta tanda. */
  paquetes: PaqueteBorrador[];
}) {
  const [codigo, setCodigo] = useState("");
  /**
   * Los códigos que la planta ENTERA ya usó.
   *
   * El índice es `@@unique[tenantId, codigo]`: autonumerar desde el último de
   * ESTA corrida proponía un código que la corrida de al lado ya tenía, y el
   * choque volvía recién al guardar. Con la serie de la planta el sugerido sale
   * libre de entrada.
   */
  const [codigosPlanta, setCodigosPlanta] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/ctp?codigosPaquete=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { codigos: [] }))
      .then((j: { codigos?: string[] }) => {
        if (vivo) setCodigosPlanta(j.codigos ?? []);
      })
      /* Sin la serie se tipea a mano y el servidor sigue validando: es una
         ayuda, no un requisito. */
      .catch(() => {
        if (vivo) setCodigosPlanta([]);
      });
    return () => {
      vivo = false;
    };
  }, []);
  const [producto, setProducto] = useState<string>(
    productoInicial || TIPOS_PRODUCTO_SALIDA[0]?.valor || "",
  );
  /* Arranca en la del producto inicial, para que el primer paquete no salga con
     una presentación que el producto contradice. */
  const [presentacion, setPresentacion] = useState<string>(
    () => presentacionSugerida(productoInicial || TIPOS_PRODUCTO_SALIDA[0]?.valor) ?? "PAQUETES",
  );
  const [cantidad, setCantidad] = useState("");
  const [volumen, setVolumen] = useState("");
  /** La presentación la puso el producto y no el operador: se dice, en chico. */
  const [presentacionAuto, setPresentacionAuto] = useState(false);

  /**
   * «Las de siempre»: las medidas que este aserradero más declaró **de ESTE
   * producto**.
   *
   * Salen del propio libro, no de un catálogo que alguien tendría que mantener:
   * lo más producido ES la plantilla. Mezcladas, el que declara listones veía
   * las medidas de la paquetería; por eso se piden por producto y se vuelven a
   * pedir cuando cambia.
   */
  const [medidas, setMedidas] = useState<
    {
      productType: string | null;
      presentacion: string | null;
      espesorCm: number;
      anchoCm: number;
      largoM: number;
      veces: number;
    }[]
  >([]);
  /** Las que se muestran son de OTROS productos: no hay historial de éste. */
  const [medidasDeOtros, setMedidasDeOtros] = useState(false);
  useEffect(() => {
    let vivo = true;
    const pedir = (url: string) =>
      fetch(url, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { medidas: [] }))
        .then((j: { medidas?: typeof medidas }) => j.medidas ?? []);
    pedir(`/api/admin/forestal/ctp?medidas=1&producto=${encodeURIComponent(producto)}`)
      .then(async (propias) => {
        if (!vivo) return;
        if (propias.length > 0) {
          setMedidas(propias);
          setMedidasDeOtros(false);
          return;
        }
        /* Un producto que nunca se declaró no tiene plantillas: antes que dejar
           el hueco vacío se ofrecen las de la planta, DICIENDO que son de otros
           productos — la medida sirve igual, el que no sirve es un atajo mudo. */
        const generales = await pedir("/api/admin/forestal/ctp?medidas=1");
        if (!vivo) return;
        setMedidas(generales);
        setMedidasDeOtros(generales.length > 0);
      })
      /* Sin plantillas se tipea como siempre: es un atajo, no un requisito. */
      .catch(() => {
        if (vivo) {
          setMedidas([]);
          setMedidasDeOtros(false);
        }
      });
    return () => {
      vivo = false;
    };
  }, [producto]);

  /**
   * El paquete que se está EDITANDO, si hay uno.
   *
   * Antes sólo se podía quitar y volver a tipear: equivocarse en el volumen del
   * paquete 3 de 15 costaba re-cargarlo entero. Editando, el formulario es el
   * mismo — un segundo formulario para corregir sería otro lugar donde el
   * volumen puede salir distinto.
   */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /**
   * Cuántos paquetes IGUALES crear de una (A1).
   *
   * El turno real es «doce paquetes de 2 × 20 × 3.20»: doce vueltas del mismo
   * formulario cambiando sólo el correlativo del código. Acá se pone 12 y salen
   * los doce, cada uno con su código libre de la serie.
   */
  const [repetir, setRepetir] = useState("1");
  /** Para devolver el foco acá al abrir y después de cada paquete agregado. */
  const cantidadRef = useRef<HTMLInputElement>(null);

  const [dimensionar, setDimensionar] = useState(false);
  const [espesor, setEspesor] = useState("");
  const [ancho, setAncho] = useState("");
  const [largo, setLargo] = useState("");
  const [obsPaquete, setObsPaquete] = useState("");

  /**
   * El próximo código LIBRE de la serie de la planta, esquivando lo que ya está
   * en el borrador. Se propone; se puede pisar tipeando.
   */
  const proponerCodigo = useCallback(
    (extra: readonly string[] = []) =>
      sugerirCodigoPaquete(codigosPlanta, {
        hoy: new Date(),
        ocupados: [...codigosUsados, ...paquetes.map((p) => p.codigo), ...extra],
      }),
    [codigosPlanta, codigosUsados, paquetes],
  );
  /**
   * El código canónico del mes (`PQ-AAMM-NNN`) que todavía está libre.
   *
   * Es el que ofrece el aviso cuando lo tipeado no tiene forma. No se impone: la
   * serie de la planta la decide el aserradero, y los códigos ya pintados en
   * atados de verdad no se tocan.
   */
  const codigoCanonicoLibre = useCallback(() => {
    const tomados = new Set(
      [...codigosPlanta, ...codigosUsados, ...paquetes.map((p) => p.codigo)]
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    );
    const hoy = new Date();
    for (let n = 1; n <= 999; n++) {
      const c = codigoCanonicoDePaquete(hoy, n);
      if (!tomados.has(c.toLowerCase())) return c;
    }
    return codigoCanonicoDePaquete(hoy, 999);
  }, [codigosPlanta, codigosUsados, paquetes]);
  /* Sólo mientras el campo esté intacto: pisar lo que el operador tipeó porque
     llegó una respuesta del servidor es la forma más rápida de perder un código
     escrito a mano. */
  const codigoTocado = useRef(false);
  /**
   * El último código que propuso la pantalla.
   *
   * Sin esto, el primer sugerido —calculado ANTES de que llegue la serie de la
   * planta, o sea sin datos— se quedaba pegado: proponía `PQ-2608-001` teniendo
   * la serie `PQ-0289` a la vista. Se puede reemplazar lo que propuso la
   * pantalla; lo que tipeó el operador, nunca.
   */
  const sugeridoRef = useRef("");
  useEffect(() => {
    if (codigoTocado.current) return;
    const sugerido = proponerCodigo();
    if (!sugerido) return;
    /**
     * El anterior se captura ANTES de mutar la ref.
     *
     * El updater de `setState` corre diferido —en el render siguiente— y para
     * entonces `sugeridoRef.current` ya vale el nuevo: comparando contra la ref
     * adentro, el sugerido inicial (calculado sin la serie de la planta) nunca
     * se reemplazaba. Medido en el navegador: proponía `PQ-2608-001` teniendo
     * `PQ-0289` cargado.
     */
    const anterior = sugeridoRef.current;
    sugeridoRef.current = sugerido;
    setCodigo((actual) => (actual.trim() === "" || actual === anterior ? sugerido : actual));
  }, [proponerCodigo]);

  return {
    codigo,
    setCodigo,
    codigosPlanta,
    producto,
    setProducto,
    presentacion,
    setPresentacion,
    cantidad,
    setCantidad,
    volumen,
    setVolumen,
    presentacionAuto,
    setPresentacionAuto,
    medidas,
    medidasDeOtros,
    editandoId,
    setEditandoId,
    repetir,
    setRepetir,
    cantidadRef,
    dimensionar,
    setDimensionar,
    espesor,
    setEspesor,
    ancho,
    setAncho,
    largo,
    setLargo,
    obsPaquete,
    setObsPaquete,
    proponerCodigo,
    codigoCanonicoLibre,
    codigoTocado,
    sugeridoRef,
  };
}

export type PaqueteForm = ReturnType<typeof usePaqueteForm>;
