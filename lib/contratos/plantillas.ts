/**
 * Plantillas legales peruanas + los ayudantes que las rellenan (ADR-307).
 *
 * Vivían dentro de ContratosModule.tsx, que pasaba las 2.200 líneas. Son datos
 * puros: sirven igual en el cliente (el asistente de creación) y en el servidor
 * (el PDF y el revisor de cláusulas), así que no importan nada de React.
 */
import type { ContractTipo } from "@/lib/types/contracts";

export interface TemplateField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required: boolean;
  options?: string[];
  placeholder?: string;
  group: "emisor" | "contraparte" | "contrato";
}

export interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  legalBasis: string;
  icon: string;
  tipo: ContractTipo;
  fields: TemplateField[];
  clausulas: string[];
  summaryTemplate: string;
}

// ── Plantillas Legales Peruanas ────────────────────────────────────────────

export const PLANTILLAS: ContractTemplate[] = [
  // 1. COMPRAVENTA DE MERCADERIA
  {
    id: "compraventa-mercaderia",
    name: "Compraventa de Mercaderia",
    category: "Comercial",
    description: "Contrato para la transferencia de propiedad de bienes muebles (mercaderia) entre comerciantes.",
    legalBasis: "Art. 1529-1601 del Codigo Civil Peruano",
    icon: "Package",
    tipo: "VENTA",
    fields: [
      { key: "NOMBRE_VENDEDOR", label: "Nombre/Razon Social del Vendedor", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "emisor" },
      { key: "RUC_VENDEDOR", label: "RUC del Vendedor", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_VENDEDOR", label: "Domicilio del Vendedor", type: "text", required: true, placeholder: "Jr. San Martin 123, Pucallpa", group: "emisor" },
      { key: "REPRESENTANTE_VENDEDOR", label: "Representante Legal", type: "text", required: false, placeholder: "Nombre del representante", group: "emisor" },
      { key: "NOMBRE_COMPRADOR", label: "Nombre/Razon Social del Comprador", type: "text", required: true, placeholder: "Nombre completo o razon social", group: "contraparte" },
      { key: "DNI_COMPRADOR", label: "DNI/RUC del Comprador", type: "text", required: true, placeholder: "DNI o RUC", group: "contraparte" },
      { key: "DOMICILIO_COMPRADOR", label: "Domicilio del Comprador", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "DESCRIPCION_MERCADERIA", label: "Descripcion de la Mercaderia", type: "textarea", required: true, placeholder: "Detalle de productos, cantidades, calidades...", group: "contrato" },
      { key: "PRECIO_TOTAL", label: "Precio Total (S/)", type: "number", required: true, placeholder: "0.00", group: "contrato" },
      { key: "PRECIO_LETRAS", label: "Precio en Letras", type: "text", required: true, placeholder: "Mil quinientos soles", group: "contrato" },
      { key: "FORMA_PAGO", label: "Forma de Pago", type: "select", required: true, options: ["Contado", "Credito a 15 dias", "Credito a 30 dias", "Credito a 60 dias", "50% adelanto, 50% contra entrega", "Letras de cambio"], group: "contrato" },
      { key: "FECHA_ENTREGA", label: "Fecha de Entrega", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "LUGAR_ENTREGA", label: "Lugar de Entrega", type: "text", required: true, placeholder: "Almacen del comprador, Pucallpa", group: "contrato" },
      { key: "PLAZO_GARANTIA", label: "Plazo de Garantia (dias)", type: "number", required: false, placeholder: "30", group: "contrato" },
      { key: "PENALIDAD_PORCENTAJE", label: "Penalidad por Incumplimiento (%)", type: "number", required: false, placeholder: "2", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad de Celebracion", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de compraventa de mercaderia que celebran de conformidad con los articulos 1529 al 1601 del Codigo Civil Peruano, de una parte, {{NOMBRE_VENDEDOR}}, con RUC N.o {{RUC_VENDEDOR}}, con domicilio en {{DOMICILIO_VENDEDOR}}, debidamente representada por {{REPRESENTANTE_VENDEDOR}}, a quien en adelante se denominara EL VENDEDOR; y de otra parte, {{NOMBRE_COMPRADOR}}, identificado(a) con DNI/RUC N.o {{DNI_COMPRADOR}}, con domicilio en {{DOMICILIO_COMPRADOR}}, a quien en adelante se denominara EL COMPRADOR.",
      "CLAUSULA PRIMERA.- OBJETO DEL CONTRATO: Por el presente contrato, EL VENDEDOR se obliga a transferir la propiedad de los siguientes bienes muebles (mercaderia) a favor de EL COMPRADOR: {{DESCRIPCION_MERCADERIA}}. La mercaderia debera cumplir con las especificaciones de calidad, cantidad y caracteristicas acordadas por ambas partes, conforme al articulo 1532 del Codigo Civil.",
      "CLAUSULA SEGUNDA.- PRECIO Y FORMA DE PAGO: El precio total pactado por la mercaderia objeto del presente contrato es de S/ {{PRECIO_TOTAL}} (Son: {{PRECIO_LETRAS}} soles). La forma de pago sera: {{FORMA_PAGO}}. En caso de pago diferido, el incumplimiento en el pago de cualquier cuota dara derecho al VENDEDOR a exigir el pago total del saldo pendiente, conforme al articulo 1561 del Codigo Civil.",
      "CLAUSULA TERCERA.- ENTREGA DE LA MERCADERIA: EL VENDEDOR se obliga a entregar la mercaderia en {{LUGAR_ENTREGA}}, en la fecha {{FECHA_ENTREGA}}. La entrega se acreditara mediante guia de remision y/o acta de conformidad suscrita por ambas partes. El riesgo de perdida o deterioro de los bienes se transfiere al COMPRADOR en el momento de la entrega, conforme al articulo 1567 del Codigo Civil.",
      "CLAUSULA CUARTA.- GARANTIA: EL VENDEDOR garantiza que la mercaderia se encuentra libre de vicios ocultos y defectos de fabricacion. EL COMPRADOR dispondra de un plazo de {{PLAZO_GARANTIA}} dias calendario desde la recepcion para formular reclamos por defectos visibles, faltantes o disconformidades. Vencido dicho plazo sin observacion, se entendera otorgada la conformidad total, conforme al articulo 1503 del Codigo Civil (saneamiento por vicios ocultos).",
      "CLAUSULA QUINTA.- PENALIDAD POR INCUMPLIMIENTO: En caso de incumplimiento en la entrega por parte del VENDEDOR, este pagara una penalidad equivalente al {{PENALIDAD_PORCENTAJE}}% del precio total por cada semana de retraso, hasta un máximo del 10% del monto total. En caso de falta de pago oportuno por parte del COMPRADOR, se aplicara un interes moratorio conforme a la tasa maxima fijada por el Banco Central de Reserva del Peru (BCRP).",
      "CLAUSULA SEXTA.- RESOLUCION DEL CONTRATO: Cualquiera de las partes podra resolver el presente contrato ante el incumplimiento sustancial de las obligaciones por la otra parte, previa comunicacion notarial otorgando un plazo de subsanacion de siete (7) dias habiles, conforme al articulo 1429 del Codigo Civil. La resolucion no libera al incumpliente del pago de la penalidad pactada ni de la indemnizacion por danos y perjuicios.",
      "CLAUSULA SEPTIMA.- DOMICILIO Y JURISDICCION: Para todos los efectos del presente contrato, las partes senalan como sus domicilios los indicados en la parte introductoria, donde se les hara llegar las comunicaciones y notificaciones de ley. Cualquier controversia derivada del presente contrato sera resuelta por los jueces y tribunales del distrito judicial de {{CIUDAD}}, renunciando ambas partes a cualquier otro fuero que pudiera corresponderles.",
      "En senal de conformidad, las partes suscriben el presente contrato en dos (2) ejemplares de igual tenor y valor, en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Este contrato es entre {{NOMBRE_VENDEDOR}} (vendedor) y {{NOMBRE_COMPRADOR}} (comprador) para la venta de: {{DESCRIPCION_MERCADERIA}}, por un total de S/ {{PRECIO_TOTAL}}. El pago se hace {{FORMA_PAGO}}. La entrega es el {{FECHA_ENTREGA}} en {{LUGAR_ENTREGA}}. Si alguien no cumple, paga una penalidad del {{PENALIDAD_PORCENTAJE}}% por semana de retraso.",
  },

  // 2. CONTRATO DE TRABAJO A PLAZO FIJO
  {
    id: "trabajo-plazo-fijo",
    name: "Contrato de Trabajo a Plazo Fijo",
    category: "Laboral",
    description: "Contrato sujeto a modalidad para contratar trabajadores por tiempo determinado con todos los beneficios de ley.",
    legalBasis: "D.S. 003-97-TR, TUO D.Leg. 728 — Ley de Productividad y Competitividad Laboral",
    icon: "Briefcase",
    tipo: "TRABAJO",
    fields: [
      { key: "NOMBRE_EMPLEADOR", label: "Razon Social del Empleador", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "emisor" },
      { key: "RUC_EMPLEADOR", label: "RUC del Empleador", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_EMPLEADOR", label: "Domicilio del Empleador", type: "text", required: true, placeholder: "Jr. San Martin 123, Pucallpa", group: "emisor" },
      { key: "REPRESENTANTE_EMPLEADOR", label: "Representante Legal", type: "text", required: true, placeholder: "Nombre del representante", group: "emisor" },
      { key: "NOMBRE_TRABAJADOR", label: "Nombre Completo del Trabajador", type: "text", required: true, placeholder: "Nombres y apellidos completos", group: "contraparte" },
      { key: "DNI_TRABAJADOR", label: "DNI del Trabajador", type: "text", required: true, placeholder: "XXXXXXXX", group: "contraparte" },
      { key: "DOMICILIO_TRABAJADOR", label: "Domicilio del Trabajador", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "CARGO", label: "Cargo / Puesto", type: "text", required: true, placeholder: "Cajero, Almacenero, Repartidor...", group: "contrato" },
      { key: "MODALIDAD", label: "Modalidad del Contrato", type: "select", required: true, options: ["Inicio de actividad (Art. 57)", "Necesidades del mercado (Art. 58)", "Reconversion empresarial (Art. 59)", "Ocasional (Art. 60)", "Suplencia (Art. 61)", "Obra determinada (Art. 63)"], group: "contrato" },
      { key: "CAUSA_OBJETIVA", label: "Causa Objetiva de Contratacion", type: "textarea", required: true, placeholder: "Descripcion de la causa que justifica la contratacion temporal...", group: "contrato" },
      { key: "REMUNERACION", label: "Remuneracion Mensual (S/)", type: "number", required: true, placeholder: "1025.00", group: "contrato" },
      { key: "FECHA_INICIO", label: "Fecha de Inicio", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "FECHA_FIN", label: "Fecha de Fin", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "PERIODO_PRUEBA", label: "Periodo de Prueba (meses)", type: "select", required: true, options: ["3 meses (general)", "6 meses (confianza)", "12 meses (direccion)"], group: "contrato" },
      { key: "JORNADA", label: "Jornada Laboral", type: "select", required: true, options: ["8 horas diarias / 48 horas semanales", "6 horas diarias (part-time)", "4 horas diarias (part-time)"], group: "contrato" },
      { key: "HORARIO", label: "Horario de Trabajo", type: "text", required: true, placeholder: "8:00 a.m. a 5:00 p.m.", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de trabajo sujeto a modalidad que celebran al amparo del Texto Único Ordenado del Decreto Legislativo 728 — Ley de Productividad y Competitividad Laboral, aprobado por Decreto Supremo N.o 003-97-TR, de una parte, {{NOMBRE_EMPLEADOR}}, con RUC N.o {{RUC_EMPLEADOR}}, con domicilio en {{DOMICILIO_EMPLEADOR}}, representada por {{REPRESENTANTE_EMPLEADOR}}, a quien en adelante se denominara EL EMPLEADOR; y de otra parte, {{NOMBRE_TRABAJADOR}}, identificado(a) con DNI N.o {{DNI_TRABAJADOR}}, con domicilio en {{DOMICILIO_TRABAJADOR}}, a quien en adelante se denominara EL TRABAJADOR; en los terminos y condiciones siguientes:",
      "CLAUSULA PRIMERA.- ANTECEDENTES Y CAUSA OBJETIVA: EL EMPLEADOR es una persona juridica dedicada al comercio minorista de abarrotes y productos de primera necesidad. Requiere contratar los servicios de EL TRABAJADOR bajo la modalidad de {{MODALIDAD}}, por la siguiente causa objetiva: {{CAUSA_OBJETIVA}}. Esta contratacion se realiza conforme a los articulos 53 al 83 del D.S. 003-97-TR.",
      "CLAUSULA SEGUNDA.- OBJETO: EL EMPLEADOR contrata los servicios de EL TRABAJADOR para desempenar el cargo de {{CARGO}}, realizando las funciones propias del puesto conforme al Manual de Organizacion y Funciones (MOF) de la empresa.",
      "CLAUSULA TERCERA.- DURACION Y PERIODO DE PRUEBA: El presente contrato tiene una duracion determinada, iniciandose el {{FECHA_INICIO}} y concluyendo el {{FECHA_FIN}}, sin necesidad de previo aviso para su terminacion. El periodo de prueba sera de {{PERIODO_PRUEBA}}, conforme al articulo 10 del D.S. 003-97-TR. Durante el periodo de prueba, cualquiera de las partes puede resolver el contrato sin expresion de causa.",
      "CLAUSULA CUARTA.- REMUNERACION: EL TRABAJADOR percibira una remuneracion mensual bruta de S/ {{REMUNERACION}}, sujeta a los descuentos de ley (aportes al sistema de pensiones ONP/AFP, e impuesto a la renta de quinta categoria cuando corresponda). El pago se realizara de forma mensual, mediante deposito en cuenta bancaria del trabajador.",
      "CLAUSULA QUINTA.- JORNADA Y HORARIO DE TRABAJO: La jornada laboral sera de {{JORNADA}}, conforme al articulo 25 de la Constitucion Politica del Peru y al D.S. 007-2002-TR. El horario de trabajo sera de {{HORARIO}}, de lunes a sabado. Las horas extras se remuneraran con la sobretasa de ley: 25% las dos primeras horas y 35% las siguientes, conforme al D.S. 007-2002-TR.",
      "CLAUSULA SEXTA.- BENEFICIOS SOCIALES: EL TRABAJADOR gozara de todos los beneficios laborales que le corresponden conforme a la legislacion peruana vigente: (a) Compensacion por Tiempo de Servicios (CTS) conforme al D.S. 001-97-TR, depositada semestralmente en mayo y noviembre; (b) Gratificaciones legales en julio y diciembre equivalentes a una remuneracion mensual cada una, conforme a la Ley 27735; (c) Descanso vacacional de 30 dias calendario por cada ano completo de servicios, conforme al D.Leg. 713; (d) Seguro social de salud (EsSalud) a cargo del empleador, equivalente al 9% de la remuneracion; (e) Seguro Complementario de Trabajo de Riesgo (SCTR) si corresponde a la actividad; (f) Asignacion familiar de S/ 102.50 cuando corresponda, conforme a la Ley 25129.",
      "CLAUSULA SEPTIMA.- OBLIGACIONES DEL TRABAJADOR: EL TRABAJADOR se compromete a: (a) Cumplir con las funciones asignadas con diligencia y eficiencia; (b) Respetar el Reglamento Interno de Trabajo; (c) Cuidar los bienes, mercaderia e instalaciones del negocio; (d) Mantener la confidencialidad de la informacion comercial, de clientes y proveedores; (e) Someterse a los controles de inventario y arqueos de caja que disponga el empleador.",
      "CLAUSULA OCTAVA.- CAUSALES DE EXTINCION: El presente contrato se extinguira por las causales previstas en el articulo 16 del D.S. 003-97-TR: vencimiento del plazo, fallecimiento, renuncia (con 30 dias de preaviso), mutuo disenso, invalidez absoluta permanente, jubilacion, despido por causa justa, y las demas previstas por ley. En caso de despido injustificado antes del vencimiento del plazo, EL EMPLEADOR abonara una indemnizacion equivalente a una remuneracion y media mensual por cada mes dejado de laborar hasta el vencimiento del contrato, con un máximo de doce remuneraciones, conforme al articulo 76 del D.S. 003-97-TR.",
      "CLAUSULA NOVENA.- JURISDICCION: Para la solucion de cualquier controversia derivada del presente contrato, las partes se someten a la jurisdiccion de los juzgados laborales del distrito judicial de {{CIUDAD}}, conforme a la Ley 29497 — Nueva Ley Procesal del Trabajo.",
      "En senal de conformidad, las partes suscriben el presente contrato en tres (3) ejemplares de igual tenor y valor (uno para cada parte y uno para el Ministerio de Trabajo), en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Este es un contrato de trabajo a plazo fijo entre {{NOMBRE_EMPLEADOR}} (empleador) y {{NOMBRE_TRABAJADOR}} (trabajador). El puesto es {{CARGO}} con un sueldo de S/ {{REMUNERACION}} al mes. El contrato va desde el {{FECHA_INICIO}} hasta el {{FECHA_FIN}}. Incluye todos los beneficios de ley: CTS, gratificaciones, vacaciones y EsSalud.",
  },

  // 3. CONTRATO DE TRABAJO A PLAZO INDETERMINADO
  {
    id: "trabajo-indeterminado",
    name: "Contrato de Trabajo a Plazo Indeterminado",
    category: "Laboral",
    description: "Contrato de trabajo sin fecha de termino, con estabilidad laboral y todos los beneficios de ley.",
    legalBasis: "D.Leg. 728 — Ley de Productividad y Competitividad Laboral",
    icon: "Users",
    tipo: "TRABAJO",
    fields: [
      { key: "NOMBRE_EMPLEADOR", label: "Razon Social del Empleador", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "emisor" },
      { key: "RUC_EMPLEADOR", label: "RUC del Empleador", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_EMPLEADOR", label: "Domicilio del Empleador", type: "text", required: true, placeholder: "Jr. San Martin 123, Pucallpa", group: "emisor" },
      { key: "REPRESENTANTE_EMPLEADOR", label: "Representante Legal", type: "text", required: true, placeholder: "Nombre del representante", group: "emisor" },
      { key: "NOMBRE_TRABAJADOR", label: "Nombre Completo del Trabajador", type: "text", required: true, placeholder: "Nombres y apellidos completos", group: "contraparte" },
      { key: "DNI_TRABAJADOR", label: "DNI del Trabajador", type: "text", required: true, placeholder: "XXXXXXXX", group: "contraparte" },
      { key: "DOMICILIO_TRABAJADOR", label: "Domicilio del Trabajador", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "CARGO", label: "Cargo / Puesto", type: "text", required: true, placeholder: "Administrador, Cajero principal...", group: "contrato" },
      { key: "REMUNERACION", label: "Remuneracion Mensual (S/)", type: "number", required: true, placeholder: "1025.00", group: "contrato" },
      { key: "FECHA_INICIO", label: "Fecha de Inicio", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "JORNADA", label: "Jornada Laboral", type: "select", required: true, options: ["8 horas diarias / 48 horas semanales", "6 horas diarias (part-time)", "4 horas diarias (part-time)"], group: "contrato" },
      { key: "HORARIO", label: "Horario de Trabajo", type: "text", required: true, placeholder: "8:00 a.m. a 5:00 p.m.", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de trabajo a plazo indeterminado que celebran al amparo del Texto Único Ordenado del Decreto Legislativo 728, aprobado por Decreto Supremo N.o 003-97-TR, de una parte, {{NOMBRE_EMPLEADOR}}, con RUC N.o {{RUC_EMPLEADOR}}, con domicilio en {{DOMICILIO_EMPLEADOR}}, representada por {{REPRESENTANTE_EMPLEADOR}}, a quien en adelante se denominara EL EMPLEADOR; y de otra parte, {{NOMBRE_TRABAJADOR}}, identificado(a) con DNI N.o {{DNI_TRABAJADOR}}, con domicilio en {{DOMICILIO_TRABAJADOR}}, a quien en adelante se denominara EL TRABAJADOR.",
      "CLAUSULA PRIMERA.- OBJETO: EL EMPLEADOR contrata los servicios de EL TRABAJADOR para que desempene el cargo de {{CARGO}} de manera permanente e indeterminada, realizando las funciones inherentes a dicho puesto.",
      "CLAUSULA SEGUNDA.- INICIO: El presente contrato surte efectos a partir del {{FECHA_INICIO}}, siendo de duracion indeterminada. El periodo de prueba sera de tres (3) meses, conforme al articulo 10 del D.S. 003-97-TR.",
      "CLAUSULA TERCERA.- REMUNERACION: EL TRABAJADOR percibira una remuneracion mensual bruta de S/ {{REMUNERACION}}, sujeta a los descuentos y aportes de ley. El pago se realizara de forma mensual.",
      "CLAUSULA CUARTA.- JORNADA Y HORARIO: La jornada laboral sera de {{JORNADA}}. El horario de trabajo sera de {{HORARIO}}. Las horas extras se remuneraran conforme al D.S. 007-2002-TR.",
      "CLAUSULA QUINTA.- BENEFICIOS SOCIALES: EL TRABAJADOR gozara de todos los beneficios que la ley establece: CTS (D.S. 001-97-TR), gratificaciones (Ley 27735), vacaciones (D.Leg. 713), EsSalud (9%), y asignacion familiar (Ley 25129) cuando corresponda.",
      "CLAUSULA SEXTA.- OBLIGACIONES: EL TRABAJADOR se compromete a cumplir con sus funciones, respetar el reglamento interno, cuidar los bienes de la empresa y mantener la confidencialidad de la informacion comercial.",
      "CLAUSULA SEPTIMA.- EXTINCION: El contrato podra extinguirse unicamente por las causales previstas en el articulo 16 del D.S. 003-97-TR. En caso de despido arbitrario, EL EMPLEADOR pagara una indemnizacion equivalente a una remuneracion y media mensual por cada ano completo de servicios, con un máximo de doce remuneraciones (Art. 38 D.S. 003-97-TR).",
      "CLAUSULA OCTAVA.- JURISDICCION: Las partes se someten a la jurisdiccion de los juzgados laborales de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Contrato de trabajo permanente (sin fecha de fin) entre {{NOMBRE_EMPLEADOR}} y {{NOMBRE_TRABAJADOR}} para el puesto de {{CARGO}}. Sueldo: S/ {{REMUNERACION}} mensuales. Incluye CTS, gratificaciones, vacaciones y EsSalud.",
  },

  // 4. LOCACION DE SERVICIOS
  {
    id: "locacion-servicios",
    name: "Locacion de Servicios",
    category: "Servicios",
    description: "Contrato civil para servicios independientes sin relacion laboral. El prestador emite recibos por honorarios.",
    legalBasis: "Art. 1764-1770 del Codigo Civil Peruano",
    icon: "PenTool",
    tipo: "LOCACION",
    fields: [
      { key: "NOMBRE_COMITENTE", label: "Nombre/Razon Social del Comitente", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "emisor" },
      { key: "RUC_COMITENTE", label: "RUC del Comitente", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_COMITENTE", label: "Domicilio del Comitente", type: "text", required: true, placeholder: "Jr. San Martin 123, Pucallpa", group: "emisor" },
      { key: "NOMBRE_LOCADOR", label: "Nombre del Locador (Prestador)", type: "text", required: true, placeholder: "Nombre completo del prestador", group: "contraparte" },
      { key: "DNI_LOCADOR", label: "DNI/RUC del Locador", type: "text", required: true, placeholder: "DNI o RUC", group: "contraparte" },
      { key: "DOMICILIO_LOCADOR", label: "Domicilio del Locador", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "DESCRIPCION_SERVICIO", label: "Descripcion del Servicio", type: "textarea", required: true, placeholder: "Detalle del servicio a prestar...", group: "contrato" },
      { key: "RETRIBUCION", label: "Retribucion Total (S/)", type: "number", required: true, placeholder: "0.00", group: "contrato" },
      { key: "FORMA_PAGO", label: "Forma de Pago", type: "select", required: true, options: ["Contra entrega del servicio", "50% al inicio, 50% al termino", "Mensual", "Por entregables"], group: "contrato" },
      { key: "FECHA_INICIO", label: "Fecha de Inicio", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "FECHA_FIN", label: "Fecha de Termino", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de locacion de servicios que celebran de conformidad con los articulos 1764 al 1770 del Codigo Civil Peruano, de una parte, {{NOMBRE_COMITENTE}}, con RUC N.o {{RUC_COMITENTE}}, con domicilio en {{DOMICILIO_COMITENTE}}, a quien en adelante se denominara EL COMITENTE; y de otra parte, {{NOMBRE_LOCADOR}}, identificado(a) con DNI/RUC N.o {{DNI_LOCADOR}}, con domicilio en {{DOMICILIO_LOCADOR}}, a quien en adelante se denominara EL LOCADOR.",
      "CLAUSULA PRIMERA.- OBJETO: EL LOCADOR se obliga a prestar el siguiente servicio a favor de EL COMITENTE, sin subordinacion: {{DESCRIPCION_SERVICIO}}. EL LOCADOR realizara el servicio con sus propios medios, herramientas y conocimientos tecnicos, conforme al articulo 1764 del Codigo Civil.",
      "CLAUSULA SEGUNDA.- RETRIBUCION: La retribucion por el servicio sera de S/ {{RETRIBUCION}}. La forma de pago sera: {{FORMA_PAGO}}. EL LOCADOR emitira el correspondiente recibo por honorarios electrónico (SUNAT) para cada pago recibido. Se aplicara la retencion del impuesto a la renta de cuarta categoria cuando corresponda (8%).",
      "CLAUSULA TERCERA.- PLAZO: El servicio sera ejecutado desde el {{FECHA_INICIO}} hasta el {{FECHA_FIN}}. EL LOCADOR no podra ceder su posicion contractual sin autorizacion escrita del COMITENTE.",
      "CLAUSULA CUARTA.- INDEPENDENCIA Y NO SUBORDINACION: Queda expresamente establecido que EL LOCADOR presta sus servicios de forma autonoma e independiente, sin sujecion a horario fijo, sin exclusividad, y sin relacion laboral de subordinacion o dependencia con EL COMITENTE, conforme al articulo 1764 del Codigo Civil. El presente contrato no genera vinculo laboral alguno.",
      "CLAUSULA QUINTA.- OBLIGACIONES DEL LOCADOR: EL LOCADOR se obliga a: (a) ejecutar el servicio personalmente y con la diligencia debida; (b) informar periodicamente al COMITENTE sobre el avance del servicio; (c) entregar el resultado del servicio en el plazo pactado.",
      "CLAUSULA SEXTA.- RESOLUCION: El contrato podra resolverse por mutuo acuerdo, incumplimiento de cualquiera de las partes, o vencimiento del plazo. En caso de resolucion anticipada sin causa justificada, la parte que resuelva indemnizara a la otra por los danos causados.",
      "CLAUSULA SEPTIMA.- JURISDICCION: Las partes se someten a la jurisdiccion de los jueces civiles de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Contrato de servicios independientes (sin relacion laboral) entre {{NOMBRE_COMITENTE}} y {{NOMBRE_LOCADOR}}. Servicio: {{DESCRIPCION_SERVICIO}}. Pago: S/ {{RETRIBUCION}} ({{FORMA_PAGO}}). Del {{FECHA_INICIO}} al {{FECHA_FIN}}. El locador emite recibos por honorarios.",
  },

  // 5. CONTRATO DE SUMINISTRO
  {
    id: "suministro",
    name: "Contrato de Suministro",
    category: "Comercial",
    description: "Acuerdo de provision periodica y continuada de mercaderia entre proveedor y bodega.",
    legalBasis: "Art. 1604-1620 del Codigo Civil Peruano",
    icon: "Truck",
    tipo: "PROVEEDOR",
    fields: [
      { key: "NOMBRE_SUMINISTRANTE", label: "Nombre/Razon Social del Proveedor", type: "text", required: true, placeholder: "Distribuidora ABC S.A.C.", group: "emisor" },
      { key: "RUC_SUMINISTRANTE", label: "RUC del Proveedor", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_SUMINISTRANTE", label: "Domicilio del Proveedor", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NOMBRE_SUMINISTRADO", label: "Nombre/Razon Social del Adquirente", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "contraparte" },
      { key: "RUC_SUMINISTRADO", label: "RUC del Adquirente", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "contraparte" },
      { key: "DOMICILIO_SUMINISTRADO", label: "Domicilio del Adquirente", type: "text", required: true, placeholder: "Jr. San Martin 123, Pucallpa", group: "contraparte" },
      { key: "LISTA_PRODUCTOS", label: "Productos a Suministrar", type: "textarea", required: true, placeholder: "Arroz, azucar, aceite, fideos...", group: "contrato" },
      { key: "FRECUENCIA", label: "Frecuencia de Entrega", type: "select", required: true, options: ["Semanal", "Quincenal", "Mensual", "Bimensual"], group: "contrato" },
      { key: "PEDIDO_MINIMO", label: "Pedido Mínimo (S/)", type: "number", required: true, placeholder: "500.00", group: "contrato" },
      { key: "PLAZO_PAGO", label: "Plazo de Pago (dias)", type: "select", required: true, options: ["Contado", "7 dias", "15 dias", "30 dias", "60 dias"], group: "contrato" },
      { key: "VIGENCIA_MESES", label: "Vigencia (meses)", type: "number", required: true, placeholder: "12", group: "contrato" },
      { key: "EXCLUSIVIDAD", label: "Clausula de Exclusividad", type: "select", required: false, options: ["No aplica", "Exclusividad por zona", "Exclusividad por marca", "Exclusividad total"], group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de suministro que celebran de conformidad con los articulos 1604 al 1620 del Codigo Civil Peruano, de una parte, {{NOMBRE_SUMINISTRANTE}}, con RUC N.o {{RUC_SUMINISTRANTE}}, con domicilio en {{DOMICILIO_SUMINISTRANTE}}, a quien en adelante se denominara EL SUMINISTRANTE; y de otra parte, {{NOMBRE_SUMINISTRADO}}, con RUC N.o {{RUC_SUMINISTRADO}}, con domicilio en {{DOMICILIO_SUMINISTRADO}}, a quien en adelante se denominara EL SUMINISTRADO.",
      "CLAUSULA PRIMERA.- OBJETO: EL SUMINISTRANTE se obliga a proveer de forma periodica y continuada los siguientes productos: {{LISTA_PRODUCTOS}}, conforme a las condiciones de calidad, cantidad y especificaciones acordadas (Art. 1604 del Codigo Civil).",
      "CLAUSULA SEGUNDA.- FRECUENCIA Y CANTIDAD: Las entregas se realizaran con frecuencia {{FRECUENCIA}}, con un pedido mínimo de S/ {{PEDIDO_MINIMO}} por cada orden. Los pedidos se cursaran con al menos 3 dias habiles de anticipacion.",
      "CLAUSULA TERCERA.- PRECIO: Los precios se fijan conforme a la lista de precios vigente al momento de cada pedido. Los precios podran revisarse trimestralmente con previo aviso de 15 dias. Los incrementos no podran superar el indice de precios al consumidor (IPC) publicado por el INEI.",
      "CLAUSULA CUARTA.- FORMA DE PAGO: El pago se realizara a {{PLAZO_PAGO}} de recibida la factura y la mercaderia conforme, mediante transferencia bancaria o deposito en cuenta.",
      "CLAUSULA QUINTA.- CALIDAD Y RECLAMOS: EL SUMINISTRANTE garantiza que los productos cumplen con las normas sanitarias (DIGESA), las Normas Tecnicas Peruanas aplicables y los registros sanitarios vigentes. EL SUMINISTRADO podra rechazar mercaderia defectuosa, vencida o que no cumpla especificaciones dentro de las 24 horas de recibida, conforme al articulo 1612 del Codigo Civil.",
      "CLAUSULA SEXTA.- PENALIDAD POR INCUMPLIMIENTO: El incumplimiento en la entrega generara una penalidad del 2% del valor del pedido por cada dia de retraso (Art. 1614 CC). Si el incumplimiento supera los 15 dias, el SUMINISTRADO podra resolver el contrato.",
      "CLAUSULA SEPTIMA.- EXCLUSIVIDAD: {{EXCLUSIVIDAD}}. De pactarse exclusividad, el SUMINISTRANTE no podra abastecer a comercios competidores en un radio de 500 metros.",
      "CLAUSULA OCTAVA.- VIGENCIA: El contrato tendra una vigencia de {{VIGENCIA_MESES}} meses, renovable automaticamente por periodos iguales, salvo comunicacion escrita con 30 dias de anticipacion (Art. 1611 CC).",
      "CLAUSULA NOVENA.- JURISDICCION: Las partes se someten a los jueces comerciales de {{CIUDAD}}.",
      "En senal de conformidad, ambas partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Contrato de suministro periodico entre {{NOMBRE_SUMINISTRANTE}} (proveedor) y {{NOMBRE_SUMINISTRADO}} (comprador). Productos: {{LISTA_PRODUCTOS}}. Entregas: {{FRECUENCIA}}. Pedido mínimo: S/ {{PEDIDO_MINIMO}}. Pago: {{PLAZO_PAGO}}. Vigencia: {{VIGENCIA_MESES}} meses.",
  },

  // 6. ARRENDAMIENTO DE LOCAL COMERCIAL
  {
    id: "arrendamiento-local",
    name: "Arrendamiento de Local Comercial",
    category: "Inmobiliario",
    description: "Contrato de alquiler de local comercial con clausula de desalojo express (Ley 30201).",
    legalBasis: "Art. 1666-1712 del Codigo Civil, Ley 30201 (desalojo notarial express)",
    icon: "Home",
    tipo: "ALQUILER",
    fields: [
      { key: "NOMBRE_ARRENDADOR", label: "Nombre del Propietario", type: "text", required: true, placeholder: "Nombre del propietario", group: "emisor" },
      { key: "DNI_ARRENDADOR", label: "DNI del Propietario", type: "text", required: true, placeholder: "XXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_ARRENDADOR", label: "Domicilio del Propietario", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NOMBRE_ARRENDATARIO", label: "Nombre/Razon Social del Arrendatario", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "contraparte" },
      { key: "RUC_ARRENDATARIO", label: "DNI/RUC del Arrendatario", type: "text", required: true, placeholder: "DNI o RUC", group: "contraparte" },
      { key: "DOMICILIO_ARRENDATARIO", label: "Domicilio del Arrendatario", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "DIRECCION_INMUEBLE", label: "Direccion del Inmueble", type: "text", required: true, placeholder: "Direccion exacta del local", group: "contrato" },
      { key: "AREA_M2", label: "Area del Local (m2)", type: "number", required: true, placeholder: "50", group: "contrato" },
      { key: "RENTA_MENSUAL", label: "Renta Mensual (S/)", type: "number", required: true, placeholder: "1500.00", group: "contrato" },
      { key: "GARANTIA_MESES", label: "Garantia (meses de renta)", type: "select", required: true, options: ["1 mes", "2 meses", "3 meses"], group: "contrato" },
      { key: "DURACION_MESES", label: "Duracion del Contrato (meses)", type: "number", required: true, placeholder: "12", group: "contrato" },
      { key: "FECHA_INICIO", label: "Fecha de Inicio", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "USO_PERMITIDO", label: "Uso Permitido", type: "text", required: true, placeholder: "Local comercial — bodega/abarrotes", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de arrendamiento de bien inmueble para uso comercial que celebran de conformidad con los articulos 1666 al 1712 del Codigo Civil Peruano y la Ley 30201 (Ley del Desalojo Notarial), de una parte, {{NOMBRE_ARRENDADOR}}, identificado(a) con DNI N.o {{DNI_ARRENDADOR}}, con domicilio en {{DOMICILIO_ARRENDADOR}}, propietario(a) del inmueble, a quien en adelante se denominara EL ARRENDADOR; y de otra parte, {{NOMBRE_ARRENDATARIO}}, con DNI/RUC N.o {{RUC_ARRENDATARIO}}, con domicilio en {{DOMICILIO_ARRENDATARIO}}, a quien en adelante se denominara EL ARRENDATARIO.",
      "CLAUSULA PRIMERA.- OBJETO: EL ARRENDADOR cede en uso temporal el inmueble ubicado en {{DIRECCION_INMUEBLE}}, con un area de {{AREA_M2}} m2, para uso exclusivo como: {{USO_PERMITIDO}}. EL ARRENDATARIO no podra destinar el inmueble a un fin distinto al pactado (Art. 1681 inc. 1 CC).",
      "CLAUSULA SEGUNDA.- RENTA (MERCED CONDUCTIVA): La renta mensual pactada es de S/ {{RENTA_MENSUAL}}, pagadera dentro de los primeros cinco (5) dias de cada mes, mediante deposito bancario o transferencia. El incumplimiento del pago por dos (2) meses consecutivos constituye causal de resolucion del contrato (Art. 1697 CC).",
      "CLAUSULA TERCERA.- GARANTIA: EL ARRENDATARIO entrega en calidad de garantia la suma equivalente a {{GARANTIA_MESES}} de renta, la cual sera devuelta al termino del contrato previa verificacion del buen estado del inmueble, descontando reparaciones pendientes y servicios impagos.",
      "CLAUSULA CUARTA.- PLAZO: El plazo del arrendamiento es de {{DURACION_MESES}} meses, iniciandose el {{FECHA_INICIO}}. La renovacion se pactara por acuerdo escrito de ambas partes con 30 dias de anticipacion al vencimiento.",
      "CLAUSULA QUINTA.- MANTENIMIENTO: EL ARRENDATARIO se obliga a mantener el inmueble en buen estado de conservacion y a realizar las reparaciones locativas (menores). Las reparaciones mayores o estructurales corresponden al ARRENDADOR (Art. 1680-1681 CC). Queda prohibido realizar modificaciones estructurales sin autorizacion escrita.",
      "CLAUSULA SEXTA.- SERVICIOS: Los pagos de energia electrica, agua potable, internet y teléfono corren por cuenta de EL ARRENDATARIO. El impuesto predial y los arbitrios municipales son de cargo de EL ARRENDADOR.",
      "CLAUSULA SEPTIMA.- SUBARRENDAMIENTO: EL ARRENDATARIO no podra subarrendar total ni parcialmente el inmueble, ni ceder su posicion contractual, sin autorizacion expresa y escrita de EL ARRENDADOR (Art. 1692 CC).",
      "CLAUSULA OCTAVA.- DESALOJO EXPRESS (LEY 30201): Las partes acuerdan someterse al procedimiento de desalojo notarial establecido en la Ley 30201, por lo que el presente contrato se inscribira en el Registro de Predios de SUNARP. Ante el vencimiento del plazo o la falta de pago de dos meses de renta, EL ARRENDADOR podra iniciar el desalojo notarial sin necesidad de proceso judicial.",
      "CLAUSULA NOVENA.- DEVOLUCION: Al termino del contrato, EL ARRENDATARIO devolvera el inmueble en el mismo estado en que lo recibio, salvo el deterioro por uso normal.",
      "CLAUSULA DECIMA.- JURISDICCION: Las partes se someten a los jueces civiles de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Contrato de alquiler de local en {{DIRECCION_INMUEBLE}} ({{AREA_M2}} m2). El propietario {{NOMBRE_ARRENDADOR}} alquila a {{NOMBRE_ARRENDATARIO}} por S/ {{RENTA_MENSUAL}} al mes. Duracion: {{DURACION_MESES}} meses desde el {{FECHA_INICIO}}. Garantia: {{GARANTIA_MESES}} de renta. Incluye clausula de desalojo express (Ley 30201).",
  },

  // 7. CONTRATO DE DISTRIBUCION
  {
    id: "distribucion",
    name: "Contrato de Distribucion",
    category: "Comercial",
    description: "Acuerdo para distribuir productos en un territorio o zona exclusiva.",
    legalBasis: "Basado en practicas comerciales peruanas y principios del Codigo Civil",
    icon: "Truck",
    tipo: "DISTRIBUCION",
    fields: [
      { key: "NOMBRE_PRINCIPAL", label: "Nombre del Principal (Proveedor)", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "emisor" },
      { key: "RUC_PRINCIPAL", label: "RUC del Principal", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_PRINCIPAL", label: "Domicilio del Principal", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NOMBRE_DISTRIBUIDOR", label: "Nombre del Distribuidor", type: "text", required: true, placeholder: "Nombre o razon social", group: "contraparte" },
      { key: "RUC_DISTRIBUIDOR", label: "DNI/RUC del Distribuidor", type: "text", required: true, placeholder: "DNI o RUC", group: "contraparte" },
      { key: "DOMICILIO_DISTRIBUIDOR", label: "Domicilio del Distribuidor", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "PRODUCTOS", label: "Productos a Distribuir", type: "textarea", required: true, placeholder: "Lista de productos...", group: "contrato" },
      { key: "ZONA", label: "Zona/Territorio Asignado", type: "text", required: true, placeholder: "Distrito de Calleria, Coronel Portillo", group: "contrato" },
      { key: "COMISION", label: "Comision (%)", type: "number", required: true, placeholder: "15", group: "contrato" },
      { key: "META_MENSUAL", label: "Meta Minima Mensual (S/)", type: "number", required: true, placeholder: "5000.00", group: "contrato" },
      { key: "VIGENCIA_MESES", label: "Vigencia (meses)", type: "number", required: true, placeholder: "12", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de distribucion comercial que celebran, de una parte, {{NOMBRE_PRINCIPAL}}, con RUC N.o {{RUC_PRINCIPAL}}, con domicilio en {{DOMICILIO_PRINCIPAL}}, a quien en adelante se denominara EL PRINCIPAL; y de otra parte, {{NOMBRE_DISTRIBUIDOR}}, con DNI/RUC N.o {{RUC_DISTRIBUIDOR}}, con domicilio en {{DOMICILIO_DISTRIBUIDOR}}, a quien en adelante se denominara EL DISTRIBUIDOR.",
      "CLAUSULA PRIMERA.- OBJETO: EL PRINCIPAL otorga a EL DISTRIBUIDOR la distribucion de los siguientes productos: {{PRODUCTOS}}, en la zona geografica de: {{ZONA}}.",
      "CLAUSULA SEGUNDA.- EXCLUSIVIDAD: EL DISTRIBUIDOR sera el único autorizado para comercializar los productos del PRINCIPAL en la zona asignada. A su vez, EL DISTRIBUIDOR se compromete a no comercializar productos de la competencia directa en la misma zona.",
      "CLAUSULA TERCERA.- PRECIOS Y COMISIONES: EL DISTRIBUIDOR percibira una comision del {{COMISION}}% sobre el precio de venta al público. Los precios de venta seran fijados por EL PRINCIPAL. Las liquidaciones se realizaran quincenalmente.",
      "CLAUSULA CUARTA.- METAS MINIMAS: EL DISTRIBUIDOR se compromete a alcanzar una meta minima de ventas de S/ {{META_MENSUAL}} mensuales. El incumplimiento reiterado (3 meses consecutivos) facultara al PRINCIPAL a resolver el contrato y revocar la exclusividad.",
      "CLAUSULA QUINTA.- USO DE MARCA: EL DISTRIBUIDOR podra utilizar las marcas y signos distintivos del PRINCIPAL exclusivamente para la comercializacion de los productos objeto del contrato, conforme al D.Leg. 1075.",
      "CLAUSULA SEXTA.- VIGENCIA: El contrato tendra una vigencia de {{VIGENCIA_MESES}} meses, renovable por acuerdo de las partes.",
      "CLAUSULA SEPTIMA.- RESOLUCION: El contrato podra resolverse por: incumplimiento de metas por 3 meses consecutivos, actos que danien la marca, incumplimiento de obligaciones contractuales, o mutuo acuerdo. La resolucion surtira efecto a los 30 dias de la comunicacion notarial.",
      "CLAUSULA OCTAVA.- JURISDICCION: Las partes se someten a los jueces comerciales de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Contrato de distribucion entre {{NOMBRE_PRINCIPAL}} y {{NOMBRE_DISTRIBUIDOR}} para comercializar: {{PRODUCTOS}} en la zona de {{ZONA}}. Comision: {{COMISION}}%. Meta mensual: S/ {{META_MENSUAL}}. Vigencia: {{VIGENCIA_MESES}} meses.",
  },

  // 8. CONSIGNACION
  {
    id: "consignacion",
    name: "Contrato de Consignacion",
    category: "Comercial",
    description: "Entrega de mercaderia para venta sin transferir la propiedad hasta la venta efectiva.",
    legalBasis: "Art. 1804-1814 del Codigo Civil Peruano (estimatorio)",
    icon: "Package",
    tipo: "CONSIGNACION",
    fields: [
      { key: "NOMBRE_CONSIGNANTE", label: "Nombre del Consignante (Proveedor)", type: "text", required: true, placeholder: "Proveedor S.A.C.", group: "emisor" },
      { key: "RUC_CONSIGNANTE", label: "RUC del Consignante", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_CONSIGNANTE", label: "Domicilio del Consignante", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NOMBRE_CONSIGNATARIO", label: "Nombre del Consignatario (Bodega)", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "contraparte" },
      { key: "RUC_CONSIGNATARIO", label: "RUC del Consignatario", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "contraparte" },
      { key: "DOMICILIO_CONSIGNATARIO", label: "Domicilio del Consignatario", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "MERCADERIA", label: "Descripcion de la Mercaderia", type: "textarea", required: true, placeholder: "Productos, cantidades, precios unitarios...", group: "contrato" },
      { key: "VALOR_TOTAL", label: "Valor Total de la Mercaderia (S/)", type: "number", required: true, placeholder: "0.00", group: "contrato" },
      { key: "COMISION", label: "Comision del Consignatario (%)", type: "number", required: true, placeholder: "20", group: "contrato" },
      { key: "PLAZO_LIQUIDACION", label: "Plazo de Liquidacion (dias)", type: "number", required: true, placeholder: "30", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato estimatorio (consignacion) que celebran de conformidad con los articulos 1804 al 1814 del Codigo Civil Peruano, de una parte, {{NOMBRE_CONSIGNANTE}}, con RUC N.o {{RUC_CONSIGNANTE}}, con domicilio en {{DOMICILIO_CONSIGNANTE}}, a quien en adelante se denominara EL CONSIGNANTE; y de otra parte, {{NOMBRE_CONSIGNATARIO}}, con RUC N.o {{RUC_CONSIGNATARIO}}, con domicilio en {{DOMICILIO_CONSIGNATARIO}}, a quien en adelante se denominara EL CONSIGNATARIO.",
      "CLAUSULA PRIMERA.- OBJETO: EL CONSIGNANTE entrega al CONSIGNATARIO la siguiente mercaderia para su venta al público: {{MERCADERIA}}. La propiedad de los bienes permanece en el CONSIGNANTE hasta que se realice la venta efectiva al consumidor final (Art. 1804 CC).",
      "CLAUSULA SEGUNDA.- VALOR Y PRECIO: El valor total de la mercaderia consignada es de S/ {{VALOR_TOTAL}}. EL CONSIGNATARIO vendera al precio establecido por el CONSIGNANTE, reteniendo una comision del {{COMISION}}% sobre cada venta realizada.",
      "CLAUSULA TERCERA.- LIQUIDACION: EL CONSIGNATARIO liquidara las ventas realizadas cada {{PLAZO_LIQUIDACION}} dias calendario, entregando al CONSIGNANTE el importe correspondiente menos su comision. La liquidacion se acompanara de un detalle de ventas.",
      "CLAUSULA CUARTA.- DEVOLUCION: La mercaderia no vendida debera ser devuelta al CONSIGNANTE en las mismas condiciones en que fue recibida, a solicitud de cualquiera de las partes. El CONSIGNATARIO no podra disponer de la mercaderia para fines distintos a la venta (Art. 1808 CC).",
      "CLAUSULA QUINTA.- RESPONSABILIDAD Y SEGURO: EL CONSIGNATARIO sera responsable de la custodia, conservacion y cuidado de la mercaderia. En caso de perdida, robo o deterioro por causas imputables al CONSIGNATARIO, este debera pagar el valor total de la mercaderia afectada.",
      "CLAUSULA SEXTA.- RESOLUCION: El contrato podra resolverse por: vencimiento del plazo, mutuo acuerdo, incumplimiento en la liquidacion, o deterioro imputable de la mercaderia.",
      "CLAUSULA SEPTIMA.- JURISDICCION: Las partes se someten a los jueces civiles de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Contrato de consignacion: {{NOMBRE_CONSIGNANTE}} entrega mercaderia a {{NOMBRE_CONSIGNATARIO}} para venderla. Mercaderia: {{MERCADERIA}} (valor: S/ {{VALOR_TOTAL}}). El consignatario cobra {{COMISION}}% de comision. Liquidacion cada {{PLAZO_LIQUIDACION}} dias. Lo que no se vende se devuelve.",
  },

  // 9. MUTUO / PRESTAMO
  {
    id: "mutuo-prestamo",
    name: "Contrato de Mutuo (Prestamo)",
    category: "Financiero",
    description: "Contrato de prestamo de dinero con tasa de interes y cronograma de pagos.",
    legalBasis: "Art. 1648-1665 del Codigo Civil Peruano",
    icon: "DollarSign",
    tipo: "MUTUO",
    fields: [
      { key: "NOMBRE_MUTUANTE", label: "Nombre del Prestamista", type: "text", required: true, placeholder: "Nombre completo o razon social", group: "emisor" },
      { key: "DNI_MUTUANTE", label: "DNI/RUC del Prestamista", type: "text", required: true, placeholder: "DNI o RUC", group: "emisor" },
      { key: "DOMICILIO_MUTUANTE", label: "Domicilio del Prestamista", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NOMBRE_MUTUATARIO", label: "Nombre del Prestatario", type: "text", required: true, placeholder: "Nombre completo", group: "contraparte" },
      { key: "DNI_MUTUATARIO", label: "DNI/RUC del Prestatario", type: "text", required: true, placeholder: "DNI o RUC", group: "contraparte" },
      { key: "DOMICILIO_MUTUATARIO", label: "Domicilio del Prestatario", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "MONTO_PRESTAMO", label: "Monto del Prestamo (S/)", type: "number", required: true, placeholder: "5000.00", group: "contrato" },
      { key: "MONTO_LETRAS", label: "Monto en Letras", type: "text", required: true, placeholder: "Cinco mil soles", group: "contrato" },
      { key: "TASA_INTERES", label: "Tasa de Interes Mensual (%)", type: "number", required: true, placeholder: "1.5", group: "contrato" },
      { key: "PLAZO_MESES", label: "Plazo de Devolucion (meses)", type: "number", required: true, placeholder: "12", group: "contrato" },
      { key: "GARANTIA", label: "Garantia Ofrecida", type: "textarea", required: false, placeholder: "Descripcion de la garantia (mueble, inmueble, fiador)...", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de mutuo (prestamo de dinero) que celebran de conformidad con los articulos 1648 al 1665 del Codigo Civil Peruano, de una parte, {{NOMBRE_MUTUANTE}}, identificado(a) con DNI/RUC N.o {{DNI_MUTUANTE}}, con domicilio en {{DOMICILIO_MUTUANTE}}, a quien en adelante se denominara EL MUTUANTE (Prestamista); y de otra parte, {{NOMBRE_MUTUATARIO}}, identificado(a) con DNI/RUC N.o {{DNI_MUTUATARIO}}, con domicilio en {{DOMICILIO_MUTUATARIO}}, a quien en adelante se denominara EL MUTUATARIO (Prestatario).",
      "CLAUSULA PRIMERA.- OBJETO: Por el presente contrato, EL MUTUANTE entrega en calidad de prestamo la suma de S/ {{MONTO_PRESTAMO}} (Son: {{MONTO_LETRAS}} soles) a favor de EL MUTUATARIO, quien declara recibir dicho monto a su entera satisfaccion (Art. 1648 CC).",
      "CLAUSULA SEGUNDA.- TASA DE INTERES: El prestamo devengara un interes compensatorio del {{TASA_INTERES}}% mensual, conforme al articulo 1242 del Codigo Civil. La tasa pactada no excede la tasa maxima de interes convencional fijada por el Banco Central de Reserva del Peru (BCRP). En caso de mora, se aplicara adicionalmente un interes moratorio conforme a ley.",
      "CLAUSULA TERCERA.- PLAZO DE DEVOLUCION: EL MUTUATARIO se obliga a devolver el monto prestado mas los intereses en un plazo de {{PLAZO_MESES}} meses, mediante cuotas mensuales iguales que incluyen capital e intereses. El cronograma de pagos se adjunta como Anexo 1.",
      "CLAUSULA CUARTA.- GARANTIA: Para asegurar el cumplimiento de la obligacion, EL MUTUATARIO ofrece la siguiente garantia: {{GARANTIA}}. En caso de no especificar garantia, el prestamo se entiende con garantia personal (quirografaria).",
      "CLAUSULA QUINTA.- VENCIMIENTO ANTICIPADO: EL MUTUANTE podra dar por vencido el plazo y exigir el pago total de la deuda si EL MUTUATARIO incurre en mora de dos (2) cuotas consecutivas, conforme al articulo 1323 del Codigo Civil.",
      "CLAUSULA SEXTA.- PAGO ANTICIPADO: EL MUTUATARIO tiene derecho a realizar pagos anticipados parciales o totales, con la correspondiente reduccion de intereses (Art. 1658 CC).",
      "CLAUSULA SEPTIMA.- JURISDICCION: Las partes se someten a los jueces civiles de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Prestamo de S/ {{MONTO_PRESTAMO}} de {{NOMBRE_MUTUANTE}} a {{NOMBRE_MUTUATARIO}}. Interes: {{TASA_INTERES}}% mensual. Plazo: {{PLAZO_MESES}} meses en cuotas. Garantia: {{GARANTIA}}.",
  },

  // 10. TRANSPORTE DE MERCANCIA
  {
    id: "transporte-mercancia",
    name: "Contrato de Transporte de Mercancias",
    category: "Logística",
    description: "Contrato para el transporte terrestre de mercaderia con seguro y responsabilidad.",
    legalBasis: "Ley 27181 (Ley Gral. de Transporte), D.S. 017-2009-MTC",
    icon: "Truck",
    tipo: "TRANSPORTE",
    fields: [
      { key: "NOMBRE_REMITENTE", label: "Nombre del Remitente", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "emisor" },
      { key: "RUC_REMITENTE", label: "RUC del Remitente", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_REMITENTE", label: "Domicilio del Remitente", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NOMBRE_TRANSPORTISTA", label: "Nombre del Transportista", type: "text", required: true, placeholder: "Transportes XYZ S.A.C.", group: "contraparte" },
      { key: "RUC_TRANSPORTISTA", label: "RUC del Transportista", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "contraparte" },
      { key: "DOMICILIO_TRANSPORTISTA", label: "Domicilio del Transportista", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "MERCADERIA", label: "Descripcion de la Mercaderia", type: "textarea", required: true, placeholder: "Detalle de productos, peso, volumen...", group: "contrato" },
      { key: "ORIGEN", label: "Punto de Origen", type: "text", required: true, placeholder: "Pucallpa, Ucayali", group: "contrato" },
      { key: "DESTINO", label: "Punto de Destino", type: "text", required: true, placeholder: "Lima, Lima", group: "contrato" },
      { key: "FLETE", label: "Flete (S/)", type: "number", required: true, placeholder: "2000.00", group: "contrato" },
      { key: "VALOR_MERCADERIA", label: "Valor Declarado de la Mercaderia (S/)", type: "number", required: true, placeholder: "15000.00", group: "contrato" },
      { key: "FECHA_DESPACHO", label: "Fecha de Despacho", type: "date", required: true, placeholder: "", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de transporte terrestre de mercancias que celebran de conformidad con la Ley 27181 — Ley General de Transporte y Transito Terrestre, y su Reglamento aprobado por D.S. 017-2009-MTC, de una parte, {{NOMBRE_REMITENTE}}, con RUC N.o {{RUC_REMITENTE}}, con domicilio en {{DOMICILIO_REMITENTE}}, a quien en adelante se denominara EL REMITENTE; y de otra parte, {{NOMBRE_TRANSPORTISTA}}, con RUC N.o {{RUC_TRANSPORTISTA}}, con domicilio en {{DOMICILIO_TRANSPORTISTA}}, a quien en adelante se denominara EL TRANSPORTISTA.",
      "CLAUSULA PRIMERA.- OBJETO: EL TRANSPORTISTA se obliga a trasladar la siguiente mercaderia: {{MERCADERIA}}, desde {{ORIGEN}} hasta {{DESTINO}}, en condiciones de seguridad y oportunidad.",
      "CLAUSULA SEGUNDA.- FLETE: El flete total pactado es de S/ {{FLETE}}, pagadero al momento de la entrega de la mercaderia en destino. El flete incluye el servicio de carga y descarga en origen.",
      "CLAUSULA TERCERA.- DOCUMENTACION: EL TRANSPORTISTA se obliga a portar durante el traslado: (a) Guia de remision del remitente; (b) Guia de remision del transportista; (c) Manifiesto de carga; (d) Licencia de conducir del chofer; (e) SOAT vigente; (f) Tarjeta de propiedad o contrato de alquiler del vehiculo.",
      "CLAUSULA CUARTA.- RESPONSABILIDAD: EL TRANSPORTISTA asume responsabilidad por la perdida, averia o deterioro de la mercaderia desde el momento de la recepcion hasta la entrega en destino. El valor declarado de la mercaderia es de S/ {{VALOR_MERCADERIA}}. EL TRANSPORTISTA debera contar con seguro de responsabilidad civil y de carga.",
      "CLAUSULA QUINTA.- PLAZO DE ENTREGA: La mercaderia debera ser despachada el {{FECHA_DESPACHO}} y entregada en destino dentro de los plazos razonables segun la distancia. El retraso injustificado generara una penalidad del 1% del flete por cada dia de retraso.",
      "CLAUSULA SEXTA.- SEGURO: EL TRANSPORTISTA declara contar con poliza de seguro de transporte de carga vigente. En caso de siniestro, la indemnizacion se efectuara conforme al valor declarado de la mercaderia.",
      "CLAUSULA SEPTIMA.- JURISDICCION: Las partes se someten a los jueces civiles de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Transporte de mercaderia de {{ORIGEN}} a {{DESTINO}}. Transportista: {{NOMBRE_TRANSPORTISTA}}. Mercaderia: {{MERCADERIA}} (valor: S/ {{VALOR_MERCADERIA}}). Flete: S/ {{FLETE}}. Despacho: {{FECHA_DESPACHO}}.",
  },

  // 11. ACUERDO DE CONFIDENCIALIDAD (NDA)
  {
    id: "nda-confidencialidad",
    name: "Acuerdo de Confidencialidad (NDA)",
    category: "Legal",
    description: "Acuerdo para proteger informacion confidencial del negocio, proveedores y clientes.",
    legalBasis: "D.Leg. 1075 — Ley de Propiedad Industrial, Art. 1321 CC (responsabilidad contractual)",
    icon: "Lock",
    tipo: "NDA",
    fields: [
      { key: "NOMBRE_REVELADOR", label: "Parte Reveladora", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "emisor" },
      { key: "RUC_REVELADOR", label: "RUC de la Parte Reveladora", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_REVELADOR", label: "Domicilio de la Parte Reveladora", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NOMBRE_RECEPTOR", label: "Parte Receptora", type: "text", required: true, placeholder: "Nombre completo", group: "contraparte" },
      { key: "DNI_RECEPTOR", label: "DNI/RUC del Receptor", type: "text", required: true, placeholder: "DNI o RUC", group: "contraparte" },
      { key: "DOMICILIO_RECEPTOR", label: "Domicilio del Receptor", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "PROPOSITO", label: "Proposito de la Revelacion", type: "textarea", required: true, placeholder: "Para que se comparte la informacion...", group: "contrato" },
      { key: "DURACION_ANOS", label: "Duracion de la Confidencialidad (anos)", type: "number", required: true, placeholder: "2", group: "contrato" },
      { key: "PENALIDAD", label: "Penalidad por Incumplimiento (S/)", type: "number", required: true, placeholder: "10000.00", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Acuerdo", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el acuerdo de confidencialidad que celebran en el marco del Decreto Legislativo 1075 — Ley de Propiedad Industrial y el articulo 1321 del Codigo Civil Peruano, de una parte, {{NOMBRE_REVELADOR}}, con RUC N.o {{RUC_REVELADOR}}, con domicilio en {{DOMICILIO_REVELADOR}}, a quien en adelante se denominara LA PARTE REVELADORA; y de otra parte, {{NOMBRE_RECEPTOR}}, identificado(a) con DNI/RUC N.o {{DNI_RECEPTOR}}, con domicilio en {{DOMICILIO_RECEPTOR}}, a quien en adelante se denominara LA PARTE RECEPTORA.",
      "CLAUSULA PRIMERA.- OBJETO: El presente acuerdo tiene por objeto proteger la informacion confidencial que LA PARTE REVELADORA compartira con LA PARTE RECEPTORA para el siguiente proposito: {{PROPOSITO}}.",
      "CLAUSULA SEGUNDA.- DEFINICION DE INFORMACION CONFIDENCIAL: Se considera informacion confidencial toda informacion comercial, financiera, técnica, de clientes, proveedores, precios, estrategias, bases de datos, procesos, know-how y cualquier otra informacion que LA PARTE REVELADORA identifique como confidencial, ya sea oral, escrita, electrónica o en cualquier otro soporte.",
      "CLAUSULA TERCERA.- OBLIGACIONES DEL RECEPTOR: LA PARTE RECEPTORA se obliga a: (a) Mantener en estricta reserva la informacion confidencial; (b) No divulgar, publicar, reproducir ni transmitir dicha informacion a terceros; (c) Utilizar la informacion unicamente para el proposito declarado; (d) Restringir el acceso a la informacion solo al personal estrictamente necesario; (e) Devolver o destruir toda la informacion al termino del acuerdo.",
      "CLAUSULA CUARTA.- EXCEPCIONES: No se considerara informacion confidencial aquella que: (a) Sea de dominio público; (b) Ya era conocida por el receptor antes de la revelacion; (c) Sea revelada por mandato judicial o legal; (d) Sea desarrollada independientemente por el receptor.",
      "CLAUSULA QUINTA.- DURACION: La obligacion de confidencialidad se mantendra durante {{DURACION_ANOS}} anos contados desde la fecha de suscripcion del presente acuerdo, subsistiendo incluso despues del termino de la relacion comercial.",
      "CLAUSULA SEXTA.- PENALIDAD: El incumplimiento de la obligacion de confidencialidad generara una penalidad convencional de S/ {{PENALIDAD}}, sin perjuicio de la indemnizacion por danos y perjuicios efectivamente causados (Art. 1321 CC).",
      "CLAUSULA SEPTIMA.- JURISDICCION: Las partes se someten a los jueces civiles de {{CIUDAD}}.",
      "En senal de conformidad, las partes suscriben el presente acuerdo en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Acuerdo de confidencialidad entre {{NOMBRE_REVELADOR}} y {{NOMBRE_RECEPTOR}}. Proposito: {{PROPOSITO}}. La informacion debe mantenerse en secreto por {{DURACION_ANOS}} anos. Si alguien incumple, paga S/ {{PENALIDAD}} de penalidad.",
  },

  // 12. COMPRAVENTA DE PRODUCTOS FORESTALES
  {
    id: "compraventa-forestal",
    name: "Compraventa de Productos Forestales",
    category: "Forestal",
    description: "Contrato especializado para compra-venta de madera con certificacion de origen legal (SERFOR/GTF).",
    legalBasis: "Ley 29763 — Ley Forestal y de Fauna Silvestre, D.S. 018-2015-MINAGRI",
    icon: "TreePine",
    tipo: "FORESTAL",
    fields: [
      { key: "NOMBRE_VENDEDOR", label: "Nombre/Razon Social del Vendedor", type: "text", required: true, placeholder: "Aserradero o concesionario forestal", group: "emisor" },
      { key: "RUC_VENDEDOR", label: "RUC del Vendedor", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "emisor" },
      { key: "DOMICILIO_VENDEDOR", label: "Domicilio del Vendedor", type: "text", required: true, placeholder: "Direccion completa", group: "emisor" },
      { key: "NUM_TITULO_HABILITANTE", label: "N.o Titulo Habilitante / Permiso", type: "text", required: true, placeholder: "RA-XXXXX-20XX-ATFFS", group: "emisor" },
      { key: "NOMBRE_COMPRADOR", label: "Nombre/Razon Social del Comprador", type: "text", required: true, placeholder: "Buleje S.A.C.", group: "contraparte" },
      { key: "RUC_COMPRADOR", label: "RUC del Comprador", type: "text", required: true, placeholder: "20XXXXXXXXX", group: "contraparte" },
      { key: "DOMICILIO_COMPRADOR", label: "Domicilio del Comprador", type: "text", required: true, placeholder: "Direccion completa", group: "contraparte" },
      { key: "ESPECIE", label: "Especie(s) Forestal(es)", type: "text", required: true, placeholder: "Tornillo (Cedrelinga cateniformis), Ishpingo...", group: "contrato" },
      { key: "VOLUMEN", label: "Volumen (pies tablares o m3)", type: "text", required: true, placeholder: "5000 PT / 11.80 m3", group: "contrato" },
      { key: "PRECIO_TOTAL", label: "Precio Total (S/)", type: "number", required: true, placeholder: "0.00", group: "contrato" },
      { key: "PRECIO_UNITARIO", label: "Precio Unitario (S/ por PT o m3)", type: "text", required: true, placeholder: "S/ 2.50 por PT", group: "contrato" },
      { key: "NUM_GTF", label: "N.o de Guia de Transporte Forestal (GTF)", type: "text", required: true, placeholder: "GTF-XXXXX-XXXX", group: "contrato" },
      { key: "FORMA_PAGO", label: "Forma de Pago", type: "select", required: true, options: ["Contado", "50% adelanto, 50% contra entrega", "Credito a 15 dias", "Credito a 30 dias"], group: "contrato" },
      { key: "LUGAR_ENTREGA", label: "Lugar de Entrega", type: "text", required: true, placeholder: "Planta o deposito", group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de compraventa de productos forestales que celebran de conformidad con la Ley 29763 — Ley Forestal y de Fauna Silvestre, su Reglamento aprobado por D.S. 018-2015-MINAGRI, y los articulos 1529 al 1601 del Codigo Civil Peruano, de una parte, {{NOMBRE_VENDEDOR}}, con RUC N.o {{RUC_VENDEDOR}}, con domicilio en {{DOMICILIO_VENDEDOR}}, titular del permiso/titulo habilitante N.o {{NUM_TITULO_HABILITANTE}}, a quien en adelante se denominara EL VENDEDOR; y de otra parte, {{NOMBRE_COMPRADOR}}, con RUC N.o {{RUC_COMPRADOR}}, con domicilio en {{DOMICILIO_COMPRADOR}}, a quien en adelante se denominara EL COMPRADOR.",
      "CLAUSULA PRIMERA.- OBJETO: EL VENDEDOR transfiere en propiedad a EL COMPRADOR los siguientes productos forestales maderables de origen legal: Especie(s): {{ESPECIE}}. Volumen: {{VOLUMEN}}. Los productos provienen de un titulo habilitante vigente registrado ante SERFOR/ATFFS.",
      "CLAUSULA SEGUNDA.- ORIGEN LEGAL: EL VENDEDOR declara bajo juramento que los productos forestales objeto del presente contrato tienen origen legal, acreditado mediante: (a) Titulo habilitante N.o {{NUM_TITULO_HABILITANTE}}; (b) Guia de Transporte Forestal (GTF) N.o {{NUM_GTF}} emitida a traves del SNIFFS (Sistema Nacional de Informacion Forestal y de Fauna Silvestre); (c) Lista de trozas y/o productos con su respectiva cubicacion. El incumplimiento de esta declaracion generara responsabilidad penal por el delito de trafico ilegal de productos forestales (Art. 310-310C del Codigo Penal).",
      "CLAUSULA TERCERA.- PRECIO: El precio total pactado es de S/ {{PRECIO_TOTAL}} a razon de {{PRECIO_UNITARIO}}. La forma de pago sera: {{FORMA_PAGO}}.",
      "CLAUSULA CUARTA.- ENTREGA Y TRANSPORTE: La entrega se realizara en {{LUGAR_ENTREGA}}. El transporte se realizara con la GTF correspondiente y la guia de remision que exige SUNAT. EL VENDEDOR es responsable de tramitar la GTF ante la autoridad forestal competente.",
      "CLAUSULA QUINTA.- CALIDAD Y CUBICACION: EL COMPRADOR verificara la especie, volumen y calidad de los productos al momento de la recepcion. Cualquier diferencia en la cubicacion se resolvera mediante nueva medicion conjunta. Las mermas aceptables son del 3% del volumen total.",
      "CLAUSULA SEXTA.- OBLIGACIONES LEGALES: Ambas partes se comprometen a cumplir con la normativa forestal vigente, incluyendo: (a) Registro en el SNIFFS; (b) Libro de operaciones actualizado; (c) Declaracion de inventario; (d) Pago de derecho de aprovechamiento cuando corresponda.",
      "CLAUSULA SEPTIMA.- PENALIDADES: Si los productos no tienen origen legal, EL VENDEDOR asumira todas las consecuencias legales, administrativas y penales, e indemnizara al COMPRADOR por todos los perjuicios causados, incluyendo decomiso, multas y lucro cesante.",
      "CLAUSULA OCTAVA.- JURISDICCION: Las partes se someten a los jueces civiles de {{CIUDAD}}. En caso de conflicto forestal, se acudira previamente al OSINFOR y SERFOR.",
      "En senal de conformidad, las partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Compraventa de madera de {{NOMBRE_VENDEDOR}} a {{NOMBRE_COMPRADOR}}. Especie: {{ESPECIE}}, volumen: {{VOLUMEN}}. Precio: S/ {{PRECIO_TOTAL}} ({{PRECIO_UNITARIO}}). GTF: {{NUM_GTF}}. Origen legal acreditado con titulo {{NUM_TITULO_HABILITANTE}}. Pago: {{FORMA_PAGO}}.",
  },
];

// ── Rellenado de plantillas ──────────────────────────────────────────────

export function fillTemplate(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `[${key}]`);
}

// ── Legal Tooltips Data ──────────────────────────────────────────────────

export const LEGAL_TOOLTIPS: Record<string, { explanation: string; example: string }> = {
  MODALIDAD: { explanation: "Tipo de contrato segun la razon de contratacion", example: "Necesidades del mercado: cuando hay mas clientes y necesitas mas personal temporal" },
  CAUSA_OBJETIVA: { explanation: "Razon legal por la que contratas temporalmente", example: "Incremento de ventas por campaña navideña que requiere 2 cajeros adicionales" },
  PERIODO_PRUEBA: { explanation: "Tiempo para evaluar si el trabajador es apto", example: "Durante 3 meses, si el trabajador no rinde, puedes terminar el contrato sin indemnizacion" },
  CTS: { explanation: "Dinero que el empleador deposita como seguro de desempleo", example: "Si ganas S/1,025 al mes, tu CTS es aprox. S/512 cada 6 meses (mayo y noviembre)" },
  GRATIFICACION: { explanation: "Pago extra en julio y diciembre", example: "Si ganas S/1,025, recibes S/1,025 extra en julio y S/1,025 extra en diciembre" },
  PENALIDAD_PORCENTAJE: { explanation: "Multa por no cumplir el contrato", example: "Si el proveedor se atrasa 2 semanas y la penalidad es 2%, paga S/100 extra sobre S/5,000" },
  PENALIDAD: { explanation: "Multa por no cumplir el contrato", example: "Si el proveedor se atrasa 2 semanas y la penalidad es 2%, paga S/100 extra sobre S/5,000" },
  RESOLUCION: { explanation: "Terminar/cancelar el contrato legalmente", example: "Si el proveedor no entrega la mercaderia en 3 ocasiones, puedes cancelar el contrato" },
  SANEAMIENTO: { explanation: "Garantia de que el bien esta libre de problemas", example: "Si compras un lote de arroz y resulta que esta vencido, el vendedor debe reemplazarlo" },
  CONFIDENCIALIDAD: { explanation: "Obligacion de no revelar informacion privada", example: "El contador no puede contarle a otros cuanto ganas o quienes son tus proveedores" },
  RUC_VENDEDOR: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_EMPLEADOR: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_COMITENTE: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_PRINCIPAL: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_REVELADOR: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_SUMINISTRANTE: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_REMITENTE: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_CONSIGNANTE: { explanation: "Número de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  TASA_INTERES: { explanation: "IGV: Impuesto del 18% sobre ventas y servicios", example: "Si vendes S/100, S/15.25 es IGV que debes pagar a SUNAT" },
  PLAZO_GARANTIA: { explanation: "Garantia de que el bien esta libre de problemas (saneamiento)", example: "Si compras un lote de arroz y resulta que esta vencido, el vendedor debe reemplazarlo" },
  EXCLUSIVIDAD: { explanation: "Solo tu puedes vender esos productos en esa zona", example: "Si tienes exclusividad en Calleria, ningun otro distribuidor puede vender esos productos ahi" },
  PROPOSITO: { explanation: "Obligacion de no revelar informacion privada del negocio", example: "El contador no puede contarle a otros cuanto ganas o quienes son tus proveedores" },
};

// ── Number to Words (Spanish) ──────────────────────────────────────────

export function numberToWords(n: number): string {
  if (n === 0) return "cero";
  if (n < 0) return "menos " + numberToWords(-n);

  const unidades = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales = ["diez", "once", "doce", "trece", "catorce", "quince"];
  const decenas = ["", "diez", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

  function convertGroup(num: number): string {
    if (num === 0) return "";
    if (num === 100) return "cien";
    let result = "";
    if (num >= 100) {
      result += centenas[Math.floor(num / 100)] + " ";
      num %= 100;
    }
    if (num >= 10 && num <= 15) {
      result += especiales[num - 10];
      return result.trim();
    }
    if (num >= 16 && num <= 19) {
      result += "dieci" + unidades[num - 10];
      return result.trim();
    }
    if (num >= 21 && num <= 29) {
      result += "veinti" + unidades[num - 20];
      return result.trim();
    }
    if (num >= 10) {
      result += decenas[Math.floor(num / 10)];
      num %= 10;
      if (num > 0) result += " y ";
    }
    if (num > 0) {
      result += unidades[num];
    }
    return result.trim();
  }

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);

  let words = "";
  if (intPart === 0) {
    words = "cero";
  } else {
    const millions = Math.floor(intPart / 1000000);
    const thousands = Math.floor((intPart % 1000000) / 1000);
    const hundreds = intPart % 1000;

    if (millions > 0) {
      words += (millions === 1 ? "un millon" : convertGroup(millions) + " millones") + " ";
    }
    if (thousands > 0) {
      words += (thousands === 1 ? "mil" : convertGroup(thousands) + " mil") + " ";
    }
    if (hundreds > 0) {
      words += convertGroup(hundreds);
    }
  }

  words = words.trim();
  // Capitalize first letter
  words = words.charAt(0).toUpperCase() + words.slice(1);

  const decStr = decPart.toString().padStart(2, "0");
  return `${words} y ${decStr}/100 soles`;
}

// ── Field Validation ──────────────────────────────────────────────────

export function validateField(key: string, value: string, allData: Record<string, string>): string | null {
  if (!value) return null;
  // DNI: exactly 8 digits
  if (key.includes("DNI") && !key.includes("RUC")) {
    if (!/^\d{8}$/.test(value.trim())) return "El DNI debe tener exactamente 8 digitos";
  }
  // RUC: exactly 11 digits, starts with 10 or 20
  if (key.startsWith("RUC_")) {
    const v = value.trim();
    if (!/^\d{11}$/.test(v)) return "El RUC debe tener exactamente 11 digitos";
    if (!v.startsWith("10") && !v.startsWith("20")) return "El RUC debe empezar con 10 (persona) o 20 (empresa)";
  }
  // DNI/RUC combo fields
  if (key.includes("DNI") && key.includes("RUC")) {
    const v = value.trim();
    if (!/^\d{8}$/.test(v) && !/^\d{11}$/.test(v)) return "Ingrese un DNI (8 digitos) o RUC (11 digitos)";
    if (v.length === 11 && !v.startsWith("10") && !v.startsWith("20")) return "El RUC debe empezar con 10 o 20";
  }
  // Amounts > 0
  if ((key.includes("PRECIO_TOTAL") || key.includes("REMUNERACION") || key.includes("RENTA_MENSUAL") || key.includes("RETRIBUCION") || key.includes("FLETE") || key.includes("MONTO_PRESTAMO") || key.includes("VALOR_TOTAL")) && value) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return "El monto debe ser mayor a 0";
  }
  // Date: FECHA_FIN must be after FECHA_INICIO
  if (key === "FECHA_FIN" && allData["FECHA_INICIO"]) {
    if (value < allData["FECHA_INICIO"]) return "La fecha de fin debe ser posterior a la fecha de inicio";
  }
  return null;
}

// ── Emisor Field Mapping (auto-fill from settings) ────────────────────

export const EMISOR_FIELD_MAP: Record<string, string> = {
  NOMBRE_VENDEDOR: "storeName",
  NOMBRE_EMPLEADOR: "storeName",
  NOMBRE_COMITENTE: "storeName",
  NOMBRE_PRINCIPAL: "storeName",
  NOMBRE_REVELADOR: "storeName",
  NOMBRE_REMITENTE: "storeName",
  NOMBRE_SUMINISTRANTE: "storeName",
  NOMBRE_CONSIGNANTE: "storeName",
  RUC_VENDEDOR: "ruc",
  RUC_EMPLEADOR: "ruc",
  RUC_COMITENTE: "ruc",
  RUC_PRINCIPAL: "ruc",
  RUC_REVELADOR: "ruc",
  RUC_REMITENTE: "ruc",
  RUC_SUMINISTRANTE: "ruc",
  RUC_CONSIGNANTE: "ruc",
  DOMICILIO_VENDEDOR: "address",
  DOMICILIO_EMPLEADOR: "address",
  DOMICILIO_COMITENTE: "address",
  DOMICILIO_PRINCIPAL: "address",
  DOMICILIO_REVELADOR: "address",
  DOMICILIO_REMITENTE: "address",
  DOMICILIO_SUMINISTRANTE: "address",
  DOMICILIO_CONSIGNANTE: "address",
  REPRESENTANTE_VENDEDOR: "ownerName",
  REPRESENTANTE_EMPLEADOR: "ownerName",
};

// ── CARGO select options ──────────────────────────────────────────────

export const CARGO_OPTIONS = [
  "Cajero(a)", "Almacenero(a)", "Repartidor(a)", "Vendedor(a)", "Administrador(a)",
  "Asistente administrativo", "Jefe de almacen", "Contador(a)", "Limpieza y mantenimiento",
  "Chofer", "Seguridad", "Auxiliar de tienda", "Otro (escribir)",
];

export const LUGAR_ENTREGA_OPTIONS = [
  "Almacen de la bodega (Jr. Ucayali 450, Pucallpa)", "Almacen del comprador",
  "Puerto de Pucallpa", "Terminal terrestre de Pucallpa", "Otro (escribir)",
];

// ── Qué significa cada plantilla en números y fechas ─────────────────────────

/**
 * Campos que representan el dinero principal del contrato, en orden de
 * prioridad. Antes se buscaba con un `includes` sobre una lista suelta y el
 * primer campo que "sonaba" a plata ganaba, aunque fuera una penalidad.
 */
const CLAVES_MONTO = [
  "PRECIO_TOTAL",
  "VALOR_TOTAL",
  "MONTO_PRESTAMO",
  "REMUNERACION",
  "RENTA_MENSUAL",
  "RETRIBUCION",
  "HONORARIOS",
  "FLETE",
  "COMISION_MONTO",
] as const;

export function montoDelContrato(
  tpl: ContractTemplate,
  data: Record<string, string>,
): number {
  for (const clave of CLAVES_MONTO) {
    if (!tpl.fields.some((f) => f.key === clave)) continue;
    const n = parseFloat(data[clave] ?? "");
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Fechas que marcan el arranque de la vigencia, de la más específica a la más genérica. */
const CLAVES_INICIO = ["FECHA_INICIO", "FECHA"] as const;

/** Duraciones expresadas como plazo en vez de fecha, con su unidad. */
const CLAVES_DURACION: { key: string; meses: (n: number) => number }[] = [
  { key: "DURACION_MESES", meses: (n) => n },
  { key: "VIGENCIA_MESES", meses: (n) => n },
  { key: "PLAZO_MESES", meses: (n) => n },
  { key: "DURACION_ANOS", meses: (n) => n * 12 },
];

function sumarMeses(desde: string, meses: number): string | null {
  const d = new Date(`${desde}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/**
 * Cuándo deja de valer el contrato, en `AAAA-MM-DD`.
 *
 * Las plantillas lo dicen de dos maneras: con una fecha de fin explícita, o con
 * un plazo ("12 meses") que hay que contar desde el inicio. El asistente nunca
 * guardaba ninguna de las dos, así que TODO contrato quedaba vigente para
 * siempre y los avisos de vencimiento no se disparaban jamás.
 */
export function vencimientoDelContrato(
  tpl: ContractTemplate,
  data: Record<string, string>,
): string | null {
  const explicita = data["FECHA_FIN"]?.trim();
  if (explicita) return explicita;

  const inicio = CLAVES_INICIO.map((k) => data[k]?.trim()).find(Boolean);
  if (!inicio) return null;

  for (const { key, meses } of CLAVES_DURACION) {
    if (!tpl.fields.some((f) => f.key === key)) continue;
    const n = parseFloat(data[key] ?? "");
    if (Number.isFinite(n) && n > 0) return sumarMeses(inicio, Math.round(meses(n)));
  }
  return null;
}

/** Fecha de celebración del contrato (`AAAA-MM-DD`), con hoy como último recurso. */
export function inicioDelContrato(data: Record<string, string>): string {
  const v = CLAVES_INICIO.map((k) => data[k]?.trim()).find(Boolean);
  return v || new Date().toISOString().slice(0, 10);
}

/** Nombre y documento de la contraparte, leídos del grupo correcto de la plantilla. */
export function contraparteDelContrato(
  tpl: ContractTemplate,
  data: Record<string, string>,
): { nombre: string; documento: string } {
  const campos = tpl.fields.filter((f) => f.group === "contraparte");
  const campoNombre = campos.find((f) => f.key.includes("NOMBRE")) ?? campos[0];
  const campoDoc = campos.find((f) => f.key.includes("DNI") || f.key.includes("RUC")) ?? campos[1];
  return {
    nombre: (campoNombre && data[campoNombre.key]?.trim()) || "Sin nombre",
    documento: (campoDoc && data[campoDoc.key]?.trim()) || "",
  };
}
