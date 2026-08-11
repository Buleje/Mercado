"use client";

/**
 * CtpDespachoGuiaModal — registrar la salida como lo que es: UNA guía con VARIOS
 * productos.
 *
 * El alta anterior pedía una línea por vez (un producto, una cantidad, un
 * número de GTF) y los datos del documento se cargaban después, desde la ficha
 * del despacho. Pero un camión que sale lleva una sola guía con cinco tablas de
 * tres especies: registrarla de a una obligaba a repetir el número cinco veces y
 * a rehacer el propietario, el destinatario y el transportista en cada una.
 *
 * Acá el acto es uno solo, con la forma del formato oficial (LO-CTP del SNIFFS):
 *   · Pestaña 1 — los datos de la Guía de Transporte Forestal.
 *   · Pestaña 2 — la lista de productos, que sale del stock real de la planta.
 *
 * Al registrar se crea UNA LÍNEA DEL LIBRO POR PRODUCTO —así cada una conserva
 * su especie, su cantidad y su atribución a la corrida de la que salió (I4/I5)—
 * y todas nacen con el mismo cuerpo de guía. El libro sigue siendo el libro; lo
 * que cambia es que el operador ya no tiene que desarmar el documento a mano.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Truck, Wand2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { useFichaCtp } from "@/hooks/use-ficha-ctp";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import { faltantesGtf, gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { rellenarGuia, siguienteNumeroGtf } from "@/lib/forestal/gtf-autocompletar";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import {
  enviosDeLista,
  filasDeCorridas,
  problemasDeLista,
  volumenTotal,
  type CorridaDisponible,
  type FilaDespacho,
} from "@/lib/forestal/despacho-lista";
import type { ValorParte } from "./CtpParteBarra";
import { UNIT_LABELS } from "./ctp-section-shared";
import CtpGuiaDatosTab from "./CtpGuiaDatosTab";
import CtpGuiaRegistrada from "./CtpGuiaRegistrada";
import CtpListaProductosTab from "./CtpListaProductosTab";
import CtpCubicarProductoModal from "./CtpCubicarProductoModal";
import CtpProductosStockModal from "./CtpProductosStockModal";
import CtpTrozasDespachoModal from "./CtpTrozasDespachoModal";
import CtpVerificarGtfSerfor, { type SelloSerfor } from "./CtpVerificarGtfSerfor";
import { logger } from "@/lib/logger";
import { Btn, ModalFooter, parseCitesPermiso } from "./ctp-shared";

const hoy = () => new Date().toISOString().slice(0, 10);

export default function CtpDespachoGuiaModal({
  presetProducto,
  presetEspecie,
  presetUids,
  presetDestino,
  onClose,
  onSaved,
}: {
  /** Producto elegido en Saldos («del patio a la guía»): abre el stock filtrado. */
  presetProducto?: string | null;
  presetEspecie?: string | null;
  /**
   * Paquetes elegidos en una cancha de RESERVA del mapa de planta, por `uid`
   * (`corridaId:paqueteId`). Entran DIRECTO a la lista de la guía: el operador
   * ya eligió qué sale cuando lo tildó en el bloque, y volver a mostrarle el
   * selector de stock sería pedirle la misma decisión dos veces.
   */
  presetUids?: readonly string[] | null;
  /** Nombre de la cancha («Lote 1 · Juan»): arranca como destinatario. */
  presetDestino?: string | null;
  onClose: () => void;
  onSaved: (r: { lineas: number; offline?: boolean }) => void;
}) {
  const ficha = useFichaCtp();
  const directorio = useDirectorioForestal();

  const [tab, setTab] = useState<"guia" | "productos">("guia");
  const [datos, setDatos] = useState<GtfDatos>(() => {
    const base = gtfDatosVacio();
    // El nombre de la cancha de reserva («Lote 1 · Juan») arranca como
    // destinatario: es a quien se le apartó la madera. Se puede corregir —es un
    // punto de partida, no un dato del libro.
    if (presetDestino?.trim()) base.destinatario = { ...base.destinatario, nombre: presetDestino.trim() };
    return base;
  });
  const [filas, setFilas] = useState<FilaDespacho[]>([]);
  const [emision, setEmision] = useState(hoy);
  const [gtfNumber, setGtfNumber] = useState("");
  const [docType, setDocType] = useState("GTF");
  const [sello, setSello] = useState<SelloSerfor | null>(null);
  const [stockAbierto, setStockAbierto] = useState(Boolean(presetProducto));
  /** El otro origen de la lista: las trozas que salen sin aserrar (ADR-363). */
  const [trozasAbierto, setTrozasAbierto] = useState(false);
  /**
   * Cubicar la lista antes de registrarla (ADR-374).
   *
   * La guía declara volumen y piezas por renglón. Medirlos **después** de
   * emitirla no arregla nada: el papel ya salió con el camión. Acá se mide y se
   * cuadra contra lo que la lista dice, con las mismas advertencias que en
   * Productos disponibles (ADR-368/369).
   */
  const [cubicarAbierto, setCubicarAbierto] = useState(false);
  /** Guía ya registrada: el modal se queda para imprimirla, no se cierra solo. */
  const [registrado, setRegistrado] = useState<{
    lineas: number;
    filas: FilaDespacho[];
    cabecera: { id: string; lineNo: number } | null;
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * Por qué quedaron casilleros en blanco.
   *
   * Va en un desplegable y no en la línea del aviso: son seis motivos y ocupaban
   * tres renglones del pie en un modal que ya es largo. El que quiere saberlo lo
   * abre; el que ya lo sabe registra y sigue.
   */
  const [porQueVacios, setPorQueVacios] = useState<string[]>([]);

  /**
   * Precarga desde una cancha de reserva: se piden los disponibles y se arman
   * las filas de esos `uid` con `filasDeCorridas` —la única fuente que trae
   * paquetes, medidas y el techo de saldo—. Si alguno ya no está (se despachó
   * desde otra pantalla mientras tanto), se avisa en vez de registrarlo igual.
   */
  const [precargando, setPrecargando] = useState(Boolean(presetUids?.length));
  useEffect(() => {
    if (!presetUids?.length) return;
    let vivo = true;
    setPrecargando(true);
    ctpGet<{ corridas?: CorridaDisponible[] }>("/api/admin/forestal/ctp?disponibles=1")
      .then((r) => {
        if (!vivo) return;
        const todas = filasDeCorridas(r.corridas ?? []);
        const quiero = new Set(presetUids);
        const elegidas = todas.filter((f) => quiero.has(f.uid));
        setFilas(elegidas);
        if (elegidas.length < quiero.size) {
          setAviso(`${quiero.size - elegidas.length} de los paquetes apartados ya no están disponibles: se despacharon o cambiaron de saldo.`);
        }
        setTab("productos");
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setPrecargando(false); });
    return () => { vivo = false; };
  }, [presetUids]);

  /** Uso de la libreta en ESTA guía: se cuenta recién al registrar. */
  const usados = useRef<{ partes: Set<string>; vehiculos: Set<string> }>({ partes: new Set(), vehiculos: new Set() });
  const anotarParte = useCallback((p: Parte) => { usados.current.partes.add(p.id); }, []);
  const anotarVehiculo = useCallback((id: string) => { usados.current.vehiculos.add(id); }, []);
  const guardarEnLibreta = useCallback(
    async (v: ValorParte, rol: RolParte) => {
      const parte = await directorio.guardarParte({
        roles: [rol], nombre: v.nombre, docTipo: v.docTipo, docNumero: v.docNumero,
        direccion: v.direccion, registroMtc: v.registroMtc,
      });
      anotarParte(parte);
    },
    [directorio, anotarParte],
  );

  /**
   * Autollenado con lo que el sistema ya sabe. Corre UNA vez, cuando la ficha
   * llega: repetirlo pisaría lo que el operador tipeó mientras cargaba.
   */
  const autollenado = useRef(false);
  useEffect(() => {
    if (autollenado.current || !ficha) return;
    autollenado.current = true;
    const planta = [ficha.direccion, ficha.distrito, ficha.provincia, ficha.region].filter(Boolean).join(", ");
    setDatos((p) => ({
      ...p,
      propietario: {
        ...p.propietario,
        esElCtp: true,
        nombre: p.propietario.nombre || ficha.razonSocial || ficha.nombreCtp || "",
        docTipo: "RUC",
        docNumero: p.propietario.docNumero || ficha.ruc || "",
        direccion: p.propietario.direccion || planta,
        departamento: p.propietario.departamento || ficha.region || "",
        provincia: p.propietario.provincia || ficha.provincia || "",
        distrito: p.propietario.distrito || ficha.distrito || "",
      },
      traslado: { ...p.traslado, puntoPartida: p.traslado.puntoPartida || planta, fechaInicio: p.traslado.fechaInicio || emision },
      guia: { ...p.guia, autoridad: p.guia.autoridad || ficha.arffs || "" },
      titulos: p.titulos.length ? p.titulos : (ficha.titulos ?? []).slice(0, 1).map((t) => t.codigo).filter(Boolean),
    }));
  }, [ficha, emision]);

  /**
   * Rellenar TODA la guía con lo guardado (ADR-371).
   *
   * El autollenado de arriba corre una vez y sólo trae la Ficha; esto además
   * baja de la libreta al destinatario, al transportista, al conductor y al
   * camión más usados, arma la ruta y propone la vigencia. No inventa nada: lo
   * que no está guardado queda vacío y se nombra.
   */
  /**
   * La última guía emitida con datos, para heredar transportista, camión y
   * chofer. Se pide una sola vez y se guarda: es la fuente que la libreta no
   * tiene la primera vez que alguien despacha.
   */
  const [ultimaGuia, setUltimaGuia] = useState<Partial<GtfDatos> | null>(null);
  /** El último N° emitido: de ahí sale el siguiente correlativo propuesto. */
  const [ultimaGtfNumber, setUltimaGtfNumber] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    /* `ultimaCompleta=1` y no el listado: la bandeja devuelve la guía RESUMIDA
       —número, destinatario, placa— y el cuerpo con el que se rellena no viaja
       ahí. Pedirle a esa lista los datos completos era buscar una llave en un
       cajón donde nunca estuvo: el modal quedaba sin fuente y no heredaba nada. */
    fetch("/api/admin/forestal/ctp/guias-emitidas?ultimaCompleta=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { ultima: null }))
      .then((j: { ultima?: unknown; gtfNumber?: string | null }) => {
        if (!vivo) return;
        setUltimaGuia(j.ultima && typeof j.ultima === "object" ? (j.ultima as Partial<GtfDatos>) : null);
        setUltimaGtfNumber(j.gtfNumber ?? null);
      })
      /* Sin guía anterior el relleno usa la Ficha y la libreta, que es como
         venía funcionando: es una fuente más, no un requisito. */
      .catch(() => { if (vivo) setUltimaGuia(null); });
    return () => { vivo = false; };
  }, []);

  /**
   * El permiso CITES que ampara lo que sale, traído del INGRESO de origen.
   *
   * Antes sólo se heredaba de la guía anterior, así que la PRIMERA salida de
   * una especie protegida dejaba el casillero vacío teniendo el papel cargado
   * a un salto de distancia. Se precarga acá —y no al hacer click— para que el
   * botón siga siendo instantáneo.
   */
  const especiesCites = useMemo(
    () => [...new Set(filas.filter((f) => f.cites && f.especie).map((f) => f.especie as string))],
    [filas],
  );
  const [citesPermiso, setCitesPermiso] = useState<string | null>(null);
  useEffect(() => {
    if (especiesCites.length === 0) { setCitesPermiso(null); return; }
    let vivo = true;
    /* La más reciente de esa especie que tenga permiso: es la que declara con
       qué papel entró la madera que ahora sale. */
    Promise.all(
      especiesCites.map((esp) =>
        fetch(`/api/admin/forestal/wood-entries?species=${encodeURIComponent(esp)}&cites=1&limit=5`, {
          credentials: "include",
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch((err) => {
            logger.warn("[ctp-guia] no se pudo leer el permiso CITES del origen", { error: String(err), especie: esp });
            return null;
          }),
      ),
    )
      .then((rs) => {
        if (!vivo) return;
        for (const j of rs) {
          const lista = (j as { data?: Array<{ notes?: string | null }> } | null)?.data ?? [];
          for (const e of lista) {
            const p = parseCitesPermiso(e.notes ?? null);
            if (p) { setCitesPermiso(p); return; }
          }
        }
        setCitesPermiso(null);
      })
      .catch(() => { if (vivo) setCitesPermiso(null); });
    return () => { vivo = false; };
  }, [especiesCites]);

  function rellenarTodo() {
    const r = rellenarGuia(datos, {
      ficha,
      destinatario: directorio.porRol("destinatario")[0] ?? null,
      transportista: directorio.porRol("transportista")[0] ?? null,
      conductor: directorio.porRol("conductor")[0] ?? null,
      vehiculo: directorio.vehiculosActivos[0] ?? null,
      destino: datos.destinatario.nombre || null,
      ultimaGuia,
      emision,
      citesPermiso,
      llevaCites: especiesCites.length > 0,
    });
    setDatos(r.datos);
    /* El N° de guía también: sigue la serie de la última emitida. Es el mismo
       correlativo que asigna «Emitir GTF», propuesto antes de guardar. */
    if (!gtfNumber.trim() && ultimaGtfNumber) {
      const siguiente = siguienteNumeroGtf(ultimaGtfNumber);
      if (siguiente) setGtfNumber(siguiente);
    }
    setAviso(
      `Se completó ${r.completados.join(", ") || "nada"}.` +
        (r.faltantes.length > 0 ? ` Falta cargar: ${r.faltantes.join("; ")}.` : " La guía quedó completa."),
    );
    /* Lo que queda en blanco a propósito se nombra: si no, alguien lo llena con
       cualquier cosa para que «no quede nada vacío», y eso es lo que un control
       lee como declaración falsa. */
    setPorQueVacios(r.aProposito);
  }

  /** La fecha de emisión es también el arranque del traslado. */
  function cambiarEmision(v: string) {
    setEmision(v);
    setDatos((p) => ({ ...p, traslado: { ...p.traslado, fechaInicio: v } }));
  }

  const total = volumenTotal(filas);
  /** La unidad de la guía: la de sus productos (la lista no admite mezclarlas). */
  const unidadLista = UNIT_LABELS[filas[0]?.unidad ?? "m3"] ?? filas[0]?.unidad ?? "m³";
  const problemas = useMemo(() => (filas.length === 0 ? [] : problemasDeLista(filas)), [filas]);
  const faltanGuia = useMemo(() => faltantesGtf(datos), [datos]);
  /* Registrar ya NO exige el N° de guía (ADR-374): la línea entra al libro
     como BORRADOR y el número se asigna al emitir. Pedirlo antes obligaba a
     inventar uno para poder registrar un despacho que ya había salido. */
  const puedeRegistrar = filas.length > 0 && problemas.length === 0 && !enviando;
  /** Lo que falta para poder registrar (lo demás se puede completar después). */
  const bloqueoRegistro = enviando
    ? null
    : filas.length === 0
      ? "Agregá productos en «Creación de lista de productos»"
      : problemas.length > 0
        ? "Revisá los avisos de la lista"
        : !gtfNumber.trim()
          ? "Falta el N° de GTF"
          : null;

  /** El título elegido, para la franja de arriba (N° de recurso y resolución). */
  const titulo = useMemo(
    () => (ficha?.titulos ?? []).find((t) => t.codigo && t.codigo === datos.titulos[0]) ?? null,
    [ficha, datos.titulos],
  );

  function agregarFilas(nuevas: FilaDespacho[]) {
    setFilas((prev) => {
      const vistos = new Set(prev.map((f) => f.uid));
      return [...prev, ...nuevas.filter((f) => !vistos.has(f.uid))];
    });
    setTab("productos");
  }

  function cambiarFila(uid: string, campo: "cantidad" | "volumen" | "valorVenta", valor: number | null) {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.uid !== uid) return f;
        /* La venta admite vacío y eso NO es 0: es "todavía no sé en cuánto se
           vendió". Cantidad y volumen sí caen a 0 —una línea sin volumen no
           despacha nada— pero un 0 en la venta diría "regalado" y le fabricaría
           al margen una pérdida del 100%. */
        if (campo === "valorVenta") {
          return { ...f, valorVenta: valor != null && Number.isFinite(valor) ? Math.max(0, valor) : null };
        }
        return { ...f, [campo]: valor != null && Number.isFinite(valor) ? Math.max(0, valor) : 0 };
      }),
    );
  }

  /**
   * Registra la guía: una línea del libro por producto, en SERIE.
   *
   * En serie y no en paralelo a propósito: cada alta toma un lock sobre las
   * líneas de producción para validar el stock (I3/I5), así que mandarlas juntas
   * las haría esperar igual —y con más chance de pisarse. Si una falla, las
   * anteriores YA están: se dice cuáles entraron y las que faltan quedan en la
   * lista para reintentar. Media guía registrada en silencio sería peor.
   */
  async function registrar() {
    setEnviando(true);
    setError(null);
    setAviso(null);
    const comun = {
      entryDate: new Date(emision).toISOString(),
      docType,
      gtfNumber,
      destino: datos.destinatario.nombre || null,
      observations: datos.observaciones || null,
      serforNumeroRegistro: sello?.numeroRegistro ?? null,
      serforVerificadoEn: sello?.verificadoEn ?? null,
    };
    const conGuia = { ...datos, traslado: { ...datos.traslado, fechaInicio: datos.traslado.fechaInicio || emision } };
    /* Producto transformado: una línea por renglón. Trozas sin aserrar: una
       línea por especie con sus piezas (ADR-363). */
    const envios = enviosDeLista(filas, comun, conGuia);

    /* Sin señal en el patio: queda anotado en el equipo y sube solo. El dato NO
       se pierde y NO se dice que quedó en el libro (no quedó). */
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const { anotar, URL_CTP } = await import("@/lib/forestal/patio-cola");
      for (const e of envios) await anotar("despacho", e.payload, URL_CTP);
      setEnviando(false);
      onSaved({ lineas: envios.length, offline: true });
      return;
    }

    const hechas: string[] = [];
    /** La primera línea creada: es la que ancla el QR de verificación del papel. */
    let primera: { id: string; lineNo: number } | null = null;
    let fallo: { rotulo: string; motivo: string } | null = null;
    for (let i = 0; i < envios.length; i++) {
      setAvance({ hechas: i, total: envios.length });
      try {
        const r = await fetch("/api/admin/forestal/ctp", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(envios[i]!.payload),
        });
        const creada: { entry?: { id?: string; lineNo?: number }; message?: string } = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(creada.message ?? `HTTP ${r.status}`);
        hechas.push(...envios[i]!.uids);
        if (!primera && creada.entry?.id) primera = { id: creada.entry.id, lineNo: creada.entry.lineNo ?? 0 };
      } catch (e) {
        fallo = { rotulo: envios[i]!.rotulo, motivo: e instanceof Error ? e.message : String(e) };
        break;
      }
    }
    setAvance(null);
    setEnviando(false);

    if (hechas.length > 0 && directorio) {
      directorio.marcarUso({ partes: [...usados.current.partes], vehiculos: [...usados.current.vehiculos] });
    }
    if (!fallo) {
      /* No se cierra de una: la guía recién registrada es la que hay que
         imprimir, y mandar al operador a buscarla en la tabla para eso era el
         paso de más. Al cerrar se avisa al libro. */
      setRegistrado({ lineas: hechas.length, filas: [...filas], cabecera: primera });
      return;
    }
    // Lo que entró se saca de la lista: reintentar no puede duplicarlo.
    setFilas((prev) => prev.filter((f) => !hechas.includes(f.uid)));
    setError(
      `Se registraron ${hechas.length} de ${filas.length} productos. «${fallo.rotulo}» no entró: ${fallo.motivo}. Lo que falta quedó en la lista para reintentar.`,
    );
    setTab("productos");
  }

  const yaElegidos = useMemo(() => new Set(filas.map((f) => f.uid)), [filas]);
  /** Las piezas ya en la lista: el patio no las vuelve a ofrecer. */
  const trozasElegidas = useMemo(
    () => new Set(filas.map((f) => f.trozaId).filter((id): id is string => Boolean(id))),
    [filas],
  );

  /** Cerrar avisa al libro sólo si algo se registró: si no, es cancelar. */
  function cerrar() {
    if (registrado) onSaved({ lineas: registrado.lineas });
    else onClose();
  }

  return (
    <>
      <AdminModal
        open
        onClose={cerrar}
        variant="wide"
        title="Registro de guía de transporte forestal"
        description="Salida de producto del CTP · una guía, los productos que van en el camión"
        icon={Truck}
        className="sm:w-[min(96vw,100rem)] sm:max-w-none sm:max-h-[95vh]"
        footer={
          registrado ? (
            <ModalFooter
              nota={
                <span>
                  <b className="text-[var(--text-primary)]">{registrado.lineas}</b> {registrado.lineas === 1 ? "línea" : "líneas"} en el libro ·{" "}
                  <span className="font-mono tabular-nums">{total.toFixed(4)} {unidadLista}</span>
                </span>
              }
            >
              <Btn variant="primary" onClick={cerrar}>Cerrar y volver al libro</Btn>
            </ModalFooter>
          ) : (
          <ModalFooter
            error={error}
            aviso={
              aviso ? (
                <span className="min-w-0 flex-1">
                  {aviso}
                  {porQueVacios.length > 0 && (
                    <details className="mt-0.5 inline-block align-top">
                      <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        ¿por qué quedaron casilleros vacíos?
                      </summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs font-normal text-[var(--text-secondary)]">
                        {porQueVacios.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </span>
              ) : null
            }
            nota={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  <b className="text-[var(--text-primary)]">{filas.length}</b> producto{filas.length === 1 ? "" : "s"} ·{" "}
                  <span className="font-mono tabular-nums">{total.toFixed(4)} {unidadLista}</span>
                </span>
                {/* Por qué NO se puede registrar todavía. Un botón apagado sin
                    motivo manda a buscar a ojo entre dos pestañas. */}
                {bloqueoRegistro && (
                  <span className="font-bold text-[var(--text-secondary)]">{bloqueoRegistro}</span>
                )}
                {faltanGuia.length > 0 && (
                  <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    Falta{faltanGuia.length === 1 ? "" : "n"} {faltanGuia.length} dato{faltanGuia.length === 1 ? "" : "s"} para poder imprimirla ({faltanGuia[0]!.campo})
                  </span>
                )}
              </span>
            }
          >
            <Btn variant="ghost" onClick={cerrar} disabled={enviando}>Cerrar</Btn>
            {/* Rellenar la guía con lo guardado: la Ficha del CTP y la libreta
                ya tienen el 90 % de estos casilleros (ADR-371). No toca la lista
                de productos — esa es la otra pestaña y otro acto. */}
            {/* Apretarlo antes de que llegue la Ficha del CTP contestaba «se
                completó nada» y hacía creer que no hay datos guardados. Mientras
                carga lo dice y no deja: la fuente todavía no está. */}
            <Btn
              variant="secondary"
              onClick={rellenarTodo}
              disabled={enviando || !ficha}
              title={
                ficha
                  ? "Completa propietario, destinatario, transportista, vehículo, traslado y títulos con lo que ya está guardado"
                  : "Todavía estoy trayendo la Ficha del CTP, de donde salen el propietario y el punto de partida"
              }
            >
              <Wand2 className="h-4 w-4" />
              {ficha ? "Rellenar datos de la guía" : "Trayendo la Ficha del CTP…"}
            </Btn>
            {/* Con precarga desde una cancha, registrar antes de que lleguen los
                paquetes emitiría una guía sin productos. */}
            <Btn variant="primary" onClick={() => void registrar()} disabled={!puedeRegistrar || precargando}>
              {precargando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Trayendo lo apartado…
                </>
              ) : enviando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {avance ? `Registrando ${avance.hechas + 1} de ${avance.total}…` : "Registrando…"}
                </>
              ) : (
                `Registrar despacho${filas.length > 1 ? ` (${filas.length} líneas)` : ""}`
              )}
            </Btn>
          </ModalFooter>
          )
        }
      >
        <div className="space-y-3 px-5 py-4 sm:px-6">
          {/* La franja del formato: con qué título sale la madera y cuánto se
              mueve. El volumen es el de la lista, en vivo. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border-2 border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] px-4 py-3 lg:grid-cols-5 dark:bg-[var(--data-warning-500)]/10">
            <DatoFranja label="Titular de TH" valor={ficha?.razonSocial || ficha?.nombreCtp || "—"} />
            <DatoFranja label="Documento" valor={ficha?.ruc || "—"} mono />
            <DatoFranja label="Número de recurso" valor={datos.titulos[0] || "—"} mono />
            <DatoFranja label="Número de resolución" valor={titulo?.resolucion || "—"} />
            {/* La unidad sale de la lista: casi siempre m³, pero una guía de
                producto medido en pies tablares no dice «m³». */}
            <DatoFranja label="Volumen a movilizar" valor={`${total.toFixed(4)} ${unidadLista}`} mono />
          </div>

          {/* Registrada: lo único que queda por hacer es el papel. Las pestañas
              se van —lo cargado ya está en el libro y editarlo acá sería
              editar algo que ya no vive en este formulario. */}
          {registrado ? (
            <CtpGuiaRegistrada
              lineas={registrado.lineas}
              filas={registrado.filas}
              cabecera={registrado.cabecera}
              gtfNumber={gtfNumber}
              emision={emision}
              datos={datos}
              ficha={ficha}
            />
          ) : (
          <>
          <div className="flex gap-1.5">
            <Pestana activa={tab === "guia"} onClick={() => setTab("guia")} label="Datos de la guía de transporte forestal" pendiente={faltanGuia.length} />
            <Pestana activa={tab === "productos"} onClick={() => setTab("productos")} label="Creación de lista de productos" contador={filas.length} />
          </div>

          {tab === "guia" ? (
            <CtpGuiaDatosTab
              datos={datos}
              setDatos={setDatos}
              ficha={ficha}
              directorio={directorio}
              emision={emision}
              onEmision={cambiarEmision}
              gtfNumber={gtfNumber}
              onGtfNumber={setGtfNumber}
              docType={docType}
              onDocType={setDocType}
              onAnotarParte={anotarParte}
              onAnotarVehiculo={anotarVehiculo}
              onGuardarEnLibreta={guardarEnLibreta}
              llevaCites={especiesCites.length > 0}
              slotVerificacion={
                <CtpVerificarGtfSerfor
                  gtfNumber={gtfNumber}
                  onSello={setSello}
                  onGuiaVerificada={(g) => {
                    /* Lo que la guía trae y el formulario todavía no tiene se
                       copia; lo tipeado no se pisa. */
                    if (g.gtfNumber && !gtfNumber.trim()) setGtfNumber(g.gtfNumber);
                    setDatos((p) => ({
                      ...p,
                      destinatario: {
                        ...p.destinatario,
                        nombre: p.destinatario.nombre || g.destinatario || "",
                        direccion: p.destinatario.direccion || g.destinatarioDireccion || "",
                      },
                      vehiculo: {
                        ...p.vehiculo,
                        placa: p.vehiculo.placa || g.placa || "",
                        tipo: p.vehiculo.tipo || g.tipoVehiculo || "",
                      },
                      traslado: { ...p.traslado, fechaFin: p.traslado.fechaFin || g.fechaVencimiento || "" },
                    }));
                    setAviso("Datos traídos de la guía verificada en SERFOR.");
                  }}
                />
              }
            />
          ) : (
            <CtpListaProductosTab
              filas={filas}
              onCambiarFila={cambiarFila}
              onQuitar={(uid) => setFilas((prev) => prev.filter((f) => f.uid !== uid))}
              listaNro={datos.guia.listaTrozasNro}
              onListaNro={(v) => setDatos((p) => ({ ...p, guia: { ...p.guia, listaTrozasNro: v } }))}
              observaciones={datos.observaciones}
              onObservaciones={(v) => setDatos((p) => ({ ...p, observaciones: v }))}
              onAbrirStock={() => setStockAbierto(true)}
              onAbrirTrozas={() => setTrozasAbierto(true)}
              onCubicar={() => setCubicarAbierto(true)}
              problemas={problemas}
            />
          )}
          </>
          )}
        </div>
      </AdminModal>

      {cubicarAbierto && !registrado && (
        <CtpCubicarProductoModal
          filas={filas.map((f) => ({
            id: f.uid,
            etiqueta: f.codigo ?? (f.lineNo != null ? `Corrida N° ${f.lineNo}` : "Renglón"),
            especie: f.especie,
            producto: f.producto,
            piezas: f.cantidad,
            volumenM3: f.volumen,
          }))}
          /* El hilo al libro: la cubicación queda ligada a las CORRIDAS que
             ampara esta guía — la guía todavía no existe cuando se mide. */
          ctpEntryIds={[...new Set(filas.map((f) => f.corridaId).filter(Boolean))]}
          titulo={`Guía ${gtfNumber || "sin número"} · ${filas.length} producto${filas.length === 1 ? "" : "s"}`}
          onClose={() => setCubicarAbierto(false)}
          onGuardada={(msg) => {
            setCubicarAbierto(false);
            setAviso(msg);
          }}
        />
      )}

      {stockAbierto && !registrado && (
        <CtpProductosStockModal
          yaElegidos={yaElegidos}
          presetProducto={presetProducto}
          presetEspecie={presetEspecie}
          onAgregar={agregarFilas}
          onCerrar={() => setStockAbierto(false)}
        />
      )}

      {trozasAbierto && !registrado && (
        <CtpTrozasDespachoModal
          yaElegidas={trozasElegidas}
          onAgregar={agregarFilas}
          onCerrar={() => setTrozasAbierto(false)}
        />
      )}
    </>
  );
}

/** Un dato de la franja de arriba (título habilitante y volumen). */
function DatoFranja({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{label}</div>
      <div className={`truncate text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`} title={valor}>{valor}</div>
    </div>
  );
}

/** Las dos pestañas del formato. */
function Pestana({
  activa,
  onClick,
  label,
  contador,
  pendiente,
}: {
  activa: boolean;
  onClick: () => void;
  label: string;
  contador?: number;
  /** Datos que le faltan a la guía: un punto, no un número rojo. */
  pendiente?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`inline-flex h-11 items-center gap-2 rounded-t-xl border-2 border-b-0 px-4 text-sm font-bold transition-colors ${
        activa
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
      }`}
    >
      {label}
      {contador != null && contador > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] tabular-nums ${activa ? "bg-white/25" : "bg-[var(--surface-raised)]"}`}>{contador}</span>
      )}
      {!activa && pendiente != null && pendiente > 0 && (
        <span className="h-2 w-2 rounded-full bg-[var(--data-warning-500)]" aria-label="tiene datos pendientes" />
      )}
    </button>
  );
}
