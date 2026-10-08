"use client";

/**
 * WoodEntryForm — Modal de registro de ingresos LOE-CTP (ADR-124, v5).
 *
 * Rediseño v5 (2026-05-28):
 * - Layout de dos paneles: formulario (izq, scroll) + vista previa en vivo
 *   tipo "boleta" (der, sticky) estilo Stripe/Linear "create".
 * - 100% dark-mode safe: tokens del DS, cero `bg-[var(--surface-raised)]` hardcodeado.
 * - Secciones numeradas, inputs consistentes, footer con progreso real.
 * - Un solo color de acento (verde forestal), cero emojis, cero gradientes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Camera, Check, ChevronDown, ChevronRight, FileText, Loader2, Search, ShieldAlert, ShieldCheck,
  Sparkles, TreePine, X, ClipboardList,
} from "@buleje/design-system/icons";
import AdminModal, { CabeceraPropia } from "@/components/admin/shared/AdminModal";
import SelectorContrato from "./SelectorContrato";
import CtpPiezasDelIngreso from "./CtpPiezasDelIngreso";
import { Btn, estaFueraDePlazo, Field, FormularioClaro, I, ModalFooter, PLAZO_REGISTRO_DIAS, Seccion, useAtajoGuardar } from "./ctp-shared";
import CtpParteBarra from "./CtpParteBarra";
import CtpTrozasImportModal from "./CtpTrozasImportModal";
import CamposPersonalizados, {
  guardarValoresPendientes,
  hayPendientes,
  pendientesVacios,
  type PendientesCampos,
} from "@/components/admin/shared/CamposPersonalizados";
import type { TrozaImportada } from "@/lib/forestal/trozas-import";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { cientificoDeEspecie, opcionesDeEspecie } from "@/lib/forestal/especies-catalogo";
import type { DocTipo } from "@/lib/forestal/directorio";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { printGtfSerfor } from "@/lib/forestal/serfor-gtf-print";
import CtpGuiaSerforHoja from "./CtpGuiaSerforHoja";
import CtpGuiaSerforTrozas from "./CtpGuiaSerforTrozas";
import CtpPrecioDeLaMadera, { PRECIO_VACIO, precioM3De, type PrecioDeLaMadera } from "./CtpPrecioDeLaMadera";
import CtpProveedorEnDirectorio from "./CtpProveedorEnDirectorio";
import { TEXTO_MOTIVO, type MotivoSalto } from "@/lib/forestal/precio-en-tanda";
import { documentoDelTitular } from "@/lib/forestal/serfor-titular";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AvisoClaveIa from "@/components/admin/shared/AvisoClaveIa";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpFichaFaltantes, type CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import {
  findSpeciesByCommonName,
} from "@/data/forestry-species";
import { TIPOS_DOCUMENTO_LOCTP, UNIDADES_LOCTP } from "@/lib/forestal/loctp-campos";
import { PRESENTACIONES_LOCTP } from "@/lib/forestal/loctp-catalogos";
import { ORIGEN_SERFOR, REGIONS_PE, sinTildesUp } from "@/lib/forestal/serfor-origen";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { repartirGtfEnIngresos } from "@/lib/forestal/serfor-gtf-a-ingresos";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { gtfDatosDesdeSerfor } from "@/lib/forestal/serfor-gtf-a-datos";
import CtpGuiaOficialForm from "./CtpGuiaOficialForm";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { tenantCacheKey, getActiveTenantSlug } from "@/lib/tenant-cache";
import { formatTime } from "@/lib/format";
import { PROVEEDOR_INVENTARIO_APERTURA } from "@/lib/forestal/ctp-serfor-a-libro";
import { claveRegistro, type GuiaGuardadaDetalle } from "@/lib/forestal/guias-guardadas";
import CtpAvisoGuiaGuardada, { diaDeLima, useGuiaGuardadaPorClave } from "./CtpAvisoGuiaGuardada";

/** Lo que se copia al duplicar un ingreso: el camión siguiente del mismo
 *  proveedor y la misma concesión. Nunca la GTF ni el volumen. */
export interface WoodEntryPreset {
  providerName?: string;
  providerDocument?: string | null;
  providerDocumentType?: string | null;
  originType?: string;
  originCode?: string | null;
  originRegion?: string | null;
  originDistrict?: string | null;
  speciesCommonName?: string;
  productType?: string;
}

/** Id estable de este formulario para los campos personalizados (ADR-427).
 *  El mismo que usa `CtpIngresoEditModal`: lo que se pregunta al registrar la
 *  guía tiene que verse después al corregir el ingreso. */
const FORMULARIO = "forestal.ingreso";

interface Props {
  onClose: () => void;
  onSaved: (opts?: {
    keepOpen?: boolean;
    /** Quedó anotado en el patio, no en el libro. */
    offline?: boolean;
    /** El ingreso entró, pero lo escrito en sus campos personalizados no: el
     *  aviso lo muestra la vista, que sobrevive al cierre de este modal. */
    camposAviso?: string;
  }) => void;
  /** Bandeja monte→planta: abre el form con esta guía ya cargada (sin doble digitación). */
  initialGtfNumber?: string;
  /** Duplicar: campos repetidos ya cargados (ver WoodEntryPreset). */
  preset?: WoodEntryPreset;
  /** La guía guardada antes de que llegue el camión (ADR-442): la vista de
   *  Ingresos la pasa al tocar «Ingresar». Sus datos llegan puestos. */
  guiaGuardada?: GuiaGuardadaDetalle | null;
  /** ADR-481: «Desde tu Libro TH» — la guía elegida quedó guardada; la vista
   *  cierra el alta y abre «Recibir» con todo relleno. Sin esto, no hay 3.ª opción. */
  onDesdeLibroTh?: (a: GuiaThAlistada) => void;
  /** Abrir el alta ya en «Desde tu Libro TH» (el aviso de guías por ingresar). Sólo vale con `onDesdeLibroTh`. */
  modoInicial?: "libro_th";
}

// Guía emitida (ForestGtf) — para importar sus datos al ingreso.
interface GtfItem {
  species?: string | null; scientific?: string | null; productType?: string | null;
  volumeM3?: number | null; quantity?: number | null; pieces?: number | null; unit?: string | null;
}
interface GtfRecord {
  gtfNumber?: string; gtfDate?: string | null; titularName?: string | null; tituloHabilitante?: string | null;
  parcelaCorta?: string | null; origen?: string | null; transportista?: string | null;
  placaVehiculo?: string | null; volumenTotalM3?: number | null; piezasTotal?: number | null;
  items?: GtfItem[] | null;
}

// ─── Catálogos ────────────────────────────────────────────────────────────

const ORIGIN_TYPES = [
  { value: "concesion", label: "Concesión forestal" },
  { value: "predio_privado", label: "Predio privado" },
  { value: "comunidad_nativa", label: "Comunidad nativa" },
  { value: "reforestacion", label: "Reforestación" },
  { value: "retroaserradero", label: "Re-entrada de otro CTP" },
  { value: "otro", label: "Otro" },
];

const PRODUCT_TYPES = [
  { value: "rolliza", label: "Rolliza (troncos)" },
  { value: "aserrada", label: "Aserrada" },
  { value: "tablones", label: "Tablones" },
  { value: "listones", label: "Listones" },
  { value: "durmientes", label: "Durmientes" },
  { value: "pulgada", label: "En pulgadas" },
  { value: "carbon", label: "Carbón vegetal" },
  { value: "lena", label: "Leña" },
  { value: "otro", label: "Otro" },
];

const DOC_TYPES = [
  { value: "RUC", label: "RUC" },
  { value: "DNI", label: "DNI" },
  { value: "CE", label: "Carnet de Extranjería" },
  { value: "PASAPORTE", label: "Pasaporte" },
];

/**
 * La ficha de SERFOR, con el tipo canónico de `lib/forestal/serfor-gtf`. Antes
 * había acá una copia recortada: dejó de servir cuando el reparto en ingresos
 * (ADR-312) pasó a ser lógica compartida entre el formulario y el servidor.
 */
type GtfSerforLite = GtfSerfor;

const TOP_SPECIES_SLUGS = ["tornillo", "capirona", "shihuahuaco", "cedro", "caoba"];

/**
 * El borrador del ingreso, POR NEGOCIO.
 *
 * ⛔ Hasta 2026-09-05 la clave era global (`buleje:ctp-wood-entry-draft`, sin
 * slug). El borrador se auto-guarda en CADA tecla y se auto-restaura al montar,
 * y transporta el N° de GTF, el proveedor con su RUC/DNI, el título habilitante
 * y el volumen: abrir el formulario en otro negocio lo pre-llenaba con los
 * datos del anterior. El guard de cambio de tenant tampoco lo limpiaba —
 * `clearAllTenantCache()` borra por una lista de prefijos y `"buleje:"` (dos
 * puntos) no matchea `"buleje-admin-"` (guion).
 *
 * Dos defensas, no una: la clave lleva el slug, y el slug también viaja DENTRO
 * del payload para descartarlo al leer si no coincide. La segunda cubre el caso
 * en que el slug todavía no estaba resuelto al escribir — ahí `tenantCacheKey`
 * devuelve la clave pelada y sin el chequeo interno volvería el bug.
 */
const DRAFT_BASE = "buleje:ctp-wood-entry-draft";
const draftKey = () => tenantCacheKey(DRAFT_BASE);

/**
 * La última consulta a SERFOR (Brandon 2026-09-25: «esa consulta se quedará
 * hasta que se ponga otro número de registro… a pesar de cerrar o ir a otra
 * pestaña o sección»). Antes vivía sólo en el estado del modal: cerrarlo o
 * pasar a «Carga manual» la soltaba y había que volver a pedirla.
 *
 * Se reemplaza al consultar OTRO número y se borra al registrar la guía:
 * dejarla viva después de registrada invitaba a registrarla dos veces.
 * Sellada con el negocio, igual que el borrador.
 */
/** Un ingreso recién creado, listo para ponerle precio (proveedor × especie como quedó guardado). */
type IngresoAValorizar = { id: string; proveedor: string; especie: string };
/** Por qué el precio no entró: define qué se le ofrece al operador. */
type TipoAvisoPrecio = "dedazo" | "permiso" | "error" | "saltadas";

const SERFOR_BASE = "buleje:ctp-wood-entry-serfor";
const serforKey = () => tenantCacheKey(SERFOR_BASE);
type ConsultaSerforGuardada = {
  __tenant: string | null;
  nro: string;
  gtf: GtfSerforLite;
  msg: { ok: boolean; text: string } | null;
  at: string;
};
/** Cómo carga este operador: se respeta su última elección entre altas. */
const MODO_CARGA_KEY = "buleje:ctp-wood-entry-modo";

// ─── Helpers ──────────────────────────────────────────────────────────────

function cubicate(pieces: number, lengthM: number, diameterCm: number): number {
  if (!pieces || !lengthM || !diameterCm) return 0;
  const r = diameterCm / 200;
  return Math.round(Math.PI * r * r * lengthM * pieces * 10000) / 10000;
}

const productLabel = (v: string) => PRODUCT_TYPES.find((p) => p.value === v)?.label ?? v;
const originLabel = (v: string) => ORIGIN_TYPES.find((o) => o.value === v)?.label ?? v;

interface DraftData {
  entryDate: string;
  gtfNumber: string;
  gtfDate: string;
  /** Cuándo bajó del camión (ADR-335). Vacío = se asume el día del ingreso. */
  fechaRecepcion: string;
  gtfSeries: string;
  /** (3) Tipo de documento del LO-CTP: GTF | GRR. */
  docType: string;
  providerName: string;
  providerDocument: string;
  providerDocumentType: string;
  originType: string;
  originCode: string;
  /** El permiso al que se imputa este ingreso (ADR-421). Vínculo aparte del
   *  código de origen: éste sigue siendo lo que se declara ante SERFOR. */
  contratoId: string | null;
  /** (5) N° Fuente de origen/procedencia (el documento que ampara la fuente). */
  originSourceNumber: string;
  /** (9) Código de CTP — sólo si la madera viene de otro centro. */
  ctpProductCode: string;
  originRegion: string;
  originDistrict: string;
  speciesSlug: string;
  customSpeciesName: string;
  productType: string;
  /** (10) Unidad de medida declarada en el documento. */
  unit: string;
  /** "Forma de presentación" del formato (ADR-314). */
  presentacion: string;
  volumeM3: string;
  pieces: string;
  avgLengthM: string;
  avgDiameterCm: string;
  humidityPct: string;
  defectsNotes: string;
  notes: string;
}

const INITIAL: DraftData = {
  entryDate: new Date().toISOString().slice(0, 10),
  gtfNumber: "",
  gtfDate: "",
  fechaRecepcion: "",
  gtfSeries: "",
  docType: "GTF",
  providerName: "",
  providerDocument: "",
  providerDocumentType: "RUC",
  originType: "concesion",
  originCode: "",
  contratoId: null,
  originSourceNumber: "",
  ctpProductCode: "",
  originRegion: "Ucayali",
  originDistrict: "",
  speciesSlug: "tornillo",
  customSpeciesName: "",
  productType: "rolliza",
  unit: "m3",
  presentacion: "",
  volumeM3: "",
  pieces: "",
  avgLengthM: "",
  avgDiameterCm: "",
  humidityPct: "",
  defectsNotes: "",
  notes: "",
};

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════

import CtpFotosDelIngreso from "./CtpFotosDelIngreso";
import CtpIngresoDesdeLibroTh from "./CtpIngresoDesdeLibroTh";
import type { GuiaThAlistada } from "@/lib/forestal/guias-th-por-ingresar";
import type { FotoCarga } from "@/lib/forestal/fotos-carga";

export default function WoodEntryForm({ onClose, onSaved, initialGtfNumber, preset, guiaGuardada, onDesdeLibroTh, modoInicial }: Props) {
  /* El picker ofrece las de fábrica MÁS las del catálogo de esta planta
     (ADR-410): «Panguana» y «Yacuchapana» entran por la GTF todas las semanas y
     el código no las conoce — sin esto hay que elegir «Otro» y tipearlas cada
     vez, que es de donde salen las grafías que después no coinciden. */
  const catalogoEspecies = useEspeciesCatalogo();
  const speciesOptions = useMemo(
    () => opcionesDeEspecie(catalogoEspecies.catalogo),
    [catalogoEspecies.catalogo],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** La libreta del CTP (ADR-317) y qué proveedor se usó en ESTE ingreso. */
  const directorio = useDirectorioForestal();
  const partesUsadas = useRef<Set<string>>(new Set());
  /** La ficha del directorio enlazada al titular de la guía SERFOR (por documento). */
  const parteDelTitularRef = useRef<string | null>(null);
  /** Lo que costó la madera (2026-09-25). Vacío = sin costo, nunca S/ 0. */
  const [precio, setPrecio] = useState<PrecioDeLaMadera>(PRECIO_VACIO);
  /**
   * El ingreso YA entró pero su precio no: dedazo a confirmar, sin permiso o
   * error. El modal se queda abierto para decirlo —la vista de Ingresos no
   * tiene dónde mostrar este aviso—, y lo único que queda es cerrar o
   * confirmar el precio. Registrar de nuevo no: duplicaría la guía.
   */
  const [precioPendiente, setPrecioPendiente] = useState<null | {
    texto: string;
    tipo: TipoAvisoPrecio;
    ingresos: IngresoAValorizar[];
    /** El precio por m³ que el servidor marcó: confirmar sólo vale para ÉSE. */
    precioM3Avisado: number | null;
    /** Cerrar después de registrar (lleva el aviso de campos personalizados). */
    alTerminar: () => void;
  }>(null);
  /** El uso se cuenta con el ingreso ya guardado, no al elegir de la lista. */
  /** Lista de trozas pegada a mano cuando SERFOR no la trajo (ADR-320). */
  /* Las fotos del ingreso (hasta 10, ADR-336): la API y la ficha ya las
     soportaban, pero acá se mandaba `photos: null` fijo y las 24 guías del
     tenant real quedaron sin una sola. */
  const [fotos, setFotos] = useState<FotoCarga[]>([]);
  const [trozasManuales, setTrozasManuales] = useState<TrozaImportada[]>([]);
  const [importarTrozas, setImportarTrozas] = useState(false);
  /**
   * El cuerpo del documento: propietario del producto, destinatario y
   * transportista (ADR-336). Va aparte de `data` porque es una declaración del
   * documento y no un campo del libro — y porque lo comparte, con el mismo
   * esquema, con la guía de salida.
   */
  const [gtfDatos, setGtfDatos] = useState<GtfDatos>(() => gtfDatosVacio());
  /** Arranca plegado: son 20 casilleros y el alta rápida no los toca. */
  const [verGuiaOficial, setVerGuiaOficial] = useState(false);
  const marcarProveedorUsado = () => {
    // En SERFOR, la ficha enlazada al titular (por documento) también se usó.
    if (modo === "serfor" && parteDelTitularRef.current) partesUsadas.current.add(parteDelTitularRef.current);
    if (!partesUsadas.current.size) return;
    directorio.marcarUso({ partes: [...partesUsadas.current] });
    partesUsadas.current.clear();
  };

  const [data, setData] = useState<DraftData>(INITIAL);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  // Importar guía por N° de registro (autocompleta el ingreso).
  const [loadingGtf, setLoadingGtf] = useState(false);
  // Consulta oficial a SERFOR por el N° de registro del QR de la guía.
  const [nroRegistroSerfor, setNroRegistroSerfor] = useState("");
  const [serforCargando, setSerforCargando] = useState(false);
  const [serforMsg, setSerforMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** Ficha oficial tal como la publicó SERFOR — viaja con el ingreso para el PDF. */
  const [serforGtf, setSerforGtf] = useState<GtfSerforLite | null>(null);
  /** Cuándo se guardó la consulta vigente (null = no hay ninguna guardada). */
  const [serforGuardadaAt, setSerforGuardadaAt] = useState<string | null>(null);
  // Aviso flotante: el operador está mirando el formulario llenarse solo, no el
  // renglón de estado del campo.
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  /* Lo escrito en los campos personalizados mientras el ingreso todavía no
     existe: se guarda cuando el servidor devuelve su id (ADR-427). */
  const [camposPendientes, setCamposPendientes] = useState<PendientesCampos>(() => pendientesVacios(FORMULARIO));
  /**
   * Dos caminos para el mismo ingreso:
   * · "manual" — se llena a mano (el de siempre, por defecto);
   * · "serfor" — se pide la guía por su N° de registro y se registra lo que dice
   *   el documento oficial. En ese modo los campos manuales se ocultan: si el
   *   dato vino de SERFOR, editarlo al lado invita a "corregir" un documento que
   *   no es nuestro.
   */
  /**
   * El modo se RECUERDA entre altas. El que trabaja contra SERFOR carga veinte
   * guías seguidas y tenía que elegir «Desde SERFOR» en cada una: el default
   * fijo en «manual» le cobraba un click por ingreso. Sigue arrancando en
   * manual la primera vez —si el servicio no responde, el camino de siempre es
   * el que no depende de nadie—, pero después respeta lo último que se usó.
   */
  const [modo, setModo] = useState<"manual" | "serfor" | "libro_th">(() => {
    if (modoInicial === "libro_th" && onDesdeLibroTh && !preset && !guiaGuardada) return "libro_th";
    if (typeof window === "undefined") return "manual";
    try {
      return localStorage.getItem(MODO_CARGA_KEY) === "serfor" ? "serfor" : "manual";
    } catch {
      return "manual";
    }
  });
  useEffect(() => {
    // «Desde tu Libro TH» no se recuerda (ADR-481): la próxima alta arranca en el modo de siempre.
    if (modo === "libro_th") return;
    try {
      localStorage.setItem(MODO_CARGA_KEY, modo);
    } catch {
      // modo privado: sin memoria, sin bug
    }
  }, [modo]);
  /* ADR-481: la 3.ª opción, sólo en un alta nueva (no al duplicar ni al ingresar una guardada). */
  const conLibroTh = !!onDesdeLibroTh && !preset && !guiaGuardada;
  /* `sinClave`: falta la IA de la plataforma — va el aviso único (`AvisoClaveIa`), no la alerta roja. */
  const [gtfMsg, setGtfMsg] = useState<{ ok: boolean; text: string; sinClave?: { instrucciones: boolean } } | null>(null);
  const [gtfItems, setGtfItems] = useState<GtfItem[]>([]);
  const [showGuias, setShowGuias] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Ficha del CTP: para avisar si está incompleta (G) y ofrecer permisos CITES (H).
  const [ficha, setFicha] = useState<CtpFicha | null>(null);
  const [citesPermiso, setCitesPermiso] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.ficha) setFicha(j.ficha as CtpFicha); })
      .catch((err) => console.warn("[wood-form] ficha fetch failed", err));
    return () => { alive = false; };
  }, []);
  const [guias, setGuias] = useState<GtfRecord[]>([]);
  const [loadingGuias, setLoadingGuias] = useState(false);
  const [guiaQuery, setGuiaQuery] = useState("");

  /* Guía guardada antes del ingreso (ADR-442): se reconoce por el N° de
     registro (SERFOR) o por la GTF (manual) mientras se tipea, y el aviso junto
     al campo dice que sus papeles se enlazan solos al registrar. */
  const [guiaPuestaId, setGuiaPuestaId] = useState<string | null>(null);
  /** Ingresos registrados con el modal abierto: lo que se sabía de las guías queda viejo. */
  const [registrados, setRegistrados] = useState(0);
  const guiaReconocida = useGuiaGuardadaPorClave(
    modo === "serfor" ? nroRegistroSerfor : data.gtfNumber,
    guiaGuardada,
    registrados,
  );
  const guiaPuesta =
    guiaReconocida != null &&
    (guiaPuestaId === guiaReconocida.id ||
      // La consulta a SERFOR de ESA guía ya llenó el formulario.
      (modo === "serfor" &&
        serforGtf != null &&
        claveRegistro(serforGtf.numeroRegistro) != null &&
        claveRegistro(serforGtf.numeroRegistro) === claveRegistro(guiaReconocida.numeroRegistro)));
  const avisoGuiaGuardada = guiaReconocida ? (
    <CtpAvisoGuiaGuardada guia={guiaReconocida} puesta={guiaPuesta} onUsar={() => usarGuiaGuardada(guiaReconocida)} />
  ) : null;

  // Load draft del localStorage. Si el form abre desde la bandeja monte→planta
  // (initialGtfNumber), duplicando un ingreso (preset) o desde una guía
  // guardada (ADR-442), la intención es explícita: eso pisa al borrador.
  useEffect(() => {
    if (initialGtfNumber || preset || guiaGuardada) return;
    try {
      const raw = localStorage.getItem(draftKey());
      if (raw) {
        const parsed = JSON.parse(raw) as DraftData & { __tenant?: string };
        const slugActual = getActiveTenantSlug();
        // Segunda defensa: un borrador que dice ser de otro negocio se descarta
        // aunque la clave haya coincidido. Sin `__tenant` (borrador viejo, de
        // antes de este arreglo) también se descarta: puede ser de cualquiera.
        const esDeEsteNegocio = Boolean(parsed.__tenant) && parsed.__tenant === slugActual;
        if (!esDeEsteNegocio) {
          localStorage.removeItem(draftKey());
        } else if (parsed.gtfNumber || parsed.providerName) {
          const { __tenant: _ignorado, ...limpio } = parsed;
          setData({ ...INITIAL, ...limpio, entryDate: INITIAL.entryDate });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al montar
  }, [initialGtfNumber, preset]);

  // La consulta a SERFOR guardada vuelve con el modal. Misma regla que el
  // borrador: si se abrió desde la bandeja, duplicando o desde una guía
  // guardada, la intención es otra guía — restaurar ésta haría registrar la
  // guía equivocada.
  const serforRestauradaRef = useRef(false);
  useEffect(() => {
    if (initialGtfNumber || preset || guiaGuardada || serforRestauradaRef.current) return;
    serforRestauradaRef.current = true;
    try {
      const raw = localStorage.getItem(serforKey());
      if (!raw) return;
      const c = JSON.parse(raw) as ConsultaSerforGuardada;
      if (!c.__tenant || c.__tenant !== getActiveTenantSlug() || !c.gtf) {
        localStorage.removeItem(serforKey());
        return;
      }
      setNroRegistroSerfor(c.nro);
      setSerforMsg(c.msg);
      setSerforGuardadaAt(c.at);
      // En «Desde SERFOR» manda el documento y se aplica ya. En «Carga manual»
      // sólo vuelve la consulta, sin tocar el formulario: el borrador de ESTE
      // alta (quizá otra guía, tipeada a mano) se acaba de restaurar arriba y
      // la guía guardada lo pisaría. Se aplica recién al pasar a SERFOR.
      if (modo === "serfor") aplicarGuiaSerfor(c.gtf, true);
      else setSerforGtf(c.gtf);
    } catch {
      // Un JSON roto no puede trabar el alta: se descarta y se sigue.
      try { localStorage.removeItem(serforKey()); } catch { /* sin storage */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al montar
  }, [initialGtfNumber, preset]);

  function guardarConsultaSerfor(nro: string, gtf: GtfSerforLite, msg: { ok: boolean; text: string } | null) {
    const at = new Date().toISOString();
    setSerforGuardadaAt(at);
    try {
      const c: ConsultaSerforGuardada = { __tenant: getActiveTenantSlug(), nro, gtf, msg, at };
      localStorage.setItem(serforKey(), JSON.stringify(c));
    } catch { /* sin storage: la consulta vale igual mientras el modal siga abierto */ }
  }

  function borrarConsultaSerfor() {
    setSerforGtf(null);
    setSerforGuardadaAt(null);
    try { localStorage.removeItem(serforKey()); } catch { /* sin storage */ }
  }

  // Duplicar un ingreso: lo que se repite camión tras camión (proveedor, origen,
  // especie, producto) llega armado; lo que cambia (GTF, volumen, piezas) queda
  // vacío a propósito — un duplicado con la GTF del anterior sería un registro
  // falso, no un atajo.
  const presetLoadedRef = useRef(false);
  useEffect(() => {
    if (!preset || presetLoadedRef.current) return;
    presetLoadedRef.current = true;
    const slug = preset.speciesCommonName
      ? speciesOptions.find((s) => s.commonName.toLowerCase() === preset.speciesCommonName!.toLowerCase())?.slug
      : undefined;
    setData((prev) => ({
      ...INITIAL,
      entryDate: prev.entryDate,
      providerName: preset.providerName ?? "",
      providerDocument: preset.providerDocument ?? "",
      providerDocumentType: preset.providerDocumentType ?? INITIAL.providerDocumentType,
      originType: preset.originType ?? INITIAL.originType,
      originCode: preset.originCode ?? "",
      originRegion: preset.originRegion ?? INITIAL.originRegion,
      originDistrict: preset.originDistrict ?? "",
      productType: preset.productType ?? INITIAL.productType,
      speciesSlug: slug ?? (preset.speciesCommonName ? "otro" : INITIAL.speciesSlug),
      customSpeciesName: slug ? "" : (preset.speciesCommonName ?? ""),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar con el preset
  }, [preset]);

  // Bandeja monte→planta: pre-cargar la guía apenas abre el form. Ref guard:
  // StrictMode monta doble en dev y sin él la guía se aplicaba 2 veces
  // (las notas quedaban con "Origen guía: …" duplicado).
  const initLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialGtfNumber || initLoadedRef.current) return;
    initLoadedRef.current = true;
    setData((prev) => ({ ...INITIAL, entryDate: prev.entryDate, gtfNumber: initialGtfNumber }));
    void cargarGuia(initialGtfNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar con la guía
  }, [initialGtfNumber]);

  // Guía guardada antes del ingreso (ADR-442): el alta abre con sus datos
  // puestos. El borrador y la consulta SERFOR guardada NO se restauran encima
  // (ver los dos efectos de arriba); ref guard por el doble montaje.
  const guiaGuardadaAplicadaRef = useRef(false);
  useEffect(() => {
    if (!guiaGuardada || guiaGuardadaAplicadaRef.current) return;
    guiaGuardadaAplicadaRef.current = true;
    usarGuiaGuardada(guiaGuardada);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al montar con la guía
  }, [guiaGuardada]);

  // Auto-guardar borrador
  useEffect(() => {
    try {
      // Se sella con el negocio: la clave sola no alcanza si el slug todavía
      // no estaba resuelto cuando se escribió.
      localStorage.setItem(draftKey(), JSON.stringify({ ...data, __tenant: getActiveTenantSlug() }));
    } catch {}
  }, [data]);

  function update<K extends keyof DraftData>(field: K, value: DraftData[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  const mapProduct = (pt: string | null | undefined, fallback: string): string => {
    if (!pt) return fallback;
    const low = pt.toLowerCase();
    return PRODUCT_TYPES.find((p) => p.label.toLowerCase().includes(low) || low.includes(p.value))?.value ?? fallback;
  };

  // Rellena especie/producto/volumen/piezas desde un ítem de la guía.
  const fillFromItem = (it: GtfItem) => {
    setData((prev) => {
      const slug = speciesOptions.find((s) => s.commonName.toLowerCase() === (it.species ?? "").toLowerCase())?.slug;
      return {
        ...prev,
        speciesSlug: slug ?? (it.species ? "otro" : prev.speciesSlug),
        customSpeciesName: slug ? "" : (it.species ?? prev.customSpeciesName),
        productType: mapProduct(it.productType, prev.productType),
        volumeM3: it.volumeM3 != null ? String(it.volumeM3) : it.quantity != null ? String(it.quantity) : prev.volumeM3,
        pieces: it.pieces != null ? String(it.pieces) : prev.pieces,
      };
    });
    setGtfItems([]);
  };

  // Aplica los datos de una guía al formulario (usado por número y por picker).
  const aplicarGuia = (gtf: GtfRecord) => {
    const region = REGIONS_PE.find((rg) => (gtf.origen ?? "").toLowerCase().includes(rg.toLowerCase()));
    setData((prev) => ({
      ...prev,
      gtfNumber: gtf.gtfNumber ?? prev.gtfNumber,
      gtfDate: gtf.gtfDate ? String(gtf.gtfDate).slice(0, 10) : prev.gtfDate,
      providerName: gtf.titularName ?? prev.providerName,
      originCode: gtf.tituloHabilitante ?? gtf.parcelaCorta ?? prev.originCode,
      originRegion: region ?? prev.originRegion,
      notes: [prev.notes, gtf.origen ? `Origen guía: ${gtf.origen}` : "", gtf.transportista ? `Transportista: ${gtf.transportista}${gtf.placaVehiculo ? ` · ${gtf.placaVehiculo}` : ""}` : ""].filter(Boolean).join(" · "),
    }));
    setShowGuias(false);
    const items = Array.isArray(gtf.items) ? gtf.items : [];
    if (items.length === 1) { fillFromItem(items[0]); setGtfMsg({ ok: true, text: `Guía cargada: ${gtf.titularName ?? "titular"} · datos importados.` }); }
    else if (items.length > 1) { setGtfItems(items); setGtfMsg({ ok: true, text: `Guía cargada. Tiene ${items.length} ítems — elige cuál registrar en este ingreso.` }); }
    else { setData((prev) => ({ ...prev, volumeM3: gtf.volumenTotalM3 != null ? String(gtf.volumenTotalM3) : prev.volumeM3, pieces: gtf.piezasTotal != null ? String(gtf.piezasTotal) : prev.pieces })); setGtfMsg({ ok: true, text: "Guía cargada (sin detalle de ítems)." }); }
  };

  // Escanea una foto de la GTF (OCR con IA) y pre-llena el ingreso. La especie
  // NO se auto-selecciona (tiene peso legal): se detecta y el operador la elige.
  async function scanGtf(file: File) {
    setScanning(true);
    setGtfMsg(null);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
        fr.readAsDataURL(file);
      });
      const r = await fetch("/api/admin/forestal/gtf-ocr", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ image: b64 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && (j.codigo === "sin_lector" || j.codigo === "ia_no_disponible")) {
        setGtfMsg({ ok: false, text: j.error, sinClave: { instrucciones: j.codigo === "sin_lector" } });
        return;
      }
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setData((prev) => ({
        ...prev,
        gtfNumber: j.gtfNumber || prev.gtfNumber,
        gtfSeries: j.gtfSeries || prev.gtfSeries,
        gtfDate: j.fecha || prev.gtfDate,
        providerName: j.proveedor || prev.providerName,
        providerDocument: j.ruc || prev.providerDocument,
        volumeM3: j.volumenM3 ? String(j.volumenM3) : prev.volumeM3,
        originCode: j.origen || prev.originCode,
      }));
      const esp = [j.especie, j.especieCientifica].filter(Boolean).join(" · ");
      setGtfMsg({ ok: true, text: `GTF escaneada.${esp ? ` Especie detectada: ${esp} — selecciónala en el picker.` : ""} Revisa los datos antes de guardar.` });
    } catch (e) {
      setGtfMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setScanning(false);
    }
  }

  // Carga la guía por su N° de registro y autocompleta el ingreso. Acepta un
  // número explícito (bandeja monte→planta) o usa el tipeado en el campo.
  /**
   * Trae la guía desde la base de SERFOR por su N° de registro y llena el
   * formulario con lo que dice el documento oficial.
   *
   * Pisa lo que esté vacío y respeta lo que el operador ya escribió: el sistema
   * ayuda, no corrige. La ficha completa queda guardada para poder reimprimir la
   * GTF después (`serforGtf`).
   */
  /**
   * Pone la guía de SERFOR en el formulario: la ficha, el cuerpo del documento
   * y los campos que el libro necesita. La usan la consulta, la restauración de
   * la consulta guardada y la vuelta a «Desde SERFOR».
   *
   * Pisa lo que esté vacío y respeta lo que el operador ya escribió: el sistema
   * ayuda, no corrige — salvo con `mandaElDocumento` (modo SERFOR), donde los
   * campos manuales están ocultos y manda el documento.
   *
   * `mandaElDocumento` es parámetro y no `modo === "serfor"` leído adentro: al
   * cambiar de pestaña el estado todavía dice la anterior.
   */
  function aplicarGuiaSerfor(g: GtfSerforLite, mandaElDocumento: boolean): string[] {
    setSerforGtf(g);
    // El cuerpo del documento (propietario, destinatario, transportista) se
    // lee de la MISMA ficha con la misma función que usa el servidor: si
    // después se pasa a carga manual, esos casilleros ya están puestos.
    setGtfDatos((prev) => gtfDatosDesdeSerfor(g, prev));
    // Si la ficha trae al dueño de la madera, el bloque se abre: esconder un
    // dato que ya existe es peor que pedirlo.
    if ((g.propietario ?? "").trim()) setVerGuiaOficial(true);

    // Fechas: SERFOR las publica dd/mm/aaaa y el input las quiere aaaa-mm-dd.
    const aISO = (f: string | null) => {
      const m = (f ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
    };
    const p0 = g.productos?.[0];
    const piezas = (g.productos ?? []).reduce((a, x) => a + (x.cantidad ?? 0), 0);
    const volumen = g.volumenTotal ?? (g.productos ?? []).reduce((a, x) => a + (x.volumen ?? 0), 0);
    /**
     * Qué campos se van a llenar se decide ANTES de tocar el estado: armar el
     * aviso desde dentro de `setData` lo dejaba siempre en "ya estaban
     * completos", porque el callback corre después de mostrarlo.
     *
     * Se respeta lo que el operador escribió; los valores que todavía son el
     * default del formulario (la especie precargada, por ejemplo) SÍ los pisa
     * el documento oficial: entre un default nuestro y lo que dice la guía,
     * manda la guía.
     *
     * En modo SERFOR **manda el documento, siempre**: los campos manuales
     * están ocultos, así que lo que quedó del borrador anterior no se puede
     * ver ni corregir. Con la regla "respetar lo escrito" un ingreso de esta
     * guía se guardaba con el titular del camión anterior — el libro decía
     * una cosa y la GTF otra, que es justo lo que un fiscalizador cruza.
     */
    const cambios: Partial<DraftData> = {};
    const llenados: string[] = [];
    const proponer = <K extends keyof DraftData>(campo: K, valor: string, etiqueta: string, pisaDefault = false) => {
      if (!valor) return;
      const actual = String(data[campo] ?? "").trim();
      const esDefault = actual === String(INITIAL[campo] ?? "").trim();
      if (actual && !mandaElDocumento && !(pisaDefault && esDefault)) return;
      // Con el documento mandando se escribe SIEMPRE: `data` puede ser el de
      // un render viejo (al restaurar, el borrador todavía no llegó al
      // closure) y saltar el campo por «ya estaba igual» dejaba el del
      // borrador. Al toast sólo va lo que de verdad cambió.
      if (actual === valor && !mandaElDocumento) return;
      (cambios as Record<string, string>)[campo as string] = valor;
      if (actual !== valor) llenados.push(etiqueta);
    };

    proponer("gtfNumber", g.gtfNumber ?? "", "N° GTF");
    proponer("gtfDate", aISO(g.fechaExpedicion), "fecha de la guía");
    proponer("providerName", g.titular ?? "", "titular");
    // El del TITULAR, nunca el RUC de la instancia que registró la guía (ver
    // `documentoDelTitular`); la misma regla que usa el servidor al registrar.
    const docTitular = documentoDelTitular(g);
    if (mandaElDocumento) {
      // Con el documento mandando se escribe SIEMPRE, número y tipo juntos: si
      // la guía no trae documento del titular, el campo queda vacío y no con el
      // de la guía anterior; un DNI no queda rotulado «RUC» (revisión 2026-09-25).
      if (data.providerDocument !== (docTitular?.numero ?? "")) llenados.push("documento del titular");
      (cambios as Record<string, string>).providerDocument = docTitular?.numero ?? "";
      if (docTitular) (cambios as Record<string, string>).providerDocumentType = docTitular.tipo;
    } else {
      proponer("providerDocument", docTitular?.numero ?? "", "RUC");
      if (docTitular && !data.providerDocument.trim()) (cambios as Record<string, string>).providerDocumentType = docTitular.tipo;
    }
    proponer("originCode", g.numeroTitulo ?? "", "código de origen");
    proponer("originSourceNumber", g.numeroResolucion ?? "", "N° de fuente de origen");
    proponer("originDistrict", g.distrito ?? "", "distrito");
    proponer("presentacion", (p0?.presentacion ?? "").toUpperCase(), "presentación", true);
    if (volumen > 0) proponer("volumeM3", volumen.toFixed(4), "volumen");
    if (piezas > 0) proponer("pieces", String(Math.round(piezas)), "piezas");
    // SERFOR manda el departamento EN MAYÚSCULAS ("PASCO") y el catálogo lo
    // tiene capitalizado ("Pasco"): comparar tal cual fallaba en silencio y el
    // ingreso se guardaba con la región POR DEFECTO (Ucayali) para una guía de
    // Pasco. Se compara sin tildes ni mayúsculas y se guarda el valor del
    // catálogo.
    const regionCatalogo = g.departamento
      ? REGIONS_PE.find((r) => sinTildesUp(r) === sinTildesUp(g.departamento ?? ""))
      : undefined;
    if (regionCatalogo) proponer("originRegion", regionCatalogo, "región", true);
    else if (g.departamento) proponer("originRegion", "Otra", "región", true);
    // La especie y el tipo de origen del formulario arrancan con un default:
    // el dato oficial de la guía tiene prioridad sobre él.
    if (p0?.comun) {
      // Si la especie de la guía está en el catálogo se elige del listado; si
      // no, va como "otro" con su nombre — el slug para especie libre es
      // "otro" (con "otra" el selector quedaba vacío y el ingreso sin especie).
      const delCatalogo = findSpeciesByCommonName(p0.comun);
      if (delCatalogo?.slug) {
        proponer("speciesSlug", delCatalogo.slug, "especie", true);
      } else {
        proponer("speciesSlug", "otro", "especie", true);
        proponer("customSpeciesName", p0.comun, "especie", true);
      }
    }
    const tipo = ORIGEN_SERFOR[(g.origenRecurso ?? "").toUpperCase()];
    if (tipo) proponer("originType", tipo, "tipo de origen", true);

    if (Object.keys(cambios).length > 0) setData((prev) => ({ ...prev, ...cambios }));
    return llenados;
  }

  /**
   * Suelta lo que la guía llena, antes de consultar otra o de entrar a «Desde
   * SERFOR» sin guía. Si el documento nuevo no trae un dato, el registro lo
   * muestra vacío — nunca el del camión anterior.
   */
  function soltarDatosDeLaGuia() {
    setData((prev) => ({
      ...prev,
      gtfNumber: "", gtfDate: "", providerName: "", providerDocument: "",
      originCode: "", originSourceNumber: "", originDistrict: "",
      volumeM3: "", pieces: "",
    }));
  }

  /** Trae la guía desde la base de SERFOR por su N° de registro. */
  async function consultarSerfor() {
    const n = nroRegistroSerfor.trim();
    if (!n) { setSerforMsg({ ok: false, text: "Escribe el N° de registro de la guía (ej. 1-19-0313629)." }); return; }
    // Otro número = otra consulta: la guía anterior se suelta YA. Si quedaba
    // en pantalla mientras la nueva fallaba, «Registrar» registraba la vieja.
    if (serforGtf && n !== serforGtf.numeroRegistro) {
      borrarConsultaSerfor();
      soltarDatosDeLaGuia();
    }
    setSerforCargando(true); setSerforMsg(null);
    try {
      const r = await fetch(`/api/admin/forestal/gtf/serfor?numeroRegistro=${encodeURIComponent(n)}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) { setSerforMsg({ ok: false, text: j?.message ?? `El servidor respondió ${r.status}` }); return; }
      if (j.estado !== "encontrada" || !j.gtf) {
        setSerforMsg({ ok: false, text: j.mensaje ?? "SERFOR no encontró esa guía." });
        pushToast?.({ tono: "warning", msg: "SERFOR no encontró esa guía", detail: "Revisa el N° de registro (va con guiones)." });
        return;
      }
      const g = j.gtf as GtfSerforLite;
      const llenados = aplicarGuiaSerfor(g, modo === "serfor");
      const msg = {
        ok: true,
        text: `Guía ${g.gtfNumber ?? n} · ${g.titular ?? "sin titular"} · ${g.estado ?? "sin estado"}`,
      };
      setSerforMsg(msg);
      guardarConsultaSerfor(n, g, msg);
      pushToast?.({
        tono: "success",
        msg: `Guía ${g.gtfNumber ?? n} cargada desde SERFOR`,
        detail:
          llenados.length > 0
            ? `Se completó: ${[...new Set(llenados)].slice(0, 6).join(", ")}${llenados.length > 6 ? "…" : ""}`
            : "Los campos ya estaban completos con lo que escribiste.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSerforMsg({ ok: false, text: msg });
      pushToast?.({ tono: "error", msg: "No se pudo consultar SERFOR", detail: msg.slice(0, 90) });
    } finally {
      setSerforCargando(false);
    }
  }

  /**
   * Pone en el formulario lo que ya se guardó de la guía (ADR-442): la abre la
   * vista de Ingresos o el «Usar sus datos» del aviso junto al campo.
   *
   * Con la ficha de SERFOR → «Desde SERFOR», con el MISMO camino que la
   * consulta (`aplicarGuiaSerfor` con el documento mandando) y SIN volver a
   * pedirla: al registrar, el servidor la pide igual. Sin ficha → carga manual
   * con la GTF, el titular, el permiso y su vínculo ya puestos.
   *
   * No escribe la consulta guardada en localStorage: la guía guardada ya vive
   * en el servidor. Si había otra consulta con OTRO número, se suelta como al
   * consultar otro número (si no, «Registrar» registraba la vieja).
   */
  function usarGuiaGuardada(g: GuiaGuardadaDetalle) {
    setGuiaPuestaId(g.id);
    const cuando = diaDeLima(g.createdAt);
    const nro = (g.numeroRegistro ?? g.serforGtf?.numeroRegistro ?? "").trim();
    if (g.serforGtf && nro) {
      if (serforGtf && claveRegistro(serforGtf.numeroRegistro) !== claveRegistro(nro)) {
        borrarConsultaSerfor();
        soltarDatosDeLaGuia();
      }
      setModo("serfor");
      setNroRegistroSerfor(nro);
      aplicarGuiaSerfor(g.serforGtf, true);
      // Sin el «Guardada · hh:mm» de la consulta: la fecha que vale es la de la guía.
      setSerforGuardadaAt(null);
      setSerforMsg({
        ok: true,
        text: `Datos de la guía guardada el ${cuando} · Guía ${g.serforGtf.gtfNumber ?? g.gtfNumber} · ${g.serforGtf.titular ?? g.titularNombre ?? "sin titular"}`,
      });
      if (g.contratoId) update("contratoId", g.contratoId);
      return;
    }
    setModo("manual");
    const titular = g.titularNombre?.trim() ?? "";
    const doc = g.titularDoc?.trim() ?? "";
    const digitos = doc.replace(/\D/g, "").length;
    setData((prev) => {
      // Número y tipo de documento van con el titular: uno nuevo sin documento
      // no se queda con el del camión anterior.
      const otroTitular = Boolean(titular) && titular.toUpperCase() !== prev.providerName.trim().toUpperCase();
      return {
        ...prev,
        gtfNumber: g.gtfNumber?.trim() || prev.gtfNumber,
        gtfDate: g.gtfDate ?? prev.gtfDate,
        providerName: titular || prev.providerName,
        providerDocument: doc || (otroTitular ? "" : prev.providerDocument),
        providerDocumentType: digitos === 8 ? "DNI" : digitos === 11 ? "RUC" : prev.providerDocumentType,
        originCode: g.permisoCodigo?.trim() || prev.originCode,
        contratoId: g.contratoId ?? prev.contratoId,
      };
    });
    pushToast?.({
      tono: "success",
      msg: `Datos de la guía guardada el ${cuando}`,
      detail: "GTF, titular y permiso puestos. La especie y el volumen los pones tú.",
    });
  }

  async function cargarGuia(num?: string) {
    const n = (num ?? data.gtfNumber).trim();
    if (!n) { setGtfMsg({ ok: false, text: "Escribe el N° de guía primero." }); return; }
    setLoadingGtf(true); setGtfMsg(null); setGtfItems([]); setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/gtf?gtfNumber=${encodeURIComponent(n)}`, { credentials: "include" });
      if (r.status === 404) { setGtfMsg({ ok: false, text: `No hay una guía emitida con el N° ${n}. Revisa el número.` }); return; }
      if (!r.ok) {
        // 409 «ambigua»: dos titulares usan ese N° (cada uno su talonario); el servidor dice cuáles.
        const j = (await r.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? `HTTP ${r.status}`);
      }
      aplicarGuia((await r.json()).gtf as GtfRecord);
    } catch (e) { setGtfMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setLoadingGtf(false); }
  }

  // Lista de guías emitidas (picker) — evita teclear el número.
  async function toggleGuias() {
    if (showGuias) { setShowGuias(false); return; }
    setShowGuias(true); setLoadingGuias(true);
    try {
      const r = await fetch(`/api/admin/forestal/gtf`, { credentials: "include" });
      const list = r.ok ? ((await r.json()).gtfs ?? []) : [];
      setGuias((list as GtfRecord[]).filter((g) => (g as { status?: string }).status !== "anulada"));
    } catch { setGuias([]); }
    finally { setLoadingGuias(false); }
  }
  const guiasFiltradas = useMemo(() => {
    const q = guiaQuery.trim().toLowerCase();
    return (q ? guias.filter((g) => (g.gtfNumber ?? "").toLowerCase().includes(q) || (g.titularName ?? "").toLowerCase().includes(q)) : guias).slice(0, 50);
  }, [guias, guiaQuery]);

  // Especie derivada
  const selectedSpecies = speciesOptions.find((s) => s.slug === data.speciesSlug);
  const isCustomSpecies = data.speciesSlug === "otro";
  const finalSpeciesName = isCustomSpecies
    ? data.customSpeciesName.trim()
    : selectedSpecies?.commonName ?? "";
  const customMatched = isCustomSpecies
    ? findSpeciesByCommonName(data.customSpeciesName)
    : null;
  const finalScientificName = isCustomSpecies
    ? /* Tipeada a mano: el científico sale del catálogo de la planta o del de
         fábrica — la columna que el LO-CTP exige no puede depender de que el
         operador se acuerde del binomio. */
      (customMatched?.scientificName ??
        cientificoDeEspecie(data.customSpeciesName, catalogoEspecies.catalogo))
    : selectedSpecies?.scientificName || null;
  const finalCites = isCustomSpecies
    ? customMatched?.cites ?? false
    : selectedSpecies?.cites ?? false;

  /**
   * Qué especie mostrar arriba del panel. Una guía puede traer VARIAS (esta
   * trae Copaiba y Sapotillo): mostrar sólo la primera haría creer que el
   * ingreso es de una sola.
   */
  /**
   * Qué renglones va a dejar esta guía en el libro. Se calcula con la MISMA
   * función que usa el servidor para crearlos (ADR-312): lo que el operador ve
   * antes de registrar es exactamente lo que se va a registrar.
   */
  const reparto = useMemo(() => (serforGtf ? repartirGtfEnIngresos(serforGtf) : null), [serforGtf]);

  /**
   * El RUC/DNI del titular de la guía, para buscarlo en el directorio.
   *
   * `providerDocument` NO sirve: en las guías de SERFOR trae el RUC de la
   * INSTANCIA que registra (ATFFS, Gobierno Regional) — medido en Blas, el
   * mismo RUC lo tienen dos titulares distintos (revisión 2026-09-25). La
   * consulta pública no publica el RUC del titular; sí el del propietario del
   * producto (casillero 15), que vale sólo si el propietario ES el titular. Si
   * no, no hay documento y se compara por nombre.
   */
  const docDelTitularSerfor = useMemo(() => (serforGtf ? (documentoDelTitular(serforGtf)?.numero ?? null) : null), [serforGtf]);


  // Cubicación auto
  const autoVolume = useMemo(() => {
    const n = Number(data.pieces);
    const l = Number(data.avgLengthM);
    const d = Number(data.avgDiameterCm);
    if (data.productType === "rolliza" && n > 0 && l > 0 && d > 0) {
      return cubicate(n, l, d);
    }
    return 0;
  }, [data.pieces, data.avgLengthM, data.avgDiameterCm, data.productType]);

  // (E) Divergencia >15% entre volumen declarado y cubicaje calculado.
  const cubicajeDivergente =
    autoVolume > 0 && Number(data.volumeM3) > 0
      ? Math.abs(Number(data.volumeM3) - autoVolume) / autoVolume > 0.15
      : false;
  // (G) Datos legales mínimos de la Ficha del CTP que faltan.
  const fichaFaltante = ficha ? ctpFichaFaltantes(ficha) : [];
  // (H) Permisos CITES cargados en la Ficha.
  const permisosCites = ficha?.citesPermisos ?? [];
  const permisoCitesSel = permisosCites.find((p) => p.numero === citesPermiso) ?? null;
  // ¿El permiso vinculado ya estaba vencido a la FECHA DE INGRESO? Comparación
  // fiscal: importa la vigencia al momento de la operación, no la de hoy. Se
  // avisa (no bloquea): CITES es legal con permiso; puede haber una renovación
  // en trámite — un permiso vencido debilita el respaldo, no lo anula.
  const citesPermisoVencidoAlIngreso = Boolean(
    permisoCitesSel?.vencimiento && data.entryDate &&
    new Date(`${permisoCitesSel.vencimiento}T23:59:59`).getTime() <
      new Date(`${data.entryDate}T00:00:00`).getTime(),
  );

  // Filtro especies
  const filteredSpecies = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    if (!q) return speciesOptions.slice(0, 12);
    return speciesOptions
      .filter(
        (s) =>
          s.commonName.toLowerCase().includes(q) ||
          s.scientificName?.toLowerCase().includes(q) ||
          s.altNames?.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [speciesQuery, speciesOptions]);

  // Validación — campos obligatorios pendientes (para checklist + footer)
  const missing = useMemo(() => {
    // ADR-481: en «Desde tu Libro TH» no se registra desde este pie: entra por «Recibir».
    if (modo === "libro_th") return ["Elegir la guía de tu Libro TH y tocar «Traer con todo»"];
    const m: string[] = [];
    if (!data.gtfNumber.trim()) m.push("N° de GTF");
    if (!data.entryDate) m.push("Fecha de ingreso");
    if (data.providerName.trim().length < 2) m.push("Titular habilitante");
    if (finalSpeciesName.length === 0) m.push("Especie forestal");
    if (!(Number(data.volumeM3) > 0)) m.push("Volumen (m³)");
    // (E) Divergencia grande volumen vs cubicaje → exigir justificación escrita.
    if (cubicajeDivergente && data.notes.trim().length < 3) m.push("Justificación de la diferencia de volumen (Observaciones)");
    // (H) Especie CITES → exigir vincular un permiso CITES de la Ficha (si hay).
    if (finalCites && permisosCites.length > 0 && !citesPermiso.trim()) m.push("Permiso CITES vinculado");
    // Modo SERFOR: si la guía no se puede repartir en ingresos (por ejemplo, no
    // declara volumen para una de sus especies) el registro automático no va.
    // El camino es cargarla a mano, no que el sistema complete el hueco.
    if (modo === "serfor") {
      if (!serforGtf) m.push("Consultar la guía en SERFOR");
      else if (reparto && !reparto.ok) m.push("Una guía que se pueda repartir por especie");
    }
    return m;
  }, [data.gtfNumber, data.entryDate, data.providerName, finalSpeciesName, data.volumeM3, cubicajeDivergente, data.notes, finalCites, permisosCites.length, citesPermiso, modo, serforGtf, reparto]);

  const isValid = missing.length === 0;

  /**
   * Lo que sigue siendo el default del formulario (especie, producto, origen).
   * Lo marcaba el panel lateral con «por defecto»; sin el panel, lo dice el pie.
   * Cargando rápido, la especie precargada entraba al libro sin que nadie la
   * eligiera.
   */
  const porDefecto = useMemo(() => {
    const l: string[] = [];
    if (data.speciesSlug === INITIAL.speciesSlug && !data.customSpeciesName) l.push(`Especie: ${finalSpeciesName || "sin especie"}`);
    if (data.productType === INITIAL.productType) l.push(`Producto: ${productLabel(data.productType)}`);
    if (data.originType === INITIAL.originType && data.originRegion === INITIAL.originRegion && !data.originDistrict) {
      l.push(`Origen: ${originLabel(data.originType)} · ${data.originRegion}`);
    }
    return l;
  }, [data.speciesSlug, data.customSpeciesName, data.productType, data.originType, data.originRegion, data.originDistrict, finalSpeciesName]);

  /**
   * Dos avisos sobre las fechas, calculados con la MISMA función que juzga el
   * libro (`estaFueraDePlazo`) para que el formulario no prometa algo distinto
   * de lo que después va a mostrar la tabla:
   *
   *   · el ingreso quedaría registrado fuera del plazo de SERFOR — se avisa
   *     ANTES de guardar, no después con un chip rojo en la lista;
   *   · la madera no puede haber entrado ANTES de que se emitiera su guía;
   *     eso es un typo de fecha, y hasta ahora se guardaba sin chistar.
   */
  /**
   * Ctrl/⌘+Enter registra, como en el resto de los modales del libro. Acá
   * faltaba: quien carga veinte guías seguidas terminaba yendo al botón con el
   * mouse en cada una. Sólo con el formulario válido — si falta algo, el atajo
   * no hace nada y el pie sigue diciendo qué falta.
   */
  const refAtajo = useAtajoGuardar<HTMLFormElement>(
    () => { void handleSubmit(new Event("submit") as unknown as React.FormEvent); },
    isValid && !submitting,
  );

  const avisoPlazo = useMemo(() => {
    if (!data.entryDate) return null;
    if (data.gtfDate && data.entryDate < data.gtfDate) {
      return "El ingreso al CTP es anterior a la fecha de la guía: revisa las fechas.";
    }
    const tarde = estaFueraDePlazo({ entryDate: data.entryDate, createdAt: new Date().toISOString() });
    return tarde
      ? `Registrarlo hoy queda fuera del plazo de ${PLAZO_REGISTRO_DIAS} días hábiles.`
      : null;
  }, [data.entryDate, data.gtfDate]);

  /**
   * Qué secciones ya están listas. Se deriva de `missing`, la MISMA lista que
   * bloquea el registro: si el tilde verde y el botón se calcularan por separado
   * terminarían diciendo cosas distintas —una sección "completa" que igual no
   * deja guardar es peor que no marcar nada.
   *
   * "Origen del material" no aparece: todos sus campos son opcionales en el
   * formato, así que nunca traba y se marca completa desde el arranque.
   */
  const estadoSeccion = useMemo(() => {
    const de: Record<string, string> = {
      "N° de GTF": "guia",
      "Fecha de ingreso": "guia",
      "Titular habilitante": "titular",
      "Especie forestal": "especie",
      "Permiso CITES vinculado": "especie",
      "Volumen (m³)": "producto",
      "Justificación de la diferencia de volumen (Observaciones)": "observaciones",
    };
    const pendientes = new Set(missing.map((m) => de[m]).filter(Boolean));
    const estado = (k: string) => (pendientes.has(k) ? "pendiente" : "ok") as "ok" | "pendiente";
    return {
      guia: estado("guia"),
      titular: estado("titular"),
      origen: "ok" as const,
      especie: estado("especie"),
      producto: estado("producto"),
      observaciones: estado("observaciones"),
    };
  }, [missing]);


  /**
   * Valoriza los ingresos recién creados con «Poner precio» (el camino de la
   * tanda): el total lo calcula el servidor, con su detector de dedazos y el
   * freno de costo congelado. Devuelve null si quedó guardado (o no había
   * precio), o lo que hay que decirle al operador.
   */
  async function ponerPrecioAlRegistrar(
    ingresos: IngresoAValorizar[],
    confirmar = false,
  ): Promise<null | { texto: string; tipo: TipoAvisoPrecio }> {
    const precioM3 = precioM3De(precio);
    if (precioM3 == null || ingresos.length === 0) return null;
    const precios = [
      ...new Map(ingresos.map((i) => [`${i.proveedor}|${i.especie}`, { proveedor: i.proveedor, especie: i.especie, precioM3 }])).values(),
    ];
    try {
      const r = await fetch("/api/admin/forestal/wood-entries/precio", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          precios,
          vistos: ingresos.map((i) => ({ id: i.id, antes: null })),
          tambienConPrecio: false,
          confirmarAvisos: confirmar,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) {
        const detalle = (j.avisos?.[0]?.avisos ?? [])[0] as string | undefined;
        return { texto: `El precio se aleja de lo que sueles pagar${detalle ? `: ${detalle}` : "."} Revísalo: si lo corriges, se vuelve a revisar al guardarlo.`, tipo: "dedazo" };
      }
      if (r.status === 403) {
        return { texto: "El precio no se guardó: cargarlo es del dueño o de un administrador (Opciones → Poner precio).", tipo: "permiso" };
      }
      if (!r.ok) {
        return { texto: `El precio no se guardó (${j.message ?? `HTTP ${r.status}`}). Reintenta o cárgalo desde Opciones → Poner precio.`, tipo: "error" };
      }
      const saltadas = (j.saltadas ?? []) as { motivo: MotivoSalto }[];
      if (saltadas.length > 0) {
        return { texto: `El precio no se aplicó a ${saltadas.length} ingreso(s): ${TEXTO_MOTIVO[saltadas[0]!.motivo] ?? saltadas[0]!.motivo}.`, tipo: "saltadas" };
      }
      /* Si proveedor o especie no emparejan con la fila, el servidor responde
         0 cambios y 0 saltadas: eso NO es éxito (revisión 2026-09-25). */
      const cambios = Array.isArray(j.cambios) ? j.cambios.length : 0;
      if (cambios < ingresos.length) {
        return { texto: `El precio se aplicó a ${cambios} de ${ingresos.length} ingreso(s). Revisa el resto en Opciones → Poner precio.`, tipo: "saltadas" };
      }
      return null;
    } catch (err) {
      return { texto: `El precio no se guardó: ${err instanceof Error ? err.message : String(err)}. Reintenta o cárgalo desde Opciones → Poner precio.`, tipo: "error" };
    }
  }

  /** Muestra el aviso de precio con el ingreso ya registrado (ver `precioPendiente`). */
  function avisarPrecio(
    aviso: { texto: string; tipo: TipoAvisoPrecio },
    ingresos: IngresoAValorizar[],
    alTerminar: () => void,
  ) {
    setPrecioPendiente({ ...aviso, ingresos, precioM3Avisado: precioM3De(precio), alTerminar });
    setSubmitting(false);
  }

  /**
   * Guardar el precio desde el aviso. Se lee el precio que está EN PANTALLA:
   * si el operador lo corrigió, va sin `confirmarAvisos` y pasa otra vez por el
   * detector de dedazos; sólo el MISMO precio avisado se confirma a ciegas.
   * (Antes se mandaba el del momento de registrar: corregido, se guardaba el
   * viejo y confirmado — revisión 2026-09-25.)
   */
  async function guardarPrecioPendiente() {
    if (!precioPendiente) return;
    const actual = precioM3De(precio);
    const confirmar = precioPendiente.tipo === "dedazo" && actual != null && actual === precioPendiente.precioM3Avisado;
    const otra = await ponerPrecioAlRegistrar(precioPendiente.ingresos, confirmar);
    if (otra) setPrecioPendiente({ ...precioPendiente, ...otra, precioM3Avisado: actual });
    else precioPendiente.alTerminar();
  }

  // Submit
  async function handleSubmit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (submitting || precioPendiente) return;
    if (!isValid) {
      setError("Completa los campos obligatorios marcados con asterisco.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // Modo SERFOR: no se manda la ficha, se manda el N° de registro. El
      // servidor la vuelve a pedir y crea UN ingreso por especie declarada, con
      // sus trozas, en una transacción (ADR-312). Media guía registrada dejaría
      // un saldo que no corresponde a ningún documento.
      if (modo === "serfor" && serforGtf) {
        const r = await fetch("/api/admin/forestal/wood-entries/desde-serfor", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            numeroRegistro: serforGtf.numeroRegistro || nroRegistroSerfor.trim(),
            entryDate: new Date(data.entryDate).toISOString(),
            ctpProductCode: data.ctpProductCode.trim() || null,
            humidityPct: data.humidityPct ? Number(data.humidityPct) : null,
            notes: data.notes.trim() || null,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
        try { localStorage.removeItem(draftKey()); } catch {}
        // Registrada la guía, la consulta guardada se va: si volviera al abrir
        // el modal, invitaría a registrar la misma guía otra vez.
        borrarConsultaSerfor();
        marcarProveedorUsado();
        setRegistrados((n) => n + 1);
        /* Una guía que no cuadra CONSIGO MISMA no es un éxito silencioso
           (ADR-353): entra igual —el documento es el que es— pero se avisa en
           amarillo y se dice dónde queda marcada, porque si no el problema
           reaparece recién al consumir y ahí parece culpa del operador. */
        const avisos: string[] = j.avisos ?? [];
        const creadosSerfor: IngresoAValorizar[] = ((j.ingresos ?? []) as { id: string; especie: string }[]).map((x) => ({
          id: x.id,
          // El mismo proveedor que guardó el servidor: el titular de la guía.
          proveedor: serforGtf.titular?.trim() || "Sin titular declarado",
          especie: x.especie,
        }));
        const avisoPrecio = await ponerPrecioAlRegistrar(creadosSerfor);
        pushToast?.({
          tono: avisos.length > 0 ? "warning" : "success",
          msg:
            avisos.length > 0
              ? `Guía ${j.gtfNumber ?? ""} registrada, pero no cuadra`
              : `Guía ${j.gtfNumber ?? ""} registrada`,
          detail:
            avisos.length > 0
              ? `${avisos[0]} Queda marcada en Ingresos con el aviso naranja: tócalo para cuadrarla.`
              : `${j.ingresos?.length ?? 0} ingreso(s) · ${j.trozas ?? 0} troza(s)`,
        });
        if (avisoPrecio) {
          avisarPrecio(avisoPrecio, creadosSerfor, () => onSaved());
          return;
        }
        onSaved();
        return;
      }

      const payload = {
        entryDate: new Date(data.entryDate).toISOString(),
        gtfNumber: data.gtfNumber.trim(),
        gtfDate: data.gtfDate ? new Date(data.gtfDate).toISOString() : null,
        fechaRecepcion: data.fechaRecepcion ? new Date(data.fechaRecepcion).toISOString() : null,
        gtfSeries: data.gtfSeries.trim() || null,
        docType: data.docType || "GTF",
        // Por esta vía entra la carga MANUAL: la guía de SERFOR que haya quedado
        // consultada (ahora se guarda aunque se cambie de pestaña) NO viaja.
        // Un ingreso tipeado a mano no puede quedar marcado como verificado en
        // SERFOR — antes daba null porque la consulta se soltaba al cambiar.
        serforNumeroRegistro: null,
        serforGtf: null,
        providerName: data.providerName.trim(),
        providerDocument: data.providerDocument.trim() || null,
        providerDocumentType: data.providerDocument.trim() ? data.providerDocumentType : null,
        originType: data.originType,
        originCode: data.originCode.trim() || null,
        // El permiso vinculado (ADR-421) — el código de arriba sigue siendo lo
        // que se declara ante SERFOR, esto es sólo el vínculo interno.
        contratoId: data.contratoId,
        originSourceNumber: data.originSourceNumber.trim() || null,
        ctpProductCode: data.ctpProductCode.trim() || null,
        originRegion: data.originRegion === "Otra" ? null : data.originRegion,
        originDistrict: data.originDistrict.trim() || null,
        speciesCommonName: finalSpeciesName,
        speciesScientificName: finalScientificName,
        speciesCites: finalCites,
        productType: data.productType,
        unit: data.unit || "m3",
        presentacion: data.presentacion || null,
        volumeM3: Number(data.volumeM3),
        pieces: data.pieces ? Number(data.pieces) : 0,
        avgLengthM: data.avgLengthM ? Number(data.avgLengthM) : null,
        avgDiameterCm: data.avgDiameterCm ? Number(data.avgDiameterCm) : null,
        humidityPct: data.humidityPct ? Number(data.humidityPct) : null,
        defectsNotes: data.defectsNotes.trim() || null,
        // (H) El permiso CITES vinculado queda en el acta del ingreso (notes).
        notes: [data.notes.trim(), finalCites && citesPermiso.trim() ? `Permiso CITES: ${citesPermiso.trim()}` : ""].filter(Boolean).join(" · ") || null,
        photos: fotos.length > 0 ? fotos : null,
        // El cuerpo del documento: propietario del producto, destinatario y
        // transportista (ADR-336). Se manda sólo si hay algo declarado — un
        // objeto de campos vacíos ensuciaría el libro sin decir nada.
        gtfDatos:
          gtfDatos.propietario.nombre.trim() ||
          gtfDatos.destinatario.nombre.trim() ||
          gtfDatos.vehiculo.placa.trim() ||
          gtfDatos.vehiculo.conductor.trim()
            ? gtfDatos
            : undefined,
        // Las trozas van con su guía y en la misma transacción: media guía
        // registrada deja un saldo sin documento (ADR-312).
        trozas: trozasManuales.length ? trozasManuales : undefined,
      };

      let res: Response;
      try {
        res = await fetch("/api/admin/forestal/wood-entries", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } catch (netErr) {
        // Sin señal en el patio: la guía queda anotada en el equipo y sube sola.
        // Es esto o el cuaderno (que después se tipea tarde y fuera de plazo).
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const { anotar, URL_INGRESO } = await import("@/lib/forestal/patio-cola");
          await anotar("ingresos", payload, URL_INGRESO);
          /* La cola del patio guarda el ingreso, no su id: sin id no hay a qué
             colgar los campos personalizados. Se dice, no se pierde en silencio. */
          const noViaja = [
            hayPendientes(camposPendientes) ? "lo que escribiste en los campos personalizados" : null,
            precioM3De(precio) != null ? "el precio de la madera" : null,
          ].filter(Boolean);
          onSaved({
            offline: true,
            camposAviso: noViaja.length
              ? `${noViaja.join(" y ")} no viaja con la guía anotada en el patio: vuelve a cargarlo al corregir el ingreso.`.replace(/^./, (c) => c.toUpperCase())
              : undefined,
          });
          return;
        }
        throw netErr;
      }

      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.message ?? (r.issues && r.issues[0]?.message) ?? r.error ?? `HTTP ${res.status}`);
      }

      try { localStorage.removeItem(draftKey()); } catch {}
      marcarProveedorUsado();
      setRegistrados((n) => n + 1);

      /* Los campos personalizados se guardan recién acá: hasta que el servidor
         no devuelve el id no hay ingreso al que colgarlos (ADR-427). Si fallan,
         el ingreso YA está en el libro — se avisa y no se pierde el alta. */
      let camposAviso: string | undefined;
      // La respuesta se lee UNA vez: la usan los campos personalizados y el precio.
      const creado = (await res.json().catch(() => ({}))) as { entry?: { id?: string } };
      if (hayPendientes(camposPendientes)) {
        const idIngreso = creado.entry?.id;
        if (!idIngreso) {
          camposAviso = "El ingreso entró, pero el servidor no devolvió su número: lo que escribiste en los campos personalizados quedó sin guardar.";
        } else {
          const rc = await guardarValoresPendientes(idIngreso, camposPendientes);
          if (rc.errores.length > 0) camposAviso = rc.errores.join(" · ");
        }
        setCamposPendientes(pendientesVacios(FORMULARIO));
      }

      const creadoManual: IngresoAValorizar[] = creado.entry?.id
        ? [{ id: creado.entry.id, proveedor: payload.providerName, especie: payload.speciesCommonName }]
        : [];
      const avisoPrecio = await ponerPrecioAlRegistrar(creadoManual);
      if (avisoPrecio) {
        avisarPrecio(avisoPrecio, creadoManual, () => onSaved(camposAviso ? { camposAviso } : undefined));
        return;
      }
      setPrecio(PRECIO_VACIO);

      if (keepOpen) {
        setData((prev) => ({
          ...INITIAL,
          entryDate: prev.entryDate,
          providerName: prev.providerName,
          providerDocument: prev.providerDocument,
          providerDocumentType: prev.providerDocumentType,
          originType: prev.originType,
          originCode: prev.originCode,
          contratoId: prev.contratoId,
          originRegion: prev.originRegion,
          originDistrict: prev.originDistrict,
        }));
        setSubmitting(false);
        onSaved({ keepOpen: true, camposAviso });
      } else {
        onSaved(camposAviso ? { camposAviso } : undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }


  // ═════════════════════════════════════════════════════════════════════
  // RENDER — dos paneles: formulario + vista previa
  // ═════════════════════════════════════════════════════════════════════

  return (
    <AdminModal
      open
      onClose={precioPendiente ? precioPendiente.alTerminar : onClose}
      variant="wide"
      hideCloseButton
      claveVentana="ctp-nuevo-ingreso"
      /* Con la guía de SERFOR el alta pasó a mostrar la ficha oficial completa
         (propietario, destinatario, transporte y la lista de trozas): 1280px se
         quedaban cortos y obligaban a scrollear de más. */
      /* Ancho: el alta muestra el formulario en dos columnas + el panel de
         registro, y con la guía de SERFOR agrega la ficha completa. Se toma el
         ancho de la pantalla menos un respiro, con techo para que en monitores
         muy anchos las líneas no queden imposibles de leer. */
      className="sm:w-[min(96vw,110rem)] sm:max-w-none sm:max-h-[95vh]"
      // El pie va por prop: dentro del scroll quedaba fuera del modal y el
      // botón "Registrar ingreso" no se veía (medido: modal 925px, footer 942px).
      footer={
        <ModalFooter
          nota={
            /* Lo que decía el panel lateral y no se puede perder vive acá:
               QUÉ falta (antes una lista a la vista, ahora en el ⓘ) y qué datos
               siguen siendo el default del formulario — la especie precargada
               entraba al libro sin que nadie la eligiera. */
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {modo === "libro_th" ? (
                <span>Elige la guía y toca «Traer con todo»: entra por «Recibir».</span>
              ) : isValid ? (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" />
                  Listo para guardar
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>
                    Faltan <span className="font-semibold text-[var(--text-secondary)]">{missing.length}</span>{" "}
                    {missing.length === 1 ? "campo" : "campos"}
                  </span>
                  <InfoTip
                    title="Falta completar"
                    ariaLabel="Ver qué falta completar"
                    body={
                      <span className="block space-y-1">
                        {missing.map((m) => (
                          <span key={m} className="block">• {m}</span>
                        ))}
                      </span>
                    }
                  />
                </span>
              )}
              {modo === "manual" && porDefecto.length > 0 && (
                <span className="flex items-center gap-1.5 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <span>
                    {porDefecto.length} {porDefecto.length === 1 ? "dato viene" : "datos vienen"} por defecto
                  </span>
                  <InfoTip
                    title="Revisa lo que vino puesto"
                    ariaLabel="Ver qué datos vienen por defecto"
                    body={
                      <span className="block space-y-1">
                        <span className="block">El formulario arranca con los valores de esta planta para ahorrar clics. Si la guía dice otra cosa, cámbialos: entran al libro tal cual.</span>
                        {porDefecto.map((d) => (
                          <span key={d} className="block font-semibold">• {d}</span>
                        ))}
                      </span>
                    }
                  />
                </span>
              )}
            </span>
          }
        >
          {precioPendiente ? (
            /* El ingreso YA entró: registrar otra vez duplicaría la guía. */
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              {(precioPendiente.tipo === "dedazo" || precioPendiente.tipo === "error") && precioM3De(precio) != null && (
                <Btn
                  variant="secondary"
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try { await guardarPrecioPendiente(); } finally { setSubmitting(false); }
                  }}
                >
                  {precioPendiente.tipo === "error"
                    ? "Reintentar el precio"
                    : precioM3De(precio) === precioPendiente.precioM3Avisado
                      ? "Guardar el precio igual"
                      : "Guardar el precio corregido"}
                </Btn>
              )}
              <Btn variant="primary" onClick={precioPendiente.alTerminar} disabled={submitting}>Cerrar</Btn>
            </div>
          ) : (
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Btn variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Btn>
            {/* ADR-481: desde tu Libro TH se registra en «Recibir» (abre al traer la guía), no acá. */}
            {modo !== "libro_th" && (
              <>
                <Btn variant="secondary" onClick={(e) => handleSubmit(e, true)} disabled={!isValid || submitting}>Guardar y otro</Btn>
                <Btn variant="primary" type="submit" form="wood-entry-form" disabled={!isValid || submitting}>
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar ingreso"}
                </Btn>
              </>
            )}
          </div>
          )}
        </ModalFooter>
      }
    >
      <div className="flex h-full flex-col bg-[var(--surface-raised)]">
        {/* ── Header ──────────────────────────────────────────────────── */}
        {/* Encabezado propio que igual es ASA de la ventana (ADR-420): se
            arrastra, y trae restaurar / maximizar / fijar antes de la X. */}
        <CabeceraPropia
          className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6"
          acciones={
            <button
              type="button"
              onClick={precioPendiente ? precioPendiente.alTerminar : onClose}
              aria-label="Cerrar"
              className="shrink-0 rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          }
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
              <TreePine className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">
                Nuevo ingreso de madera
              </CardTitle>
              <p className="truncate text-xs text-[var(--text-tertiary)]">
                Libro de Operaciones CTP · LOE-CTP SERFOR
              </p>
            </div>
          </div>
        </CabeceraPropia>

        {/* ── Cuerpo: dos paneles ─────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ─── Panel izquierdo: formulario ──────────────────────── */}
          <form
            id="wood-entry-form"
            ref={refAtajo}
            onSubmit={handleSubmit}
            // Fondo hundido: las secciones son tarjetas y se tienen que
            // despegar del fondo para leerse como bloques separados.
            className="min-w-0 flex-1 overflow-y-auto bg-[var(--surface-sunken)] px-5 py-5 sm:px-6 sm:py-6"
          >
            <FormularioClaro>
            {precioPendiente && (
              <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm text-[var(--text-primary)] dark:bg-[var(--data-warning-500)]/10">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
                <div>
                  <strong>El ingreso quedó registrado.</strong> {precioPendiente.texto}
                </div>
              </div>
            )}

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{error}</div>
              </div>
            )}

            {/* (G) La Ficha del CTP debe estar completa para que los documentos tengan validez legal. */}
            {fichaFaltante.length > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm text-[var(--data-warning-700)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div><strong>Ficha del CTP incompleta.</strong> Faltan datos legales (Código CTP, RUC…) que los documentos SERFOR necesitan. Complétala en la pestaña «Ficha CTP» — puedes registrar igual, pero el libro no tendrá identidad legal completa.</div>
              </div>
            )}

            {/* Rediseño 2026-08-03 — el grid reparte por FILAS, no por columnas.
                Antes eran dos columnas independientes, [1·2·3 | 4·5·6], y eso
                rompía las dos cosas que importan al transcribir una guía:
                  · el ORDEN DE LECTURA — se bajaba por 01→03 y había que SUBIR
                    al tope de la otra columna para el 04, aunque el formulario
                    está numerado como el papel que se copia;
                  · el ESPACIO — medido: la izquierda pedía 987px y la derecha
                    786, así que quedaban ~200px de aire muerto a la derecha
                    mientras a la izquierda seguían habiendo campos.
                Con las secciones como hijas DIRECTAS del grid fluyen 01·02 /
                03·04 / 05·06: se lee izquierda→derecha como se numera, y el
                aire sobrante se reparte por fila en vez de acumularse al pie de
                una columna. (Sigue sin ser CSS multicol: con altura fija hace
                column-fill:auto y desborda a una 3ª columna fuera del form.) */}
            {/* Selector de modo: es lo primero que se decide al abrir el alta. */}
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              <SegmentedControl
                value={modo}
                onChange={(v) => {
                  setModo(v);
                  // La consulta a SERFOR ya NO se suelta al pasar a mano: queda
                  // guardada hasta que se consulte otro número (Brandon
                  // 2026-09-25). Lo que antes justificaba soltarla —el panel
                  // lateral decía «verificado en SERFOR» sobre un ingreso
                  // tipeado— se fue con el panel, y el alta manual no la
                  // adjunta (ver `serforGtf: null` en el envío).
                  if (v === "serfor") {
                    // De vuelta en SERFOR, manda el documento guardado. Sin
                    // guía, lo que la guía va a traer se suelta antes de
                    // consultarla: si el documento no trae un dato, el registro
                    // lo muestra vacío — nunca el del camión anterior.
                    if (serforGtf) aplicarGuiaSerfor(serforGtf, true);
                    else {
                      soltarDatosDeLaGuia();
                      // Sin guía, un error de una consulta anterior ya no dice nada.
                      setSerforMsg(null);
                    }
                  }
                }}
                size="lg"
                label="Cómo se carga el ingreso"
                options={[
                  { value: "manual", label: "Carga manual" },
                  { value: "serfor", label: "Desde SERFOR" },
                  /* ADR-481: la guía que salió de tu Libro TH entra con todo, sin tipear. */
                  ...(conLibroTh ? [{ value: "libro_th" as const, label: "Desde tu Libro TH" }] : []),
                ]}
              />
              {/* En el celular va debajo del selector: al costado le quedaban
                  ~50 px y salía una palabra por renglón. */}
              <p className="w-full min-w-0 text-xs text-[var(--text-secondary)] sm:w-auto sm:flex-1">
                {modo === "manual"
                  ? "Llenas la guía a mano, campo por campo."
                  : modo === "libro_th"
                    ? "Eliges la guía que salió de tu Libro TH y entra con sus trozas, su resumen y su titular."
                    : "Se pide la guía a SERFOR por su N° de registro y se registra lo que dice el documento oficial."}
              </p>
            </div>

            {modo === "libro_th" && onDesdeLibroTh && <CtpIngresoDesdeLibroTh onAlistada={onDesdeLibroTh} />}

            {modo === "serfor" && (
              <div className="grid grid-cols-1 gap-4">
                <Seccion
                  numero={1}
                  title="Guía en la base de SERFOR"
                  hint="El N° de registro trae la guía desde la base de SERFOR y llena el ingreso con lo que dice el documento oficial. La consulta queda guardada aunque cierres el modal o cambies de pestaña: se reemplaza al consultar otro número y se borra al registrar la guía."
                >
              {/* La vía más corta: el N° de registro del QR trae la guía desde la
                  base de SERFOR. Va PRIMERO porque, cuando la guía existe allá,
                  llena medio formulario de una. */}
              <Field
                span={12}
                label="N° de registro SERFOR"
                hint="Es el N° de constancia del SNIFFS, el que acompaña al código QR de la guía — no el N° de GTF impreso arriba. Lleva guiones: 2-25-0002326. Trae el titular y su documento, el origen y su código, la especie, el producto y el volumen, y la lista de trozas pieza por pieza."
              >
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    inputMode="text"
                    value={nroRegistroSerfor}
                    onChange={(e) => { setNroRegistroSerfor(e.target.value); setSerforMsg(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void consultarSerfor(); } }}
                    placeholder="2-25-0002326"
                    className={`${I} w-full flex-1 font-mono sm:w-auto`}
                  />
                  <button
                    type="button"
                    onClick={() => void consultarSerfor()}
                    disabled={serforCargando || !nroRegistroSerfor.trim()}
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-3.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {serforCargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Consultar SERFOR
                  </button>
                  {serforGtf && (
                    <button
                      type="button"
                      onClick={() => { void printGtfSerfor(serforGtf as never); }}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                    >
                      <FileText className="h-4 w-4" /> Imprimir la GTF
                    </button>
                  )}
                </div>
                {serforMsg && (
                  <p
                    className={`mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium ${
                      serforMsg.ok
                        ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
                        : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
                    }`}
                  >
                    {serforMsg.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1">{serforMsg.text}</span>
                    {/* Que se vea que es la consulta GUARDADA: al reabrir el modal
                        la guía está ahí sin haberla pedido de nuevo. */}
                    {serforMsg.ok && serforGtf && serforGuardadaAt && (
                      <span className="shrink-0 whitespace-nowrap text-xs font-normal opacity-80">
                        Guardada · {formatTime(serforGuardadaAt)}
                      </span>
                    )}
                  </p>
                )}
                {avisoGuiaGuardada}
              </Field>

              {!serforGtf && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:col-span-12">
                  <span className="text-sm text-[var(--text-secondary)]">¿La guía no está en SERFOR?</span>
                  <button
                    type="button"
                    onClick={() => setModo("manual")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    Cargarla a mano
                  </button>
                </div>
              )}
                </Seccion>

                {/* La guía, las trozas y lo que la guía no trae, JUNTOS debajo de
                    la consulta. Antes la hoja y los datos del CTP iban después
                    del formulario manual oculto y la lista de trozas colgaba al
                    pie de la hoja; ahora las trozas tienen su apartado. */}
                {serforGtf && (
                  <>
                    <Seccion
                      numero={2}
                      title="Datos de la guía"
                      hint="Como los declara el documento de SERFOR: no se editan. Los bloques siguen el orden del papel — la guía, el propietario, el destinatario, el transportista y el detalle del producto."
                    >
                      <CtpGuiaSerforHoja gtf={serforGtf} onImprimir={() => { void printGtfSerfor(serforGtf as never); }} />
                    </Seccion>

                    <Seccion
                      numero={3}
                      title="Trozas de la guía"
                      hint="La lista de trozas (casillero 35) tal como la publica SERFOR, pieza por pieza, y cómo entra al libro: un ingreso por especie con sus trozas."
                    >
                      <CtpGuiaSerforTrozas key={serforGtf.numeroRegistro} gtf={serforGtf} reparto={reparto} />
                    </Seccion>

                    {/* Lo que la guía NO trae y el libro sí necesita: cuándo entró
                        al patio y el código con el que este centro marca la
                        madera. Son datos del CTP, no del documento — por eso se
                        piden igual. */}
                    <Seccion
                      numero={4}
                      title="Datos del ingreso al CTP"
                      hint="Lo que la guía no trae: cuándo entró la madera al patio, el código con el que este centro la marca y lo que costó. Además, si el titular ya está en tu directorio."
                    >
                      <div className="min-w-0 sm:col-span-12">
                        <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Proveedor</p>
                        <CtpProveedorEnDirectorio
                          nombre={serforGtf.titular ?? data.providerName}
                          documento={docDelTitularSerfor}
                          partes={directorio.porRol("proveedor")}
                          onEnlazada={(p) => { parteDelTitularRef.current = p?.id ?? null; }}
                          onAgregar={async () => {
                            const doc = docDelTitularSerfor ?? "";
                            const parte = await directorio.guardarParte({
                              roles: ["proveedor"],
                              nombre: (serforGtf.titular ?? data.providerName).trim(),
                              ...(doc.length === 11 ? { docTipo: "RUC" as const, docNumero: doc } : doc.length === 8 ? { docTipo: "DNI" as const, docNumero: doc } : {}),
                              tituloHabilitante: data.originCode.trim() || undefined,
                            });
                            partesUsadas.current.add(parte.id);
                          }}
                        />
                      </div>
                      <Field span={3} label="Fecha de ingreso al CTP" required casillero={2}>
                        <input
                          type="date"
                          value={data.entryDate}
                          onChange={(e) => update("entryDate", e.target.value)}
                          required
                          className={I}
                        />
                      </Field>
                      <Field span={6} label="Código que asigna el CTP" casillero={10} hint="El que le pones a la troza o al paquete">
                        <input
                          type="text"
                          value={data.ctpProductCode}
                          onChange={(e) => update("ctpProductCode", e.target.value)}
                          placeholder="T-0142 / PQ-08"
                          className={`${I} font-mono`}
                        />
                      </Field>
                      <Field span={3} label="Humedad (%)">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={data.humidityPct}
                          onChange={(e) => update("humidityPct", e.target.value)}
                          placeholder="22"
                          className={I}
                        />
                      </Field>
                      <CtpPrecioDeLaMadera
                        precio={precio}
                        onCambio={setPrecio}
                        lineas={reparto?.ok ? reparto.ingresos.map((l) => ({ etiqueta: l.especieComun, m3: l.volumenM3 })) : []}
                      />
                      <Field span={12} label="Observaciones del ingreso" casillero={13}>
                        <textarea
                          value={data.notes}
                          onChange={(e) => update("notes", e.target.value)}
                          rows={2}
                          placeholder="Estado de la carga, faltantes, defectos…"
                          className={`${I} h-auto py-2.5`}
                        />
                      </Field>
                    </Seccion>
                  </>
                )}
              </div>
            )}

            <div className={modo === "manual" ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : "hidden"}>
            {/* ─── 1 · GTF ─────────────────────────────────────────── */}
            <Seccion numero={1} title="Guía de Transporte Forestal" estado={estadoSeccion.guia}>
              {/* (3) del formato LO-CTP: casi siempre GTF, pero la madera también
                  puede entrar con Guía de Remisión Remitente y el libro tiene
                  que decir con cuál (ADR-311). */}
              <Field span={6} label="Tipo de documento" required casillero={3}>
                <select
                  value={data.docType}
                  onChange={(e) => update("docType", e.target.value)}
                  required
                  className={I}
                >
                  {TIPOS_DOCUMENTO_LOCTP.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.label}</option>
                  ))}
                </select>
              </Field>
                <Field span={6} label="Serie">
                  <input
                    type="text"
                    value={data.gtfSeries}
                    onChange={(e) => update("gtfSeries", e.target.value)}
                    placeholder="A001"
                    className={I}
                  />
                </Field>
              <Field span={12} label="N° GTF" required hint="Escribe el número y toca «Cargar guía» para traer todos los datos.">
                {/* El número manda: fila propia. Con los tres botones al lado,
                    al input le quedaban 35px de ancho y no se veía lo tipeado. */}
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={data.gtfNumber}
                    onChange={(e) => { update("gtfNumber", e.target.value); setGtfMsg(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); cargarGuia(); } }}
                    aria-label="N° de la guía de transporte forestal"
                    placeholder="0001234"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- el campo del N° de guía es lo primero que se escribe
                    autoFocus
                    required
                    className={`${I} w-full font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => void cargarGuia()}
                    disabled={loadingGtf || !data.gtfNumber.trim()}
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-3.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingGtf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Cargar guía
                  </button>
                  <button
                    type="button"
                    onClick={toggleGuias}
                    className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${showGuias ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                  >
                    <Search className="h-4 w-4" /> Ver guías
                  </button>
                  <label
                    title="Escanea una foto de la GTF para pre-llenar el ingreso con IA"
                    className={`inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors ${scanning ? "border-[var(--rule-base)] text-[var(--text-tertiary)] opacity-70" : "border-[var(--brand-ink)] text-[var(--brand-ink)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"}`}
                  >
                    {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Escanear
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={scanning}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanGtf(f); e.target.value = ""; }}
                    />
                  </label>
                </div>
                {/* Este bloque sigue montado (oculto) en «Desde SERFOR»: el aviso, sólo en su modo. */}
                {modo === "manual" && avisoGuiaGuardada}
              </Field>
              {/* Los tres de abajo van a lo ancho de la sección: sin `sm:col-span-12`
                  caían en UNA de las 12 columnas (30 px) encima de «Fecha del GTF»
                  (medido 02-10 con el aviso de la clave de IA). */}
              {showGuias && (
                <div className="space-y-2 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-2 sm:col-span-12">
                  <input value={guiaQuery} onChange={(e) => setGuiaQuery(e.target.value)} placeholder="Buscar por N° o titular…" className={`${I} h-9`} />
                  <div className="max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {loadingGuias ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando guías…</div>
                      : guiasFiltradas.length === 0 ? <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">No hay guías emitidas. Se emiten en el Libro de Títulos Habilitantes → GTF.</div>
                        : guiasFiltradas.map((g, i) => (
                          <button key={i} type="button" onClick={() => aplicarGuia(g)} className="flex w-full items-center justify-between gap-3 px-3 min-h-10 text-left transition-colors hover:bg-[var(--data-success-50)]">
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">{g.gtfNumber}</span>
                              <span className="truncate text-xs text-[var(--text-secondary)]">{g.titularName ?? "—"}{g.origen ? ` · ${g.origen}` : ""}</span>
                            </span>
                            <span className="shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{g.volumenTotalM3 != null ? `${g.volumenTotalM3} m³` : ""}{g.gtfDate ? <><br />{String(g.gtfDate).slice(0, 10)}</> : ""}</span>
                          </button>
                        ))}
                  </div>
                </div>
              )}
              {gtfMsg?.sinClave && (
                <AvisoClaveIa className="sm:col-span-12" mensaje={gtfMsg.text} conInstrucciones={gtfMsg.sinClave.instrucciones} />
              )}
              {gtfMsg && !gtfMsg.sinClave && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs sm:col-span-12 ${gtfMsg.ok ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "bg-[var(--data-error-50)] text-[var(--data-error-700)]"}`}>
                  {gtfMsg.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{gtfMsg.text}</span>
                </div>
              )}
              {gtfItems.length > 1 && (
                <div className="space-y-1 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-2 sm:col-span-12">
                  <span className="px-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-700)]">Elige el ítem de la guía</span>
                  <div className="max-h-40 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {gtfItems.map((it, i) => (
                      <button key={i} type="button" onClick={() => fillFromItem(it)} className="flex w-full items-center justify-between gap-3 px-3 min-h-10 text-left transition-colors hover:bg-[var(--data-success-50)]">
                        <span className="truncate text-sm font-medium text-[var(--text-primary)]">{it.species ?? it.productType ?? "Ítem"}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{it.volumeM3 != null ? `${it.volumeM3} m³` : it.quantity != null ? `${it.quantity} ${it.unit ?? ""}` : ""}{it.pieces != null ? ` · ${it.pieces} pz` : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
                {/* Las DOS fechas, juntas y en ese orden: la distancia entre
                    ellas es la que decide si el registro entra en el plazo de
                    SERFOR (2 días hábiles, RDE D000025-2023). Estaban separadas
                    por el campo Serie, así que el desfase —lo único que se mira
                    acá— había que calcularlo de memoria. */}
                <Field span={6} label="Fecha del GTF">
                  <input
                    type="date"
                    value={data.gtfDate}
                    onChange={(e) => update("gtfDate", e.target.value)}
                    className={I}
                  />
                </Field>
                <Field span={6} label="Fecha de ingreso al CTP" required hint={avisoPlazo ?? undefined}>
                  <input
                    type="date"
                    value={data.entryDate}
                    onChange={(e) => update("entryDate", e.target.value)}
                    required
                    className={`${I} ${avisoPlazo ? "border-[var(--data-warning-500)]" : ""}`}
                  />
                </Field>
                {/* La TERCERA fecha, que no es ninguna de las otras dos: el
                    camión sale el lunes, la guía tiene fecha del viernes y se
                    descarga el martes. La recepción se cuenta desde ésta y es lo
                    primero que se pregunta cuando las otras no coinciden. */}
                <Field span={6} label="Recepcionado en planta el" hint="Cuándo bajó la madera del camión. Vacío = el día del ingreso.">
                  <input
                    type="date"
                    value={data.fechaRecepcion}
                    onChange={(e) => update("fechaRecepcion", e.target.value)}
                    className={I}
                  />
                </Field>
            </Seccion>

            {/* 2 · Especie + producto: eran dos secciones y la de especie gastaba
                un encabezado numerado entero para UN campo. Para el que copia la
                guía es una sola pregunta: qué madera es y cuánta hay. */}
            <Seccion numero={2} title="Especie, producto y medidas" estado={estadoSeccion.especie === "pendiente" || estadoSeccion.producto === "pendiente" ? "pendiente" : "ok"}>
              <Field span={12} label="Especie" required>
                <button
                  type="button"
                  onClick={() => setShowSpeciesPicker((v) => !v)}
                  className={`${I} flex items-center justify-between text-left`}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span className="truncate font-medium">{finalSpeciesName || "Seleccionar especie..."}</span>
                    {finalCites && <CitesPill />}
                  </span>
                  <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                </button>
              </Field>

              {showSpeciesPicker && (
                <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <input
                    type="text"
                    value={speciesQuery}
                    onChange={(e) => setSpeciesQuery(e.target.value)}
                    placeholder="Buscar por nombre común o científico..."
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- el buscador de especies se abre para tipear de inmediato
                    autoFocus
                    className={`${I} mb-2`}
                  />

                  {!speciesQuery && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TOP_SPECIES_SLUGS.map((slug) => {
                        const s = speciesOptions.find((x) => x.slug === slug);
                        if (!s) return null;
                        const active = data.speciesSlug === slug;
                        return (
                          <button
                            key={slug}
                            type="button"
                            onClick={() => {
                              update("speciesSlug", slug);
                              setShowSpeciesPicker(false);
                              setSpeciesQuery("");
                            }}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"
                                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                            }`}
                          >
                            {s.commonName}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="max-h-64 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {filteredSpecies.length === 0 && (
                      <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                        Sin resultados
                      </div>
                    )}
                    {filteredSpecies.map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => {
                          update("speciesSlug", s.slug);
                          setShowSpeciesPicker(false);
                          setSpeciesQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-sm font-medium text-[var(--text-primary)]">{s.commonName}</span>
                            {s.cites && <CitesPill />}
                          </div>
                          {s.scientificName && (
                            <div className="truncate text-xs italic text-[var(--text-tertiary)]">
                              {s.scientificName}
                            </div>
                          )}
                        </div>
                        {s.densityKgM3 && (
                          <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                            {s.densityKgM3} kg/m³
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isCustomSpecies && (
                <Field span={12} label="Nombre de la especie" required>
                  <input
                    type="text"
                    value={data.customSpeciesName}
                    onChange={(e) => update("customSpeciesName", e.target.value)}
                    placeholder="ej: Aguano masha"
                    required
                    className={I}
                  />
                </Field>
              )}

              {finalCites && (
                <div className="flex items-start gap-2.5 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2.5 text-xs text-[var(--data-error-700)]">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <span className="font-bold">Especie CITES.</span>{" "}
                    Requiere permiso de exportación. Verifica el sello en la GTF.
                  </div>
                </div>
              )}
              {/* (H) Vincular un permiso CITES cargado en la Ficha del CTP. */}
              {finalCites && (
                <div className="mt-2">
                  {permisosCites.length > 0 ? (
                    <Field span={12} label="Permiso CITES vinculado" required hint="Del listado cargado en la Ficha del CTP">
                      <select className={I} value={citesPermiso} onChange={(e) => setCitesPermiso(e.target.value)}>
                        <option value="">Elige el permiso CITES…</option>
                        {permisosCites.map((p, i) => (
                          <option key={i} value={p.numero}>{p.especie} · {p.numero}{p.vencimiento ? ` (vence ${p.vencimiento})` : ""}</option>
                        ))}
                      </select>
                      {citesPermisoVencidoAlIngreso && permisoCitesSel && (
                        <p className="mt-2 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2.5 text-xs font-medium text-[var(--data-warning-700)]">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>El permiso <strong>{permisoCitesSel.numero}</strong> venció el {permisoCitesSel.vencimiento}, antes de la fecha de ingreso ({data.entryDate}). Verifica que exista una renovación vigente — un permiso vencido al momento del ingreso debilita el respaldo legal del origen CITES.</span>
                        </p>
                      )}
                    </Field>
                  ) : (
                    <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2.5 text-xs font-medium text-[var(--data-error-700)]">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>No hay permisos CITES cargados en la Ficha del CTP. Carga el permiso de esta especie en «Ficha CTP» antes de registrar — sin permiso archivado, un ingreso CITES no tiene respaldo legal.</span>
                    </p>
                  )}
                </div>
              )}

                <Field span={6} label="Tipo de producto" required>
                  <select
                    value={data.productType}
                    onChange={(e) => update("productType", e.target.value)}
                    required
                    className={I}
                  >
                    {PRODUCT_TYPES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>
                <Field span={6} label="N° de piezas">
                  <input
                    type="number"
                    min="0"
                    value={data.pieces}
                    onChange={(e) => update("pieces", e.target.value)}
                    placeholder="35"
                    className={I}
                  />
                </Field>

              {/* (10) del formato. El libro SIEMPRE calcula en m³ (saldos,
                  invariantes, costeo): esto guarda lo que decía el documento
                  cuando vino declarado en otra unidad (ADR-311). */}
              {/* La "forma de presentación" del formato (ADR-314): cómo vino
                  físicamente la madera. La guía de SERFOR la declara —"TROZAS"—
                  y hasta ahora se perdía al registrar. */}
              <Field label="Forma de presentación" span={6} hint="Cómo vino: TROZAS, PIEZAS…">
                <select
                  value={data.presentacion}
                  onChange={(e) => update("presentacion", e.target.value)}
                  className={I}
                >
                  <option value="">Sin declarar</option>
                  {PRESENTACIONES_LOCTP.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Unidad de medida"
                casillero={11}
                span={6}
                hint="El libro calcula en m³ igual: esto conserva lo que decía el documento."
              >
                <select
                  value={data.unit}
                  onChange={(e) => update("unit", e.target.value)}
                  className={I}
                >
                  {UNIDADES_LOCTP.map((u) => (
                    <option key={u.valor} value={u.valor}>{u.label}</option>
                  ))}
                </select>
              </Field>

              <Field span={12}
                label="Volumen total (m³)"
                required
                hint="Precisión 4 decimales (estándar SERFOR)"
              >
                <div className="sm:col-span-12 relative">
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={data.volumeM3}
                    onChange={(e) => update("volumeM3", e.target.value)}
                    aria-label="Volumen total en metros cúbicos"
                    placeholder="0.0000"
                    required
                    className={`${I} pr-32 font-mono tabular-nums`}
                  />
                  {autoVolume > 0 && data.productType === "rolliza" && Number(data.volumeM3) !== autoVolume && (
                    <button
                      type="button"
                      onClick={() => update("volumeM3", autoVolume.toFixed(4))}
                      title="Aplicar cubicación π·r²·L·n"
                      className="absolute right-1.5 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg bg-[var(--data-success-100)] px-2.5 text-xs font-bold text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-100)]"
                    >
                      <Sparkles className="h-3 w-3" />
                      {fmtM3(autoVolume)}
                    </button>
                  )}
                </div>
                {cubicajeDivergente && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-medium text-[var(--data-warning-700)]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>El volumen declarado ({Number(data.volumeM3).toFixed(2)} m³) difiere más de 15% del cubicaje calculado ({autoVolume.toFixed(2)} m³). Verifica las medidas o justifica la diferencia en Observaciones (obligatorio).</span>
                  </p>
                )}
              </Field>
                <Field span={4} label="Largo prom. (m)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={data.avgLengthM}
                    onChange={(e) => update("avgLengthM", e.target.value)}
                    placeholder="6.50"
                    className={I}
                  />
                </Field>
                <Field span={4} label="Diám. prom. (cm)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={data.avgDiameterCm}
                    onChange={(e) => update("avgDiameterCm", e.target.value)}
                    placeholder="45.0"
                    className={I}
                  />
                </Field>
                <Field span={4} label="Humedad (%)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={data.humidityPct}
                    onChange={(e) => update("humidityPct", e.target.value)}
                    placeholder="22"
                    className={I}
                  />
                </Field>

            </Seccion>

            {/* ─── 3 · Lista de trozas, a ANCHO COMPLETO ───────────────
                Estaba dentro de «Especie y producto», que ocupa media pantalla:
                la tabla de piezas —diez columnas, con los códigos y las tres
                dimensiones— entraba en 500px y había que scrollearla de lado
                para ver la especie. Es la misma razón por la que la ficha de
                SERFOR se sacó de la columna.

                Y va JUNTO a la especie y antes del titular porque es el mismo
                momento del trabajo: se descarga el camión, se cuenta la pila y
                se marca. Lo del titular se copia después, con el papel. */}
            <Seccion
              numero={3}
              title="Lista de trozas"
              hint={
                trozasManuales.length > 0
                  ? `${trozasManuales.length} pieza(s) · ${fmtM3(trozasManuales.reduce((a, t) => a + (t.volumenM3 ?? 0), 0))} m³`
                  : "La que acompaña a la guía (casillero 35)"
              }
              className="xl:col-span-2"
            >
              {/* La lista normalmente viene de SERFOR; cuando el servicio no
                  responde o el detalle llegó en un Excel, se pega acá en vez de
                  tipear ochenta filas o quedarse sin trozas. */}
              <div className="sm:col-span-12 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
                <Btn size="sm" variant="secondary" onClick={() => setImportarTrozas(true)}>
                  <ClipboardList className="h-4 w-4" />
                  {trozasManuales.length ? "Cambiar la lista de trozas" : "Pegar lista de trozas"}
                </Btn>
                {trozasManuales.length === 0 && (
                  <span className="text-sm text-[var(--text-secondary)]">
                    Sin lista, el ingreso entra igual — pero después no se puede cruzar pieza por pieza contra el POA.
                  </span>
                )}
                {trozasManuales.length > 0 && (
                  <>
                    <span className="text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      {trozasManuales.length} troza(s) · {fmtM3(trozasManuales.reduce((a, t) => a + (t.volumenM3 ?? 0), 0))} m³
                    </span>
                    <button
                      type="button"
                      onClick={() => setTrozasManuales([])}
                      className="text-sm font-medium text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]"
                    >
                      Quitar
                    </button>
                  </>
                )}
              </div>

              {/* Qué llegó, cuándo llegó, con qué código y cuánto entra de
                  verdad. Va acá y no en una pantalla de «recepción» posterior
                  porque el que descarga el camión lo sabe AHORA — y lo que se
                  pospone no se hace. */}
              {trozasManuales.length > 0 && (
                <div className="sm:col-span-12">
                  <CtpPiezasDelIngreso
                    trozas={trozasManuales}
                    onChange={setTrozasManuales}
                    /* El default razonable para «cuándo bajó del camión»: lo que
                       ya se declaró como recepción del ingreso y, si no, el día
                       del ingreso al libro. */
                    fechaSugerida={data.fechaRecepcion || data.entryDate}
                  />
                </div>
              )}
            </Seccion>

            {/* ─── 4 · Titular ─────────────────────────────────────── */}
            <Seccion numero={4} title="Titular habilitante" estado={estadoSeccion.titular}>
              {/* La libreta del CTP (ADR-317): el mismo titular trae madera todo
                  el año y su nombre entraba escrito distinto cada vez. */}
              <div className="sm:col-span-12">
                <CtpParteBarra
                  rol="proveedor"
                  valor={{
                    nombre: data.providerName,
                    docTipo: (data.providerDocumentType || "RUC") as DocTipo,
                    docNumero: data.providerDocument,
                    direccion: "",
                  }}
                  opciones={directorio.porRol("proveedor")}
                  onAplicar={(v) => {
                    if (v.nombre !== undefined) update("providerName", v.nombre);
                    if (v.docNumero !== undefined) update("providerDocument", v.docNumero);
                    if (v.docTipo !== undefined) update("providerDocumentType", v.docTipo);
                  }}
                  onElegir={(parte) => {
                    partesUsadas.current.add(parte.id);
                    // El título habilitante del proveedor propone el código de
                    // origen, pero SÓLO si está vacío: lo tipeado manda.
                    if (parte.tituloHabilitante) {
                      setData((prev) => (prev.originCode ? prev : { ...prev, originCode: parte.tituloHabilitante ?? "" }));
                    }
                  }}
                  onGuardar={async (v) => {
                    const parte = await directorio.guardarParte({
                      roles: ["proveedor"],
                      nombre: v.nombre,
                      docTipo: v.docTipo,
                      docNumero: v.docNumero,
                      // El código de origen del ingreso ES el título con el que
                      // extrae: se guarda con el proveedor para la próxima guía.
                      tituloHabilitante: data.originCode.trim() || undefined,
                    });
                    partesUsadas.current.add(parte.id);
                  }}
                />
              </div>
              <Field span={12} label="Nombre o razón social" required>
                <input
                  type="text"
                  value={data.providerName}
                  onChange={(e) => update("providerName", e.target.value)}
                  placeholder="Concesión Forestal X"
                  required
                  className={I}
                />
                {/* La madera que ya estaba antes de abrir el libro no tiene
                    titular que la venda: se declara como existencia de apertura.
                    Eso YA se podía hacer —el importador SERFOR lo hace— pero a
                    mano había que escribir la cadena exacta, y el reconocimiento
                    es por comparación estricta (`CtpGuiasTable`): un typo, una
                    mayúscula de más, y la guía dejaba de contar como apertura
                    sin ningún error visible. Acá se pone sola. */}
                <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={data.providerName === PROVEEDOR_INVENTARIO_APERTURA}
                    onChange={(e) =>
                      update("providerName", e.target.checked ? PROVEEDOR_INVENTARIO_APERTURA : "")
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span>
                    Es <b className="font-bold text-[var(--text-primary)]">existencia de apertura</b>: madera que ya
                    estaba en el patio antes de abrir el libro. Su guía y su permiso se cargan igual; lo que no hay es
                    un titular que la venda.
                  </span>
                </label>
              </Field>
                <Field span={4} label="Tipo doc">
                  <select
                    value={data.providerDocumentType}
                    onChange={(e) => update("providerDocumentType", e.target.value)}
                    className={I}
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>
                <Field span={8} label="Número">
                  <input
                    type="text"
                    value={data.providerDocument}
                    onChange={(e) => update("providerDocument", e.target.value)}
                    placeholder={data.providerDocumentType === "RUC" ? "20XXXXXXXXX" : "Documento"}
                    className={I}
                  />
                </Field>
            </Seccion>

            {/* ─── 5 · Origen ──────────────────────────────────────── */}
            <Seccion numero={5} title="Origen del material" estado={estadoSeccion.origen}>
                <Field span={6} label="Tipo de origen" required>
                  <select
                    value={data.originType}
                    onChange={(e) => update("originType", e.target.value)}
                    required
                    className={I}
                  >
                    {ORIGIN_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                <Field span={6} label="Código de origen" casillero={9} hint="El código con el que salió del bosque">
                  <input
                    type="text"
                    value={data.originCode}
                    onChange={(e) => update("originCode", e.target.value)}
                    placeholder="N° concesión o predio"
                    className={I}
                  />
                </Field>
                <div className="sm:col-span-12">
                  <SelectorContrato
                    id="wood-entry-contrato"
                    value={data.contratoId}
                    onChange={(contratoId) => update("contratoId", contratoId)}
                    codigoSugerido={data.originCode}
                  />
                </div>
                <Field span={6} label="N° fuente de origen" casillero={5} hint="De qué fuente viene la madera (Apartado 1)">
                  <input
                    type="text"
                    value={data.originSourceNumber}
                    onChange={(e) => update("originSourceNumber", e.target.value)}
                    placeholder="RD-SD-549"
                    className={`${I} font-mono`}
                  />
                </Field>
                <Field span={6} label="Código que asigna el CTP" casillero={10} hint="El que tú le pones a la troza o al paquete">
                  <input
                    type="text"
                    value={data.ctpProductCode}
                    onChange={(e) => update("ctpProductCode", e.target.value)}
                    placeholder="T-0142 / PQ-08"
                    className={`${I} font-mono`}
                  />
                </Field>
                <Field span={6} label="Región">
                  <select
                    value={data.originRegion}
                    onChange={(e) => update("originRegion", e.target.value)}
                    className={I}
                  >
                    {REGIONS_PE.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field span={6} label="Distrito">
                  <input
                    type="text"
                    value={data.originDistrict}
                    onChange={(e) => update("originDistrict", e.target.value)}
                    className={I}
                  />
                </Field>
            </Seccion>

            {/* ─── 5 · El cuerpo del documento (13 a 36) ───────────────
                Propietario del producto, destinatario, transportista y los
                casilleros sueltos del formato. Va PLEGADO: son veinte campos
                que el alta rápida no toca, pero que un fiscalizador pregunta —
                y hasta ahora, cargando a mano, no había dónde escribirlos.

                Se despliega solo cuando ya hay algo cargado (la consulta a
                SERFOR los trae): esconder datos que existen sería peor que
                pedirlos. */}
            <div className="xl:col-span-2">
              <Seccion numero={6} title="Datos del documento" hint="Propietario del producto · destinatario · transporte">
                <div className="sm:col-span-12">
                  <button
                    type="button"
                    onClick={() => setVerGuiaOficial((v) => !v)}
                    aria-expanded={verGuiaOficial || Boolean(gtfDatos.propietario.nombre.trim())}
                    className="flex w-full items-center gap-2 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 min-h-11 text-left transition-colors hover:border-[var(--accent)]"
                  >
                    {verGuiaOficial ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[var(--text-primary)]">
                        {verGuiaOficial ? "Ocultar" : "Completar"} los casilleros 13 a 36 de la guía
                      </span>
                      <span className="block truncate text-xs text-[var(--text-secondary)]">
                        {gtfDatos.propietario.nombre.trim()
                          ? `Propietario: ${gtfDatos.propietario.nombre.trim()}${
                              gtfDatos.vehiculo.placa.trim() ? ` · ${gtfDatos.vehiculo.placa.trim()}` : ""
                            }`
                          : "Sin declarar — el dueño de la madera puede no ser el titular del título habilitante"}
                      </span>
                    </span>
                    {gtfDatos.propietario.nombre.trim() && (
                      <span className="shrink-0 rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                        cargado
                      </span>
                    )}
                  </button>
                </div>
                {verGuiaOficial && (
                  <div className="sm:col-span-12 xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-5">
                    <CtpGuiaOficialForm
                      datos={gtfDatos}
                      onChange={setGtfDatos}
                      directorio={directorio}
                      titular={{
                        nombre: data.providerName,
                        docTipo: data.providerDocumentType,
                        docNumero: data.providerDocument,
                      }}
                      ficha={ficha}
                    />
                  </div>
                )}
              </Seccion>
            </div>

            {/* ─── 7 · Observaciones ───────────────────────────────── */}
            <Seccion numero={7} title="Observaciones" estado={estadoSeccion.observaciones}>
              <Field span={6} label="Defectos visibles">
                <input
                  type="text"
                  value={data.defectsNotes}
                  onChange={(e) => update("defectsNotes", e.target.value)}
                  placeholder="ej: 3 piezas con nudos grandes"
                  className={I}
                />
              </Field>
              <Field span={12} label="Fotos del ingreso">
                <CtpFotosDelIngreso fotos={fotos} onCambio={setFotos} disabled={submitting} gtf={data.gtfNumber || null} />
              </Field>
              <Field span={6} label="Notas adicionales">
                <textarea
                  value={data.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                  placeholder="Cualquier observación útil..."
                  className={`${I} h-auto resize-none py-2.5`}
                />
              </Field>
            </Seccion>

            {/* ─── 8 · Costo ───────────────────────────────────────── */}
            <Seccion
              numero={8}
              title="Costo de la madera"
              hint="Opcional. Lo que pagaste por esta madera, por m³ o por pie tablar: el costo lo calcula y lo guarda el servidor al registrar. Vacío = sin costo."
            >
              <CtpPrecioDeLaMadera
                precio={precio}
                onCambio={setPrecio}
                lineas={[{ etiqueta: finalSpeciesName || "La madera", m3: Number(data.volumeM3) || 0 }]}
              />
            </Seccion>
            </div>

            {/* Lo que este negocio anota de un ingreso y el formato no pregunta
                (ADR-427). Sólo en el alta a mano: con la guía traída del SNIFFS
                el servidor crea UN ingreso por especie declarada, y no habría
                un registro al que colgarle la respuesta. */}
            {modo === "manual" && (
              <CamposPersonalizados
                className="mt-4"
                formulario={FORMULARIO}
                registroId={null}
                etiquetaFormulario="ingresos"
                pendientes={camposPendientes}
                onPendientes={setCamposPendientes}
              />
            )}
            </FormularioClaro>
          </form>

        </div>

      </div>
      {/* Los avisos viven DENTRO del modal (su `fixed` se ancla a la caja, que
          está trasladada), así que «abajo» era encima del pie: el de «Guía
          cargada desde SERFOR» tapaba «Registrar ingreso». Se suben por
          encima del pie con la variable que la pila ya respeta. */}
      <div style={{ "--pila-toasts-bottom": "6rem" } as React.CSSProperties}>
        <ActionToasts toasts={toasts} onDismiss={dismissToast} />
      </div>
      {importarTrozas && (
        <CtpTrozasImportModal
          especie={finalSpeciesName}
          especieCientifica={finalScientificName}
          volumenDeclarado={Number(data.volumeM3) || undefined}
          onAceptar={(t) => setTrozasManuales(t)}
          onClose={() => setImportarTrozas(false)}
        />
      )}
    </AdminModal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════





function CitesPill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-error-700)]">
      CITES
    </span>
  );
}

// ─── Estilos canonical ────────────────────────────────────────────────────
