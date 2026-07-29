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

export const AUTORIDADES: Record<AutoridadTramite, { label: string; detalle: string }> = {
  arffs: {
    label: "ARFFS (Gobierno Regional)",
    detalle: "Autoridad Regional Forestal y de Fauna Silvestre — registra el CTP y autoriza el foliado",
  },
  serfor: {
    label: "SERFOR",
    detalle: "Autoridad nacional rectora — normativa, registros y SNIFFS",
  },
  osinfor: {
    label: "OSINFOR",
    detalle: "Supervisor y fiscalizador de títulos habilitantes",
  },
  otra: { label: "Otra autoridad", detalle: "Municipalidad, MINAM, aduanas u otra entidad" },
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
  },
  {
    id: "destinatarioEntidad",
    label: "Entidad",
    tipo: "texto",
    requerido: true,
    placeholder: "Gobierno Regional de Ucayali",
  },
  {
    id: "firmante",
    label: "Quién firma",
    tipo: "texto",
    requerido: true,
    autollenado: "ficha",
    hint: "Titular del CTP o su representante legal",
  },
  {
    id: "firmanteDni",
    label: "DNI del firmante",
    tipo: "texto",
    placeholder: "12345678",
  },
  {
    id: "lugar",
    label: "Lugar de la firma",
    tipo: "texto",
    autollenado: "ficha",
    hint: "La ciudad que va antes de la fecha (\"Pucallpa, 29 de julio de 2026\")",
  },
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

  // ── 7. Constancia / permiso CITES ────────────────────────────────────────
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

  // ── 8. Oficio o carta genérica ───────────────────────────────────────────
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
