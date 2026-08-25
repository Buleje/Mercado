/**
 * tramites-catalogo — los formatos que un CTP le presenta a la autoridad.
 *
 * Cada trámite declara qué autoridad lo recibe, qué campos hay que llenar, con
 * qué base legal se ampara y cómo se redacta el cuerpo. Es DATA: sumar un
 * trámite nuevo es agregar una entrada acá, sin tocar la UI ni el generador
 * (ADR-308).
 *
 * Honestidad legal (regla del módulo): acá NO se inventan códigos de formato
 * oficial. Se arma una solicitud administrativa con la estructura estándar
 * peruana (destinatario · referencia · asunto · cuerpo · base legal · anexos ·
 * firma, Ley 27444) y cada formato avisa dónde cotejar el requisito exacto: el
 * TUPA de la ARFFS que corresponda. Un formato fabricado que parece oficial hace
 * más daño que no tener ninguno.
 *
 * PURO: sin React, sin fetch, sin DOM.
 */

/** Quién recibe el documento. Define el encabezado y el tratamiento. */
export type AutoridadTramite = "arffs" | "serfor" | "osinfor" | "otra";

export const AUTORIDADES: Record<
  AutoridadTramite,
  { label: string; corto: string; detalle: string; tono: "accent" | "info" | "warning" | "muted" }
> = {
  arffs: {
    label: "ARFFS (Gobierno Regional)",
    corto: "ARFFS",
    detalle: "Autoridad Regional Forestal y de Fauna Silvestre — registra el CTP y autoriza el foliado",
    tono: "accent",
  },
  serfor: {
    label: "SERFOR",
    corto: "SERFOR",
    detalle: "Autoridad nacional rectora — normativa, registros y SNIFFS",
    tono: "info",
  },
  osinfor: {
    label: "OSINFOR",
    corto: "OSINFOR",
    detalle: "Supervisor y fiscalizador de títulos habilitantes",
    tono: "warning",
  },
  otra: {
    label: "Otra autoridad",
    corto: "Otra",
    detalle: "Municipalidad, MINAM, aduanas u otra entidad",
    tono: "muted",
  },
};

/**
 * Ícono de cada trámite (Lucide, del barrel del DS). Ocho cards con el mismo
 * ícono no se distinguen de un vistazo; con el suyo, el operador encuentra el
 * que busca por la forma antes de leer el título.
 */
export const ICONO_TRAMITE: Record<string, string> = {
  "visado-talonario-gtf": "Stamp",
  "revision-campo": "Compass",
  "registro-actualizacion-ctp": "Building2",
  "presentacion-libro": "BookOpen",
  "cambio-regente": "UserCog",
  "descargo-osinfor": "ShieldAlert",
  "constancia-cites": "Globe",
  "carta-generica": "PenLine",
  "relacion-guias-serfor": "Truck",
  "anulacion-gtf": "Ban",
  "ampliacion-volumen-autorizado": "ArrowUpCircle",
  "reposicion-talonario-gtf": "FileWarning",
  "paralizacion-temporal": "Pause",
  "renovacion-registro-ctp": "RotateCcw",
  "informe-regencia": "ClipboardCheck",
  "remision-libro-th": "FileStack",
  "recurso-administrativo": "Scale",
  "ampliacion-plazo": "CalendarClock",
  "denuncia-policial-perdida-gtf": "Siren",
  "comunicacion-perdida-gtf-serfor": "FileX",
  "aviso-inicio-aprovechamiento": "Axe",
  "apertura-via-extraccion": "Route",
  "siniestro-forestal": "Flame",
};

export type TipoCampo = "texto" | "textarea" | "numero" | "fecha";

export interface CampoTramite {
  id: string;
  label: string;
  tipo: TipoCampo;
  requerido?: boolean;
  /** Ayuda debajo del campo — para qué sirve el dato, no cómo se escribe. */
  hint?: string;
  /** Valor sugerido cuando el sistema no lo puede completar solo. */
  placeholder?: string;
  /**
   * De dónde lo saca el sistema si puede: `ficha` (identidad del CTP) o
   * `libro` (dato del período). La UI lo pre-llena y el operador lo corrige.
   */
  autollenado?: "ficha" | "libro";
  /**
   * Ejemplos elegibles para arrancar un campo de redacción libre (Brandon
   * 2026-08-25: "opciones de dónde y cómo se perdió, ejemplos") — la UI los
   * muestra como chips cortos debajo del campo; tocar uno REEMPLAZA el valor
   * actual por el `texto` completo (no lo inserta a la fuerza) para que el
   * operador lo termine de ajustar a su caso real. Son puntos de partida, no
   * el hecho: el sistema no sabe qué pasó, el operador tiene que declararlo
   * y revisarlo antes de firmar.
   */
  sugerencias?: { label: string; texto: string }[];
  /**
   * Sección del formulario. Trece campos en una grilla plana se leen como un
   * trámite del Estado; en tres bloques (a quién va · qué se pide · quién firma)
   * se llena sin perder el hilo. Default: `datos`.
   */
  grupo?: "destino" | "datos" | "firma";
}

/** Datos del formulario: id de campo → valor tipeado por el operador. */
export type DatosTramite = Record<string, string>;

export interface FormatoTramite {
  id: string;
  /** Cómo lo llama el operador ("Visado de talonario de GTF"). */
  nombre: string;
  autoridad: AutoridadTramite;
  /** Qué resuelve, en una línea. */
  proposito: string;
  /** Asunto sugerido del documento (el operador puede cambiarlo). */
  asunto: string;
  /** Artículos y normas que se citan al pie. Reales, verificables. */
  baseLegal: string[];
  campos: CampoTramite[];
  /** Documentos que conviene adjuntar. Se listan en el pie del documento. */
  anexos: string[];
  /**
   * Cuerpo del documento: párrafos ya redactados con los datos. Devuelve texto
   * plano (el generador lo escapa y lo maqueta) — un párrafo por elemento.
   */
  cuerpo: (d: DatosTramite) => string[];
  /** Aviso al operador antes de imprimir (qué cotejar, qué firmar). */
  advertencia?: string;
  /**
   * Este trámite lleva el editor de guías (`TramiteRelacionGuias`) además de los
   * `campos` sueltos: una tabla de GTF —emitidas y anuladas— con su lista de
   * trozas, que viaja en `datos.guiasJson` (ADR-364). El campo NO está en
   * `campos` a propósito: tiene forma propia, no un input de texto.
   */
  tablaGuias?: boolean;
  /**
   * Este trámite lleva N° de documento propio, correlativo por año
   * ("001-2026"), asignado SOLO cuando pasa a "Presentado" y nunca reasignado
   * después (`construirTramite`, ADR-364 ronda 3, Brandon 2026-08-20) — el
   * talonario real no vuelve a numerar un oficio ya presentado.
   */
  correlativo?: boolean;
  /**
   * Carpeta propia del Drive para este formato — si no se declara, cae en la
   * carpeta genérica `CARPETA_TRAMITES` de `TramiteFormulario`. Separar
   * "Relación de guías" del resto evita que se pierda entre otros ocho
   * formatos cuando SERFOR pide "mandame las que presentaste este año".
   */
  carpetaDrive?: string;
}

const v = (d: DatosTramite, k: string, fallback = "—"): string => {
  const raw = (d[k] ?? "").trim();
  return raw || fallback;
};

/** Campos que casi todos los trámites necesitan (el operador los ve una vez). */
const CAMPOS_COMUNES: CampoTramite[] = [
  {
    id: "destinatarioCargo",
    label: "Dirigido a (cargo)",
    tipo: "texto",
    requerido: true,
    placeholder: "Director de la Dirección Regional Forestal y de Fauna Silvestre",
    hint: "El cargo, no el nombre: si cambia la persona el documento sigue valiendo",
    grupo: "destino",
  },
  {
    id: "destinatarioEntidad",
    label: "Entidad",
    tipo: "texto",
    requerido: true,
    placeholder: "Gobierno Regional de Ucayali",
    grupo: "destino",
  },
  {
    id: "firmante",
    label: "Quién firma",
    tipo: "texto",
    requerido: true,
    autollenado: "ficha",
    hint: "Titular del CTP o su representante legal",
    grupo: "firma",
  },
  {
    id: "firmanteDni",
    label: "DNI del firmante",
    tipo: "texto",
    placeholder: "12345678",
    grupo: "firma",
  },
  {
    id: "lugar",
    label: "Lugar de la firma",
    tipo: "texto",
    autollenado: "ficha",
    hint: "La ciudad que va antes de la fecha (\"Pucallpa, 29 de julio de 2026\")",
    grupo: "firma",
  },
  {
    id: "membreteEmpresa",
    label: "Empresa que emite (membrete)",
    tipo: "texto",
    autollenado: "ficha",
    hint: "Sale arriba del papel. Trae la razón social de tu Ficha CTP — cambiala sólo si ESTE documento lo firma otra empresa",
    grupo: "firma",
  },
];

/**
 * Ronda 8 (Brandon: "que el RUC/código/registro también se puedan editar"):
 * `membreteRuc/CodigoCtp/RegistroArffs/Direccion` viven SOLO como override
 * tocable en el papel (`tramites-print.ts`, mismo mecanismo genérico de
 * `datos[id]` que cualquier campo del catálogo) — deliberadamente NO se
 * suman acá como `CampoTramite`: son identidad legal que casi nunca cambia
 * por documento, y volverlos un input siempre visible en los nueve formatos
 * sería ruido por un dato que se toca una vez cada mil. La Ficha CTP sigue
 * siendo el default; tocar el papel sólo lo pisa PARA ESE documento.
 */

/** Etiquetas de las secciones del formulario, en el orden en que se llenan. */
export const GRUPOS_CAMPO: { id: "destino" | "datos" | "firma"; label: string; hint: string }[] = [
  { id: "destino", label: "A quién va", hint: "El cargo y la entidad que lo recibe" },
  { id: "datos", label: "Qué se pide", hint: "Los datos propios de este trámite" },
  { id: "firma", label: "Quién firma", hint: "Aparece al pie, sobre la línea de firma" },
];

export const FORMATOS_TRAMITE: FormatoTramite[] = [
  // ── 1. Visado / autorización de talonario de GTF ──────────────────────────
  {
    id: "visado-talonario-gtf",
    nombre: "Visado de talonario de GTF",
    autoridad: "arffs",
    proposito: "Pedir la autorización del talonario y el correlativo de las Guías de Transporte Forestal del CTP",
    asunto: "Solicito visado y autorización de talonario de Guías de Transporte Forestal",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      {
        id: "cantidadTalonarios",
        label: "Talonarios solicitados",
        tipo: "numero",
        requerido: true,
        placeholder: "2",
      },
      {
        id: "guiasPorTalonario",
        label: "Guías por talonario",
        tipo: "numero",
        placeholder: "50",
      },
      {
        id: "serieActual",
        label: "Serie en uso",
        tipo: "texto",
        autollenado: "libro",
        hint: "La serie de las GTF que el CTP viene emitiendo",
      },
      {
        id: "ultimoCorrelativo",
        label: "Último correlativo emitido",
        tipo: "texto",
        autollenado: "libro",
        hint: "Lo toma del último despacho con GTF del libro",
      },
      {
        id: "motivo",
        label: "Motivo",
        tipo: "textarea",
        placeholder: "Se agotó el talonario autorizado con Resolución N° … / incremento de despachos",
      },
    ],
    anexos: [
      "Copia de la resolución que autorizó el talonario anterior",
      "Relación de guías emitidas del talonario en uso",
      "Comprobante de pago por derecho de trámite (según TUPA)",
    ],
    cuerpo: (d) => [
      `Que, siendo titular del Centro de Transformación Primaria registrado ante su Autoridad, solicito el visado y la autorización de ${v(d, "cantidadTalonarios")} talonario(s) de Guías de Transporte Forestal${d.guiasPorTalonario ? ` de ${v(d, "guiasPorTalonario")} guías cada uno` : ""}, a efectos de amparar el transporte de los productos forestales que se despachan desde nuestra planta.`,
      `A la fecha, el CTP viene emitiendo la serie ${v(d, "serieActual")}, cuyo último correlativo emitido es el N° ${v(d, "ultimoCorrelativo")}, conforme al Registro de Salida de nuestro Libro de Operaciones.`,
      d.motivo?.trim()
        ? `El presente pedido se sustenta en lo siguiente: ${v(d, "motivo")}.`
        : "El presente pedido se formula por agotamiento del talonario en uso.",
      "Por lo expuesto, solicito a usted disponer el visado y la entrega del talonario solicitado, comprometiéndome a rendir cuenta de las guías emitidas conforme a la normativa vigente.",
    ],
    advertencia:
      "El derecho de trámite y los requisitos exactos (cantidad máxima, rendición del talonario anterior) los fija el TUPA de tu ARFFS: cotejalos antes de presentar.",
  },

  // ── 2. Inspección / revisión de campo ────────────────────────────────────
  {
    id: "revision-campo",
    nombre: "Solicitud de inspección o revisión de campo",
    autoridad: "arffs",
    proposito: "Pedir la verificación en planta que exige el registro o la renovación del CTP",
    asunto: "Solicito inspección técnica en las instalaciones del Centro de Transformación Primaria",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      {
        id: "motivoInspeccion",
        label: "Motivo de la inspección",
        tipo: "texto",
        requerido: true,
        placeholder: "Registro inicial del CTP / renovación / ampliación de capacidad instalada",
      },
      {
        id: "fechaPropuesta",
        label: "Fecha propuesta",
        tipo: "fecha",
        hint: "Un día en que la planta esté operando: la inspección mira el proceso, no sólo el local",
      },
      {
        id: "contactoNombre",
        label: "Quién recibe a la comisión",
        tipo: "texto",
        placeholder: "Nombre y cargo de quien atenderá la visita",
      },
      { id: "contactoTelefono", label: "Teléfono de contacto", tipo: "texto", placeholder: "9XX XXX XXX" },
      {
        id: "referenciaExpediente",
        label: "Expediente de referencia",
        tipo: "texto",
        hint: "Si la inspección corresponde a un trámite ya iniciado",
      },
    ],
    anexos: [
      "Croquis de ubicación y distribución de la planta",
      "Relación de maquinaria instalada con su capacidad",
      "Documento que acredita la propiedad o posesión del predio",
    ],
    cuerpo: (d) => [
      `Que, en mi calidad de titular del Centro de Transformación Primaria, solicito a su Despacho disponer la inspección técnica de nuestras instalaciones por el siguiente motivo: ${v(d, "motivoInspeccion")}.`,
      d.referenciaExpediente?.trim()
        ? `La presente se formula en el marco del expediente N° ${v(d, "referenciaExpediente")}.`
        : "",
      d.fechaPropuesta?.trim()
        ? `Proponemos como fecha de visita el ${v(d, "fechaPropuesta")}, día en que la planta se encuentra operativa, a fin de que la comisión pueda verificar el proceso de transformación en funcionamiento.`
        : "Quedamos a disposición para la fecha que su Autoridad disponga; la planta opera en días hábiles.",
      d.contactoNombre?.trim()
        ? `La comisión será recibida por ${v(d, "contactoNombre")}${d.contactoTelefono ? `, teléfono ${v(d, "contactoTelefono")}` : ""}.`
        : "",
      "Nos comprometemos a facilitar el acceso a las instalaciones, al Libro de Operaciones y a la documentación de origen legal de la materia prima.",
    ],
  },

  // ── 3. Registro / actualización de datos del CTP ──────────────────────────
  {
    id: "registro-actualizacion-ctp",
    nombre: "Registro o actualización de datos del CTP",
    autoridad: "arffs",
    proposito: "Comunicar un cambio en la planta (dirección, maquinaria, capacidad) o pedir el registro inicial",
    asunto: "Solicito registro/actualización de datos del Centro de Transformación Primaria",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      {
        id: "tipoCambio",
        label: "Qué se registra o cambia",
        tipo: "texto",
        requerido: true,
        placeholder: "Registro inicial / cambio de dirección / nueva maquinaria / ampliación de capacidad",
      },
      { id: "datoAnterior", label: "Dato anterior", tipo: "textarea", hint: "Lo que figura hoy en el registro" },
      { id: "datoNuevo", label: "Dato nuevo", tipo: "textarea", requerido: true },
      {
        id: "vigenciaDesde",
        label: "Vigente desde",
        tipo: "fecha",
        hint: "Desde cuándo opera el cambio en la práctica",
      },
    ],
    anexos: [
      "Documento que sustenta el cambio (contrato, factura de maquinaria, título del predio)",
      "Ficha técnica de la maquinaria, si corresponde",
      "Vigencia de poder del representante legal",
    ],
    cuerpo: (d) => [
      `Que, en cumplimiento de la obligación de mantener actualizada la información del Centro de Transformación Primaria, comunico y solicito el registro de lo siguiente: ${v(d, "tipoCambio")}.`,
      d.datoAnterior?.trim() ? `Dato que figura actualmente: ${v(d, "datoAnterior")}.` : "",
      `Dato que solicito registrar: ${v(d, "datoNuevo")}.`,
      d.vigenciaDesde?.trim() ? `El cambio se encuentra vigente desde el ${v(d, "vigenciaDesde")}.` : "",
      "Adjunto la documentación que sustenta lo declarado y quedo a disposición para la verificación que su Autoridad estime necesaria.",
    ],
  },

  // ── 4. Remisión del Libro de Operaciones / informe del período ────────────
  {
    id: "presentacion-libro",
    nombre: "Remisión del Libro de Operaciones",
    autoridad: "arffs",
    proposito: "La carta que acompaña al informe del período que ya genera el Libro CTP",
    asunto: "Remito información del Libro de Operaciones del Centro de Transformación Primaria",
    baseLegal: [
      "RDE N° D000025-2023-MIDAGRI-SERFOR-DE — formato del Libro de Operaciones de CTP",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      {
        id: "periodo",
        label: "Período que se remite",
        tipo: "texto",
        requerido: true,
        autollenado: "libro",
        hint: "Lo toma del período elegido en el Libro",
      },
      { id: "ingresosCount", label: "Ingresos registrados", tipo: "numero", autollenado: "libro" },
      { id: "volumenIngresado", label: "Volumen ingresado (m³)", tipo: "texto", autollenado: "libro" },
      { id: "despachosCount", label: "Despachos del período", tipo: "numero", autollenado: "libro" },
      { id: "observaciones", label: "Observaciones", tipo: "textarea" },
    ],
    anexos: [
      "Libro de Operaciones del período en formato oficial (LO-CTP)",
      "Reporte de existencias al cierre del período",
      "Relación de guías de transporte emitidas",
    ],
    cuerpo: (d) => [
      `Que, en cumplimiento de lo dispuesto por la RDE N° D000025-2023-MIDAGRI-SERFOR-DE, remito la información contenida en el Libro de Operaciones de nuestro Centro de Transformación Primaria correspondiente al período ${v(d, "periodo")}.`,
      `En dicho período se registraron ${v(d, "ingresosCount", "0")} ingresos de materia prima por un volumen de ${v(d, "volumenIngresado", "0.00")} m³, y ${v(d, "despachosCount", "0")} operaciones de salida, con el detalle que consta en los registros adjuntos.`,
      d.observaciones?.trim() ? `Observaciones: ${v(d, "observaciones")}.` : "",
      "La documentación de origen legal de la materia prima y las guías de transporte emitidas se encuentran a disposición de su Autoridad en nuestras instalaciones.",
    ],
    advertencia:
      "Adjuntá el Libro en formato oficial: se descarga desde Acciones → «Formato oficial SERFOR» en el Libro CTP.",
  },

  // ── 5. Cambio de regente / responsable técnico ────────────────────────────
  {
    id: "cambio-regente",
    nombre: "Comunicación de cambio de regente",
    autoridad: "arffs",
    proposito: "Informar el cambio del profesional responsable del CTP",
    asunto: "Comunico cambio de regente / responsable técnico del Centro de Transformación Primaria",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "regenteSaliente", label: "Regente saliente", tipo: "texto", hint: "Nombre y N° de registro" },
      { id: "regenteEntrante", label: "Regente entrante", tipo: "texto", requerido: true, hint: "Nombre y N° de registro" },
      { id: "fechaCambio", label: "Fecha del cambio", tipo: "fecha", requerido: true },
      { id: "motivoCambio", label: "Motivo", tipo: "textarea" },
    ],
    anexos: [
      "Contrato o carta de aceptación del regente entrante",
      "Constancia de habilitación profesional vigente del entrante",
      "Carta de renuncia o término de contrato del saliente",
    ],
    cuerpo: (d) => [
      `Que, comunico a su Despacho el cambio del regente/responsable técnico de nuestro Centro de Transformación Primaria, con efecto desde el ${v(d, "fechaCambio")}.`,
      d.regenteSaliente?.trim() ? `Regente saliente: ${v(d, "regenteSaliente")}.` : "",
      `Regente entrante: ${v(d, "regenteEntrante")}, quien asume la responsabilidad técnica de las operaciones de la planta y del Libro de Operaciones.`,
      d.motivoCambio?.trim() ? `Motivo del cambio: ${v(d, "motivoCambio")}.` : "",
      "Adjunto la documentación que acredita la habilitación profesional del regente entrante y su aceptación del cargo.",
    ],
  },

  // ── 6. Descargo ante OSINFOR ─────────────────────────────────────────────
  {
    id: "descargo-osinfor",
    nombre: "Descargo ante una supervisión",
    autoridad: "osinfor",
    proposito: "Responder las observaciones de un acta o informe de supervisión",
    asunto: "Presento descargo respecto de las observaciones formuladas en la supervisión",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General (derecho de defensa)",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      {
        id: "expediente",
        label: "Expediente / acta de supervisión",
        tipo: "texto",
        requerido: true,
        hint: "El número que figura en el documento que se responde",
      },
      { id: "fechaNotificacion", label: "Fecha en que fue notificado", tipo: "fecha", requerido: true },
      {
        id: "observacion",
        label: "Observación que se responde",
        tipo: "textarea",
        requerido: true,
        hint: "Transcribí la observación tal como fue formulada",
      },
      {
        id: "descargo",
        label: "Descargo",
        tipo: "textarea",
        requerido: true,
        hint: "Qué se sostiene y con qué documento se prueba",
      },
    ],
    anexos: [
      "Copia del acta o informe de supervisión",
      "Documentos de origen legal que sustentan el descargo (GTF, Libro de Operaciones)",
      "Cadena de custodia del período observado",
    ],
    cuerpo: (d) => [
      `Que, habiendo sido notificado el ${v(d, "fechaNotificacion")} con el documento correspondiente al expediente N° ${v(d, "expediente")}, y dentro del plazo otorgado, presento mi descargo en los términos siguientes.`,
      `Observación formulada: ${v(d, "observacion")}.`,
      `Descargo: ${v(d, "descargo")}.`,
      "Sustento lo expuesto con la documentación que se adjunta, la cual acredita el origen legal de los productos y la trazabilidad de las operaciones registradas en nuestro Libro de Operaciones.",
      "Por lo expuesto, solicito tener por presentado el descargo y disponer el archivo de la observación formulada.",
    ],
    advertencia:
      "El plazo para descargar es corto y se cuenta desde la notificación: verificá la fecha del acta antes de presentar. La carpeta de fiscalización del Libro CTP arma la evidencia del período.",
  },

  // ── 7. Relación de guías de transporte forestal emitidas ──────────────────
  {
    id: "relacion-guias-serfor",
    nombre: "Relación de guías de transporte forestal emitidas",
    autoridad: "serfor",
    proposito:
      "Informar a SERFOR (Sede Puerto Bermúdez, editable) las GTF que emitió el titular en el período —y las anuladas, si las hay— con su lista de trozas, para que la Sede las registre en el SNIFFS",
    asunto: "Remito relación de guías de transporte forestal emitidas para su registro en el SNIFFS",
    baseLegal: [
      "RDE N° D000025-2023-MIDAGRI-SERFOR-DE — formato del Libro de Operaciones de CTP",
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General",
    ],
    tablaGuias: true,
    correlativo: true,
    carpetaDrive: "Relación de guías SERFOR (CTP)",
    campos: [
      {
        id: "destinatarioCargo",
        label: "Dirigido a (cargo)",
        tipo: "texto",
        requerido: true,
        placeholder: "Administrador Técnico Forestal y de Fauna Silvestre",
        hint: "El cargo de quien recibe en la Sede, no el nombre",
        grupo: "destino",
      },
      {
        id: "destinatarioEntidad",
        label: "Entidad / sede",
        tipo: "texto",
        requerido: true,
        placeholder: "SERFOR — Sede Puerto Bermúdez",
        hint: "Cambialo si tu titular reporta a otra sede: es un sugerido, no un dato fijo",
        grupo: "destino",
      },
      {
        id: "entidadNombre",
        label: "Comunidad / titular que solicita",
        tipo: "texto",
        requerido: true,
        autollenado: "ficha",
        hint: "Razón social del titular ante SERFOR",
      },
      { id: "entidadRuc", label: "RUC", tipo: "texto", autollenado: "ficha" },
      {
        id: "entidadRepresentante",
        label: "Jefe / representante legal",
        tipo: "texto",
        requerido: true,
        autollenado: "ficha",
        hint: "Quien encabeza la solicitud ante la autoridad",
      },
      { id: "periodoDesde", label: "Período — desde", tipo: "fecha", requerido: true },
      { id: "periodoHasta", label: "Período — hasta", tipo: "fecha", requerido: true },
      {
        id: "serieGtfInforme",
        label: "Serie de GTF",
        tipo: "texto",
        autollenado: "libro",
        hint: "La serie del talonario que amparan estas guías",
      },
      { id: "observaciones", label: "Observaciones", tipo: "textarea" },
      ...CAMPOS_COMUNES.filter((c) => c.grupo === "firma"),
    ],
    anexos: [
      "Anexo 1: Relación de guías de transporte forestal emitidas, con su lista de trozas",
      "Anexo 2: Relación de guías anuladas (si las hubiera), con su lista de trozas",
      "Copias de las guías físicas del talonario correspondiente",
    ],
    cuerpo: (d) => [
      `Que, en mi calidad de ${v(d, "entidadRepresentante", "representante legal")} de ${v(d, "entidadNombre", "el titular")}${d.entidadRuc?.trim() ? `, con RUC ${v(d, "entidadRuc")}` : ""}, pongo en conocimiento de su Despacho la relación de Guías de Transporte Forestal y Lista de Trozas emitidas.`,
      "Adjunto el anexo con el detalle de las guías correspondientes al período.",
      d.observaciones?.trim() ? `Observaciones: ${v(d, "observaciones")}.` : "",
      "Solicito a su Despacho disponer el registro de las guías detalladas en el Sistema Nacional de Información y Fiscalización Forestal y de Fauna Silvestre (SNIFFS), conforme a la información que se declara.",
    ],
    advertencia:
      "El SNIFFS no tiene un canal para que el titular registre directamente: por eso esta relación se presenta en mesa de partes para que la Sede la suba al sistema. Verificá cada N° de guía contra tu talonario físico y marcá como anuladas sólo las que de verdad no se usaron.",
  },

  // ── 8. Constancia / permiso CITES ────────────────────────────────────────
  {
    id: "constancia-cites",
    nombre: "Constancia o permiso CITES",
    autoridad: "serfor",
    proposito: "Pedir el permiso CITES que exige la exportación de especies protegidas",
    asunto: "Solicito emisión de permiso CITES de exportación",
    baseLegal: [
      "Convención CITES — Apéndices I, II y III",
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "especie", label: "Especie", tipo: "texto", requerido: true, autollenado: "libro", hint: "Nombre común y científico" },
      { id: "volumen", label: "Volumen / cantidad", tipo: "texto", requerido: true },
      { id: "producto", label: "Producto", tipo: "texto", placeholder: "Madera aserrada, tablones…" },
      { id: "destinoPais", label: "País de destino", tipo: "texto", requerido: true },
      { id: "importador", label: "Importador", tipo: "texto", hint: "Razón social y dirección en destino" },
      { id: "permisoOrigen", label: "Permiso CITES del origen", tipo: "texto", hint: "El del título habilitante de donde vino la madera" },
    ],
    anexos: [
      "Permiso CITES de aprovechamiento del origen",
      "Guías de Transporte Forestal que amparan la materia prima",
      "Cadena de custodia del embarque (Libro CTP)",
      "Factura o contrato de exportación",
    ],
    cuerpo: (d) => [
      `Que, solicito la emisión del permiso CITES de exportación para ${v(d, "volumen")} de ${v(d, "producto", "producto forestal")} de la especie ${v(d, "especie")}, con destino a ${v(d, "destinoPais")}${d.importador ? `, a nombre del importador ${v(d, "importador")}` : ""}.`,
      d.permisoOrigen?.trim()
        ? `La materia prima proviene de un aprovechamiento amparado con el permiso CITES N° ${v(d, "permisoOrigen")}, cuya copia se adjunta.`
        : "La materia prima proviene de aprovechamiento autorizado, cuya documentación de origen legal se adjunta.",
      "La cadena de custodia del embarque se encuentra registrada en nuestro Libro de Operaciones y puede ser verificada hasta la guía de transporte de ingreso de cada lote.",
      "Por lo expuesto, solicito tener por presentada la solicitud y disponer la emisión del permiso.",
    ],
    advertencia:
      "El permiso CITES es previo al embarque y el trámite tiene plazos propios: iniciá con anticipación. El expediente EUDR del Libro CTP sirve para acreditar la cadena.",
  },

  // ── 9. Anulación de guía de transporte forestal ───────────────────────────
  {
    id: "anulacion-gtf",
    nombre: "Comunicación de anulación de guía de transporte forestal",
    autoridad: "arffs",
    proposito: "Dejar constancia formal de que una GTF del talonario autorizado quedó anulada, para que no figure como guía sin rendir",
    asunto: "Comunico la anulación de Guía de Transporte Forestal",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "numeroGtfAnulada", label: "N° de GTF anulada", tipo: "texto", requerido: true, placeholder: "001-0000123" },
      { id: "fechaEmisionOriginal", label: "Fecha de emisión original", tipo: "fecha" },
      {
        id: "motivoAnulacion",
        label: "Motivo de la anulación",
        tipo: "texto",
        requerido: true,
        placeholder: "Error de llenado / deterioro del formato / guía no utilizada",
      },
      { id: "fechaAnulacion", label: "Fecha de anulación", tipo: "fecha", requerido: true },
      {
        id: "guiaReemplazo",
        label: "N° de guía de reemplazo (si la hay)",
        tipo: "texto",
        hint: "Dejalo vacío si esta guía no se reemplazó por otra",
      },
    ],
    anexos: [
      "Ejemplar físico de la guía anulada (inutilizado con el sello «ANULADO»)",
      "Extracto del Libro de Operaciones donde consta la anulación",
    ],
    cuerpo: (d) => [
      `Que, comunico a su Despacho la anulación de la Guía de Transporte Forestal N° ${v(d, "numeroGtfAnulada")}${d.fechaEmisionOriginal?.trim() ? `, emitida el ${v(d, "fechaEmisionOriginal")}` : ""}, correspondiente al talonario autorizado a mi cargo.`,
      `Motivo de la anulación: ${v(d, "motivoAnulacion")}.`,
      d.guiaReemplazo?.trim()
        ? `El transporte que amparaba quedó respaldado por la Guía N° ${v(d, "guiaReemplazo")}.`
        : "La presente guía no amparó movilización alguna de producto forestal.",
      `La anulación quedó asentada en el Libro de Operaciones con fecha ${v(d, "fechaAnulacion")}, conforme se acredita en el extracto que se adjunta.`,
      "Solicito a su Despacho tener presente la anulación de la guía referida para efectos del control del talonario a mi cargo.",
    ],
    advertencia:
      "El formato físico anulado se conserva inutilizado, nunca se destruye: es lo primero que pide un puesto de control o una fiscalización si preguntan por ese número.",
  },

  // ── 10. Ampliación de volumen autorizado (Plan de Manejo / POA) ───────────
  {
    id: "ampliacion-volumen-autorizado",
    nombre: "Solicitud de ampliación de volumen autorizado",
    autoridad: "arffs",
    proposito: "Pedir el incremento del volumen autorizado por especie en el Plan de Manejo Forestal (POA) del título habilitante",
    asunto: "Solicito ampliación del volumen autorizado en el Plan de Manejo Forestal",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      {
        id: "tituloHabilitante",
        label: "Título habilitante / N° de resolución",
        tipo: "texto",
        requerido: true,
        hint: "El que aprueba el Plan de Manejo vigente",
      },
      { id: "especieAmpliar", label: "Especie", tipo: "texto", requerido: true },
      {
        id: "volumenAutorizadoActual",
        label: "Volumen autorizado actual (m³)",
        tipo: "texto",
        requerido: true,
        hint: "Lo ves en Control → Balance del Libro de Títulos Habilitantes",
      },
      { id: "volumenAdicional", label: "Volumen adicional solicitado (m³)", tipo: "texto", requerido: true },
      {
        id: "sustentoTecnico",
        label: "Sustento técnico",
        tipo: "textarea",
        requerido: true,
        hint: "Censo forestal adicional, corrección de área, saldo de otra parcela del mismo plan…",
      },
    ],
    anexos: [
      "Informe técnico o censo forestal que sustenta el volumen adicional",
      "Copia de la resolución que aprueba el Plan de Manejo Forestal vigente",
      "Plano o mapa actualizado del área, si el sustento lo requiere",
    ],
    cuerpo: (d) => [
      `Que, siendo titular del título habilitante ${v(d, "tituloHabilitante")}, solicito la ampliación del volumen autorizado para la especie ${v(d, "especieAmpliar")} en el Plan de Manejo Forestal vigente.`,
      `El volumen actualmente autorizado para dicha especie es de ${v(d, "volumenAutorizadoActual")} m³, y solicito su ampliación en ${v(d, "volumenAdicional")} m³ adicionales.`,
      `Sustento técnico del pedido: ${v(d, "sustentoTecnico")}.`,
      "Adjunto la documentación técnica que sustenta el volumen adicional solicitado y quedo a disposición para la verificación de campo que su Autoridad considere necesaria.",
      "Por lo expuesto, solicito a su Despacho disponer la evaluación y aprobación de la ampliación de volumen requerida.",
    ],
    advertencia:
      "El TUPA de tu ARFFS fija si esto se tramita como modificación del Plan de Manejo o como un procedimiento propio de ampliación: confirmalo antes de presentar.",
  },

  // ── 11. Reposición de talonario de GTF por pérdida o deterioro ────────────
  {
    id: "reposicion-talonario-gtf",
    nombre: "Solicitud de reposición de talonario de GTF por pérdida o deterioro",
    autoridad: "arffs",
    proposito: "Pedir un talonario nuevo cuando el vigente se perdió, fue robado o quedó inutilizable, con declaración jurada del hecho",
    asunto: "Solicito reposición de talonario de Guías de Transporte Forestal por pérdida o deterioro",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General (declaración jurada)",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "serieExtraviada", label: "Serie del talonario afectado", tipo: "texto", requerido: true },
      { id: "rangoNumeros", label: "Rango de números afectados", tipo: "texto", requerido: true, placeholder: "001-0000150 al 001-0000200" },
      {
        id: "circunstancia",
        label: "Circunstancia",
        tipo: "texto",
        requerido: true,
        placeholder: "Pérdida / robo / deterioro por agua o fuego",
      },
      { id: "fechaHecho", label: "Fecha en que ocurrió", tipo: "fecha", requerido: true },
      {
        id: "denunciaPolicial",
        label: "N° de denuncia policial",
        tipo: "texto",
        hint: "Si el hecho fue robo o pérdida, cotejá con tu ARFFS si la exige",
      },
    ],
    anexos: [
      "Denuncia policial, si el hecho fue robo o pérdida (según lo exija el TUPA)",
      "Guías ya utilizadas del talonario afectado, si quedó alguna disponible",
      "Declaración jurada de las circunstancias del hecho",
    ],
    cuerpo: (d) => [
      `Que, declaro bajo juramento que el talonario de Guías de Transporte Forestal serie ${v(d, "serieExtraviada")}, correspondiente al rango ${v(d, "rangoNumeros")}, resultó ${v(d, "circunstancia")} el ${v(d, "fechaHecho")}.`,
      d.denunciaPolicial?.trim()
        ? `El hecho fue puesto en conocimiento de la autoridad policial mediante denuncia N° ${v(d, "denunciaPolicial")}, cuya copia se adjunta.`
        : "",
      "Los números del rango afectado quedan inutilizados para todo efecto: ninguna guía con esos correlativos ampara transporte alguno desde la fecha señalada.",
      "Por lo expuesto, solicito a su Despacho disponer la reposición de un nuevo talonario, dejando constancia de la inutilización del rango declarado.",
    ],
    advertencia: "Cotejá en el TUPA de tu ARFFS si exige la denuncia policial como requisito obligatorio (no solo recomendado) antes de presentar.",
  },

  // ── 12. Paralización temporal de operaciones ──────────────────────────────
  {
    id: "paralizacion-temporal",
    nombre: "Comunicación de paralización temporal de operaciones",
    autoridad: "arffs",
    proposito: "Avisar que la planta deja de operar por un período, para que la ausencia de registros en el Libro no se lea como una omisión",
    asunto: "Comunico paralización temporal de operaciones del Centro de Transformación Primaria",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "fechaInicioParalizacion", label: "Fecha de inicio", tipo: "fecha", requerido: true },
      {
        id: "fechaFinParalizacion",
        label: "Fecha estimada de reinicio",
        tipo: "fecha",
        hint: "Dejalo vacío si todavía no hay fecha cierta",
      },
      {
        id: "motivoParalizacion",
        label: "Motivo",
        tipo: "textarea",
        requerido: true,
        placeholder: "Mantenimiento de maquinaria / falta de materia prima / causa de fuerza mayor",
      },
    ],
    anexos: ["Documento que sustenta el motivo, si corresponde (informe técnico, parte policial, informe de siniestro)"],
    cuerpo: (d) => [
      `Que, comunico a su Despacho la paralización temporal de las operaciones de nuestro Centro de Transformación Primaria a partir del ${v(d, "fechaInicioParalizacion")}.`,
      `Motivo: ${v(d, "motivoParalizacion")}.`,
      d.fechaFinParalizacion?.trim()
        ? `Estimamos reiniciar operaciones el ${v(d, "fechaFinParalizacion")}; comunicaremos oportunamente cualquier variación de esta fecha.`
        : "Comunicaremos la fecha de reinicio de operaciones en cuanto se determine.",
      "Durante el período señalado no se registrarán movimientos en el Libro de Operaciones por ausencia de actividad, lo que ponemos en conocimiento de su Autoridad para evitar cualquier observación por vacío de registro.",
    ],
  },

  // ── 13. Renovación de registro del CTP ────────────────────────────────────
  {
    id: "renovacion-registro-ctp",
    nombre: "Solicitud de renovación de registro del CTP",
    autoridad: "arffs",
    proposito: "Pedir la renovación del registro del Centro de Transformación Primaria antes de que venza, para no operar con el registro caduco",
    asunto: "Solicito renovación del registro del Centro de Transformación Primaria",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "codigoRegistroCtp", label: "Código de registro del CTP", tipo: "texto", requerido: true, autollenado: "ficha" },
      { id: "fechaVencimientoRegistro", label: "Fecha de vencimiento del registro vigente", tipo: "fecha", requerido: true },
      {
        id: "cambiosDesdeElRegistro",
        label: "Cambios desde el último registro",
        tipo: "textarea",
        hint: "Maquinaria, capacidad, dirección — o «ninguno» si sigue igual",
      },
    ],
    anexos: [
      "Copia de la resolución de registro vigente",
      "Vigencia de poder del representante legal",
      "Comprobante de pago por derecho de trámite (según TUPA)",
    ],
    cuerpo: (d) => [
      `Que, siendo titular del Centro de Transformación Primaria con código de registro ${v(d, "codigoRegistroCtp")}, cuyo registro vence el ${v(d, "fechaVencimientoRegistro")}, solicito a su Despacho disponer su renovación.`,
      d.cambiosDesdeElRegistro?.trim()
        ? `Desde el último registro, se produjeron los siguientes cambios: ${v(d, "cambiosDesdeElRegistro")}.`
        : "No se han producido cambios en la planta desde el último registro.",
      "Adjunto la documentación que sustenta la vigencia de nuestra operación y quedo a disposición para la inspección que su Autoridad estime necesaria.",
    ],
    advertencia: "Iniciá el trámite con anticipación: operar con el registro vencido puede generar observaciones aunque la planta siga funcionando igual.",
  },

  // ── 14. Informe periódico de regencia forestal (Título Habilitante) ──────
  {
    id: "informe-regencia",
    nombre: "Informe periódico de regencia forestal",
    autoridad: "arffs",
    proposito: "El informe que el regente forestal presenta sobre el avance del aprovechamiento del título habilitante bajo su responsabilidad técnica",
    asunto: "Remito informe periódico de regencia forestal",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "regenteNombre", label: "Regente forestal", tipo: "texto", requerido: true, hint: "Nombre y N° de registro o habilitación profesional" },
      { id: "tituloHabilitanteRegencia", label: "Título habilitante", tipo: "texto", requerido: true },
      { id: "periodoRegencia", label: "Período que se informa", tipo: "texto", requerido: true, placeholder: "Julio-agosto 2026" },
      {
        id: "avanceAprovechamiento",
        label: "Avance del aprovechamiento",
        tipo: "textarea",
        requerido: true,
        hint: "Talado/trozado/movilizado del período — lo ves en Resumen y Analítica del Libro de Títulos Habilitantes",
      },
      { id: "incidenciasRegencia", label: "Incidencias u observaciones técnicas", tipo: "textarea" },
    ],
    anexos: [
      "Resumen del aprovechamiento del período (Libro de Títulos Habilitantes)",
      "Constancia de habilitación profesional vigente del regente",
    ],
    cuerpo: (d) => [
      `Que, en mi calidad de regente forestal (${v(d, "regenteNombre")}) del título habilitante ${v(d, "tituloHabilitanteRegencia")}, remito el presente informe correspondiente al período ${v(d, "periodoRegencia")}.`,
      `Avance del aprovechamiento: ${v(d, "avanceAprovechamiento")}.`,
      d.incidenciasRegencia?.trim() ? `Incidencias u observaciones técnicas del período: ${v(d, "incidenciasRegencia")}.` : "No se presentaron incidencias técnicas dignas de mención en el período.",
      "Adjunto el resumen del aprovechamiento y quedo a disposición para la verificación que su Autoridad estime necesaria.",
    ],
    advertencia: "La periodicidad exacta de la regencia (mensual, trimestral…) la fija tu Plan de Manejo o el TUPA de tu ARFFS: confirmala antes de presentar.",
  },

  // ── 15. Remisión del Libro de Operaciones del Título Habilitante ─────────
  {
    id: "remision-libro-th",
    nombre: "Remisión del Libro de Operaciones del Título Habilitante",
    autoridad: "arffs",
    proposito: "La carta que acompaña la información del período del Libro de Operaciones de tu título habilitante (LO-TH)",
    asunto: "Remito información del Libro de Operaciones del Título Habilitante",
    baseLegal: [
      "RDE N° 264-2019-MINAGRI-SERFOR-DE — formato del Libro de Operaciones de los Títulos Habilitantes",
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "tituloHabilitanteRemision", label: "Título habilitante", tipo: "texto", requerido: true },
      { id: "periodoRemisionTh", label: "Período que se remite", tipo: "texto", requerido: true },
      { id: "taladoPeriodoM3", label: "Talado del período (m³)", tipo: "texto", hint: "Lo ves en Resumen del Libro de Títulos Habilitantes" },
      { id: "movilizadoPeriodoM3", label: "Movilizado del período (m³)", tipo: "texto" },
      { id: "observacionesRemisionTh", label: "Observaciones", tipo: "textarea" },
    ],
    anexos: [
      "Libro de Operaciones del período en formato oficial (LO-TH)",
      "Balance de extracción por especie del período",
    ],
    cuerpo: (d) => [
      `Que, en cumplimiento de lo dispuesto por la RDE N° 264-2019-MINAGRI-SERFOR-DE, remito la información contenida en el Libro de Operaciones del título habilitante ${v(d, "tituloHabilitanteRemision")} correspondiente al período ${v(d, "periodoRemisionTh")}.`,
      `En dicho período se registró un volumen talado de ${v(d, "taladoPeriodoM3", "0.00")} m³${d.movilizadoPeriodoM3?.trim() ? ` y un volumen movilizado de ${v(d, "movilizadoPeriodoM3")} m³` : ""}, con el detalle que consta en el Libro adjunto.`,
      d.observacionesRemisionTh?.trim() ? `Observaciones: ${v(d, "observacionesRemisionTh")}.` : "",
      "La documentación de origen legal y las guías de transporte forestal emitidas se encuentran a disposición de su Autoridad en nuestras instalaciones.",
    ],
    advertencia: "Adjuntá el Libro en formato oficial: se descarga desde el Libro de Títulos Habilitantes.",
  },

  // ── 16. Recurso de reconsideración o apelación ────────────────────────────
  {
    id: "recurso-administrativo",
    nombre: "Recurso de reconsideración o apelación",
    autoridad: "arffs",
    proposito: "Impugnar una resolución de la autoridad — reconsideración ante quien la emitió, o apelación ante su superior jerárquico",
    asunto: "Interpongo recurso administrativo",
    baseLegal: [
      "Ley N° 27444 — Ley del Procedimiento Administrativo General (TUO, D.S. N° 004-2019-JUS), arts. 219 (reconsideración) y 220 (apelación)",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      {
        id: "tipoRecurso",
        label: "Tipo de recurso",
        tipo: "texto",
        requerido: true,
        placeholder: "Reconsideración / Apelación",
        hint: "Reconsideración: la resuelve la MISMA autoridad, con nueva prueba. Apelación: la eleva al superior jerárquico, sin necesidad de prueba nueva.",
      },
      {
        id: "resolucionImpugnada",
        label: "Resolución que se impugna",
        tipo: "texto",
        requerido: true,
        placeholder: "Resolución Directoral N° 018-2026-GOB.REG.UCAYALI-DRFFS",
      },
      { id: "fechaNotificacionResolucion", label: "Fecha de notificación de la resolución", tipo: "fecha", requerido: true },
      {
        id: "fundamentos",
        label: "Fundamentos del recurso",
        tipo: "textarea",
        requerido: true,
        hint: "Qué está mal de la resolución y por qué (hecho, norma o prueba nueva que la autoridad no evaluó)",
      },
      {
        id: "pedidoRecurso",
        label: "Lo que se pide",
        tipo: "textarea",
        requerido: true,
        placeholder: "Se revoque / se modifique / se deje sin efecto la resolución impugnada",
      },
    ],
    anexos: [
      "Copia de la resolución impugnada",
      "Cargo de notificación (acredita que el recurso se presenta dentro del plazo)",
      "Nueva prueba, si el recurso es de reconsideración",
    ],
    cuerpo: (d) => [
      `Que, habiendo sido notificado el ${v(d, "fechaNotificacionResolucion")} con la ${v(d, "resolucionImpugnada")}, y dentro del plazo legal, interpongo recurso de ${v(d, "tipoRecurso")} contra la citada resolución.`,
      `Fundamentos: ${v(d, "fundamentos")}.`,
      `Petitorio: ${v(d, "pedidoRecurso")}.`,
      "Adjunto la documentación que sustenta lo expuesto y solicito se tenga por interpuesto el presente recurso dentro del plazo legal.",
    ],
    advertencia:
      "El plazo para interponer el recurso es de 15 días hábiles perentorios desde la notificación (art. 216 TUO Ley 27444): vencido, el acto queda firme y ya no se puede recurrir. La reconsideración exige nueva prueba, salvo que la resolución la haya emitido un órgano de instancia única.",
  },

  // ── 17. Solicitud de ampliación de plazo ──────────────────────────────────
  {
    id: "ampliacion-plazo",
    nombre: "Solicitud de ampliación de plazo",
    autoridad: "otra",
    proposito: "Pedir más tiempo para presentar un descargo, informe o documentación antes de que venza el plazo",
    asunto: "Solicito ampliación de plazo",
    baseLegal: ["Ley N° 27444 — Ley del Procedimiento Administrativo General (TUO, D.S. N° 004-2019-JUS), art. 136.3 — prórroga"],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "expedientePlazo", label: "Expediente o notificación que fija el plazo", tipo: "texto", requerido: true },
      { id: "plazoOriginal", label: "Plazo original que vence", tipo: "fecha", requerido: true },
      { id: "plazoSolicitado", label: "Nueva fecha solicitada", tipo: "fecha", requerido: true },
      {
        id: "motivoAmpliacion",
        label: "Motivo",
        tipo: "textarea",
        requerido: true,
        placeholder: "Volumen de documentación / gestión ante un tercero / causa de fuerza mayor",
      },
    ],
    anexos: ["Documento que sustenta el motivo, si corresponde"],
    cuerpo: (d) => [
      `Que, en el marco del expediente ${v(d, "expedientePlazo")}, cuyo plazo vence el ${v(d, "plazoOriginal")}, solicito a su Despacho la ampliación de dicho plazo hasta el ${v(d, "plazoSolicitado")}.`,
      `Motivo de la solicitud: ${v(d, "motivoAmpliacion")}.`,
      "La presente solicitud se formula dentro del plazo original, conforme al artículo 136 de la Ley N° 27444, sin que el vencimiento haya sido causado por hecho imputable al administrado.",
      "Quedo a la espera de la resolución que corresponda.",
    ],
    advertencia:
      "La prórroga se concede UNA sola vez y hay que pedirla ANTES de que venza el plazo original (art. 136.3 TUO Ley 27444) — presentada el mismo día del vencimiento o después, ya no cabe.",
  },

  // ── 18. Denuncia policial por pérdida de GTF y Lista de Trozas ────────────
  {
    id: "denuncia-policial-perdida-gtf",
    nombre: "Denuncia policial por pérdida de GTF y Lista de Trozas",
    autoridad: "otra",
    proposito:
      "El relato de hechos para presentar en la comisaría (o para completar la Denuncia Policial Digital) cuando se pierde o roban la guía y la lista de trozas de un despacho",
    asunto: "Pongo en conocimiento la pérdida de Guía de Transporte Forestal y Lista de Trozas, y solicito registrar la denuncia",
    baseLegal: [
      "Constitución Política del Perú, artículo 2 inciso 20 — derecho de petición ante la autoridad competente",
      "Código Procesal Penal, artículo 326 — facultad y obligación de denunciar",
    ],
    campos: [
      {
        id: "destinatarioCargo",
        label: "Dirigido a (cargo)",
        tipo: "texto",
        requerido: true,
        placeholder: "Comisario",
        hint: "El comisario de turno, no un nombre propio",
        grupo: "destino",
      },
      {
        id: "destinatarioEntidad",
        label: "Comisaría",
        tipo: "texto",
        requerido: true,
        placeholder: "Comisaría PNP de (tu distrito)",
        hint: "La más cercana al lugar del hecho — no tiene que ser la de tu domicilio",
        grupo: "destino",
      },
      {
        id: "numeroGtfPerdida",
        label: "N° de GTF perdida",
        tipo: "texto",
        requerido: true,
        placeholder: "001-0000123",
      },
      {
        id: "especieProductoPerdido",
        label: "Especie / producto que amparaba",
        tipo: "texto",
        requerido: true,
        autollenado: "libro",
      },
      { id: "volumenAmparadoPerdido", label: "Volumen amparado (m³)", tipo: "texto", autollenado: "libro" },
      {
        id: "circunstanciaPerdidaGtf",
        label: "Cómo ocurrió",
        tipo: "textarea",
        requerido: true,
        placeholder: "Extravío / robo / asalto en ruta — contá el hecho tal como pasó, sin suposiciones",
        sugerencias: [
          {
            label: "Extravío en tránsito",
            texto: "Se extravió durante el transporte, posiblemente cayó del vehículo en un tramo de trocha o carretera sin pavimentar.",
          },
          {
            label: "Hurto (sin violencia)",
            texto: "Fue sustraída sin violencia, junto con otros documentos y efectos personales que se encontraban en el vehículo.",
          },
          {
            label: "Asalto en ruta",
            texto: "El vehículo fue interceptado en ruta por personas desconocidas, quienes sustrajeron la documentación junto con otros bienes.",
          },
          {
            label: "Extravío en el patio/almacén",
            texto: "Se extravió en el patio de acopio o almacén del CTP; pese a la búsqueda, no se pudo ubicar.",
          },
          {
            label: "Accidente de tránsito",
            texto: "El vehículo sufrió un accidente de tránsito y la documentación se perdió o resultó dañada en el siniestro.",
          },
        ],
      },
      {
        id: "lugarHechoGtf",
        label: "Lugar del hecho",
        tipo: "texto",
        requerido: true,
        hint: "Dirección, km de carretera o referencia del lugar",
        sugerencias: [
          { label: "Km de carretera", texto: "Km ___ de la carretera ___, en el trayecto de ___ a ___" },
          { label: "Patio/almacén del CTP", texto: "Patio de acopio / almacén del CTP" },
          { label: "Domicilio del transportista", texto: "Domicilio del transportista o chofer" },
          { label: "Vía pública", texto: "Vía pública, a la altura de ___" },
        ],
      },
      { id: "fechaHoraHechoGtf", label: "Fecha y hora aproximada", tipo: "fecha", requerido: true },
      {
        id: "personaACargoGtf",
        label: "Quién tenía la documentación",
        tipo: "texto",
        hint: "Nombre del chofer o transportista al momento del hecho",
      },
      { id: "vehiculoPlacaGtf", label: "Placa del vehículo (si aplica)", tipo: "texto", placeholder: "ABC-123" },
      ...CAMPOS_COMUNES.filter((c) => c.grupo === "firma"),
    ],
    anexos: [
      "Copia de tu DNI",
      "Copia o fotografía de la GTF, si conservás alguna (talón, foto del celular, PDF del aplicativo SERFOR)",
      "Copia o fotografía de la Lista de Trozas, si conservás algún registro",
    ],
    cuerpo: (d) => [
      `Que, mediante el presente documento pongo en conocimiento de su Despacho la pérdida de la Guía de Transporte Forestal N° ${v(d, "numeroGtfPerdida")} y su Lista de Trozas, documentos que amparaban el transporte de ${v(d, "volumenAmparadoPerdido", "un volumen de")} m³ de ${v(d, "especieProductoPerdido", "producto forestal")}.`,
      `El hecho ocurrió el ${v(d, "fechaHoraHechoGtf")} en ${v(d, "lugarHechoGtf")}, en las siguientes circunstancias: ${v(d, "circunstanciaPerdidaGtf")}.`,
      d.personaACargoGtf?.trim()
        ? `Al momento del hecho, la documentación se encontraba bajo responsabilidad de ${v(d, "personaACargoGtf")}${d.vehiculoPlacaGtf?.trim() ? `, quien conducía el vehículo de placa ${v(d, "vehiculoPlacaGtf")}` : ""}.`
        : "",
      "Por lo expuesto, solicito a su Despacho se sirva registrar la presente denuncia y expedir el certificado o constancia de denuncia policial correspondiente, documento que pondremos en conocimiento de la autoridad forestal competente.",
    ],
    advertencia:
      "Antes de ir a la comisaría, probá la Denuncia Policial Digital (gob.pe/11155 → sistemas.policia.gob.pe/denuncias_digitales): es gratis, está las 24 horas, cubre pérdida/robo de \"guía\" como categoría, y el certificado PDF que emite tiene la MISMA validez que el de comisaría. Usá este documento como guión de los hechos para esa declaración, o llevalo impreso si preferís hacer la denuncia en persona.",
  },

  // ── 19. Comunicación a SERFOR por pérdida de GTF ya emitida ──────────────
  {
    id: "comunicacion-perdida-gtf-serfor",
    nombre: "Comunicación a SERFOR por pérdida de GTF ya emitida",
    autoridad: "serfor",
    proposito:
      "Reportar formalmente la pérdida de una guía ya emitida y en uso (no un talonario en blanco), con el certificado de la denuncia policial adjunto y la trazabilidad de la madera hasta el Libro de Operaciones",
    asunto: "Comunico la pérdida de Guía de Transporte Forestal ya emitida, con denuncia policial adjunta",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
      "Ley N° 27444 — Ley del Procedimiento Administrativo General",
    ],
    campos: [
      {
        id: "destinatarioCargo",
        label: "Dirigido a (cargo)",
        tipo: "texto",
        requerido: true,
        placeholder: "Administrador Técnico Forestal y de Fauna Silvestre",
        hint: "El cargo de quien recibe en la Sede, no el nombre",
        grupo: "destino",
      },
      {
        id: "destinatarioEntidad",
        label: "Entidad / sede",
        tipo: "texto",
        requerido: true,
        placeholder: "SERFOR — Sede (la que corresponda a tu operación)",
        grupo: "destino",
      },
      { id: "numeroGtfPerdidaSerfor", label: "N° de GTF perdida", tipo: "texto", requerido: true, placeholder: "001-0000123" },
      { id: "fechaEmisionOriginalPerdida", label: "Fecha de emisión de la guía", tipo: "fecha" },
      { id: "especieProductoPerdidoSerfor", label: "Especie / producto amparado", tipo: "texto", requerido: true, autollenado: "libro" },
      { id: "volumenAmparadoPerdidoSerfor", label: "Volumen amparado (m³)", tipo: "texto", autollenado: "libro" },
      { id: "destinoGuiaPerdida", label: "Destino que declaraba la guía", tipo: "texto" },
      { id: "fechaHechoSerfor", label: "Fecha del hecho", tipo: "fecha", requerido: true },
      {
        id: "numeroDenunciaPolicialSerfor",
        label: "N° de certificado de denuncia policial",
        tipo: "texto",
        requerido: true,
        hint: "El que emite la comisaría o la Denuncia Policial Digital — es el anexo obligatorio de este trámite",
      },
      {
        id: "entradaLibroRefPerdida",
        label: "Asiento del Libro que respalda el origen",
        tipo: "texto",
        hint: "N° de libro del ingreso o de la corrida de la que salió esta madera — lo ves en la ficha de la operación",
      },
      ...CAMPOS_COMUNES.filter((c) => c.grupo === "firma"),
    ],
    anexos: [
      "Certificado de denuncia policial (obligatorio — física o la Denuncia Policial Digital)",
      "Copia del asiento del Libro de Operaciones que sustenta el origen legal de la madera transportada",
      "Copia o fotografía de la Lista de Trozas, si se conserva algún respaldo",
    ],
    cuerpo: (d) => [
      `Que, pongo en conocimiento de su Despacho la pérdida de la Guía de Transporte Forestal N° ${v(d, "numeroGtfPerdidaSerfor")}${d.fechaEmisionOriginalPerdida?.trim() ? `, emitida el ${v(d, "fechaEmisionOriginalPerdida")}` : ""}, que amparaba el transporte de ${v(d, "volumenAmparadoPerdidoSerfor", "un volumen de")} m³ de ${v(d, "especieProductoPerdidoSerfor")}${d.destinoGuiaPerdida?.trim() ? ` con destino a ${v(d, "destinoGuiaPerdida")}` : ""}.`,
      `El hecho ocurrió el ${v(d, "fechaHechoSerfor")} y fue puesto en conocimiento de la Policía Nacional del Perú, la cual expidió el certificado de denuncia N° ${v(d, "numeroDenunciaPolicialSerfor")}, que se adjunta a la presente.`,
      d.entradaLibroRefPerdida?.trim()
        ? `La operación que amparaba la guía extraviada se encuentra registrada en el asiento N° ${v(d, "entradaLibroRefPerdida")} de nuestro Libro de Operaciones, donde consta el origen legal de la materia prima y su trazabilidad.`
        : "El origen legal de la materia prima transportada consta en nuestro Libro de Operaciones, a disposición de su Autoridad para la verificación que estime pertinente.",
      "Por lo expuesto, solicito a su Despacho tener por comunicada la pérdida de la guía referida y disponer se deje constancia de la inutilización de dicho número para todo efecto, sin perjuicio de la responsabilidad que pudiera corresponder conforme a los hechos denunciados.",
    ],
    advertencia:
      "Confirmá con tu Sede si además de SERFOR corresponde copia a tu ARFFS: la guía la visa y controla el correlativo la Autoridad Regional, aunque el registro final viva en el SNIFFS. El certificado de denuncia policial es el anexo que no puede faltar — sin él, este documento sólo es un aviso, no un respaldo.",
  },

  // ── 20. Aviso de inicio de aprovechamiento / zafra ────────────────────────
  {
    id: "aviso-inicio-aprovechamiento",
    nombre: "Aviso de inicio de aprovechamiento o zafra",
    autoridad: "arffs",
    proposito: "Comunicar que arranca la extracción del Plan Operativo Anual (POA) vigente, cuando el propio plan pide avisar antes de la primera tala",
    asunto: "Comunico el inicio de las actividades de aprovechamiento forestal",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "tituloHabilitanteInicio", label: "Título habilitante", tipo: "texto", requerido: true },
      { id: "poaVigenteInicio", label: "POA / período aprobado", tipo: "texto", requerido: true, placeholder: "Campaña 2026" },
      { id: "fechaInicioAprovechamiento", label: "Fecha de inicio", tipo: "fecha", requerido: true },
      {
        id: "especiesAprovechar",
        label: "Especies programadas para esta etapa",
        tipo: "textarea",
        requerido: true,
      },
      { id: "volumenProgramadoInicio", label: "Volumen estimado (m³)", tipo: "texto" },
      { id: "responsableCampoInicio", label: "Responsable en campo", tipo: "texto", hint: "Regente forestal o encargado de la cuadrilla" },
    ],
    anexos: [
      "Copia de la resolución que aprueba el Plan Operativo Anual vigente",
      "Cronograma de actividades del Plan",
    ],
    cuerpo: (d) => [
      `Que, en el marco del Plan Operativo Anual "${v(d, "poaVigenteInicio")}" aprobado para el título habilitante ${v(d, "tituloHabilitanteInicio")}, comunico a su Despacho el inicio de las actividades de aprovechamiento forestal a partir del ${v(d, "fechaInicioAprovechamiento")}.`,
      `Las especies programadas para esta etapa son: ${v(d, "especiesAprovechar")}${d.volumenProgramadoInicio?.trim() ? `, por un volumen estimado de ${v(d, "volumenProgramadoInicio")} m³` : ""}, conforme a lo aprobado en el Plan.`,
      d.responsableCampoInicio?.trim()
        ? `Las actividades de campo estarán a cargo de ${v(d, "responsableCampoInicio")}, quien reportará el avance conforme al informe periódico de regencia.`
        : "",
      "Ponemos en conocimiento de su Autoridad el inicio de operaciones a efectos de la programación de las visitas de supervisión que estime pertinentes.",
    ],
    advertencia:
      "Cotejá en tu Plan de Manejo si el aviso de inicio es un requisito EXPRESO con plazo de anticipación, o una buena práctica sin plazo fijo: lo que obliga es lo que dice tu propio plan aprobado, no una norma genérica.",
  },

  // ── 21. Apertura de vía de extracción / camino forestal ───────────────────
  {
    id: "apertura-via-extraccion",
    nombre: "Solicitud de apertura de vía de extracción",
    autoridad: "arffs",
    proposito: "Pedir autorización para abrir un camino o vía de extracción nueva dentro del área de aprovechamiento",
    asunto: "Solicito autorización de apertura de vía de extracción forestal",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "tituloHabilitanteVia", label: "Título habilitante", tipo: "texto", requerido: true },
      { id: "ubicacionVia", label: "Ubicación de la vía", tipo: "texto", requerido: true, hint: "Coordenadas UTM o referencia del tramo dentro del área" },
      { id: "longitudVia", label: "Longitud aproximada", tipo: "texto", placeholder: "1.2 km" },
      {
        id: "justificacionVia",
        label: "Justificación",
        tipo: "textarea",
        requerido: true,
        placeholder: "Acceso al bloque de aprovechamiento programado para esta campaña",
      },
    ],
    anexos: [
      "Croquis o mapa de la vía sobre el plano del Plan de Manejo",
      "Coordenadas UTM del trazo propuesto",
    ],
    cuerpo: (d) => [
      `Que, siendo titular del título habilitante ${v(d, "tituloHabilitanteVia")}, solicito a su Despacho la autorización para la apertura de una vía de extracción forestal ubicada en ${v(d, "ubicacionVia")}${d.longitudVia?.trim() ? `, con una longitud aproximada de ${v(d, "longitudVia")}` : ""}.`,
      `La vía solicitada se justifica en lo siguiente: ${v(d, "justificacionVia")}.`,
      "La apertura se realizará con las medidas de manejo que eviten impactos innecesarios sobre el bosque remanente, conforme a las prácticas de aprovechamiento de impacto reducido.",
      "Adjunto el croquis de ubicación de la vía y quedo a disposición para la verificación de campo que su Autoridad considere necesaria.",
    ],
    advertencia:
      "Si el trazo no figuraba en tu Plan de Manejo aprobado, puede que necesite tramitarse como una modificación del plan y no como una autorización suelta: confirmalo con tu ARFFS antes de presentar.",
  },

  // ── 22. Siniestro en el área de aprovechamiento ───────────────────────────
  {
    id: "siniestro-forestal",
    nombre: "Comunicación de siniestro en el área de aprovechamiento",
    autoridad: "arffs",
    proposito: "Avisar formalmente un incendio, inundación o plaga que afecta el bosque bajo manejo, como sustento para un futuro ajuste del POA",
    asunto: "Comunico siniestro en el área de aprovechamiento forestal",
    baseLegal: [
      "Ley N° 29763 — Ley Forestal y de Fauna Silvestre",
      "D.S. N° 018-2015-MINAGRI — Reglamento para la Gestión Forestal",
    ],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "tituloHabilitanteSiniestro", label: "Título habilitante", tipo: "texto", requerido: true },
      {
        id: "tipoSiniestro",
        label: "Tipo de siniestro",
        tipo: "texto",
        requerido: true,
        placeholder: "Incendio forestal / inundación / plaga / viento (windthrow)",
      },
      { id: "fechaSiniestro", label: "Fecha del siniestro", tipo: "fecha", requerido: true },
      { id: "areaAfectadaHa", label: "Área afectada (ha, estimado)", tipo: "texto" },
      { id: "especiesAfectadasSiniestro", label: "Especies con mayor incidencia", tipo: "texto" },
      {
        id: "accionesTomadasSiniestro",
        label: "Acciones tomadas",
        tipo: "textarea",
        hint: "Control del siniestro, aviso a bomberos o Defensa Civil, medidas de contención",
      },
    ],
    anexos: [
      "Fotografías o reporte del área afectada",
      "Constancia de bomberos, Defensa Civil u otra autoridad, si el siniestro fue reportado",
    ],
    cuerpo: (d) => [
      `Que, comunico a su Despacho el siniestro ocurrido el ${v(d, "fechaSiniestro")} en el área de aprovechamiento del título habilitante ${v(d, "tituloHabilitanteSiniestro")}, consistente en: ${v(d, "tipoSiniestro")}.`,
      `${d.areaAfectadaHa?.trim() ? `El área estimada afectada es de ${v(d, "areaAfectadaHa")} hectáreas` : "El área afectada se encuentra en evaluación"}${d.especiesAfectadasSiniestro?.trim() ? `, con mayor incidencia sobre: ${v(d, "especiesAfectadasSiniestro")}` : ""}.`,
      d.accionesTomadasSiniestro?.trim() ? `Acciones tomadas: ${v(d, "accionesTomadasSiniestro")}.` : "",
      "Ponemos el hecho en conocimiento de su Autoridad a efectos de que se tenga presente al momento de evaluar el cumplimiento del Plan de Manejo del período, y solicitamos disponer la verificación de campo que estime pertinente.",
    ],
    advertencia:
      "Este aviso deja constancia del hecho; si el siniestro te impide cumplir el volumen o el cronograma del POA, todavía tenés que tramitar el reajuste del plan por separado — este documento es el sustento, no el pedido de ajuste en sí.",
  },

  // ── 23. Oficio o carta genérica ───────────────────────────────────────────
  {
    id: "carta-generica",
    nombre: "Carta u oficio a la autoridad",
    autoridad: "otra",
    proposito: "Cualquier comunicación con el membrete y los datos legales del CTP ya puestos",
    asunto: "",
    baseLegal: ["Ley N° 27444 — Ley del Procedimiento Administrativo General"],
    campos: [
      ...CAMPOS_COMUNES,
      { id: "asuntoLibre", label: "Asunto", tipo: "texto", requerido: true },
      { id: "referencia", label: "Referencia", tipo: "texto", hint: "Expediente, resolución o documento previo" },
      { id: "cuerpoLibre", label: "Cuerpo del documento", tipo: "textarea", requerido: true, hint: "Un párrafo por línea" },
      { id: "pedido", label: "Lo que se solicita", tipo: "textarea" },
    ],
    anexos: [],
    cuerpo: (d) => [
      ...v(d, "cuerpoLibre", "")
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
      d.pedido?.trim() ? `Por lo expuesto, solicito a usted: ${v(d, "pedido")}.` : "",
    ],
  },
];

export const formatoPorId = (id: string): FormatoTramite | undefined =>
  FORMATOS_TRAMITE.find((f) => f.id === id);

/** Campos requeridos sin valor — la UI no deja generar el documento así. */
export function faltantesDelTramite(formato: FormatoTramite, datos: DatosTramite): CampoTramite[] {
  return formato.campos.filter((c) => c.requerido && !(datos[c.id] ?? "").trim());
}

/** El asunto que va en el documento: el libre del formulario o el del formato. */
export function asuntoDe(formato: FormatoTramite, datos: DatosTramite): string {
  const libre = (datos.asuntoLibre ?? "").trim();
  return libre || formato.asunto;
}

/** Párrafos del cuerpo, ya sin los vacíos que dejan los campos opcionales. */
export function cuerpoDe(formato: FormatoTramite, datos: DatosTramite): string[] {
  return formato.cuerpo(datos).map((p) => p.trim()).filter(Boolean);
}

/**
 * Los datos de un trámite ya presentado, listos para arrancar uno NUEVO
 * (Duplicar): destinatario/entidad/firma se repiten casi siempre, así que
 * copiarlos ahorra re-tipear. Se excluyen las FECHAS y la tabla de guías
 * (`guiasJson`, ADR-364): son propias del período viejo, y arrastrarlas
 * declararía hoy un dato de otro mes sin que el operador lo note. Los demás
 * campos (incluso identificadores puntuales como un N° de GTF) quedan tal
 * cual — el operador los revisa antes de guardar, como con cualquier copia.
 */
export function datosParaDuplicar(formato: FormatoTramite, datos: DatosTramite): DatosTramite {
  const fechaIds = new Set(formato.campos.filter((c) => c.tipo === "fecha").map((c) => c.id));
  const seed: DatosTramite = {};
  for (const [k, val] of Object.entries(datos)) {
    if (fechaIds.has(k) || k === "guiasJson") continue;
    seed[k] = val;
  }
  return seed;
}
