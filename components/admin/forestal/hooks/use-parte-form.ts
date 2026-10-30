"use client";

/**
 * El estado de la ficha del Directorio (alta y edición, ADR-317): el borrador,
 * lo que se deriva de él, el paso que se ve y el «Guardar» con todo lo que se
 * cuelga de la ficha recién creada (permisos, campos, precios, vínculos).
 *
 * Vive acá para que `CtpParteModal` sea sólo el marco y cada paso un archivo
 * propio (`ctp-parte-paso-*`). Pasos: `lib/forestal/directorio-pasos.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { direccionSinLugar, planDeAutocompletado, ubigeoPorDistrito, type CambioPropuesto } from "@/lib/documento/autocompletar";
import { logger } from "@/lib/logger";
import { navegarTrasCerrar } from "./use-parte-form-salir";
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
  categoriaEfectiva,
  parteAInput,
  fuenteAutocompletado,
  motivoDocInvalido,
  motivoRepresentanteDniInvalido,
  normalizarDocumento,
  partesParecidas,
  documentoEnElNombre,
  type CategoriaParte,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
  type Vehiculo,
} from "@/lib/forestal/directorio";
import {
  estadoDePasoFicha,
  pasoDelPendiente,
  pasosDeLaFicha,
  pasoVisibleDeLaFicha,
  PASO_DEL_ERROR,
  type ErroresDeLaFicha,
  type PasoFicha,
} from "@/lib/forestal/directorio-pasos";
import { opcionesEscritas } from "@/lib/forestal/permisos-de-parte";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import { useAtajoGuardar, useCierreSeguro, useHayCambios } from "../ctp-shared";
import {
  guardarValoresPendientes as guardarCamposPendientes,
  pendientesVacios as camposVacios,
  type PendientesCampos,
} from "@/components/admin/shared/CamposPersonalizados";
import { guardarPermisosPendientes, type PermisoBorrador } from "../CtpPartePermisos";
import { guardarPreciosPendientes, type PrecioPendiente } from "@/lib/forestal/precio-cliente-borrador";
import { useTarifasCliente } from "@/hooks/use-tarifas-cliente";
import { useSaldoParte } from "@/hooks/use-saldo-parte";
import { crearVinculosPendientes, type VinculoPendiente } from "@/hooks/use-vinculos-parte";
import { ETIQUETA_SERVICIO_PRECIO } from "@/lib/forestal/precio-cliente";
import { useHistorialProveedor } from "./use-historial-proveedor";

/** Id estable de este formulario para los campos personalizados (ADR-427). */
export const FORMULARIO_FICHA = "directorio.parte";

export type BorradorDeParte = ParteInput & { id?: string };

/**
 * De ficha guardada a borrador del formulario.
 *
 * Usa `parteAInput`, que es la ÚNICA lista completa de campos de una parte. La
 * copia a mano que había acá se quedó corta apenas se agregaron campos: los
 * datos de pago y de contacto salían vacíos al editar y, como la edición con
 * `id` sí pisa con `null` lo que no llega, guardar los BORRABA. Es el mismo
 * patrón que costó dos rondas en RRHH con `PuestoInput`/`ColaboradorInput`.
 */
function aBorrador(p: Parte | null, rolInicial: RolParte, nombreInicial = ""): BorradorDeParte {
  if (!p) return { roles: [rolInicial], nombre: nombreInicial.trim(), categoria: "ccnn", docTipo: "RUC" };
  return {
    ...parteAInput(p),
    roles: p.roles.length ? p.roles : [rolInicial],
    categoria: categoriaEfectiva(p.categoria),
    docTipo: p.docTipo ?? "RUC",
    logo: p.logo ?? "",
    adjuntos: p.adjuntos ?? [],
  };
}

export interface OpcionesFichaParte {
  parte: Parte | null;
  rolInicial: RolParte;
  /** Alta con el nombre que ya se escribió en otro formulario (el comprador del Cubicador, 28-10). */
  nombreInicial?: string;
  existentes: Parte[];
  vehiculos: readonly Vehiculo[];
  onGuardar: (input: BorradorDeParte) => Promise<Parte | void>;
  onClose: () => void;
  /**
   * Abierta encima de otro formulario (una guía, el alta del plan, otro modal):
   * sin los accesos que llevan al Libro TH, que dejarían ese otro a medias.
   */
  anidada?: boolean;
  /** «Completar» desde la lista de fichas por completar: el paso donde falta lo primero. */
  pasoInicial?: PasoFicha;
}

export function useParteForm({ parte, rolInicial, nombreInicial, existentes, vehiculos, onGuardar, onClose, anidada = false, pasoInicial }: OpcionesFichaParte) {
  const [b, setB] = useState<BorradorDeParte>(() => aBorrador(parte, rolInicial, nombreInicial));
  const [copiado, setCopiado] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "consultando" | "guardando">("idle");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** El paso que se ve (`directorio-pasos`): una cosa a la vez. */
  const [pasoElegido, setPaso] = useState<PasoFicha>(pasoInicial ?? "quien");
  /** Recién después del primer «Guardar» el nombre vacío se marca en rojo. */
  const [intento, setIntento] = useState(false);
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
  /**
   * Precios del cliente escritos y sin guardar (ADR-430). En el alta esperan el
   * id de la ficha, como los permisos; al editar, el «Guardar» de la ficha
   * también los guarda para no cerrar y perderlos.
   */
  const [preciosPendientes, setPreciosPendientes] = useState<PrecioPendiente[]>([]);
  /** Vínculos cargados en el alta: se crean cuando la ficha tiene id. */
  const [vinculosPendientes, setVinculosPendientes] = useState<VinculoPendiente[]>([]);
  /* Sólo por su `guardar`: publica una versión con el id que la ficha recién
     recibió. Con `null` no lee nada. */
  const { guardar: guardarTarifa } = useTarifasCliente(null);
  const saldo = useSaldoParte(parte?.id ?? null);
  const historial = useHistorialProveedor(parte);

  const docTipo = (b.docTipo ?? "RUC") as DocTipo;
  const fuente = fuenteAutocompletado(docTipo);
  const docMal = motivoDocInvalido(docTipo, b.docNumero ?? "");
  const dniRepresentanteMal = motivoRepresentanteDniInvalido(b.representanteDni ?? "");
  const set = (v: Partial<BorradorDeParte>) => setB((p) => ({ ...p, ...v }));

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
    /* Un nombre que es un RUC/DNI tiene su propio aviso, que busca por número
       (`CtpParteNombreEsDocumento`): el «parecido» por nombre ahí sería ruido. */
    () =>
      coincide || documentoEnElNombre(b.nombre ?? "")
        ? []
        : partesParecidas(b.nombre ?? "", existentes, { excluirId: b.id ?? null }),
    [b.nombre, b.id, existentes, coincide],
  );

  const esTransportista = b.roles.includes("transportista");
  const esConductor = b.roles.includes("conductor");
  const esProveedor = b.roles.includes("proveedor");
  const esCliente = b.roles.includes("cliente");
  const esDestinatario = b.roles.includes("destinatario");
  const esEstablecimiento = b.roles.includes("establecimiento");
  const categoriaProveedor = categoriaEfectiva(b.categoria as CategoriaParte | null | undefined);
  /* El N° de autorización (columna `codigoCtp`) sale en la guía 2024 en el (18)
     del establecimiento de partida y en el (22) del destinatario. Antes sólo se
     pedía al proveedor «aserradero»: un destinatario o un depósito no tenía
     dónde cargarlo desde el Directorio. Si el campo del aserradero ya se
     dibuja, éste no se repite (es la misma columna). */
  const conAutorizacion = (esDestinatario || esCliente || esEstablecimiento) && !(esProveedor && categoriaProveedor === "aserradero");
  /** «Según el papel» sólo existe si algún papel marcado pide algo propio. */
  const hayPapel = esTransportista || esConductor || esProveedor || esCliente || esDestinatario || esEstablecimiento;

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
  const precioMal = esCliente ? preciosPendientes.find((p) => !p.resultado.ok) : undefined;

  // ── Los pasos (Brandon 24-10: «ir bloque a bloque») ──────────────────────
  const errores: ErroresDeLaFicha = {
    documento: Boolean(docMal && b.docNumero) || coincideBloquea,
    representanteDni: Boolean(dniRepresentanteMal),
    precio: Boolean(precioMal),
    cci: Boolean(cciMal),
  };
  const requisitos = pendientesDeFicha({ roles: b.roles });
  const datosDelEstado = { requisitos, pendientes, errores, sinNombre: b.nombre.trim().length < 2, intento };
  const pasos = pasosDeLaFicha(hayPapel).map((p) => ({ ...p, estado: estadoDePasoFicha(p.id, datosDelEstado) }));
  const paso = pasoVisibleDeLaFicha(pasos, pasoElegido);
  /** Lo que la salud reclama, repartido en el paso donde se carga. */
  const pendientesDe = (p: PasoFicha) => pendientes.filter((x) => pasoDelPendiente(x.campo) === p);

  function alternarRol(rol: RolParte) {
    const tiene = b.roles.includes(rol);
    // Siempre queda al menos uno: una parte sin rol no aparece en ninguna lista
    // y se vuelve invisible desde la UI.
    if (tiene && b.roles.length === 1) return;
    set({ roles: tiene ? b.roles.filter((r) => r !== rol) : [...b.roles, rol] });
  }

  /** Lo que el padrón dice distinto de lo ya escrito: se pregunta, nunca se pisa. */
  const [propuestaPadron, setPropuestaPadron] = useState<CambioPropuesto[]>([]);

  /**
   * `auto` = lo disparó el último dígito del documento, no un clic. Lo vacío se
   * llena solo (el ubigeo sale del catálogo por distrito + provincia); lo que
   * ya tiene algo distinto queda en `propuestaPadron` para «Usar dato de SUNAT».
   */
  async function traerDelPadron(auto = false) {
    setEstado("consultando");
    setError(null);
    setAviso(null);
    setPropuestaPadron([]);
    try {
      const datos = await consultarDocumento(docTipo, b.docNumero ?? "");
      if (!datos) {
        if (!auto) setError(`No se encontró el ${docTipo} en ${fuente}.`);
        return;
      }
      const lugar = { departamento: datos.region, provincia: datos.provincia, distrito: datos.distrito };
      const plan = planDeAutocompletado(
        { nombre: b.nombre, direccion: b.direccion, region: b.region, provincia: b.provincia, distrito: b.distrito, ubigeo: b.ubigeo },
        {
          nombre: datos.nombre,
          direccion: direccionSinLugar(datos.direccion, lugar),
          region: datos.region,
          provincia: datos.provincia,
          distrito: datos.distrito,
          ubigeo: datos.ubigeo || ubigeoPorDistrito(datos.region, datos.provincia, datos.distrito),
        },
      );
      if (Object.keys(plan.llenar).length > 0) set(plan.llenar);
      setPropuestaPadron(plan.preguntar);
      const baja = datos.estado && datos.estado.toUpperCase() !== "ACTIVO";
      setAviso(
        plan.preguntar.length > 0
          ? `${fuente} trae ${plan.preguntar.length === 1 ? "un dato distinto" : `${plan.preguntar.length} datos distintos`} de lo que escribiste.`
          : baja
            ? `Traído de ${fuente}. Ojo: figura ${datos.estado}.`
            : `Traído de ${fuente}.`,
      );
    } catch (e) {
      if (!auto) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("idle");
    }
  }

  /** «Usar dato de SUNAT»: la persona vio el cambio y lo aceptó. */
  function usarDatoDelPadron() {
    const cambios: Record<string, string> = {};
    for (const c of propuestaPadron) cambios[c.campo] = c.nuevo;
    set(cambios);
    setPropuestaPadron([]);
    setAviso(`Traído de ${fuente}.`);
  }

  // Con el documento completo y bien escrito (y distinto del que ya estaba), los datos se traen solos.
  const ultimoConsultado = useRef((parte?.docNumero ?? "").replace(/\D/g, ""));
  useEffect(() => {
    const n = (b.docNumero ?? "").replace(/\D/g, "");
    if (!fuente || docMal || estado !== "idle" || n === ultimoConsultado.current) return;
    if (n.length !== (docTipo === "DNI" ? 8 : 11)) return;
    ultimoConsultado.current = n;
    void traerDelPadron(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.docNumero, docMal, fuente, docTipo]);

  /** Dice el error y lleva al paso donde se arregla: con un paso a la vez, el campo podía estar escondido. */
  function fallar(mensaje: string, en: PasoFicha) {
    setError(mensaje);
    setPaso(en);
  }

  async function guardar() {
    setIntento(true);
    if (b.nombre.trim().length < 2) return fallar("El nombre es obligatorio.", "quien");
    if (docMal && !dandoDeBaja) return fallar(docMal, PASO_DEL_ERROR.documento);
    if (dniRepresentanteMal && !dandoDeBaja) return fallar(dniRepresentanteMal, PASO_DEL_ERROR.representanteDni);
    if (coincideBloquea && coincide && !dandoDeBaja) {
      return fallar(`Ese documento ya lo tiene ${coincide.nombre}. Edita esa ficha en vez de repetir el documento acá.`, PASO_DEL_ERROR.documento);
    }
    /* Un precio mal escrito se dice ANTES de guardar la ficha: después ya no
       habría a quién decírselo sin dejar la ficha a medias. */
    if (precioMal && !precioMal.resultado.ok) {
      return fallar(`Precio del cliente (${ETIQUETA_SERVICIO_PRECIO[precioMal.servicio]}): ${precioMal.resultado.error}`, PASO_DEL_ERROR.precio);
    }
    setEstado("guardando");
    setError(null);
    /* Lo que se cuelga de la ficha y falló: la ficha YA está guardada, así que
       se avisa, se lleva al paso donde está la lista y el modal queda abierto. */
    const aMedias = (mensaje: string, en: PasoFicha) => {
      fallar(`La ficha se guardó. ${mensaje}`, en);
      setEstado("idle");
    };
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
        if (r.errores.length > 0) return aMedias(`Sus permisos: ${r.errores.join(" · ")}`, "papel");
      }
      /* Los campos personalizados del alta se guardan cuando la ficha ya tiene
         id, igual que los permisos. Si fallan, la ficha YA está guardada. */
      if (idFicha) {
        const rc = await guardarCamposPendientes(idFicha, camposPendientes);
        if (rc.errores.length > 0) return aMedias(`Sus campos personalizados: ${rc.errores.join(" · ")}`, "papeles");
      }
      /* Precios y vínculos del alta (ADR-430): igual que los permisos, recién
         ahora hay id. Si fallan, la ficha YA está guardada y el modal queda
         abierto diciendo cuál. */
      if (idFicha && esCliente && preciosPendientes.length > 0) {
        const rp = await guardarPreciosPendientes(guardarTarifa, idFicha, preciosPendientes);
        setPreciosPendientes([]);
        if (rp.errores.length > 0) return aMedias(`Sus precios: ${rp.errores.join(" · ")}`, "papel");
      }
      if (idFicha && vinculosPendientes.length > 0) {
        const rv = await crearVinculosPendientes(idFicha, vinculosPendientes);
        setVinculosPendientes([]);
        if (rv.errores.length > 0) return aMedias(`Sus vínculos: ${rv.errores.join(" · ")}`, "pago");
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("idle");
    }
  }

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

  /**
   * Los vehículos de ESTE transportista.
   *
   * Existen desde siempre y tienen su propia pestaña en el Directorio, pero la
   * ficha del transportista no los mencionaba: había que acordarse de ir a
   * «Vehículos» y filtrar por dueño. Acá se listan en lectura —el alta sigue
   * siendo la de esa pestaña, que ya valida placas duplicadas— para que la
   * ficha conteste «con qué camiones trabaja este».
   */
  const susVehiculos = useMemo(
    () => (b.id ? vehiculos.filter((v) => v.transportistaId === b.id && v.activo) : []),
    [b.id, vehiculos],
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
  const fichaCambio = useHayCambios(b);
  const hayCambios =
    (fichaCambio || permisosPendientes.length > 0 || preciosPendientes.length > 0 || vinculosPendientes.length > 0) &&
    estado !== "guardando";
  const cerrar = useCierreSeguro(hayCambios, onClose);
  /* «Ver su cuenta» sale de la ficha hacia Adelantos → Cuenta por persona: si
     hay algo sin guardar, pregunta igual que al cerrar. */
  const verCuenta = useCierreSeguro(hayCambios, () => {
    const antes = window.location.href;
    onClose();
    navegarTrasCerrar(antes, () =>
      window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "adelantos" } })),
    );
  });
  /* Ir al Libro TH desde «Planes de manejo» (ADR-518): igual que «Ver su
     cuenta», pregunta si hay algo sin guardar; cierra y DESPUÉS navega, así el
     alta del plan no se abre con la ficha todavía encima. */
  const accionAlLibro = useRef<(() => void) | null>(null);
  const salirAlLibro = useCierreSeguro(hayCambios, () => {
    const accion = accionAlLibro.current;
    accionAlLibro.current = null;
    const antes = window.location.href;
    onClose();
    // El cierre es un «atrás» asíncrono: navegar en el mismo tick lo deshacía.
    if (accion) navegarTrasCerrar(antes, accion);
  });
  const irAlLibro = (accion: () => void) => {
    accionAlLibro.current = accion;
    void salirAlLibro();
  };

  return {
    parte, existentes, b, set, estado, error, aviso, copiado, copiar,
    docTipo, fuente, docMal, dniRepresentanteMal, coincide, coincideBloquea, dandoDeBaja, parecidas,
    esTransportista, esConductor, esProveedor, esCliente, esDestinatario, esEstablecimiento,
    categoriaProveedor, conAutorizacion, hayPapel,
    pendientes, listo, tituloEnPermisos, cciMal, vigencia, arffsDeLaLibreta, susVehiculos, whatsappLink,
    permisosPendientes, setPermisosPendientes, setPermisosDelTitular, camposPendientes, setCamposPendientes,
    setPreciosPendientes, vinculosPendientes, setVinculosPendientes,
    saldo, historial, pasos, paso, setPaso, pendientesDe,
    alternarRol, traerDelPadron, propuestaPadron, usarDatoDelPadron, guardar, bodyRef, cerrar, verCuenta, anidada, irAlLibro,
  };
}

export type ParteFormEstado = ReturnType<typeof useParteForm>;
