"use client";

/**
 * CtpParteModal — alta y edición de una parte del directorio forestal (ADR-317).
 *
 * El formulario largo (todos los campos, todos los roles) vive acá; la guía usa
 * la barra rápida. Lo que hace útil a este modal es el botón de padrón: se tipea
 * el RUC y SUNAT devuelve razón social y domicilio fiscal — que es exactamente
 * lo que va en la guía y lo que nadie recuerda de memoria.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Loader2, MessageCircle, Save, Users } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { logger } from "@/lib/logger";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { ubigeoDeNombres } from "@/lib/peru-ubigeo";
import {
  completitud,
  estadoTitulo,
  motivoCciInvalido,
  pendientesDeFicha,
  tituloCubiertoPorPermisos,
  type ContextoDeFicha,
  type FichaParaSalud,
} from "@/lib/forestal/directorio-salud";
import {
  CATEGORIAS_PARTE,
  CATEGORIA_LABEL,
  DOC_TIPOS,
  ROLES_PARTE,
  ROL_DESCRIPCION,
  ROL_LABEL,
  CONDICIONES_PAGO,
  categoriaEfectiva,
  claveBusqueda,
  parteAInput,
  textoCondicionPago,
  fuenteAutocompletado,
  motivoDocInvalido,
  motivoRepresentanteDniInvalido,
  normalizarDocumento,
  partesParecidas,
  type CategoriaParte,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
  type Vehiculo,
} from "@/lib/forestal/directorio";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import { Btn, CampoGrid, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar, useCierreSeguro, useHayCambios } from "./ctp-shared";
import CamposPersonalizados, {
  guardarValoresPendientes as guardarCamposPendientes,
  pendientesVacios as camposVacios,
  type PendientesCampos,
} from "@/components/admin/shared/CamposPersonalizados";
import CtpPartePermisos, {
  guardarPermisosPendientes,
  type PermisoBorrador,
} from "./CtpPartePermisos";
import { SelectConOtra } from "./campos-elegibles";
import { TIPOS_PLAN_LISTA } from "@/lib/forestal/loth-tipos-plan";
import { opcionesEscritas } from "@/lib/forestal/permisos-de-parte";
import CtpParteLogo from "./CtpParteLogo";
import CtpPartePuntoAcopio from "./CtpPartePuntoAcopio";
import CtpParteBitacora from "./CtpParteBitacora";
import CtpParteAdjuntos from "./CtpParteAdjuntos";

/** Id estable de este formulario para los campos personalizados (ADR-427). */
const FORMULARIO_FICHA = "directorio.parte";

/** Los documentos de gestión de la norma — el casillero (9) de la guía. */
const DOCUMENTOS_DE_GESTION = TIPOS_PLAN_LISTA.map((t) => t.sigla);

/** Lo que el libro ya sabe de este proveedor, resumido para la ficha. */
interface HistorialDeCompras {
  guias: number;
  ingresadoM3: number;
  enPatioM3: number;
  /** Guías sin factura cargada: sin costo no hay margen que calcular (ADR-134). */
  guiasSinCosto: number;
  /** Con qué nombre lo escribieron las guías, si no es el de la ficha. */
  escritoComo: string | null;
}

interface RespuestaTrazabilidad {
  trazabilidad?: {
    balance?: { guias: number; ingresadoM3: number; enPatioM3: number; guiasSinCosto: number };
  };
  nombresEncontrados?: string[];
}

type Borrador = ParteInput & { id?: string };

/**
 * De ficha guardada a borrador del formulario.
 *
 * Usa `parteAInput`, que es la ÚNICA lista completa de campos de una parte. La
 * copia a mano que había acá se quedó corta apenas se agregaron campos: los
 * datos de pago y de contacto salían vacíos al editar y, como la edición con
 * `id` sí pisa con `null` lo que no llega, guardar los BORRABA. Es el mismo
 * patrón que costó dos rondas en RRHH con `PuestoInput`/`ColaboradorInput`.
 */
function aBorrador(p: Parte | null, rolInicial: RolParte): Borrador {
  if (!p) return { roles: [rolInicial], nombre: "", categoria: "ccnn", docTipo: "RUC" };
  return {
    ...parteAInput(p),
    roles: p.roles.length ? p.roles : [rolInicial],
    categoria: categoriaEfectiva(p.categoria),
    docTipo: p.docTipo ?? "RUC",
    logo: p.logo ?? "",
    adjuntos: p.adjuntos ?? [],
  };
}

export default function CtpParteModal({
  parte,
  rolInicial,
  existentes = [],
  vehiculos: vehiculosDeLaLibreta = [],
  onUsarExistente,
  onGuardar,
  onClose,
  aboveModals = false,
}: {
  /** `null` = alta. */
  parte: Parte | null;
  rolInicial: RolParte;
  /** La libreta de vehículos ya cargada, para listar los de este transportista. */
  vehiculos?: readonly Vehiculo[];
  /**
   * Resolver el duplicado en un clic: el aviso de «ficha parecida» deja de ser
   * sólo una advertencia y pasa a ofrecer la existente. Sin esto, evitar el
   * duplicado costaba cancelar, reabrir el picker y buscarla a mano.
   */
  onUsarExistente?: (p: Parte) => void;
  /** El resto de la libreta — para avisar si el documento ya es de otra ficha
   *  (el problema #1 que este módulo existe para evitar: "MADERERA DEL
   *  ORIENTE SAC" y "Maderera del Oriente" como dos filas distintas). */
  existentes?: Parte[];
  /**
   * Guarda y **devuelve la ficha guardada**: el modal la necesita para colgarle
   * los permisos que se cargaron durante el alta, cuando todavía no había id
   * (ADR-425). El padre ya no cierra el modal — lo cierra él mismo cuando
   * terminó de guardar todo.
   */
  onGuardar: (input: Borrador) => Promise<Parte | void>;
  onClose: () => void;
  /**
   * Se abre ENCIMA de otro modal: «Crear cuenta nueva» desde «Declarar
   * producción» (ADR-429). Sin esto se monta detrás y Radix apaga los clics de
   * toda la página (ver `AdminModal`).
   */
  aboveModals?: boolean;
}) {
  const [b, setB] = useState<Borrador>(() => aBorrador(parte, rolInicial));
  const [copiado, setCopiado] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "consultando" | "guardando">("idle");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Permisos cargados durante el ALTA: se crean cuando la ficha tiene id. */
  const [permisosPendientes, setPermisosPendientes] = useState<PermisoBorrador[]>([]);
  /* Campos personalizados cargados durante el ALTA: como los permisos, esperan
     el id de la ficha (ADR-427). */
  const [camposPendientes, setCamposPendientes] = useState<PendientesCampos>(() => camposVacios(FORMULARIO_FICHA));
  /**
   * Cuántos permisos tiene este titular, según la sección que los lista.
   *
   * La barra de salud reclamaba el «título habilitante» aunque abajo hubiera
   * dos permisos vigentes con su área y su vigencia (ADR-425). El dato lo tiene
   * `CtpPartePermisos` —es quien monta `usePermisosForestal`—, así que lo sube
   * por callback: pedir la lista otra vez acá serían dos GET al mismo endpoint
   * para el mismo número.
   */
  const [permisosDelTitular, setPermisosDelTitular] = useState(0);

  const docTipo = (b.docTipo ?? "RUC") as DocTipo;
  const fuente = fuenteAutocompletado(docTipo);
  const docMal = motivoDocInvalido(docTipo, b.docNumero ?? "");
  const dniRepresentanteMal = motivoRepresentanteDniInvalido(b.representanteDni ?? "");
  const set = (v: Partial<Borrador>) => setB((p) => ({ ...p, ...v }));

  /**
   * Otra ficha con el MISMO documento — el problema #1 que este módulo existe
   * para evitar ("MADERERA DEL ORIENTE SAC" y "Maderera del Oriente" como dos
   * filas). Al AGREGAR, el servidor ya fusiona los roles solo (mismo criterio
   * que la placa del vehículo); acá sólo se avisa, sin bloquear. Al EDITAR una
   * ficha existente hacia un documento que YA es de otra, no hay fusión del
   * lado del servidor — ahí sí bloquea, como el duplicado de placa.
   */
  const docNorm = normalizarDocumento(b.docNumero ?? "");
  const coincide = useMemo(
    () =>
      docNorm && !docMal
        ? (existentes.find((p) => p.docTipo === docTipo && normalizarDocumento(p.docNumero ?? "") === docNorm && p.id !== b.id) ?? null)
        : null,
    [existentes, docTipo, docNorm, docMal, b.id],
  );
  const coincideBloquea = Boolean(coincide && b.id);

  /**
   * Retirar una ficha no exige que sus papeles estén bien.
   *
   * Medido en el navegador: la ficha «QA Aserrío» tenía el RUC con el dígito
   * verificador mal y **no se podía dar de baja** — la validación que evita
   * cargar un documento inventado terminaba defendiendo a la ficha basura que
   * uno justamente quiere sacar de los selectores. Al desactivar se pide sólo
   * el nombre; lo ya emitido con esa parte no cambia.
   */
  const dandoDeBaja = b.activo === false && parte?.activo !== false;

  /**
   * El otro duplicado: el que el documento no caza.
   *
   * Una parte sin RUC —comunidades y compradores informales, que son muchos—
   * podía entrar dos veces sin que nada avisara. Se compara el núcleo del
   * nombre (sin la forma societaria, que es lo que la gente omite al tipear).
   * Avisa y no bloquea: dos aserraderos del mismo dueño pueden llamarse
   * parecido y ser dos fichas legítimas.
   */
  const parecidas = useMemo(
    () => (coincide ? [] : partesParecidas(b.nombre ?? "", existentes, { excluirId: b.id ?? null })),
    [b.nombre, b.id, existentes, coincide],
  );

  function alternarRol(rol: RolParte) {
    const tiene = b.roles.includes(rol);
    // Siempre queda al menos uno: una parte sin rol no aparece en ninguna lista
    // y se vuelve invisible desde la UI.
    if (tiene && b.roles.length === 1) return;
    set({ roles: tiene ? b.roles.filter((r) => r !== rol) : [...b.roles, rol] });
  }

  async function traerDelPadron() {
    setEstado("consultando");
    setError(null);
    setAviso(null);
    try {
      const datos = await consultarDocumento(docTipo, b.docNumero ?? "");
      if (!datos) {
        setError(`No se encontró el ${docTipo} en ${fuente}.`);
        return;
      }
      set({
        nombre: datos.nombre,
        direccion: datos.direccion ?? b.direccion,
        region: datos.region ?? b.region,
        provincia: datos.provincia ?? b.provincia,
        distrito: datos.distrito ?? b.distrito,
        ubigeo: datos.ubigeo ?? b.ubigeo,
      });
      setAviso(
        datos.estado && datos.estado.toUpperCase() !== "ACTIVO"
          ? `Traído de ${fuente}. Ojo: figura ${datos.estado}.`
          : `Traído de ${fuente}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("idle");
    }
  }

  async function guardar() {
    if (b.nombre.trim().length < 2) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (docMal && !dandoDeBaja) {
      setError(docMal);
      return;
    }
    if (dniRepresentanteMal && !dandoDeBaja) {
      setError(dniRepresentanteMal);
      return;
    }
    if (coincideBloquea && coincide && !dandoDeBaja) {
      setError(`Ese documento ya lo tiene ${coincide.nombre}. Edita esa ficha en vez de repetir el documento acá.`);
      return;
    }
    setEstado("guardando");
    setError(null);
    try {
      const guardada = await onGuardar(b);
      /* Los permisos del alta se crean recién acá: antes no había id al que
         colgarlos. Si alguno falla, la ficha YA está guardada — se avisa y el
         modal queda abierto con la lista, en vez de perderlos en silencio. */
      const idFicha = guardada?.id ?? b.id ?? null;
      if (permisosPendientes.length > 0 && idFicha) {
        const r = await guardarPermisosPendientes(
          { id: idFicha, nombre: guardada?.nombre ?? b.nombre, docTipo: b.docTipo, docNumero: b.docNumero },
          permisosPendientes,
        );
        setPermisosPendientes([]);
        if (r.errores.length > 0) {
          setError(`La ficha se guardó. Sus permisos: ${r.errores.join(" · ")}`);
          setEstado("idle");
          return;
        }
      }
      /* Los campos personalizados del alta se guardan cuando la ficha ya tiene
         id, igual que los permisos. Si fallan, la ficha YA está guardada. */
      if (idFicha) {
        const rc = await guardarCamposPendientes(idFicha, camposPendientes);
        if (rc.errores.length > 0) {
          setError(`La ficha se guardó. Sus campos personalizados: ${rc.errores.join(" · ")}`);
          setEstado("idle");
          return;
        }
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("idle");
    }
  }

  const esTransportista = b.roles.includes("transportista");
  const esConductor = b.roles.includes("conductor");
  const esProveedor = b.roles.includes("proveedor");
  const categoriaProveedor = categoriaEfectiva(b.categoria as CategoriaParte | null | undefined);

  /**
   * «Según el papel» sólo aparece para ciertos roles, y con los números fijos el
   * formulario mostraba 01·02·03·05: el operador buscaba una sección 04 que no
   * existía. Se numeran las que de verdad se pintan.
   */
  const hayPapel = esTransportista || esConductor || esProveedor;
  const base = hayPapel ? 4 : 3;
  const nro = {
    roles: 1,
    identidad: 2,
    donde: 3,
    papel: 4,
    pago: base + 1,
    logo: base + 2,
    notas: base + 3,
  };

  // Qué le falta a esta ficha para servir en los papeles que cumple.
  const contextoSalud: ContextoDeFicha = { permisos: permisosDelTitular };
  const pendientes = pendientesDeFicha(b as FichaParaSalud, contextoSalud);
  const listo = completitud(b as FichaParaSalud, contextoSalud);
  /** Si el título dejó de reclamarse porque sus permisos lo cubren, por qué. */
  const tituloEnPermisos = tituloCubiertoPorPermisos(b as FichaParaSalud, contextoSalud);
  const cciMal = motivoCciInvalido(b.cuentaCci);
  const vigencia = estadoTitulo(b.tituloVigenciaHasta || null);
  /* Las autoridades que la libreta ya tiene escritas, para no escribir la misma
     de tres formas (pasó: «GERFOR Ucayali» vs «ATFFS SELVA CENTRAL» vs la misma
     con su sede). */
  const arffsDeLaLibreta = useMemo(
    () => opcionesEscritas([...existentes.map((p) => p.arffs), b.arffs]),
    [existentes, b.arffs],
  );

  /**
   * Los vehículos de ESTE transportista.
   *
   * Existen desde siempre y tienen su propia pestaña en el Directorio, pero la
   * ficha del transportista no los mencionaba: había que acordarse de ir a
   * «Vehículos» y filtrar por dueño. Acá se listan en lectura —el alta sigue
   * siendo la de esa pestaña, que ya valida placas duplicadas— para que la
   * ficha conteste «con qué camiones trabaja este».
   */
  /**
   * Resumen de lo que pasó con este proveedor.
   *
   * El detalle completo ya existe (`CtpProveedorTrazaModal`, ADR-319) pero se
   * abre sólo desde la pantalla del Directorio. Acá va el RESUMEN, no otro
   * modal: esta ficha suele abrirse desde un picker que a su vez está dentro de
   * otro modal, y un cuarto nivel de ventana es justo lo que la regla de
   * modales anidados dice evitar.
   */
  const [historial, setHistorial] = useState<HistorialDeCompras | null>(null);
  useEffect(() => {
    const nombre = (parte?.nombre ?? "").trim();
    if (!nombre || !parte?.roles?.includes("proveedor")) return;
    let vivo = true;
    fetch(`/api/admin/forestal/directorio/trazabilidad?proveedor=${encodeURIComponent(nombre)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: RespuestaTrazabilidad | null) => {
        // El balance viaja DENTRO de `trazabilidad`; leerlo un nivel más arriba
        // devolvía `undefined` sin error y la ficha no mostraba nada.
        const b = j?.trazabilidad?.balance;
        if (!vivo || !b) return;
        const escritos = (j?.nombresEncontrados ?? []).filter(
          (n) => claveBusqueda(n) !== claveBusqueda(nombre),
        );
        setHistorial({
          guias: b.guias,
          ingresadoM3: b.ingresadoM3,
          enPatioM3: b.enPatioM3,
          guiasSinCosto: b.guiasSinCosto,
          escritoComo: escritos[0] ?? null,
        });
      })
      .catch((err) => {
        // El historial es contexto, no el trabajo: si falla, la ficha se edita igual.
        logger.warn("[directorio] historial del proveedor no disponible", { error: String(err) });
      });
    return () => {
      vivo = false;
    };
  }, [parte?.nombre, parte?.roles]);

  /** Copiar un dato para pegarlo en la web del banco o en un WhatsApp. */
  const copiar = (valor: string, cual: string) => {
    navigator.clipboard
      .writeText(valor)
      .then(() => {
        setCopiado(cual);
        window.setTimeout(() => setCopiado(null), 1600);
      })
      .catch((err) => logger.warn("[directorio] no se pudo copiar", { error: String(err) }));
  };

  const susVehiculos = useMemo(
    () => (b.id ? vehiculosDeLaLibreta.filter((v) => v.transportistaId === b.id && v.activo) : []),
    [b.id, vehiculosDeLaLibreta],
  );
  /**
   * `wa.me` quiere el número sin signos y con código de país. Un celular
   * peruano de 9 dígitos se asume +51: es lo que hay en el 99 % de las fichas,
   * y si alguien carga el código completo se respeta.
   */
  const whatsappLink = (() => {
    const n = (b.whatsapp ?? "").replace(/\D/g, "");
    if (!n) return null;
    const conPais = n.length === 9 ? `51${n}` : n;
    return conPais.length >= 10 ? `https://wa.me/${conPais}` : null;
  })();

  const bodyRef = useAtajoGuardar(() => void guardar(), estado === "idle");
  /* Un permiso cargado y todavía sin crear también es algo que perder: sin
     contarlo, cerrar de un roce se llevaba la lista sin preguntar. */
  const cerrar = useCierreSeguro(
    (useHayCambios(b) || permisosPendientes.length > 0) && estado !== "guardando",
    onClose,
  );

  return (
    <AdminModal
      open
      onClose={cerrar}
      aboveModals={aboveModals}
      title={parte ? `Editar ${parte.nombre}` : "Agregar al directorio"}
      description={b.roles.map((r) => ROL_LABEL[r]).join(" · ")}
      icon={Users}
      variant="info"
      footer={
        <ModalFooter
          error={error}
          aviso={aviso}
          nota={coincide && !coincideBloquea ? `Ese documento ya es de ${coincide.nombre} — al guardar se combina con esa ficha, no se crea una nueva.` : undefined}
          atajo
        >
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn variant="primary" disabled={estado === "guardando" || (coincideBloquea && !dandoDeBaja)} onClick={() => void guardar()}>
            {estado === "guardando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={bodyRef}>
        {historial && historial.guias > 0 && (
          <div className="col-span-12 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-info-700)]">
              Lo que compraste
            </span>
            <span className="text-sm text-[var(--text-primary)]">
              <b className="font-mono tabular-nums">{historial.guias}</b> guía{historial.guias === 1 ? "" : "s"}
            </span>
            <span className="text-sm text-[var(--text-primary)]">
              <b className="font-mono tabular-nums">{Number(historial.ingresadoM3).toFixed(2)}</b> m³ ingresados
            </span>
            <span className="text-sm text-[var(--text-primary)]">
              <b className="font-mono tabular-nums">{Number(historial.enPatioM3).toFixed(2)}</b> m³ todavía en patio
            </span>
            {historial.guiasSinCosto > 0 && (
              <span className="text-sm text-[var(--data-warning-700)]">
                <b className="font-mono tabular-nums">{historial.guiasSinCosto}</b> sin factura cargada
              </span>
            )}
            {historial.escritoComo && (
              <span className="w-full text-xs text-[var(--text-tertiary)]">
                En las guías está escrito «{historial.escritoComo}» — es el mismo titular con otro nombre.
              </span>
            )}
          </div>
        )}

        {/* Qué le falta a esta ficha para servir. No bloquea: es una lista de
            pendientes, que es lo contrario de un formulario que no deja guardar. */}
        <div className="col-span-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {listo === 100 ? "Ficha completa para lo que hace" : `Ficha al ${listo}%`}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {pendientes.length === 0
                ? "No falta nada de lo que piden estos papeles"
                : `${pendientes.length} dato${pendientes.length === 1 ? "" : "s"} por cargar`}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            role="progressbar"
            aria-valuenow={listo}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Qué parte de la ficha está cargada"
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                listo === 100 ? "bg-[var(--data-success-500)]" : listo >= 60 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"
              }`}
              style={{ width: `${Math.max(4, listo)}%` }}
            />
          </div>
          {pendientes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {pendientes.slice(0, 4).map((x) => (
                <li key={x.campo} className="flex items-start gap-1.5 text-xs">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      x.nivel === "alto" ? "bg-[var(--data-error-500)]" : "bg-[var(--data-warning-500)]"
                    }`}
                  />
                  <span className="text-[var(--text-secondary)]">
                    <b className="text-[var(--text-primary)]">{x.campo}</b> — {x.porque}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* Un pendiente que desaparece en silencio confunde tanto como uno de
              más: se dice por qué dejó de pedirse. */}
          {tituloEnPermisos && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--data-success-700)]">
              <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{tituloEnPermisos}</span>
            </p>
          )}
        </div>

        {/* A partir de `lg` las secciones se reparten en 2 columnas: chips,
            identidad y «Según el papel» (ahí entra la tabla de permisos que se
            agrega después) necesitan el ancho entero y van con `lg:col-span-2`;
            «Dónde está» —la más alta: dirección, ubigeo, 2 teléfonos, 2
            contactos, email— va SOLA en una columna frente a «Cómo se le paga»
            + «Logo y papeles del titular» + «Notas» apiladas en la otra, para
            que las dos columnas queden de altura parecida. */}
        <div className="grid grid-cols-1 gap-x-6 items-start lg:grid-cols-2">
        <Seccion numero={nro.roles} title="Qué papel cumple" hint="Se puede marcar más de uno" className="lg:col-span-2">
          <div className="sm:col-span-12 flex flex-wrap gap-2">
            {ROLES_PARTE.map((rol) => {
              const on = b.roles.includes(rol);
              return (
                <button
                  key={rol}
                  type="button"
                  aria-pressed={on}
                  title={ROL_DESCRIPCION[rol]}
                  onClick={() => alternarRol(rol)}
                  className={`inline-flex h-11 items-center rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {ROL_LABEL[rol]}
                </button>
              );
            })}
          </div>
        </Seccion>

        <Seccion numero={nro.identidad} title="Identidad" className="lg:col-span-2">
          <Field label="Tipo de documento" span={3}>
            <select className={I} value={docTipo} onChange={(e) => set({ docTipo: e.target.value as DocTipo })}>
              {DOC_TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field
            label="N° de documento"
            span={4}
            hint={docMal ?? (coincideBloquea ? "Ya es de otra ficha" : coincide ? "Ya existe — se va a combinar" : undefined)}
          >
            <input
              type="text"
              aria-invalid={coincideBloquea ? true : undefined}
              className={`${I} font-mono ${coincideBloquea ? "border-[var(--data-error-500)]" : ""}`}
              value={b.docNumero ?? ""}
              onChange={(e) => set({ docNumero: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-5 flex items-end">
            {fuente && (
              <Btn variant="secondary" disabled={!!docMal || !b.docNumero || estado !== "idle"} onClick={() => void traerDelPadron()}>
                {estado === "consultando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Traer de {fuente}
              </Btn>
            )}
          </div>
          <Field label="Nombre o razón social" required span={12}>
            <input type="text" className={I} value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} />
          </Field>

          {parecidas.length > 0 && (
            <div className="col-span-12 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
              <p className="font-bold">
                {parecidas.length === 1 ? "Ya hay una ficha parecida" : `Ya hay ${parecidas.length} fichas parecidas`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {parecidas.slice(0, 3).map((p) => (
                  <li key={p.id ?? p.nombre} className="truncate">
                    · {p.nombre}
                    {p.docNumero ? ` — ${p.docTipo ?? "Doc"} ${p.docNumero}` : " — sin documento"}
                  </li>
                ))}
              </ul>
              {onUsarExistente && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {parecidas.slice(0, 3).map((p) => (
                    <button
                      key={`usar-${p.id ?? p.nombre}`}
                      type="button"
                      onClick={() => onUsarExistente(p as Parte)}
                      className="inline-flex min-h-8 items-center rounded-lg border border-[var(--data-warning-500)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--data-warning-700)] transition-colors hover:bg-[var(--data-warning-100)]"
                    >
                      Usar «{p.nombre.slice(0, 26)}»
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 opacity-90">
                {onUsarExistente
                  ? "Si es la misma, tocá el botón y seguimos con esa. Si de verdad son dos, seguí cargando: esto es sólo un aviso."
                  : "Si es la misma, cancela y edita la que ya existe. Si de verdad son dos, sigue: esto es sólo un aviso."}
              </p>
            </div>
          )}
        </Seccion>

        {(esTransportista || esConductor || esProveedor) && (
          <Seccion numero={nro.papel} title="Según el papel" className="lg:col-span-2">
            {esTransportista && (
              <>
              {susVehiculos.length > 0 && (
                <div className="col-span-12 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
                  <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Sus vehículos
                  </span>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {susVehiculos.map((v) => (
                      <li
                        key={v.id}
                        className="rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)]"
                        title={[v.marca, v.tipo, v.capacidadM3 ? `${v.capacidadM3} m³` : null].filter(Boolean).join(" · ")}
                      >
                        {v.placa}
                        {v.placaRemolque && <span className="text-[var(--text-tertiary)]"> + {v.placaRemolque}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Se dan de alta en Directorio → Vehículos, que valida las placas repetidas.
                  </p>
                </div>
              )}
              <Field label="Registro MTC" span={4} hint="Si es empresa de transporte">
                <input type="text" className={I} value={b.registroMtc ?? ""} onChange={(e) => set({ registroMtc: e.target.value })} />
              </Field>
              </>
            )}
            {esConductor && (
              <Field label="Licencia de conducir" span={4} hint="Es lo que pide el puesto de control">
                <input type="text" className={`${I} font-mono`} value={b.licencia ?? ""} onChange={(e) => set({ licencia: e.target.value })} />
              </Field>
            )}
            {esProveedor && (
              <>
                <div className="sm:col-span-12">
                  <span className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Categoría</span>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_PARTE.map((cat) => {
                      const on = categoriaProveedor === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ categoria: cat })}
                          className={`inline-flex h-10 items-center rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors ${
                            on
                              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                          }`}
                        >
                          {CATEGORIA_LABEL[cat]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Decide qué pide este bloque: una CCNN extrae con título habilitante, un aserradero tiene su propio Código de CTP.
                  </p>
                </div>
                {categoriaProveedor === "ccnn" && (
                  <>
                    <Field label="Título habilitante" span={4} hint="Permiso, concesión o plantación con la que extrae">
                      <input type="text" className={I} value={b.tituloHabilitante ?? ""} onChange={(e) => set({ tituloHabilitante: e.target.value })} />
                    </Field>
                    {/* Los tres casilleros que la guía pide del titular y que, sin
                        esto, había que tipear en cada guía: (8) resolución, (9)
                        plan de manejo y (2) autoridad. */}
                    <Field label="N° de resolución" span={4} hint="Casillero (8) de la GTF">
                      <input type="text" className={I} value={b.resolucion ?? ""} onChange={(e) => set({ resolucion: e.target.value })} />
                    </Field>
                    <Field label="Plan de manejo" span={4} hint="Casillero (9) — el documento con el que aprovecha">
                      {/* Lista y no texto libre: son los documentos de gestión de
                          la norma (`loth-tipos-plan`), los mismos que ofrece el
                          alta de plan del Libro TH. */}
                      <SelectConOtra
                        className={I}
                        valor={b.planManejo ?? ""}
                        opciones={DOCUMENTOS_DE_GESTION}
                        textoOtra="Otro documento…"
                        placeholder="DEMA"
                        onCambio={(v) => set({ planManejo: v })}
                      />
                    </Field>
                    {/* Comprarle a alguien con el título vencido invalida la GTF
                      que se emita con esa madera: es un dato de riesgo. */}
                  <Field
                    label="Su título vence el"
                    span={6}
                    hint={vigencia.nivel === "sin_dato" ? "Para que el sistema avise antes de comprarle" : vigencia.texto}
                  >
                    <input
                      type="date"
                      className={`${I} ${
                        vigencia.tono === "danger"
                          ? "border-[var(--data-error-500)]"
                          : vigencia.tono === "warn"
                            ? "border-[var(--data-warning-500)]"
                            : ""
                      }`}
                      value={(b.tituloVigenciaHasta ?? "").slice(0, 10)}
                      onChange={(e) => set({ tituloVigenciaHasta: e.target.value })}
                    />
                  </Field>
                  {vigencia.nivel === "vencido" && (
                    <p className="col-span-12 rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] px-3 py-2 text-xs font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
                      {vigencia.texto}. Pídele la renovación antes de registrar un ingreso con su guía.
                    </p>
                  )}
                  <Field label="ARFFS competente" span={6} hint="Casillero (2) — la autoridad regional del titular">
                    {/* De lo ya escrito en la libreta: la misma autoridad estaba
                        cargada de tres formas distintas entre fichas y permisos. */}
                    <SelectConOtra
                      className={I}
                      valor={b.arffs ?? ""}
                      opciones={arffsDeLaLibreta}
                      textoOtra="Otra autoridad…"
                      placeholder="ATFFS Selva Central"
                      onCambio={(v) => set({ arffs: v })}
                    />
                  </Field>
                  </>
                )}
                {categoriaProveedor === "aserradero" && (
                  <Field label="Código de CTP" span={6} hint="El código que le dio ARFFS a SU planta, no la nuestra">
                    <input type="text" className={`${I} font-mono`} value={b.codigoCtp ?? ""} onChange={(e) => set({ codigoCtp: e.target.value })} />
                  </Field>
                )}
                <Field label="Representante legal" span={6} hint="El que firma; cuelga del (7)">
                  <input type="text" className={I} value={b.representante ?? ""} onChange={(e) => set({ representante: e.target.value })} />
                </Field>
                <Field label="DNI del representante" span={6} hint={dniRepresentanteMal ?? "El jefe de la comunidad o el gerente que firma"}>
                  <input
                    type="text"
                    className={`${I} font-mono`}
                    value={b.representanteDni ?? ""}
                    onChange={(e) => set({ representanteDni: e.target.value })}
                  />
                </Field>
                {/* Los campos de arriba guardan UN papel — el último que alguien
                    escribió. Acá van TODOS los que maneja el titular, cada uno
                    con su área y su vigencia (ADR-425). */}
                <CtpPartePermisos
                  parteId={b.id ?? null}
                  titular={{ id: b.id ?? null, nombre: b.nombre, docTipo: b.docTipo, docNumero: b.docNumero }}
                  arffsDeLaFicha={b.arffs}
                  pendientes={permisosPendientes}
                  onPendientes={setPermisosPendientes}
                  onConteo={setPermisosDelTitular}
                />
              </>
            )}
          </Seccion>
        )}

        <Seccion numero={nro.donde} title="Dónde está" hint="La dirección del destinatario es el punto de llegada de la guía">
          <Field label="Dirección" span={12}>
            <input type="text" className={I} value={b.direccion ?? ""} onChange={(e) => set({ direccion: e.target.value })} />
          </Field>
          {/* Región · provincia · distrito en cascada, con el mismo selector que
              ya usa la Ficha del CTP. Antes eran tres campos de texto libre:
              «Coronel Portillo» y «CORONEL PORTILLO» quedaban como dos lugares
              distintos, y el ubigeo había que buscarlo aparte. Ahora el código
              INEI sale solo de los tres nombres elegidos. */}
          <CtpUbigeoSelects
            span={6}
            valor={{ departamento: b.region ?? "", provincia: b.provincia ?? "", distrito: b.distrito ?? "" }}
            onChange={(v) => {
              /**
               * `CtpUbigeoSelects` emite un PATCH PARCIAL, no el valor entero:
               * al cambiar la provincia manda `{provincia, distrito}` sin el
               * departamento. Leerlo como `v.departamento ?? ""` borraba la
               * región y dejaba el distrito sin opciones — se vio eligiendo
               * Ucayali → Coronel Portillo y quedándose sin distritos.
               */
              const region = v.departamento !== undefined ? v.departamento : (b.region ?? "");
              const provincia = v.provincia !== undefined ? v.provincia : (b.provincia ?? "");
              const distrito = v.distrito !== undefined ? v.distrito : (b.distrito ?? "");
              const code = ubigeoDeNombres(region, provincia, distrito);
              set({
                region,
                provincia,
                distrito,
                // Sólo se pisa el ubigeo cuando los tres nombres resuelven a un
                // código: si alguien lo tenía cargado a mano y la selección
                // todavía está a medias, su dato no se borra.
                ...(code ? { ubigeo: code } : {}),
              });
            }}
          />
          <Field label="Zona" span={6} hint="Sector o caserío — identifica el punto de llegada cuando la dirección no tiene numeración">
            <input type="text" className={I} value={b.zona ?? ""} onChange={(e) => set({ zona: e.target.value })} />
          </Field>
          <Field label="Ubigeo" span={6} hint="Se completa solo al elegir departamento, provincia y distrito">
            <input type="text" className={`${I} font-mono`} value={b.ubigeo ?? ""} onChange={(e) => set({ ubigeo: e.target.value })} />
          </Field>
          <Field label="Teléfono" span={6}>
            <input type="text" className={I} value={b.telefono ?? ""} onChange={(e) => set({ telefono: e.target.value })} />
          </Field>
          {/* WhatsApp aparte: en la selva el fijo no existe y el número que
              contesta no siempre es el que figura en el RUC. */}
          {/* El enlace va FUERA del Field, como el botón de SUNAT: `Field`
              asocia el id por `htmlFor` y sólo a un input/select/textarea —
              envolviéndolo en un div, el label quedaba sin campo asociado (se
              vio: `label[for]` vacío para WhatsApp). */}
          <Field label="WhatsApp" span={4} hint="Solo números, con o sin +51">
            <input type="text" className={I} value={b.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} />
          </Field>
          <div className="sm:col-span-1 flex items-end">
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir el chat de WhatsApp"
                aria-label="Abrir el chat de WhatsApp"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--data-success-500)] text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-50)]"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
          </div>
          <Field label="Email" span={12}>
            <input type="email" className={I} value={b.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          {/* Quien atiende de verdad, cuando no es el representante legal. */}
          <Field label="Contacto" span={6} hint="El que coordina el flete o la entrega">
            <input type="text" className={I} value={b.contactoNombre ?? ""} onChange={(e) => set({ contactoNombre: e.target.value })} />
          </Field>
          <Field label="Teléfono del contacto" span={6}>
            <input type="text" className={I} value={b.contactoTelefono ?? ""} onChange={(e) => set({ contactoTelefono: e.target.value })} />
          </Field>
          {/* El segundo que contesta. En comunidades y empresas chicas el primer
              contacto se queda sin señal o cambia de número, y la guía se frena
              por no tener a quién llamar. */}
          <Field label="Otro contacto" span={6} hint="El que contesta cuando el primero no">
            <input type="text" className={I} value={b.contacto2Nombre ?? ""} onChange={(e) => set({ contacto2Nombre: e.target.value })} />
          </Field>
          <Field label="Su teléfono" span={6}>
            <input type="text" className={I} value={b.contacto2Telefono ?? ""} onChange={(e) => set({ contacto2Telefono: e.target.value })} />
          </Field>
          {/* Dónde se carga el camión: no es la dirección legal. */}
          <CtpPartePuntoAcopio
            lat={b.acopioLat}
            lng={b.acopioLng}
            referencia={b.acopioReferencia ?? ""}
            onCambio={(v) => set(v)}
          />
        </Seccion>

        {/* Columna derecha: al meter estas 3 secciones en un `<div>` propio
            para emparejarlas con «Dónde está», la primera queda `:first-child`
            de ESE div y `first:border-t-0` (pensado para la primera sección
            del formulario entero) le borra el separador — se ve raro sólo del
            lado derecho. Se lo devolvemos a mano con `!` para que pese más que
            la variante `first:`. */}
        <div className="flex flex-col">
        {/* Sin esto, cada pago vuelve a pedir el número de cuenta por chat. */}
        <Seccion numero={nro.pago} title="Cómo se le paga" hint="Para transferirle sin volver a pedir los datos" className="!border-t !mt-4 !pt-4">
          <Field label="Banco" span={6}>
            <input type="text" className={I} value={b.banco ?? ""} onChange={(e) => set({ banco: e.target.value })} placeholder="BCP, Interbank…" />
          </Field>
          <Field label="N° de cuenta" span={6}>
            <input type="text" className={`${I} font-mono`} value={b.cuentaNumero ?? ""} onChange={(e) => set({ cuentaNumero: e.target.value })} />
          </Field>
          <Field
            label="CCI"
            span={12}
            hint={cciMal ?? "20 dígitos — es el que sirve para transferir entre bancos distintos"}
          >
            <input
              type="text"
              inputMode="numeric"
              className={`${I} font-mono ${cciMal ? "border-[var(--data-error-500)]" : ""}`}
              value={b.cuentaCci ?? ""}
              onChange={(e) => set({ cuentaCci: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-12 -mt-1 flex flex-wrap items-center gap-1.5">
            <BotonCopiar valor={b.cuentaNumero} cual="el N° de cuenta" copiado={copiado} onCopiar={copiar} />
            <BotonCopiar valor={b.cuentaCci} cual="el CCI" copiado={copiado} onCopiar={copiar} />
            <BotonCopiar valor={b.docNumero} cual="el documento" copiado={copiado} onCopiar={copiar} />
            <span className="text-xs text-[var(--text-tertiary)]">
              {copiado ? `Copiado ${copiado}` : "Copiar para pegar en el banco o en un WhatsApp"}
            </span>
          </div>
          <Field label="La cuenta está a nombre de" span={12} hint="Sólo si no coincide con el titular de la ficha (pasa: la comunidad cobra en la cuenta de su jefe)">
            <input type="text" className={I} value={b.cuentaTitular ?? ""} onChange={(e) => set({ cuentaTitular: e.target.value })} />
          </Field>

          {/* Contado o crédito: es lo que decide si una compra deja una fecha de
              pago que vigilar. Sin pactar NO es contado — asumirlo haría
              aparecer deuda cero donde en realidad no se sabe. */}
          <Field label="Condición de pago" span={6} hint={textoCondicionPago(b.condicionPago, b.diasCredito)}>
            <select
              className={I}
              value={b.condicionPago ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                set({
                  condicionPago: v ? (v as (typeof CONDICIONES_PAGO)[number]) : null,
                  ...(v === "credito" ? {} : { diasCredito: null }),
                });
              }}
            >
              <option value="">Sin pactar</option>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </Field>
          {b.condicionPago === "credito" && (
            <Field label="Días de crédito" span={6} hint="Los que se pactaron: de ahí sale el vencimiento">
              <input
                type="number"
                min={0}
                max={365}
                inputMode="numeric"
                className={`${I} font-mono tabular-nums`}
                value={b.diasCredito ?? ""}
                onChange={(e) => set({ diasCredito: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
          )}
          <Field
            label="Correo de cobranza"
            span={b.condicionPago === "credito" ? 12 : 6}
            hint="Dónde mandar factura y liquidación, si no es el correo general"
          >
            <input type="email" className={I} value={b.emailCobranza ?? ""} onChange={(e) => set({ emailCobranza: e.target.value })} />
          </Field>
        </Seccion>

        <Seccion numero={nro.logo} title="Logo y papeles del titular">
          <CampoGrid className="sm:col-span-12">
            <Field label="Membrete de sus documentos" span={12} hint="Sale en la cabecera de la guía y sus anexos">
              <CtpParteLogo logo={b.logo ?? ""} onCambio={(logo) => set({ logo })} />
            </Field>
            <Field label="Documentos del titular" span={12} hint="Permiso, resolución, copia del RUC — se guardan en el Drive">
              <CtpParteAdjuntos
                adjuntos={b.adjuntos ?? []}
                nombreParte={b.nombre}
                onCambio={(adjuntos) => set({ adjuntos })}
              />
            </Field>
          </CampoGrid>
        </Seccion>

        {/* Dar de baja sin ir al Directorio. `activo` existía en el modelo y el
            modal lo leía sin exponerlo: una parte que ya no opera sólo se podía
            desactivar desde la otra pantalla. Sólo al EDITAR: una ficha que se
            está creando inactiva no tiene sentido. */}
        {parte && (
          <div className="col-span-12">
            <label className="flex items-start gap-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={b.activo === false}
                onChange={(e) => set({ activo: !e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[var(--data-error-600)]"
              />
              <span className="text-sm text-[var(--text-primary)]">
                Dar de baja
                <span className="block text-xs text-[var(--text-tertiary)]">
                  Deja de ofrecerse en los selectores de guías y formularios. No se borra: lo que ya se emitió con
                  esta parte sigue igual.
                </span>
              </span>
            </label>
          </div>
        )}

        <Seccion numero={nro.notas} title="Notas">
          <CampoGrid className="sm:col-span-12">
            <Field label="Observaciones internas" span={12} hint="Una línea que describe a la parte; se pisa al editarla">
              <input type="text" className={I} value={b.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
            </Field>
            <CtpParteBitacora
              notas={parte?.bitacora ?? []}
              nueva={b.nuevaNota ?? ""}
              onNueva={(nuevaNota) => set({ nuevaNota })}
            />
            {/* Lo que este negocio le pregunta a sus partes y la ficha no
                previó (ADR-427). */}
            <CamposPersonalizados
              className="sm:col-span-12"
              formulario={FORMULARIO_FICHA}
              registroId={b.id ?? null}
              etiquetaFormulario="fichas del Directorio"
              pendientes={camposPendientes}
              onPendientes={setCamposPendientes}
            />
          </CampoGrid>
        </Seccion>
        </div>
        </div>

      </ModalBody>
    </AdminModal>
  );
}

function BotonCopiar({ valor, cual, copiado, onCopiar }: { valor?: string | null; cual: string; copiado: string | null; onCopiar: (v: string, c: string) => void }) {
  const limpio = (valor ?? "").trim();
  if (!limpio) return null;
  const yaCopio = copiado === cual;
  return (
    <button
      type="button"
      onClick={() => onCopiar(limpio, cual)}
      aria-label={`Copiar ${cual}`}
      title={yaCopio ? "Copiado" : `Copiar ${cual}`}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors ${
        yaCopio
          ? "border-[var(--data-success-500)] text-[var(--data-success-700)]"
          : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      }`}
    >
      {yaCopio ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
