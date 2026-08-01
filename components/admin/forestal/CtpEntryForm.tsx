"use client";

/**
 * CtpEntryForm — alta de Producción / Despacho del Libro CTP (ADR-127).
 * Data-driven: Producción jala de los ingresos; Despacho de los productos en stock.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Truck, Loader2, X, Search, Check, AlertCircle, ShieldCheck, AlertTriangle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import CtpConsumosPicker, { sumConsumos, type ConsumoRow } from "./CtpConsumosPicker";
import CtpTrozasPicker from "./CtpTrozasPicker";
import { agruparPorGuia, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpReprocesoPicker, { type ReprocesoRow } from "./CtpReprocesoPicker";
import CtpOrigenesPicker, { sumOrigenes, type OrigenRow } from "./CtpOrigenesPicker";
import { Btn, Field, I, Seccion } from "./ctp-shared";
import { TIPOS_DOCUMENTO_LOCTP } from "@/lib/forestal/loctp-campos";
import {
  LINEAS_PRODUCCION, sugerirCodigoPaquete,
  PRESENTACIONES_LOCTP,
  TIPOS_PRODUCTO_SALIDA,
  juzgarRendimiento,
  presentacionSugerida,
  RENDIMIENTO_META,
} from "@/lib/forestal/loctp-catalogos";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";

type CtpSection = "produccion" | "despacho";

interface Props {
  section: CtpSection;
  /** Producto ya elegido — llega desde el stock de Saldos ("del patio a la guía"). */
  presetProducto?: string | null;
  /** Especie de ese stock: sin ella el despacho abriría a medias. */
  presetEspecie?: string | null;
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean; /** Quedó anotado en el patio, no en el libro. */ offline?: boolean }) => void;
}

interface SourceItem {
  kind: string; id?: string; code: string | null; species: string | null; scientific: string | null;
  cites?: boolean; vol?: number | null; disponible?: number | null; costoUnitario?: number | null; moneda?: string | null;
  quantity?: number | null; unit?: string | null; productType?: string | null;
}

const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

/** Sin tildes, sin mayúsculas y sin espacios de más — para cotejar catálogos. */
const clave = (v: string) =>
  v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/**
 * El valor del catálogo que corresponde a lo que llega de afuera, o `null` si no
 * existe. Devuelve SIEMPRE el valor canónico: guardar la variante tipeada haría
 * que el mismo producto se agrupe distinto en los saldos.
 */
function productoDelCatalogo(v: string | null | undefined): string | null {
  if (!v) return null;
  const k = clave(v);
  return TIPOS_PRODUCTO_SALIDA.find((t) => clave(t.valor) === k)?.valor ?? null;
}

const META: Record<CtpSection, { label: string; help: string; icon: typeof Boxes; sourceTitle: string }> = {
  produccion: { label: "Producción", help: "Transformación de materia prima en producto", icon: Boxes, sourceTitle: "Elegí el ingreso (materia prima)" },
  despacho: { label: "Despacho de producto", help: "Salida de producto transformado con GTF", icon: Truck, sourceTitle: "Elegí de qué corridas sale el despacho" },
};

export default function CtpEntryForm({ section, presetProducto, presetEspecie, onClose, onSaved }: Props) {
  const meta = META[section];
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [materiaPrimaRef, setMateriaPrimaRef] = useState("");
  const [speciesCommon, setSpeciesCommon] = useState(presetEspecie ?? "");
  // El preset sólo vale si el producto existe en el catálogo (ADR-314): uno
  // viejo del libro que ya no está en la lista dejaría el select en un valor
  // fantasma. La comparación ignora mayúsculas y acentos porque el stock
  // devuelve el `productType` tal como se tipeó ("Madera aserrada") y el
  // catálogo lo canoniza ("MADERA ASERRADA") — comparando literal, el atajo
  // caía siempre en la primera opción de la lista.
  const [productType, setProductType] = useState<string>(
    () => productoDelCatalogo(presetProducto) ?? TIPOS_PRODUCTO_SALIDA[0]!.valor,
  );
  /** "Forma de presentación" del formato (ADR-314). */
  const [presentacion, setPresentacion] = useState("");
  /** Si el operador la eligió a mano, el producto ya no la pisa. */
  const [presentacionTocada, setPresentacionTocada] = useState(false);
  const [volumeInputM3, setVolumeInputM3] = useState("");
  const [volumeTouched, setVolumeTouched] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"m3" | "kg" | "unidad" | "pt">("m3");
  const [pieces, setPieces] = useState("");
  const [gtfNumber, setGtfNumber] = useState("");
  /**
   * El despacho también tiene dos modos (ADR-312), pero al revés que el ingreso:
   * acá la GTF **la emite este CTP**, así que SERFOR no reemplaza la carga —la
   * verifica. Se consulta el N° de registro de la guía emitida y se comprueba
   * que exista, esté vigente y diga lo que el despacho declara. Los orígenes
   * (de qué corridas sale) los sigue poniendo el operador: eso es del libro, no
   * del documento.
   */
  const [modoSalida, setModoSalida] = useState<"manual" | "serfor">("manual");
  const [nroRegistroSerfor, setNroRegistroSerfor] = useState("");
  const [gtfSerfor, setGtfSerfor] = useState<GtfSerfor | null>(null);
  const [serforCargando, setSerforCargando] = useState(false);
  const [serforMsg, setSerforMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** (3) del formato LO-CTP: con qué documento sale el producto. */
  const [docType, setDocType] = useState("GTF");
  /** Línea de producción de la corrida (Cuadro Resumen 3): LP | LRE. */
  const [lineaProduccion, setLineaProduccion] = useState("LP");
  /** (9) del formato: código del producto que sale. */
  const [codigoProducto, setCodigoProducto] = useState("");
  const [destino, setDestino] = useState("");
  const [observations, setObservations] = useState("");

  // Producción: una corrida real mezcla varias guías (ADR-134). Cada fila es
  // un consumo (ingreso + m³ atribuidos); ver CtpConsumosPicker.
  const [consumos, setConsumos] = useState<ConsumoRow[]>([]);
  // Qué PIEZAS entran a la sierra (ADR-326). Elegir trozas DERIVA los consumos
  // por guía: el operador no tipea un volumen que después no cuadra con la pila.
  const [trozasPatio, setTrozasPatio] = useState<TrozaConsumible[]>([]);
  const [trozasCargando, setTrozasCargando] = useState(false);
  const [seleccionTrozas, setSeleccionTrozas] = useState<Set<string>>(new Set());
  /** De qué producto YA terminado sale esta corrida, si es un reproceso (ADR-316). */
  const [reprocesos, setReprocesos] = useState<ReprocesoRow[]>([]);
  const [costoProceso, setCostoProceso] = useState("");

  // Despacho: de qué corridas de producción salió el producto (ADR-135).
  // Espejo de consumos, del otro lado de la cadena; ver CtpOrigenesPicker.
  const [origenes, setOrigenes] = useState<OrigenRow[]>([]);
  const [quantityTouched, setQuantityTouched] = useState(false);
  // 1ª corrida elegida fija producto/especie/unidad: el backend rechaza mezclar (TENANT_MISMATCH).
  const despachoLocked = section === "despacho" && origenes.length > 0;

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loadingSrc, setLoadingSrc] = useState(false);
  const [srcQuery, setSrcQuery] = useState("");

  const loadSources = useCallback(async () => {
    setLoadingSrc(true);
    try {
      const r = await fetch(`/api/admin/forestal/ctp?available=${section}`, { credentials: "include" });
      setSources(r.ok ? (await r.json()).items ?? [] : []);
    } catch { setSources([]); }
    finally { setLoadingSrc(false); }
  }, [section]);
  useEffect(() => { loadSources(); }, [loadSources]);

  /** Las piezas del patio. Sólo para producción: un despacho no consume trozas. */
  const loadTrozas = useCallback(async () => {
    if (section !== "produccion") return;
    setTrozasCargando(true);
    try {
      const r = await fetch("/api/admin/forestal/trozas/patio", { credentials: "include" });
      setTrozasPatio(r.ok ? ((await r.json()).trozas ?? []) : []);
    } catch {
      // Sin la lista se sigue pudiendo cargar la corrida a mano: el picker de
      // guías de siempre no depende de esto.
      setTrozasPatio([]);
    } finally {
      setTrozasCargando(false);
    }
  }, [section]);
  useEffect(() => { void loadTrozas(); }, [loadTrozas]);

  /**
   * Elegir trozas DERIVA los consumos por guía.
   *
   * Es el puente entre las dos formas de mirar el consumo: el operador tilda
   * piezas, el libro guarda m³ por guía (donde viven I1-I6). Si no hay trozas
   * elegidas no toca nada — el alta manual de siempre sigue funcionando igual.
   */
  useEffect(() => {
    if (section !== "produccion" || seleccionTrozas.size === 0) return;
    const elegidas = trozasPatio.filter((t) => seleccionTrozas.has(t.id));
    const porGuia = agruparPorGuia(elegidas);
    setConsumos((prev) =>
      porGuia.map((g) => {
        const previa = prev.find((c) => c.woodEntryId === g.woodEntryId);
        const fuente = sources.find((x) => x.id === g.woodEntryId);
        return {
          woodEntryId: g.woodEntryId,
          code: g.gtfNumber ?? previa?.code ?? fuente?.code ?? null,
          species: g.especie ?? previa?.species ?? null,
          // Lo que la guía tiene sin consumir. Si el listado de fuentes no la
          // trae (ya sin saldo por otras líneas), el backend lo rechaza igual.
          disponible: fuente?.disponible ?? previa?.disponible ?? g.volumenM3,
          costoUnitario: fuente?.costoUnitario ?? previa?.costoUnitario ?? null,
          moneda: fuente?.moneda ?? previa?.moneda ?? "PEN",
          volumeM3: String(g.volumenM3),
        };
      }),
    );
  }, [section, seleccionTrozas, trozasPatio, sources]);

  function pick(it: SourceItem) {
    if (it.species) setSpeciesCommon(it.species);
    if (section === "produccion") {
      const id = it.id;
      if (!id) return;
      setConsumos((prev) => {
        if (prev.some((c) => c.woodEntryId === id)) return prev; // ya agregado: el backend lo rechaza igual (I1)
        const disponible = it.disponible ?? it.vol ?? 0;
        return [...prev, {
          woodEntryId: id, code: it.code, species: it.species,
          disponible, costoUnitario: it.costoUnitario ?? null, moneda: it.moneda ?? "PEN",
          volumeM3: disponible > 0 ? String(disponible) : "",
        }];
      });
    } else {
      const id = it.id;
      if (!id || origenes.some((o) => o.produccionEntryId === id)) return; // ya agregada: el backend la rechaza igual (I4)
      if (origenes.length === 0) {
        // 1ª corrida fija producto/unidad — a partir de acá el picker filtra el resto.
        if (it.productType) setProductType(it.productType);
        if (it.unit === "m3" || it.unit === "kg" || it.unit === "unidad" || it.unit === "pt") setUnit(it.unit);
      }
      const disponible = it.disponible ?? 0;
      setOrigenes((prev) => [...prev, {
        produccionEntryId: id, code: it.code, species: it.species,
        disponible, quantity: disponible > 0 ? String(disponible) : "",
      }]);
    }
  }

  const filtered = useMemo(() => {
    const q = srcQuery.trim().toLowerCase();
    let list = q ? sources.filter((s) => (s.code ?? "").toLowerCase().includes(q) || (s.species ?? "").toLowerCase().includes(q) || (s.productType ?? "").toLowerCase().includes(q)) : sources;
    if (section === "produccion") {
      // Un ingreso ya elegido desaparece del buscador: no se puede agregar dos veces.
      const picked = new Set(consumos.map((c) => c.woodEntryId));
      list = list.filter((s) => !s.id || !picked.has(s.id));
    }
    if (section === "despacho") {
      // Una corrida ya elegida desaparece del buscador: no se puede agregar dos veces.
      const picked = new Set(origenes.map((o) => o.produccionEntryId));
      list = list.filter((s) => !s.id || !picked.has(s.id));
      // El backend rechaza mezclar producto/especie/unidad distintos en un mismo
      // despacho: mejor filtrar acá que dejar elegir y fallar al guardar (TENANT_MISMATCH).
      if (origenes.length > 0) {
        const pt = productType.trim().toLowerCase();
        const sp = speciesCommon.trim().toLowerCase();
        list = list.filter((s) => (s.productType ?? "").trim().toLowerCase() === pt && (s.species ?? "").trim().toLowerCase() === sp && (s.unit ?? "") === unit);
      }
    }
    return list.slice(0, 60);
  }, [sources, srcQuery, section, consumos, origenes, productType, speciesCommon, unit]);

  /**
   * El vacío del picker tiene varias causas distintas y decirle "no hay nada" a
   * todas es mentira: el operador que ya eligió todas sus guías/corridas
   * creería que el módulo perdió sus datos.
   */
  const emptyPickerMsg = useMemo(() => {
    if (srcQuery.trim()) return "Ninguna coincide con la búsqueda.";
    if (section === "despacho") {
      if (sources.length > 0 && origenes.length > 0) return "Ya agregaste todas las corridas de este producto.";
      return "Sin corridas de producción con saldo para despachar.";
    }
    if (sources.length > 0) return "Ya agregaste todas las guías disponibles.";
    return "Sin ingresos de materia prima validados y con saldo.";
  }, [sources, srcQuery, section, origenes]);

  const rendimiento = useMemo(() => {
    const i = Number(volumeInputM3), o = Number(quantity);
    return section === "produccion" && i > 0 && o > 0 && unit === "m3" ? Math.round((o / i) * 10000) / 100 : null;
  }, [volumeInputM3, quantity, unit, section]);

  // Volumen/cantidad declarada: se autocompleta con el total atribuido (caso normal),
  // pero deja de seguirlo apenas el usuario lo edita a mano (atribución parcial legítima).
  const totalAtribuido = useMemo(
    () => (section === "produccion" ? sumConsumos(consumos) : sumOrigenes(origenes)),
    [consumos, origenes, section],
  );
  useEffect(() => {
    if (section === "produccion" && !volumeTouched) setVolumeInputM3(totalAtribuido > 0 ? String(totalAtribuido) : "");
    if (section === "despacho" && !quantityTouched) setQuantity(totalAtribuido > 0 ? String(totalAtribuido) : "");
  }, [totalAtribuido, volumeTouched, quantityTouched, section]);

  const consumosOk = section !== "produccion" || consumos.every((c) => {
    const v = Number(c.volumeM3);
    return v > 0 && v <= c.disponible + 1e-9;
  });
  const sobreAtribuido = section === "produccion" && consumos.length > 0
    && Math.round((totalAtribuido - (Number(volumeInputM3) || 0)) * 10000) / 10000 > 0;

  const origenesOk = section !== "despacho" || origenes.every((o) => {
    const v = Number(o.quantity);
    return v > 0 && v <= o.disponible + 1e-9;
  });
  const sobreAtribuidoDespacho = section === "despacho" && origenes.length > 0
    && Math.round((totalAtribuido - (Number(quantity) || 0)) * 10000) / 10000 > 0;

  const isValid = section === "produccion"
    ? productType.trim().length > 0 && Number(quantity) > 0 && consumosOk && !sobreAtribuido
    : productType.trim().length > 0 && Number(quantity) > 0 && gtfNumber.trim().length > 0 && origenesOk && !sobreAtribuidoDespacho;

  /**
   * Qué falta, con nombre y apellido. "Completá los obligatorios" obliga a
   * buscar a ojo entre ocho campos y un picker; decir "N° de GTF" ahorra eso.
   */
  const faltantes = useMemo(() => {
    const f: string[] = [];
    if (!entryDate) f.push("Fecha");
    if (!productType.trim()) f.push("Tipo de producto");
    if (!(Number(quantity) > 0)) f.push(section === "produccion" ? "Cantidad producida" : "Cantidad a despachar");
    if (section === "despacho") {
      if (!gtfNumber.trim()) f.push("N° de GTF");
      if (!origenesOk) f.push("Corridas de origen");
      if (sobreAtribuidoDespacho) f.push("Lo atribuido supera lo declarado");
    } else {
      if (!consumosOk) f.push("Guías de materia prima");
      if (sobreAtribuido) f.push("Lo consumido supera lo disponible");
    }
    return f;
  }, [entryDate, productType, quantity, section, gtfNumber, origenesOk, consumosOk, sobreAtribuido, sobreAtribuidoDespacho]);

  /** Lo declarado menos lo atribuido: el hueco de la cadena de custodia. */
  const sinAtribuir = useMemo(() => {
    const declarado = section === "produccion" ? Number(volumeInputM3) || 0 : Number(quantity) || 0;
    return Math.max(0, Math.round((declarado - totalAtribuido) * 10000) / 10000);
  }, [section, volumeInputM3, quantity, totalAtribuido]);

  /**
   * Verifica en SERFOR la GTF que ESTE centro emitió para la salida.
   *
   * Lo que importa acá no es llenar campos sino que el documento exista y esté
   * vigente: un despacho amparado por una guía anulada es exactamente lo que
   * una fiscalización busca. Lo que la guía trae y el formulario no tiene
   * todavía (N° de GTF, destinatario) se copia; lo que el operador ya escribió
   * se respeta y, si difiere, se avisa en vez de pisarlo.
   */
  async function verificarGuiaSalida() {
    const n = nroRegistroSerfor.trim();
    if (!n) { setSerforMsg({ ok: false, text: "Escribí el N° de registro de la guía que emitiste." }); return; }
    setSerforCargando(true); setSerforMsg(null);
    try {
      const r = await fetch(`/api/admin/forestal/gtf/serfor?numeroRegistro=${encodeURIComponent(n)}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) { setSerforMsg({ ok: false, text: j?.message ?? `El servidor respondió ${r.status}` }); return; }
      if (j.estado !== "encontrada" || !j.gtf) {
        setSerforMsg({ ok: false, text: j.mensaje ?? "SERFOR no encontró esa guía." });
        setGtfSerfor(null);
        return;
      }
      const g = j.gtf as GtfSerfor;
      setGtfSerfor(g);
      if (g.gtfNumber && !gtfNumber.trim()) setGtfNumber(g.gtfNumber);
      if (g.destinatario && !destino.trim()) setDestino(g.destinatario);
      setSerforMsg({
        ok: (g.estado ?? "").toUpperCase().startsWith("ACTIVA"),
        text: `Guía ${g.gtfNumber ?? n} · ${g.destinatario ?? "sin destinatario"} · ${g.estado ?? "sin estado"}`,
      });
    } catch (e) {
      setSerforMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSerforCargando(false);
    }
  }

  /**
   * En qué NO coincide el despacho con la guía que lo ampara. No bloquea: el
   * libro admite que el operador sepa algo que el documento no dice. Pero la
   * diferencia se muestra antes de guardar, no después en una fiscalización.
   */
  const discrepancias = useMemo(() => {
    if (!gtfSerfor) return [];
    const d: string[] = [];
    const estado = (gtfSerfor.estado ?? "").toUpperCase();
    if (estado && !estado.startsWith("ACTIVA")) {
      d.push(`La guía figura como «${gtfSerfor.estado}» en SERFOR: un despacho amparado por una guía que no está activa es observable.`);
    }
    if (gtfSerfor.gtfNumber && gtfNumber.trim() && gtfSerfor.gtfNumber !== gtfNumber.trim()) {
      d.push(`El N° de GTF del despacho (${gtfNumber.trim()}) no es el de la guía consultada (${gtfSerfor.gtfNumber}).`);
    }
    const cant = Number(quantity);
    if (gtfSerfor.volumenTotal != null && unit === "m3" && cant > 0 && Math.abs(cant - gtfSerfor.volumenTotal) > 0.001) {
      d.push(`La cantidad a despachar (${cant.toFixed(4)} m³) no coincide con el volumen que declara la guía (${gtfSerfor.volumenTotal.toFixed(3)} m³).`);
    }
    if (gtfSerfor.destinatario && destino.trim() && gtfSerfor.destinatario.toUpperCase() !== destino.trim().toUpperCase()) {
      d.push(`El destino escrito no es el destinatario de la guía (${gtfSerfor.destinatario}).`);
    }
    return d;
  }, [gtfSerfor, gtfNumber, quantity, unit, destino]);

  async function submit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (submitting || !isValid) { if (!isValid) setError("Completá los campos obligatorios."); return; }
    setSubmitting(true); setError(null);
    const matched = findSpeciesByCommonName(speciesCommon);
    try {
      const payload: Record<string, unknown> = {
        section, entryDate: new Date(entryDate).toISOString(),
        speciesCommon: speciesCommon.trim() || null, speciesScientific: matched?.scientificName ?? null, cites: matched?.cites ?? false,
        productType, quantity: Number(quantity), unit, observations: observations.trim() || null,
      };
      if (section === "produccion") {
        // GTF de ingreso ya no se tipea a mano: se resume de las guías elegidas.
        payload.gtfIngreso = consumos.length ? consumos.map((c) => c.code).filter(Boolean).join(", ") : null;
        payload.materiaPrimaRef = materiaPrimaRef.trim() || null;
        payload.volumeInputM3 = volumeInputM3 ? Number(volumeInputM3) : null;
        payload.costoProceso = costoProceso ? Number(costoProceso) : null;
        payload.lineaProduccion = lineaProduccion || "LP";
        payload.presentacion = presentacion || null;
        payload.codigoProducto = codigoProducto.trim() || null;
        if (consumos.length) payload.consumos = consumos.map((c) => ({ woodEntryId: c.woodEntryId, volumeM3: Number(c.volumeM3) }));
      } else {
        payload.pieces = pieces ? Number(pieces) : null;
        payload.gtfNumber = gtfNumber.trim() || null;
        payload.docType = docType || null;
        payload.codigoProducto = codigoProducto.trim() || null;
        payload.presentacion = presentacion || null;
        payload.destino = destino.trim() || null;
        // El sello de la verificación viaja con la salida: una guía activa hoy
        // puede estar anulada mañana, así que sin la fecha no dice nada.
        if (modoSalida === "serfor" && gtfSerfor) {
          payload.serforNumeroRegistro = gtfSerfor.numeroRegistro || nroRegistroSerfor.trim() || null;
          payload.serforVerificadoEn = new Date().toISOString();
        }
        if (origenes.length) payload.origenes = origenes.map((o) => ({ produccionEntryId: o.produccionEntryId, quantity: Number(o.quantity) }));
      }
      let r: Response;
      try {
        r = await fetch("/api/admin/forestal/ctp", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      } catch (netErr) {
        // Sin señal en el patio: se anota en el equipo y sube sola después. El
        // dato NO se pierde y NO se dice que quedó en el libro (no quedó).
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const { anotar, URL_CTP } = await import("@/lib/forestal/patio-cola");
          await anotar(section, payload, URL_CTP);
          onSaved({ offline: true });
          return;
        }
        throw netErr;
      }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);

      // El reproceso se atribuye DESPUÉS: necesita el id de la corrida recién
      // creada. Si falla, la corrida queda igual y el operador puede reintentar
      // desde el detalle — perder la producción por un origen mal puesto sería peor.
      // Las trozas se marcan DESPUÉS por lo mismo que el reproceso: hace falta el
      // id de la corrida. Si falla, la corrida queda igual y se corrige desde el
      // detalle — perder la producción por esto sería peor.
      if (section === "produccion" && seleccionTrozas.size > 0) {
        const creada = await r.clone().json().catch(() => ({}));
        const nuevaId = creada?.entry?.id ?? creada?.id;
        if (nuevaId) {
          const rt = await fetch("/api/admin/forestal/trozas/patio", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ ctpEntryId: nuevaId, trozaIds: [...seleccionTrozas], fecha: new Date(entryDate).toISOString() }),
          });
          if (!rt.ok) {
            const j = await rt.json().catch(() => ({}));
            throw new Error(`La corrida se guardó, pero las trozas no quedaron marcadas: ${j?.message ?? `HTTP ${rt.status}`}`);
          }
        }
      }

      const lineasRepro = reprocesos
        .map((x) => ({ origenEntryId: x.origenEntryId, quantity: Number(x.quantity) }))
        .filter((x) => x.origenEntryId && x.quantity > 0);
      if (section === "produccion" && lineasRepro.length > 0) {
        const creada = await r.clone().json().catch(() => ({}));
        const destinoEntryId = creada?.entry?.id ?? creada?.id;
        if (destinoEntryId) {
          const rr = await fetch("/api/admin/forestal/ctp/reproceso", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ destinoEntryId, lineas: lineasRepro }),
          });
          if (!rr.ok) {
            const j = await rr.json().catch(() => ({}));
            throw new Error(`La corrida se guardó, pero el reproceso no: ${j?.message ?? `HTTP ${rr.status}`}`);
          }
        }
      }
      if (keepOpen) {
        setMateriaPrimaRef(""); setVolumeInputM3(""); setVolumeTouched(false); setQuantity(""); setPieces(""); setGtfNumber(""); setDestino(""); setObservations("");
        setConsumos([]); setCostoProceso(""); setReprocesos([]); setSeleccionTrozas(new Set()); void loadTrozas(); setCodigoProducto("");
        setGtfSerfor(null); setNroRegistroSerfor(""); setSerforMsg(null);
        setOrigenes([]); setQuantityTouched(false);
        setSubmitting(false); onSaved({ keepOpen: true }); loadSources();
      } else onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const Icon = meta.icon;
  return (
    /* Mismo ancho que el alta de ingreso: con el picker de origen a un lado y el
       producto al otro, 1200px dejaban las dos columnas apretadas. */
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:w-[min(94vw,96rem)] sm:max-w-none sm:max-h-[95vh]">
      <div className="flex h-full max-h-[95vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">{meta.label}</CardTitle>
              <p className="truncate text-xs text-[var(--text-tertiary)]">CTP · {meta.help}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
        <form
          id="ctp-entry-form"
          onSubmit={submit}
          className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
        >
          {error && (
            <div className="mb-4 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]">
              {error}
            </div>
          )}

          {/* Dos columnas: a la izquierda DE DÓNDE SALE (el origen que hay que
              elegir), a la derecha QUÉ SALE (el producto y su documento). El
              picker es lo primero porque sin él no hay nada que atribuir. */}
          <div className="xl:grid xl:grid-cols-2 xl:gap-x-6 xl:items-start">
            <div>
              <Seccion numero={1} title={section === "produccion" ? "Materia prima consumida" : "De qué corridas sale"}>
                <Field span={12} label="Fecha" required casillero={2}>
                  <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className={I} />
                </Field>

                <div className="sm:col-span-12 space-y-2 rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-3 dark:bg-[var(--data-success-500)]/10">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{meta.sourceTitle}</span>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input value={srcQuery} onChange={(e) => setSrcQuery(e.target.value)} placeholder="Buscar..." className={`${I} h-10 pl-8`} />
                  </div>
                  <div className="max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {loadingSrc ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
                      : filtered.length === 0 ? <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">{emptyPickerMsg}</div>
                      : filtered.map((it, i) => (
                        <button key={i} type="button" onClick={() => pick(it)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--data-success-50)] dark:hover:bg-[var(--data-success-500)]/10">
                          <span className="flex min-w-0 items-center gap-2 truncate">
                            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{it.code ?? it.productType ?? "—"}</span>
                            {it.kind === "corrida" && it.productType && <span className="truncate text-xs text-[var(--text-secondary)]">{it.productType}</span>}
                            {it.species && <span className="truncate text-sm text-[var(--text-secondary)]">{it.species}</span>}
                            {it.cites && <span className="rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{it.disponible != null ? `${Number(it.disponible).toFixed(4)} ${it.unit ? (UNIT_LABELS[it.unit] ?? it.unit) : "m³"} disp.` : it.vol != null ? `${Number(it.vol).toFixed(4)} m³` : it.quantity != null ? `stock ${Number(it.quantity).toFixed(2)} ${it.unit ?? ""}` : ""}</span>
                        </button>
                      ))}
                  </div>
                </div>

                {section === "despacho" && (
                  <div className="sm:col-span-12">
                    <CtpOrigenesPicker
                      origenes={origenes}
                      onChangeQuantity={(id, value) => setOrigenes((prev) => prev.map((o) => (o.produccionEntryId === id ? { ...o, quantity: value } : o)))}
                      onRemove={(id) => setOrigenes((prev) => prev.filter((o) => o.produccionEntryId !== id))}
                      totalAtribuido={totalAtribuido}
                      quantityDeclared={Number(quantity) || 0}
                      unitLabel={UNIT_LABELS[unit] ?? unit}
                    />
                  </div>
                )}

                {section === "produccion" && (
                  <>
                    <div className="sm:col-span-12">
                      {/* Elegir PIEZAS (ADR-326). Si el patio no tiene trozas
                          cargadas no estorba: el picker de guías sigue solo. */}
                      {trozasPatio.length > 0 && (
                        <CtpTrozasPicker
                          trozas={trozasPatio}
                          cargando={trozasCargando}
                          seleccion={seleccionTrozas}
                          onSeleccion={setSeleccionTrozas}
                        />
                      )}
                      <CtpConsumosPicker
                        consumos={consumos}
                        onChangeVolume={(id, value) => setConsumos((prev) => prev.map((c) => (c.woodEntryId === id ? { ...c, volumeM3: value } : c)))}
                        onRemove={(id) => setConsumos((prev) => prev.filter((c) => c.woodEntryId !== id))}
                        totalAtribuido={totalAtribuido}
                        volumeDeclared={Number(volumeInputM3) || 0}
                        costoProceso={costoProceso}
                        onCostoProcesoChange={setCostoProceso}
                        producedQty={Number(quantity) || 0}
                        producedUnitLabel={UNIT_LABELS[unit] ?? unit}
                      />
                    </div>
                    <Field span={6} label="Volumen consumido (m³)" hint="Se autocompleta con lo atribuido; editalo si es parcial">
                      <input type="number" step="0.0001" value={volumeInputM3} onChange={(e) => { setVolumeInputM3(e.target.value); setVolumeTouched(true); }} placeholder="2.13" className={`${I} font-mono tabular-nums`} />
                    </Field>
                    <Field span={6} label="Ref. materia prima" hint="Lote o acopio de origen (libre)">
                      <input value={materiaPrimaRef} onChange={(e) => setMateriaPrimaRef(e.target.value)} placeholder="lote / acopio" className={I} />
                    </Field>
                  </>
                )}
                {/* El reproceso es la otra entrada posible de una corrida: no
                    materia prima del patio sino producto ya terminado que
                    vuelve a la sierra. Va acá y no en una pantalla aparte
                    porque para el libro sigue siendo una corrida. */}
                {section === "produccion" && (
                  <CtpReprocesoPicker unidad={unit} rows={reprocesos} onRowsChange={setReprocesos} />
                )}
              </Seccion>
            </div>

            <div>
              <Seccion numero={2} title={section === "produccion" ? "Producto obtenido" : "Producto que sale"}>
                <Field span={12} label="Tipo de producto" required casillero={section === "produccion" ? 3 : 5} hint={despachoLocked ? "Lo fija la corrida elegida" : undefined}>
                  <select
                    value={productType}
                    onChange={(e) => {
                      setProductType(e.target.value);
                      // La presentación se sugiere sola cuando es inequívoca
                      // (paquetería → PAQUETES), pero se puede cambiar: un
                      // producto que suele ir en paquetes puede salir suelto.
                      if (!presentacionTocada) setPresentacion(presentacionSugerida(e.target.value) ?? "");
                    }}
                    disabled={despachoLocked}
                    className={`${I} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {TIPOS_PRODUCTO_SALIDA.map((t) => (
                      <option key={t.valor} value={t.valor}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field span={12} label="Forma de presentación" hint="Cómo sale físicamente: es lo que declara la guía">
                  <select
                    value={presentacion}
                    onChange={(e) => { setPresentacion(e.target.value); setPresentacionTocada(true); }}
                    className={I}
                  >
                    <option value="">Sin declarar</option>
                    {PRESENTACIONES_LOCTP.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field span={12} label="Especie" casillero={section === "produccion" ? 4 : 6} hint={despachoLocked ? "Lo fija la corrida elegida" : undefined}>
                  <input value={speciesCommon} onChange={(e) => setSpeciesCommon(e.target.value)} disabled={despachoLocked} placeholder="Tornillo" className={`${I} disabled:cursor-not-allowed disabled:opacity-60`} />
                </Field>
                <Field span={section === "despacho" ? 4 : 6} label={section === "produccion" ? "Producido" : "Cantidad"} required casillero={section === "produccion" ? 7 : 11} hint={section === "despacho" ? "Se autocompleta con lo atribuido" : undefined}>
                  <input type="number" step="0.0001" value={quantity} onChange={(e) => { setQuantity(e.target.value); if (section === "despacho") setQuantityTouched(true); }} placeholder="1.90" className={`${I} font-mono tabular-nums`} />
                </Field>
                <Field span={section === "despacho" ? 4 : 6} label="Unidad" required casillero={section === "produccion" ? 6 : 10} hint={despachoLocked ? "Lo fija la corrida" : undefined}>
                  <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} disabled={despachoLocked} className={`${I} disabled:cursor-not-allowed disabled:opacity-60`}><option value="m3">m³</option><option value="kg">Kg</option><option value="pt">pt</option><option value="unidad">Unidad</option></select>
                </Field>
                {section === "despacho" && (
                  <Field span={4} label="N° piezas">
                    <input type="number" min="0" value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="25" className={`${I} tabular-nums`} />
                  </Field>
                )}
                {section === "produccion" && (
                  <Field
                    span={12}
                    label="Código del paquete"
                    hint="El que se pinta en el atado. Es por el que pregunta el comprador y el que viaja en la guía de salida"
                  >
                    <div className="flex gap-2">
                      <input
                        value={codigoProducto}
                        onChange={(e) => setCodigoProducto(e.target.value)}
                        placeholder="PRO-042"
                        className={`${I} font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() => setCodigoProducto(sugerirCodigoPaquete(entryDate, lineaProduccion))}
                        className="h-11 shrink-0 rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)]"
                        title="Proponer un código con la fecha y la línea"
                      >
                        Sugerir
                      </button>
                    </div>
                  </Field>
                )}
                {section === "produccion" && (
                  <Field span={12} label="Línea de producción" hint="Cuadro Resumen 3 del LO-CTP — LRE aprovecha los residuos">
                    <select value={lineaProduccion} onChange={(e) => setLineaProduccion(e.target.value)} className={I}>
                      {LINEAS_PRODUCCION.map((l) => (
                        <option key={l.valor} value={l.valor}>{l.label}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {/* El rendimiento contra la meta operativa. Un número solo no
                    dice nada: 38% parece bien hasta que se sabe que lo normal
                    ronda 56%. No bloquea —depende de la especie y del equipo—
                    pero un valor muy bajo casi siempre es un error de carga. */}
                {rendimiento != null && (() => {
                  const juicio = juzgarRendimiento(rendimiento);
                  const tono =
                    juicio === "bueno"
                      ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]"
                      : juicio === "sospechoso"
                        ? "bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                        : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]";
                  return (
                    <div className={`sm:col-span-12 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-xs ${tono}`}>
                      {juicio === "bueno" ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                      Rendimiento: <b>{rendimiento}%</b> (producido / consumido)
                      <span className="opacity-80">· meta {(RENDIMIENTO_META * 100).toFixed(0)}%</span>
                      {juicio === "sospechoso" && (
                        <span className="font-bold">— de 1 m³ de troza no salen más de 1 m³ de producto: revisá lo cargado.</span>
                      )}
                      {juicio === "bajo" && <span>— por debajo de lo normal, verificá el consumo.</span>}
                    </div>
                  );
                })()}
              </Seccion>

              {section === "despacho" && (
                <Seccion numero={3} title="Documento de salida">
                  {/* La GTF de salida la emite ESTE centro, así que SERFOR no la
                      carga: la verifica. Por eso el selector no oculta los
                      campos manuales como en el ingreso — acá los acompaña. */}
                  <div className="sm:col-span-12 flex flex-wrap items-center gap-3">
                    <SegmentedControl
                      value={modoSalida}
                      onChange={(v) => {
                        setModoSalida(v);
                        setSerforMsg(null);
                        if (v === "manual") { setGtfSerfor(null); setNroRegistroSerfor(""); }
                      }}
                      label="Cómo se declara la guía de salida"
                      options={[
                        { value: "manual", label: "Cargar a mano" },
                        { value: "serfor", label: "Verificar en SERFOR" },
                      ]}
                    />
                    <p className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
                      {modoSalida === "manual"
                        ? "Escribís el N° de la guía que emitiste."
                        : "Se consulta la guía emitida en la base de SERFOR y se avisa si el despacho no coincide con ella."}
                    </p>
                  </div>

                  {modoSalida === "serfor" && (
                    <Field
                      span={12}
                      label="N° de registro SERFOR de la guía emitida"
                      hint="El que asigna el SNIFFS a la guía, con guiones (ej. 2-25-0002326). NO es el N° de GTF del talonario."
                    >
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={nroRegistroSerfor}
                          onChange={(e) => { setNroRegistroSerfor(e.target.value); setSerforMsg(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void verificarGuiaSalida(); } }}
                          placeholder="2-25-0002326"
                          className={`${I} w-full flex-1 font-mono sm:w-auto`}
                        />
                        <button
                          type="button"
                          onClick={() => void verificarGuiaSalida()}
                          disabled={serforCargando || !nroRegistroSerfor.trim()}
                          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-3.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {serforCargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Verificar
                        </button>
                      </div>
                      {serforMsg && (
                        <p className={`mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium ${
                          serforMsg.ok
                            ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
                            : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
                        }`}>
                          {serforMsg.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                          <span>{serforMsg.text}</span>
                        </p>
                      )}
                    </Field>
                  )}

                  {/* Lo que la guía declara, para comparar de un vistazo. */}
                  {modoSalida === "serfor" && gtfSerfor && (
                    <div className="sm:col-span-12 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-[var(--surface-sunken)] p-3.5">
                      {[
                        ["Destinatario", gtfSerfor.destinatario],
                        ["RUC / DNI", gtfSerfor.destinatarioDoc],
                        ["Dirección", gtfSerfor.destinatarioDireccion],
                        ["Vigencia", [gtfSerfor.fechaExpedicion, gtfSerfor.fechaVencimiento].filter(Boolean).join(" → ")],
                        ["Transporte", [gtfSerfor.tipoVehiculo, gtfSerfor.placa].filter(Boolean).join(" · ")],
                        ["Volumen declarado", gtfSerfor.volumenTotal != null ? `${gtfSerfor.volumenTotal.toFixed(3)} m³` : null],
                      ].map(([label, valor]) => (
                        <div key={String(label)} className="min-w-0">
                          <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</div>
                          <div className="truncate text-sm text-[var(--text-primary)]">{valor || "—"}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No bloquea: el operador puede saber algo que el documento no
                      dice. Pero la diferencia se ve ANTES de guardar, no después
                      en una fiscalización. */}
                  {discrepancias.length > 0 && (
                    <div className="sm:col-span-12 rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/10">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                        <AlertTriangle className="h-3.5 w-3.5" /> El despacho no coincide con la guía
                      </p>
                      <ul className="space-y-1">
                        {discrepancias.map((d, i) => (
                          <li key={i} className="text-xs leading-snug text-[var(--text-secondary)]">{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Field span={6} label="Tipo de documento" casillero={3}>
                    <select value={docType} onChange={(e) => setDocType(e.target.value)} className={I}>
                      {TIPOS_DOCUMENTO_LOCTP.map((t) => (
                        <option key={t.valor} value={t.valor}>{t.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field span={6} label="N° de GTF" required casillero={4}>
                    <input value={gtfNumber} onChange={(e) => setGtfNumber(e.target.value)} placeholder="001-00000025" className={`${I} font-mono`} />
                  </Field>
                  <Field span={6} label="Código del producto" casillero={9} hint="Obligatorio para trozas y para lo que no se produjo acá">
                    <input value={codigoProducto} onChange={(e) => setCodigoProducto(e.target.value)} placeholder="1-13-51-A-1" className={`${I} font-mono`} />
                  </Field>
                  <Field span={6} label="Destino">
                    <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Industria / cliente" className={I} />
                  </Field>
                </Seccion>
              )}

              <Seccion numero={section === "despacho" ? 4 : 3} title="Observaciones">
                <Field span={12} label="Notas" casillero={section === "produccion" ? 9 : 12}>
                  <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} placeholder="Información adicional…" className={`${I} h-auto resize-none py-2.5`} />
                </Field>
              </Seccion>
            </div>
          </div>
        </form>

        {/* ── Panel derecho: lo que se va a registrar ───────────────
            Decía "Completá los obligatorios" sin decir CUÁLES: con el picker de
            origen arriba y ocho campos abajo, eso obliga a buscar a ojo. Ahora
            lista lo que falta, igual que el alta de ingreso. */}
        <aside className="hidden w-[340px] shrink-0 flex-col border-l border-[var(--rule-base)] bg-[var(--surface-canvas)] lg:flex">
          <div className="border-b border-[var(--rule-soft)] px-5 py-3.5">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Lo que se va a registrar</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-4">
              <CardTitle className="text-lg font-bold leading-tight text-[var(--text-primary)]">{productType || "Sin producto"}</CardTitle>
              {speciesCommon.trim() && <p className="mt-0.5 text-xs italic text-[var(--text-tertiary)]">{speciesCommon.trim()}</p>}
            </div>

            <div className="mb-4">
              {isValid ? (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--data-success-50)] px-3 py-2 text-sm font-medium text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
                  <Check className="h-4 w-4 shrink-0" /> Listo para registrar
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Falta completar</p>
                  <ul className="space-y-1">
                    {faltantes.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-error-500)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mb-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{section === "produccion" ? "Producido" : "A despachar"}</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">{quantity ? Number(quantity).toLocaleString("es-PE", { maximumFractionDigits: 4 }) : "0"}<span className="ml-1 text-sm font-medium text-[var(--text-tertiary)]">{UNIT_LABELS[unit] ?? unit}</span></div>
              {section === "produccion" && rendimiento != null && <div className="mt-1.5 flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"><Check className="h-3 w-3" /> Rendimiento {rendimiento}%</div>}
            </div>

            <dl className="space-y-2.5">
              <PreviewRow label="Fecha" value={entryDate || "—"} />
              {section === "produccion" ? (
                <>
                  <PreviewRow label="Consumido" value={volumeInputM3 ? `${volumeInputM3} m³` : "—"} mono />
                  <PreviewRow label="Atribuido" value={totalAtribuido > 0 ? `${totalAtribuido.toFixed(4)} m³` : "—"} mono />
                  <PreviewRow label="Guías consumidas" value={consumos.length > 0 ? `${consumos.length}` : "—"} />
                  <PreviewRow label="Línea" value={lineaProduccion} />
                  <PreviewRow label="Costo proceso" value={costoProceso ? `S/ ${costoProceso}` : "—"} mono />
                </>
              ) : (
                <>
                  <PreviewRow label="Documento" value={`${docType} ${gtfNumber.trim()}`.trim() || "—"} mono />
                  <PreviewRow label="Destino" value={destino.trim() || "—"} />
                  <PreviewRow label="Piezas" value={pieces ? Number(pieces).toLocaleString("es-PE") : "—"} />
                  <PreviewRow label="Corridas de origen" value={origenes.length > 0 ? `${origenes.length}` : "—"} />
                  <PreviewRow label="Atribuido" value={totalAtribuido > 0 ? `${totalAtribuido.toFixed(4)} ${UNIT_LABELS[unit] ?? unit}` : "—"} mono />
                </>
              )}
            </dl>

            {/* Lo atribuido contra lo declarado: el hueco es lo que rompe la
                cadena de custodia, así que se muestra antes de guardar. */}
            {sinAtribuir > 0.0001 && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2.5 text-xs font-medium text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Quedan <b>{sinAtribuir.toFixed(4)} {section === "produccion" ? "m³" : (UNIT_LABELS[unit] ?? unit)}</b> sin atribuir. Se puede guardar, pero el certificado va a pedir la cadena completa.</span>
              </p>
            )}
          </div>
        </aside>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3.5 sm:px-6">
          <div className="hidden items-center gap-1.5 text-xs text-[var(--text-tertiary)] sm:flex">
            {isValid ? <><Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" /><span>Listo para registrar</span></> : <span>Completá los obligatorios</span>}
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Btn variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Btn>
            <Btn variant="secondary" onClick={(e) => submit(e, true)} disabled={!isValid || submitting}>Guardar y otro</Btn>
            <Btn variant="primary" type="submit" form="ctp-entry-form" disabled={!isValid || submitting}>{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar"}</Btn>
          </div>
        </footer>
      </div>
    </AdminModal>
  );
}

function PreviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
