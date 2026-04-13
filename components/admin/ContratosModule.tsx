"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  FileText, User, Printer, DollarSign, Clock, CheckCircle, BookOpen, FileSignature, LayoutGrid, List,
  Download, Copy, Eye, Edit3, ArrowRight, ArrowLeft, Briefcase, Truck, Home, Package, Users,
  Lock, TreePine, Scale, PenTool, Save, BarChart3, AlertCircle, ClipboardCopy,
  MapPin, Info } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ContratoTipo = "VENTA" | "SERVICIO" | "TRABAJO" | "PROVEEDOR" | "DISTRIBUCION" | "ALQUILER" | "CONSIGNACION" | "MUTUO" | "TRANSPORTE" | "NDA" | "FORESTAL" | "LOCACION";

type ContratoEstado = "VIGENTE" | "POR_VENCER" | "VENCIDO" | "ANULADO" | "BORRADOR";

interface TemplateField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required: boolean;
  options?: string[];
  placeholder?: string;
  group: "emisor" | "contraparte" | "contrato";
}

interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  legalBasis: string;
  icon: string;
  tipo: ContratoTipo;
  fields: TemplateField[];
  clausulas: string[];
  summaryTemplate: string;
}

interface ContractVersion {
  version: number;
  data: Record<string, string>;
  content: string;
  savedAt: string;
}

interface _Contract {
  id: string;
  templateId: string;
  numero: string;
  tipo: ContratoTipo;
  estado: ContratoEstado;
  parties: { emisor: string; contraparte: string };
  data: Record<string, string>;
  content: string;
  summary: string;
  montoTotal: number;
  createdAt: string;
  expiresAt?: string;
  versions: ContractVersion[];
}

// Re-export old API-compatible type
type ContratoAPI = {
  id: string;
  numero: string;
  tenantId: string;
  tipo: ContratoTipo;
  clienteNombre: string;
  clienteDocumento: string;
  descripcion: string;
  montoTotal: number;
  fechaContrato: string;
  fechaVencimiento?: string;
  clausulas: string[];
  createdAt: string;
  updatedAt: string;
};

type TabId = "dashboard" | "plantillas" | "contratos" | "crear" | "editor";

// ── Plantillas Legales Peruanas ────────────────────────────────────────────

const PLANTILLAS: ContractTemplate[] = [
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
      "CLAUSULA QUINTA.- PENALIDAD POR INCUMPLIMIENTO: En caso de incumplimiento en la entrega por parte del VENDEDOR, este pagara una penalidad equivalente al {{PENALIDAD_PORCENTAJE}}% del precio total por cada semana de retraso, hasta un maximo del 10% del monto total. En caso de falta de pago oportuno por parte del COMPRADOR, se aplicara un interes moratorio conforme a la tasa maxima fijada por el Banco Central de Reserva del Peru (BCRP).",
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
      "Conste por el presente documento, el contrato de trabajo sujeto a modalidad que celebran al amparo del Texto Unico Ordenado del Decreto Legislativo 728 — Ley de Productividad y Competitividad Laboral, aprobado por Decreto Supremo N.o 003-97-TR, de una parte, {{NOMBRE_EMPLEADOR}}, con RUC N.o {{RUC_EMPLEADOR}}, con domicilio en {{DOMICILIO_EMPLEADOR}}, representada por {{REPRESENTANTE_EMPLEADOR}}, a quien en adelante se denominara EL EMPLEADOR; y de otra parte, {{NOMBRE_TRABAJADOR}}, identificado(a) con DNI N.o {{DNI_TRABAJADOR}}, con domicilio en {{DOMICILIO_TRABAJADOR}}, a quien en adelante se denominara EL TRABAJADOR; en los terminos y condiciones siguientes:",
      "CLAUSULA PRIMERA.- ANTECEDENTES Y CAUSA OBJETIVA: EL EMPLEADOR es una persona juridica dedicada al comercio minorista de abarrotes y productos de primera necesidad. Requiere contratar los servicios de EL TRABAJADOR bajo la modalidad de {{MODALIDAD}}, por la siguiente causa objetiva: {{CAUSA_OBJETIVA}}. Esta contratacion se realiza conforme a los articulos 53 al 83 del D.S. 003-97-TR.",
      "CLAUSULA SEGUNDA.- OBJETO: EL EMPLEADOR contrata los servicios de EL TRABAJADOR para desempenar el cargo de {{CARGO}}, realizando las funciones propias del puesto conforme al Manual de Organizacion y Funciones (MOF) de la empresa.",
      "CLAUSULA TERCERA.- DURACION Y PERIODO DE PRUEBA: El presente contrato tiene una duracion determinada, iniciandose el {{FECHA_INICIO}} y concluyendo el {{FECHA_FIN}}, sin necesidad de previo aviso para su terminacion. El periodo de prueba sera de {{PERIODO_PRUEBA}}, conforme al articulo 10 del D.S. 003-97-TR. Durante el periodo de prueba, cualquiera de las partes puede resolver el contrato sin expresion de causa.",
      "CLAUSULA CUARTA.- REMUNERACION: EL TRABAJADOR percibira una remuneracion mensual bruta de S/ {{REMUNERACION}}, sujeta a los descuentos de ley (aportes al sistema de pensiones ONP/AFP, e impuesto a la renta de quinta categoria cuando corresponda). El pago se realizara de forma mensual, mediante deposito en cuenta bancaria del trabajador.",
      "CLAUSULA QUINTA.- JORNADA Y HORARIO DE TRABAJO: La jornada laboral sera de {{JORNADA}}, conforme al articulo 25 de la Constitucion Politica del Peru y al D.S. 007-2002-TR. El horario de trabajo sera de {{HORARIO}}, de lunes a sabado. Las horas extras se remuneraran con la sobretasa de ley: 25% las dos primeras horas y 35% las siguientes, conforme al D.S. 007-2002-TR.",
      "CLAUSULA SEXTA.- BENEFICIOS SOCIALES: EL TRABAJADOR gozara de todos los beneficios laborales que le corresponden conforme a la legislacion peruana vigente: (a) Compensacion por Tiempo de Servicios (CTS) conforme al D.S. 001-97-TR, depositada semestralmente en mayo y noviembre; (b) Gratificaciones legales en julio y diciembre equivalentes a una remuneracion mensual cada una, conforme a la Ley 27735; (c) Descanso vacacional de 30 dias calendario por cada ano completo de servicios, conforme al D.Leg. 713; (d) Seguro social de salud (EsSalud) a cargo del empleador, equivalente al 9% de la remuneracion; (e) Seguro Complementario de Trabajo de Riesgo (SCTR) si corresponde a la actividad; (f) Asignacion familiar de S/ 102.50 cuando corresponda, conforme a la Ley 25129.",
      "CLAUSULA SEPTIMA.- OBLIGACIONES DEL TRABAJADOR: EL TRABAJADOR se compromete a: (a) Cumplir con las funciones asignadas con diligencia y eficiencia; (b) Respetar el Reglamento Interno de Trabajo; (c) Cuidar los bienes, mercaderia e instalaciones del negocio; (d) Mantener la confidencialidad de la informacion comercial, de clientes y proveedores; (e) Someterse a los controles de inventario y arqueos de caja que disponga el empleador.",
      "CLAUSULA OCTAVA.- CAUSALES DE EXTINCION: El presente contrato se extinguira por las causales previstas en el articulo 16 del D.S. 003-97-TR: vencimiento del plazo, fallecimiento, renuncia (con 30 dias de preaviso), mutuo disenso, invalidez absoluta permanente, jubilacion, despido por causa justa, y las demas previstas por ley. En caso de despido injustificado antes del vencimiento del plazo, EL EMPLEADOR abonara una indemnizacion equivalente a una remuneracion y media mensual por cada mes dejado de laborar hasta el vencimiento del contrato, con un maximo de doce remuneraciones, conforme al articulo 76 del D.S. 003-97-TR.",
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
      "Conste por el presente documento, el contrato de trabajo a plazo indeterminado que celebran al amparo del Texto Unico Ordenado del Decreto Legislativo 728, aprobado por Decreto Supremo N.o 003-97-TR, de una parte, {{NOMBRE_EMPLEADOR}}, con RUC N.o {{RUC_EMPLEADOR}}, con domicilio en {{DOMICILIO_EMPLEADOR}}, representada por {{REPRESENTANTE_EMPLEADOR}}, a quien en adelante se denominara EL EMPLEADOR; y de otra parte, {{NOMBRE_TRABAJADOR}}, identificado(a) con DNI N.o {{DNI_TRABAJADOR}}, con domicilio en {{DOMICILIO_TRABAJADOR}}, a quien en adelante se denominara EL TRABAJADOR.",
      "CLAUSULA PRIMERA.- OBJETO: EL EMPLEADOR contrata los servicios de EL TRABAJADOR para que desempene el cargo de {{CARGO}} de manera permanente e indeterminada, realizando las funciones inherentes a dicho puesto.",
      "CLAUSULA SEGUNDA.- INICIO: El presente contrato surte efectos a partir del {{FECHA_INICIO}}, siendo de duracion indeterminada. El periodo de prueba sera de tres (3) meses, conforme al articulo 10 del D.S. 003-97-TR.",
      "CLAUSULA TERCERA.- REMUNERACION: EL TRABAJADOR percibira una remuneracion mensual bruta de S/ {{REMUNERACION}}, sujeta a los descuentos y aportes de ley. El pago se realizara de forma mensual.",
      "CLAUSULA CUARTA.- JORNADA Y HORARIO: La jornada laboral sera de {{JORNADA}}. El horario de trabajo sera de {{HORARIO}}. Las horas extras se remuneraran conforme al D.S. 007-2002-TR.",
      "CLAUSULA QUINTA.- BENEFICIOS SOCIALES: EL TRABAJADOR gozara de todos los beneficios que la ley establece: CTS (D.S. 001-97-TR), gratificaciones (Ley 27735), vacaciones (D.Leg. 713), EsSalud (9%), y asignacion familiar (Ley 25129) cuando corresponda.",
      "CLAUSULA SEXTA.- OBLIGACIONES: EL TRABAJADOR se compromete a cumplir con sus funciones, respetar el reglamento interno, cuidar los bienes de la empresa y mantener la confidencialidad de la informacion comercial.",
      "CLAUSULA SEPTIMA.- EXTINCION: El contrato podra extinguirse unicamente por las causales previstas en el articulo 16 del D.S. 003-97-TR. En caso de despido arbitrario, EL EMPLEADOR pagara una indemnizacion equivalente a una remuneracion y media mensual por cada ano completo de servicios, con un maximo de doce remuneraciones (Art. 38 D.S. 003-97-TR).",
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
      "CLAUSULA SEGUNDA.- RETRIBUCION: La retribucion por el servicio sera de S/ {{RETRIBUCION}}. La forma de pago sera: {{FORMA_PAGO}}. EL LOCADOR emitira el correspondiente recibo por honorarios electronico (SUNAT) para cada pago recibido. Se aplicara la retencion del impuesto a la renta de cuarta categoria cuando corresponda (8%).",
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
      { key: "PEDIDO_MINIMO", label: "Pedido Minimo (S/)", type: "number", required: true, placeholder: "500.00", group: "contrato" },
      { key: "PLAZO_PAGO", label: "Plazo de Pago (dias)", type: "select", required: true, options: ["Contado", "7 dias", "15 dias", "30 dias", "60 dias"], group: "contrato" },
      { key: "VIGENCIA_MESES", label: "Vigencia (meses)", type: "number", required: true, placeholder: "12", group: "contrato" },
      { key: "EXCLUSIVIDAD", label: "Clausula de Exclusividad", type: "select", required: false, options: ["No aplica", "Exclusividad por zona", "Exclusividad por marca", "Exclusividad total"], group: "contrato" },
      { key: "CIUDAD", label: "Ciudad", type: "text", required: true, placeholder: "Pucallpa", group: "contrato" },
      { key: "FECHA", label: "Fecha del Contrato", type: "date", required: true, placeholder: "", group: "contrato" },
    ],
    clausulas: [
      "Conste por el presente documento, el contrato de suministro que celebran de conformidad con los articulos 1604 al 1620 del Codigo Civil Peruano, de una parte, {{NOMBRE_SUMINISTRANTE}}, con RUC N.o {{RUC_SUMINISTRANTE}}, con domicilio en {{DOMICILIO_SUMINISTRANTE}}, a quien en adelante se denominara EL SUMINISTRANTE; y de otra parte, {{NOMBRE_SUMINISTRADO}}, con RUC N.o {{RUC_SUMINISTRADO}}, con domicilio en {{DOMICILIO_SUMINISTRADO}}, a quien en adelante se denominara EL SUMINISTRADO.",
      "CLAUSULA PRIMERA.- OBJETO: EL SUMINISTRANTE se obliga a proveer de forma periodica y continuada los siguientes productos: {{LISTA_PRODUCTOS}}, conforme a las condiciones de calidad, cantidad y especificaciones acordadas (Art. 1604 del Codigo Civil).",
      "CLAUSULA SEGUNDA.- FRECUENCIA Y CANTIDAD: Las entregas se realizaran con frecuencia {{FRECUENCIA}}, con un pedido minimo de S/ {{PEDIDO_MINIMO}} por cada orden. Los pedidos se cursaran con al menos 3 dias habiles de anticipacion.",
      "CLAUSULA TERCERA.- PRECIO: Los precios se fijan conforme a la lista de precios vigente al momento de cada pedido. Los precios podran revisarse trimestralmente con previo aviso de 15 dias. Los incrementos no podran superar el indice de precios al consumidor (IPC) publicado por el INEI.",
      "CLAUSULA CUARTA.- FORMA DE PAGO: El pago se realizara a {{PLAZO_PAGO}} de recibida la factura y la mercaderia conforme, mediante transferencia bancaria o deposito en cuenta.",
      "CLAUSULA QUINTA.- CALIDAD Y RECLAMOS: EL SUMINISTRANTE garantiza que los productos cumplen con las normas sanitarias (DIGESA), las Normas Tecnicas Peruanas aplicables y los registros sanitarios vigentes. EL SUMINISTRADO podra rechazar mercaderia defectuosa, vencida o que no cumpla especificaciones dentro de las 24 horas de recibida, conforme al articulo 1612 del Codigo Civil.",
      "CLAUSULA SEXTA.- PENALIDAD POR INCUMPLIMIENTO: El incumplimiento en la entrega generara una penalidad del 2% del valor del pedido por cada dia de retraso (Art. 1614 CC). Si el incumplimiento supera los 15 dias, el SUMINISTRADO podra resolver el contrato.",
      "CLAUSULA SEPTIMA.- EXCLUSIVIDAD: {{EXCLUSIVIDAD}}. De pactarse exclusividad, el SUMINISTRANTE no podra abastecer a comercios competidores en un radio de 500 metros.",
      "CLAUSULA OCTAVA.- VIGENCIA: El contrato tendra una vigencia de {{VIGENCIA_MESES}} meses, renovable automaticamente por periodos iguales, salvo comunicacion escrita con 30 dias de anticipacion (Art. 1611 CC).",
      "CLAUSULA NOVENA.- JURISDICCION: Las partes se someten a los jueces comerciales de {{CIUDAD}}.",
      "En senal de conformidad, ambas partes suscriben el presente contrato en la ciudad de {{CIUDAD}}, a los {{FECHA}}.",
    ],
    summaryTemplate: "Contrato de suministro periodico entre {{NOMBRE_SUMINISTRANTE}} (proveedor) y {{NOMBRE_SUMINISTRADO}} (comprador). Productos: {{LISTA_PRODUCTOS}}. Entregas: {{FRECUENCIA}}. Pedido minimo: S/ {{PEDIDO_MINIMO}}. Pago: {{PLAZO_PAGO}}. Vigencia: {{VIGENCIA_MESES}} meses.",
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
      "CLAUSULA SEXTA.- SERVICIOS: Los pagos de energia electrica, agua potable, internet y telefono corren por cuenta de EL ARRENDATARIO. El impuesto predial y los arbitrios municipales son de cargo de EL ARRENDADOR.",
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
      "CLAUSULA SEGUNDA.- EXCLUSIVIDAD: EL DISTRIBUIDOR sera el unico autorizado para comercializar los productos del PRINCIPAL en la zona asignada. A su vez, EL DISTRIBUIDOR se compromete a no comercializar productos de la competencia directa en la misma zona.",
      "CLAUSULA TERCERA.- PRECIOS Y COMISIONES: EL DISTRIBUIDOR percibira una comision del {{COMISION}}% sobre el precio de venta al publico. Los precios de venta seran fijados por EL PRINCIPAL. Las liquidaciones se realizaran quincenalmente.",
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
      "CLAUSULA PRIMERA.- OBJETO: EL CONSIGNANTE entrega al CONSIGNATARIO la siguiente mercaderia para su venta al publico: {{MERCADERIA}}. La propiedad de los bienes permanece en el CONSIGNANTE hasta que se realice la venta efectiva al consumidor final (Art. 1804 CC).",
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
    category: "Logistica",
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
      "CLAUSULA SEGUNDA.- DEFINICION DE INFORMACION CONFIDENCIAL: Se considera informacion confidencial toda informacion comercial, financiera, tecnica, de clientes, proveedores, precios, estrategias, bases de datos, procesos, know-how y cualquier otra informacion que LA PARTE REVELADORA identifique como confidencial, ya sea oral, escrita, electronica o en cualquier otro soporte.",
      "CLAUSULA TERCERA.- OBLIGACIONES DEL RECEPTOR: LA PARTE RECEPTORA se obliga a: (a) Mantener en estricta reserva la informacion confidencial; (b) No divulgar, publicar, reproducir ni transmitir dicha informacion a terceros; (c) Utilizar la informacion unicamente para el proposito declarado; (d) Restringir el acceso a la informacion solo al personal estrictamente necesario; (e) Devolver o destruir toda la informacion al termino del acuerdo.",
      "CLAUSULA CUARTA.- EXCEPCIONES: No se considerara informacion confidencial aquella que: (a) Sea de dominio publico; (b) Ya era conocida por el receptor antes de la revelacion; (c) Sea revelada por mandato judicial o legal; (d) Sea desarrollada independientemente por el receptor.",
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

// ── Icon Map ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, Briefcase, Users, PenTool, Truck, Home, Lock, TreePine, DollarSign, Scale,
};

function TemplateIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon] || FileText;
  return <Icon className={className} />;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatCurrency(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function formatDatePeru(iso: string) {
  if (!iso) return "---";
  try {
    const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

function _formatDateLong(iso: string) {
  if (!iso) return "---";
  try {
    const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
    return d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

function getDiasVencimiento(fecha?: string): number | null {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fecha); venc.setHours(0, 0, 0, 0);
  return Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function getEstado(c: ContratoAPI): ContratoEstado {
  if (!c.fechaVencimiento) return "VIGENTE";
  const dias = getDiasVencimiento(c.fechaVencimiento);
  if (dias === null) return "VIGENTE";
  if (dias < 0) return "VENCIDO";
  if (dias <= 30) return "POR_VENCER";
  return "VIGENTE";
}

function fillTemplate(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `[${key}]`);
}

const ESTADO_STYLES: Record<ContratoEstado, string> = {
  VIGENTE: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  POR_VENCER: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  VENCIDO: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  ANULADO: "bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  BORRADOR: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
};

const TIPO_LABELS: Record<string, string> = {
  VENTA: "Compraventa",
  SERVICIO: "Servicios",
  TRABAJO: "Trabajo",
  PROVEEDOR: "Suministro",
  DISTRIBUCION: "Distribucion",
  ALQUILER: "Arrendamiento",
  CONSIGNACION: "Consignacion",
  MUTUO: "Mutuo/Prestamo",
  TRANSPORTE: "Transporte",
  NDA: "Confidencialidad",
  FORESTAL: "Forestal",
  LOCACION: "Locacion Serv.",
};

const PIE_COLORS = ["#00B4A6", "#f97316", "#264653", "#e76f51", "#2a9d8f", "#e9c46a", "#606c38", "#bc6c25", "#023047", "#219ebc", "#8338ec", "#ff006e"];

const PER_PAGE = 12;

// ── LegalTooltip Component ──────────────────────────────────────────────

function LegalTooltip({ term, explanation, example }: { term: string; explanation: string; example: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button onClick={() => setOpen(!open)} className="ml-1 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-center hover:bg-blue-200 transition-colors" title="¿Qué significa esto?">?</button>
      {open && (
        <div className="absolute bottom-7 left-0 z-50 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 text-xs">
          <p className="font-bold text-gray-800 dark:text-gray-200 mb-1">{term}</p>
          <p className="text-gray-600 dark:text-gray-400 mb-2">{explanation}</p>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
            <p className="text-amber-700 dark:text-amber-400"><strong>Ejemplo:</strong> {example}</p>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Legal Tooltips Data ──────────────────────────────────────────────────

const LEGAL_TOOLTIPS: Record<string, { explanation: string; example: string }> = {
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
  RUC_VENDEDOR: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_EMPLEADOR: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_COMITENTE: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_PRINCIPAL: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_REVELADOR: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_SUMINISTRANTE: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_REMITENTE: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  RUC_CONSIGNANTE: { explanation: "Numero de identificacion tributaria de empresas (11 digitos)", example: "El RUC tiene 11 digitos: 20123456789. Empieza con 10 (persona) o 20 (empresa)" },
  TASA_INTERES: { explanation: "IGV: Impuesto del 18% sobre ventas y servicios", example: "Si vendes S/100, S/15.25 es IGV que debes pagar a SUNAT" },
  PLAZO_GARANTIA: { explanation: "Garantia de que el bien esta libre de problemas (saneamiento)", example: "Si compras un lote de arroz y resulta que esta vencido, el vendedor debe reemplazarlo" },
  EXCLUSIVIDAD: { explanation: "Solo tu puedes vender esos productos en esa zona", example: "Si tienes exclusividad en Calleria, ningun otro distribuidor puede vender esos productos ahi" },
  PROPOSITO: { explanation: "Obligacion de no revelar informacion privada del negocio", example: "El contador no puede contarle a otros cuanto ganas o quienes son tus proveedores" },
};

// ── Number to Words (Spanish) ──────────────────────────────────────────

function numberToWords(n: number): string {
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

function validateField(key: string, value: string, allData: Record<string, string>): string | null {
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

const EMISOR_FIELD_MAP: Record<string, string> = {
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

const CARGO_OPTIONS = [
  "Cajero(a)", "Almacenero(a)", "Repartidor(a)", "Vendedor(a)", "Administrador(a)",
  "Asistente administrativo", "Jefe de almacen", "Contador(a)", "Limpieza y mantenimiento",
  "Chofer", "Seguridad", "Auxiliar de tienda", "Otro (escribir)",
];

const LUGAR_ENTREGA_OPTIONS = [
  "Almacen de la bodega (Jr. Ucayali 450, Pucallpa)", "Almacen del comprador",
  "Puerto de Pucallpa", "Terminal terrestre de Pucallpa", "Otro (escribir)",
];

const _MONEDA_OPTIONS = ["Soles (S/)", "Dolares (US$)"];

// ── Main Component ──────────────────────────────────────────────────────

export default function ContratosModule() {
  // -- Data from API
  const [contratos, setContratos] = useState<ContratoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -- UI
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [filterTipo, setFilterTipo] = useState<string>("ALL");
  const [filterEstado, setFilterEstado] = useState<string>("ALL");

  // -- Contract detail
  const [selected, setSelected] = useState<ContratoAPI | null>(null);

  // -- Wizard: Crear Contrato
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [wizardData, setWizardData] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // -- Auto-fill from settings
  const [storeSettings, setStoreSettings] = useState<Record<string, string>>({});
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());

  // -- Geolocation
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoResult, setGeoResult] = useState<string | null>(null);

  // -- Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // -- Select "Otro" custom values
  const [customSelectValues, setCustomSelectValues] = useState<Record<string, string>>({});

  // -- Editor
  const [editorTemplate, setEditorTemplate] = useState<ContractTemplate | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorPreview, setEditorPreview] = useState(false);

  // -- Refs
  const printRef = useRef<HTMLDivElement>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────

  const fetchContratos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contratos");
      if (!res.ok) throw new Error("Error al cargar contratos");
      const json = await res.json();
      const data: ContratoAPI[] = Array.isArray(json) ? json : Array.isArray(json?.contratos) ? json.contratos : [];
      setContratos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContratos(); }, [fetchContratos]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) setSelected(null);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selected]);

  // Fetch store settings for auto-fill
  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const s: Record<string, string> = {};
          if (data.storeName) s.storeName = data.storeName;
          if (data.ruc) s.ruc = data.ruc;
          if (data.address) s.address = data.address;
          if (data.ownerName) s.ownerName = data.ownerName;
          setStoreSettings(s);
        }
      })
      .catch(() => { /* noop */ });
  }, []);

  // ── Geolocation ────────────────────────────────────────────────────────

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=es`
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || "Pucallpa";
          const state = data.address?.state || "Ucayali";
          setWizardData(p => ({ ...p, CIUDAD: city }));
          setGeoResult(`${city}, ${state}`);
        } catch {
          setWizardData(p => ({ ...p, CIUDAD: "Pucallpa" }));
          setGeoResult("Pucallpa, Ucayali");
        }
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        setGeoResult(null);
      }
    );
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────

  const filteredContratos = useMemo(() => {
    let list = contratos;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(c => c.clienteNombre.toLowerCase().includes(q) || c.numero.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q));
    }
    if (filterTipo !== "ALL") list = list.filter(c => c.tipo === filterTipo);
    if (filterEstado !== "ALL") list = list.filter(c => getEstado(c) === filterEstado);
    return list;
  }, [contratos, debouncedSearch, filterTipo, filterEstado]);

  const totalPages = Math.max(1, Math.ceil(filteredContratos.length / PER_PAGE));
  const paginated = filteredContratos.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [debouncedSearch, filterTipo, filterEstado]);

  // Stats
  const stats = useMemo(() => {
    const vigentes = contratos.filter(c => getEstado(c) === "VIGENTE").length;
    const porVencer = contratos.filter(c => getEstado(c) === "POR_VENCER").length;
    const vencidos = contratos.filter(c => getEstado(c) === "VENCIDO").length;
    const montoTotal = contratos.reduce((s, c) => s + (c.montoTotal || 0), 0);

    const byType: Record<string, number> = {};
    contratos.forEach(c => { byType[c.tipo] = (byType[c.tipo] || 0) + 1; });
    const typeData = Object.entries(byType).map(([k, v]) => ({ name: TIPO_LABELS[k] || k, value: v }));

    const byMonth: Record<string, number> = {};
    contratos.forEach(c => {
      const m = c.createdAt ? c.createdAt.substring(0, 7) : "N/A";
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    const monthData = Object.entries(byMonth).sort().slice(-6).map(([k, v]) => ({ name: k, contratos: v }));

    return { vigentes, porVencer, vencidos, montoTotal, typeData, monthData, total: contratos.length };
  }, [contratos]);

  // ── Wizard: Create ────────────────────────────────────────────────────

  const startWizard = (tpl: ContractTemplate) => {
    setSelectedTemplate(tpl);
    setCreateError(null);
    setFieldErrors({});
    setCustomSelectValues({});
    setGeoResult(null);

    // Auto-fill emisor fields from settings + date + city
    const autoData: Record<string, string> = {};
    const autoKeys = new Set<string>();

    tpl.fields.forEach(f => {
      const settingsKey = EMISOR_FIELD_MAP[f.key];
      if (settingsKey && storeSettings[settingsKey]) {
        autoData[f.key] = storeSettings[settingsKey];
        autoKeys.add(f.key);
      }
    });

    // Auto-fill FECHA with today
    const today = new Date().toISOString().slice(0, 10);
    const fechaField = tpl.fields.find(f => f.key === "FECHA");
    if (fechaField) {
      autoData["FECHA"] = today;
      autoKeys.add("FECHA");
    }

    // Auto-fill CIUDAD with Pucallpa
    const ciudadField = tpl.fields.find(f => f.key === "CIUDAD");
    if (ciudadField) {
      autoData["CIUDAD"] = "Pucallpa";
      autoKeys.add("CIUDAD");
    }

    setWizardData(autoData);
    setAutoFilledFields(autoKeys);
    setWizardStep(0);
    setActiveTab("crear");
  };

  const wizardGroups = selectedTemplate ? [
    { id: "emisor", label: "Datos del Emisor", fields: selectedTemplate.fields.filter(f => f.group === "emisor") },
    { id: "contraparte", label: "Datos de la Contraparte", fields: selectedTemplate.fields.filter(f => f.group === "contraparte") },
    { id: "contrato", label: "Datos del Contrato", fields: selectedTemplate.fields.filter(f => f.group === "contrato") },
  ] : [];

  const wizardGroupLabels = ["Datos del Emisor", "Datos de la Contraparte", "Datos del Contrato", "Vista Previa", "Confirmar y Generar"];

  const generateContent = useCallback(() => {
    if (!selectedTemplate) return "";
    return selectedTemplate.clausulas.map(c => fillTemplate(c, wizardData)).join("\n\n");
  }, [selectedTemplate, wizardData]);

  const generateSummary = useCallback(() => {
    if (!selectedTemplate) return "";
    return fillTemplate(selectedTemplate.summaryTemplate, wizardData);
  }, [selectedTemplate, wizardData]);

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    setCreateError(null);

    // Validate required fields
    const missing = selectedTemplate.fields.filter(f => f.required && !wizardData[f.key]?.trim());
    if (missing.length > 0) {
      setCreateError(`Campos requeridos faltantes: ${missing.map(f => f.label).join(", ")}`);
      return;
    }

    setCreating(true);
    try {
      // Extract client info from template fields
      const contraparteFields = selectedTemplate.fields.filter(f => f.group === "contraparte");
      const nameField = contraparteFields.find(f => f.key.includes("NOMBRE")) || contraparteFields[0];
      const docField = contraparteFields.find(f => f.key.includes("DNI") || f.key.includes("RUC")) || contraparteFields[1];

      const clienteNombre = nameField ? (wizardData[nameField.key] || "Sin nombre") : "Sin nombre";
      const clienteDoc = docField ? (wizardData[docField.key] || "Sin doc") : "Sin doc";

      const montoField = selectedTemplate.fields.find(f => f.key.includes("PRECIO_TOTAL") || f.key.includes("REMUNERACION") || f.key.includes("RENTA_MENSUAL") || f.key.includes("RETRIBUCION") || f.key.includes("FLETE") || f.key.includes("MONTO_PRESTAMO") || f.key.includes("VALOR_TOTAL") || f.key.includes("PENALIDAD"));
      const monto = montoField ? parseFloat(wizardData[montoField.key] || "0") : 0;

      const content = generateContent();
      const summary = generateSummary();
      const descripcion = `${selectedTemplate.name} — ${summary}`.substring(0, 1999);

      const fechaField = selectedTemplate.fields.find(f => f.key === "FECHA");
      const fecha = fechaField ? wizardData[fechaField.key] : new Date().toISOString().slice(0, 10);

      const clausulasArr = content.split("\n\n").filter(c => c.trim());

      // Determine the closest matching API type
      const apiTipo = (["VENTA", "SERVICIO", "TRABAJO", "PROVEEDOR", "DISTRIBUCION", "ALQUILER"] as const).includes(selectedTemplate.tipo as never)
        ? selectedTemplate.tipo as "VENTA" | "SERVICIO" | "TRABAJO" | "PROVEEDOR" | "DISTRIBUCION" | "ALQUILER"
        : "VENTA";

      const res = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: apiTipo,
          clienteNombre,
          clienteDoc,
          descripcion,
          monto: monto || 0,
          fecha: new Date(fecha || Date.now()).toISOString(),
          clausulas: clausulasArr.slice(0, 20),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : JSON.stringify(err.error));
      }

      // Save version to localStorage
      const result = await res.json();
      try {
        const vKey = `contract-versions-${result.id}`;
        const v: ContractVersion = { version: 1, data: wizardData, content, savedAt: new Date().toISOString() };
        localStorage.setItem(vKey, JSON.stringify([v]));
      } catch { /* noop */ }

      // Save locally generated content
      try {
        localStorage.setItem(`contract-content-${result.id}`, JSON.stringify({ content, summary, templateId: selectedTemplate.id, data: wizardData }));
      } catch { /* noop */ }

      setSelectedTemplate(null);
      setWizardData({});
      setWizardStep(0);
      setActiveTab("contratos");
      fetchContratos();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  // ── Download Helpers ──────────────────────────────────────────────────

  const getContractContent = (c: ContratoAPI): { content: string; summary: string } => {
    try {
      const raw = localStorage.getItem(`contract-content-${c.id}`);
      if (raw) { const p = JSON.parse(raw); return { content: p.content || "", summary: p.summary || "" }; }
    } catch { /* noop */ }
    return { content: c.clausulas.join("\n\n"), summary: c.descripcion };
  };

  const downloadPDF = (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const tipoLabel = TIPO_LABELS[c.tipo] || c.tipo;
    const html = `<!DOCTYPE html><html><head><title>Contrato ${c.numero}</title>
<style>
@media print { @page { size: A4; margin: 25mm; } body { margin: 0; } }
body { font-family: 'Times New Roman', Georgia, serif; max-width: 680px; margin: 0 auto; padding: 40px 30px; font-size: 12.5px; line-height: 1.7; color: #111; }
.header { text-align: center; border-bottom: 3px double #333; padding-bottom: 15px; margin-bottom: 25px; }
h1 { font-size: 16px; text-transform: uppercase; letter-spacing: 3px; margin: 0 0 5px; }
.numero { font-size: 13px; color: #555; }
.summary { background: #f8f8f0; border-left: 4px solid #00B4A6; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #333; }
.summary strong { color: #00B4A6; }
.clause { margin: 14px 0; text-align: justify; }
.firmas { margin-top: 80px; display: flex; justify-content: space-between; gap: 40px; }
.firma-box { text-align: center; flex: 1; }
.firma-line { border-top: 1px solid #000; padding-top: 8px; font-size: 11px; margin-top: 60px; }
.footer { margin-top: 50px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
</style></head><body>
<div class="header"><h1>CONTRATO DE ${tipoLabel.toUpperCase()}</h1><div class="numero">N.o ${c.numero}</div></div>
${summary ? `<div class="summary"><strong>RESUMEN:</strong> ${summary}</div>` : ""}
${content.split("\n\n").map(p => `<div class="clause">${p}</div>`).join("")}
<div class="firmas">
<div class="firma-box"><div class="firma-line">PRIMERA PARTE</div></div>
<div class="firma-box"><div class="firma-line">SEGUNDA PARTE</div></div>
</div>
<div class="footer">Documento generado el ${new Date().toLocaleDateString("es-PE")} | Buleje</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  const downloadWord = (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const tipoLabel = TIPO_LABELS[c.tipo] || c.tipo;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Contrato ${c.numero}</title>
<style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;}h1{text-align:center;font-size:14pt;text-transform:uppercase;}p{text-align:justify;margin:8pt 0;}</style></head>
<body><h1>CONTRATO DE ${tipoLabel.toUpperCase()}</h1><p style="text-align:center;color:#555;">N.o ${c.numero}</p>
${summary ? `<p style="background:#f0f0e0;padding:10px;border-left:4px solid #00B4A6;"><b>RESUMEN:</b> ${summary}</p>` : ""}
${content.split("\n\n").map(p => `<p>${p}</p>`).join("")}
<br/><br/><table width="100%"><tr><td width="45%" style="border-top:1px solid #000;text-align:center;padding-top:8px;">PRIMERA PARTE</td><td width="10%"></td><td width="45%" style="border-top:1px solid #000;text-align:center;padding-top:8px;">SEGUNDA PARTE</td></tr></table>
</body></html>`;
    const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Contrato_${c.numero}.doc`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTxt = (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const tipoLabel = TIPO_LABELS[c.tipo] || c.tipo;
    const text = `CONTRATO DE ${tipoLabel.toUpperCase()}\nN.o ${c.numero}\n${"=".repeat(50)}\n\nRESUMEN: ${summary}\n\n${"=".repeat(50)}\n\n${content}\n\n${"=".repeat(50)}\n\n_________________________          _________________________\n    PRIMERA PARTE                      SEGUNDA PARTE\n\nFecha: ${new Date().toLocaleDateString("es-PE")}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Contrato_${c.numero}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const text = `CONTRATO N.o ${c.numero}\n\nRESUMEN: ${summary}\n\n${content}`;
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
  };

  // ── Version History ───────────────────────────────────────────────────

  const getVersions = (id: string): ContractVersion[] => {
    try {
      const raw = localStorage.getItem(`contract-versions-${id}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  // ── Tab definitions ───────────────────────────────────────────────────

  const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "plantillas", label: "Plantillas", icon: BookOpen },
    { id: "contratos", label: "Mis Contratos", icon: FileText },
    { id: "crear", label: "Crear Contrato", icon: Plus },
    { id: "editor", label: "Editor", icon: Edit3 },
  ];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-[#00B4A6] text-white flex items-center justify-center shadow-sm shrink-0">
            <FileSignature className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Contratos
              {contratos.length > 0 && <span className="bg-gray-200 dark:bg-gray-700 text-[10px] px-2 py-0.5 rounded-full font-bold text-gray-600 dark:text-gray-300">{contratos.length}</span>}
            </h1>
            <p className="text-sm text-gray-500">Gestion legal de contratos con plantillas peruanas</p>
          </div>
        </div>
        <button
          onClick={() => setActiveTab("plantillas")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] shadow-sm transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Contrato
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
                activeTab === tab.id
                  ? "bg-[#00B4A6] text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#00B4A6]" />
        </div>
      )}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchContratos} className="text-xs text-[#00B4A6] hover:underline font-semibold">Reintentar</button>
        </div>
      )}

      {/* Tab Content */}
      {!loading && !error && (
        <AnimatePresence mode="wait">
          <m.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {/* ═══ DASHBOARD ═══ */}
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Total Contratos", value: stats.total, icon: FileText, color: "bg-blue-500" },
                    { label: "Vigentes", value: stats.vigentes, icon: CheckCircle, color: "bg-emerald-500" },
                    { label: "Por Vencer", value: stats.porVencer, icon: Clock, color: "bg-amber-500" },
                    { label: "Vencidos", value: stats.vencidos, icon: AlertCircle, color: "bg-red-500" },
                  ].map(kpi => (
                    <div key={kpi.label} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white", kpi.color)}>
                          <kpi.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                          <p className="text-xs text-gray-500">{kpi.label}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Monto Total */}
                <div className="bg-gradient-to-r from-[#00B4A6] to-[#009690] rounded-xl p-6 text-white">
                  <p className="text-sm opacity-80">Monto Total en Contratos</p>
                  <p className="text-3xl font-bold mt-1">{formatCurrency(stats.montoTotal)}</p>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Por tipo */}
                  <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Contratos por Tipo</h3>
                    {stats.typeData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <RechartsPie>
                          <Pie data={stats.typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                            {stats.typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </RechartsPie>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>}
                  </div>

                  {/* Por mes */}
                  <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Contratos por Mes</h3>
                    {stats.monthData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats.monthData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="contratos" fill="#00B4A6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>}
                  </div>
                </div>

                {/* Contratos por vencer */}
                {stats.porVencer > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Contratos por vencer (30 dias)
                    </h3>
                    <div className="space-y-2">
                      {contratos.filter(c => getEstado(c) === "POR_VENCER").slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-amber-700 dark:text-amber-300">{c.clienteNombre} — {c.numero} — vence {formatDatePeru(c.fechaVencimiento!)}</span>
                          <button onClick={() => { setSelected(c); }} className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 font-bold hover:bg-amber-200 transition-colors">
                            Ver
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ PLANTILLAS ═══ */}
            {activeTab === "plantillas" && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Selecciona una plantilla para crear un contrato con clausulas legales peruanas reales.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PLANTILLAS.map(tpl => (
                    <m.div
                      key={tpl.id}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 cursor-pointer hover:border-[#00B4A6] hover:shadow-lg transition-all group"
                      onClick={() => startWizard(tpl)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 flex items-center justify-center shrink-0 group-hover:bg-[#00B4A6] group-hover:text-white transition-colors text-[#00B4A6]">
                          <TemplateIcon icon={tpl.icon} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">{tpl.name}</h4>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{tpl.description}</p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00B4A6]/10 text-[#00B4A6] font-bold">{tpl.category}</span>
                            <span className="text-[10px] text-gray-400">{tpl.fields.length} campos</span>
                            <span className="text-[10px] text-gray-400">{tpl.clausulas.length} clausulas</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1 italic">{tpl.legalBasis}</p>
                        </div>
                      </div>
                    </m.div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ MIS CONTRATOS ═══ */}
            {activeTab === "contratos" && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por cliente, numero..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                    />
                  </div>
                  <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30">
                    <option value="ALL">Todos los tipos</option>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30">
                    <option value="ALL">Todos los estados</option>
                    <option value="VIGENTE">Vigentes</option>
                    <option value="POR_VENCER">Por vencer</option>
                    <option value="VENCIDO">Vencidos</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setViewMode("cards")} className={cn("p-2 rounded-lg transition-colors", viewMode === "cards" ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500")}><LayoutGrid className="h-4 w-4" /></button>
                    <button onClick={() => setViewMode("list")} className={cn("p-2 rounded-lg transition-colors", viewMode === "list" ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500")}><List className="h-4 w-4" /></button>
                  </div>
                </div>

                {filteredContratos.length === 0 ? (
                  <div className="text-center py-16">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin contratos</h3>
                    <p className="text-sm text-gray-500 mb-6">Crea tu primer contrato desde una plantilla</p>
                    <button onClick={() => setActiveTab("plantillas")} className="bg-[#00B4A6] text-white px-6 py-2.5 rounded-xl font-medium hover:bg-[#009690]">Ver Plantillas</button>
                  </div>
                ) : viewMode === "cards" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginated.map(c => {
                      const estado = getEstado(c);
                      const dias = getDiasVencimiento(c.fechaVencimiento);
                      const borderColor = estado === "VENCIDO" ? "border-l-red-500" : estado === "POR_VENCER" ? "border-l-amber-500" : "border-l-emerald-500";
                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className={cn("bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl shadow-sm hover:shadow-lg transition-all cursor-pointer border-l-4", borderColor)}
                        >
                          <div className="p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-400 font-mono">{c.numero}</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{TIPO_LABELS[c.tipo] || c.tipo}</p>
                              </div>
                              <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ml-2", ESTADO_STYLES[estado])}>
                                {estado === "VIGENTE" ? "Vigente" : estado === "POR_VENCER" ? "Por vencer" : estado === "VENCIDO" ? "Vencido" : estado}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[#f97316]/20 flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5 text-[#f97316]" /></div>
                              <div className="min-w-0">
                                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{c.clienteNombre}</p>
                                <p className="text-[10px] text-gray-400">{c.clienteDocumento}</p>
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                              <p>Fecha: {formatDatePeru(c.fechaContrato || c.createdAt)}</p>
                              {c.fechaVencimiento && <p>Vence: {formatDatePeru(c.fechaVencimiento)} {dias !== null && dias >= 0 ? `(${dias}d)` : dias !== null ? `(hace ${Math.abs(dias)}d)` : ""}</p>}
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/5">
                              <p className="text-sm font-bold text-[#00B4A6]">{formatCurrency(c.montoTotal || 0)}</p>
                              <div className="flex gap-1">
                                <button onClick={e => { e.stopPropagation(); downloadPDF(c); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-[#00B4A6] transition-colors" title="PDF"><Printer className="h-3.5 w-3.5" /></button>
                                <button onClick={e => { e.stopPropagation(); downloadWord(c); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-blue-600 transition-colors" title="Word"><Download className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                            <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">N.o</th>
                            <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Cliente</th>
                            <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">Tipo</th>
                            <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right">Monto</th>
                            <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden md:table-cell">Fecha</th>
                            <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden lg:table-cell">Estado</th>
                            <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map(c => {
                            const estado = getEstado(c);
                            return (
                              <tr key={c.id} onClick={() => setSelected(c)} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors">
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.numero}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-gray-900 dark:text-white truncate">{c.clienteNombre}</p>
                                  <p className="text-xs text-gray-400">{c.clienteDocumento}</p>
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400">{TIPO_LABELS[c.tipo] || c.tipo}</span>
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(c.montoTotal || 0)}</td>
                                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{formatDatePeru(c.fechaContrato || c.createdAt)}</td>
                                <td className="px-4 py-3 hidden lg:table-cell">
                                  <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-bold", ESTADO_STYLES[estado])}>{estado}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1">
                                    <button onClick={e => { e.stopPropagation(); downloadPDF(c); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400" title="PDF"><Printer className="h-4 w-4" /></button>
                                    <button onClick={e => { e.stopPropagation(); downloadWord(c); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400" title="Word"><Download className="h-4 w-4" /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{filteredContratos.length} contrato{filteredContratos.length !== 1 ? "s" : ""} — Pag. {page}/{totalPages}</p>
                    <div className="flex gap-1">
                      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                      <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ CREAR CONTRATO (WIZARD) ═══ */}
            {activeTab === "crear" && (
              <div className="space-y-6">
                {!selectedTemplate ? (
                  <div className="text-center py-16">
                    <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Selecciona una plantilla</h3>
                    <p className="text-sm text-gray-500 mb-6">Ve a la pestana &quot;Plantillas&quot; para elegir una plantilla legal</p>
                    <button onClick={() => setActiveTab("plantillas")} className="bg-[#00B4A6] text-white px-6 py-2.5 rounded-xl font-medium hover:bg-[#009690]">Ver Plantillas</button>
                  </div>
                ) : (
                  <>
                    {/* Wizard Header */}
                    <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-xl bg-[#00B4A6]/10 flex items-center justify-center text-[#00B4A6]">
                          <TemplateIcon icon={selectedTemplate.icon} className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{selectedTemplate.name}</h3>
                          <p className="text-xs text-gray-400">{selectedTemplate.legalBasis}</p>
                        </div>
                        <button onClick={() => { setSelectedTemplate(null); setWizardStep(0); setWizardData({}); }} className="ml-auto text-gray-400 hover:text-gray-600">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Step Indicators */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {wizardGroupLabels.map((label, i) => (
                          <button
                            key={i}
                            onClick={() => setWizardStep(i)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                              wizardStep === i ? "bg-[#00B4A6] text-white" : wizardStep > i ? "bg-[#00B4A6]/10 text-[#00B4A6]" : "bg-gray-100 dark:bg-white/5 text-gray-400"
                            )}
                          >
                            <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                              wizardStep === i ? "bg-white/20 text-white" : wizardStep > i ? "bg-[#00B4A6] text-white" : "bg-gray-200 dark:bg-white/10 text-gray-500"
                            )}>
                              {wizardStep > i ? <CheckCircle className="h-3 w-3" /> : i + 1}
                            </span>
                            <span className="hidden sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(() => {
                      const allFields = selectedTemplate.fields;
                      const totalRequired = allFields.filter(f => f.required).length;
                      const filledRequired = allFields.filter(f => f.required && wizardData[f.key]?.trim()).length;
                      const progress = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 0;
                      return (
                        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Progreso del contrato</span>
                            <span className="text-xs font-bold text-gray-900 dark:text-white">{filledRequired} de {totalRequired} campos completados ({progress}%)</span>
                          </div>
                          <div className="relative h-3 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500", progress === 100 ? "bg-emerald-500" : progress >= 60 ? "bg-[#00B4A6]" : "bg-[#f97316]")}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Wizard Steps 0-2: Form Fields */}
                    {wizardStep < 3 && (
                      <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-6 space-y-4">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">{wizardGroupLabels[wizardStep]}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {wizardGroups[wizardStep]?.fields.map(field => {
                            // Determine if field should be a select with options
                            const isCargoField = field.key === "CARGO" && field.type === "text";
                            const isLugarEntrega = field.key === "LUGAR_ENTREGA" && field.type === "text";
                            const effectiveType = (isCargoField || isLugarEntrega) ? "smart-select" : field.type;
                            const selectOptions = isCargoField ? CARGO_OPTIONS : isLugarEntrega ? LUGAR_ENTREGA_OPTIONS : field.options;

                            const hasTooltip = LEGAL_TOOLTIPS[field.key];
                            const isAutoFilled = autoFilledFields.has(field.key) && wizardData[field.key];
                            const validationError = fieldErrors[field.key];
                            const isCiudadField = field.key === "CIUDAD";

                            // Check if current select value is "Otro (escribir)"
                            const currentVal = wizardData[field.key] || "";
                            const isOtroSelected = (effectiveType === "smart-select" || field.type === "select") && currentVal === "Otro (escribir)";

                            return (
                              <div key={field.key} className={(field.type === "textarea") ? "sm:col-span-2" : ""}>
                                <label className="flex items-center gap-1 text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                                  {field.label} {field.required && <span className="text-red-500">*</span>}
                                  {hasTooltip && <LegalTooltip term={field.label} explanation={hasTooltip.explanation} example={hasTooltip.example} />}
                                  {isAutoFilled && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                      Auto-completado
                                    </span>
                                  )}
                                </label>

                                {/* Ciudad field with geolocation button */}
                                {isCiudadField && (
                                  <div className="flex gap-2 mb-1">
                                    <input
                                      type="text"
                                      value={wizardData[field.key] || ""}
                                      onChange={e => {
                                        setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                        setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      }}
                                      placeholder={field.placeholder}
                                      className={cn(
                                        "flex-1 px-3 py-2 rounded-xl border text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30",
                                        isAutoFilled ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10" : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
                                      )}
                                    />
                                    <button
                                      type="button"
                                      onClick={detectLocation}
                                      disabled={geoLoading}
                                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
                                    >
                                      {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                                      Detectar
                                    </button>
                                  </div>
                                )}
                                {isCiudadField && geoResult && (
                                  <p className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5 mb-1">
                                    <MapPin className="h-3 w-3" /> Ubicacion detectada: {geoResult}
                                  </p>
                                )}

                                {/* Smart select (CARGO, LUGAR_ENTREGA) */}
                                {!isCiudadField && effectiveType === "smart-select" && (
                                  <>
                                    <select
                                      value={isOtroSelected ? "Otro (escribir)" : (selectOptions?.includes(currentVal) ? currentVal : (currentVal && !selectOptions?.includes(currentVal) ? "Otro (escribir)" : ""))}
                                      onChange={e => {
                                        const v = e.target.value;
                                        if (v === "Otro (escribir)") {
                                          setWizardData(p => ({ ...p, [field.key]: "Otro (escribir)" }));
                                          setCustomSelectValues(p => ({ ...p, [field.key]: "" }));
                                        } else {
                                          setWizardData(p => ({ ...p, [field.key]: v }));
                                          setCustomSelectValues(p => { const n = { ...p }; delete n[field.key]; return n; });
                                        }
                                        setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      }}
                                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                                    >
                                      <option value="">Seleccionar...</option>
                                      {selectOptions?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    {(isOtroSelected || (currentVal && !selectOptions?.includes(currentVal) && currentVal !== "Otro (escribir)")) && (
                                      <input
                                        type="text"
                                        value={currentVal === "Otro (escribir)" ? (customSelectValues[field.key] || "") : currentVal}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setCustomSelectValues(p => ({ ...p, [field.key]: v }));
                                          setWizardData(p => ({ ...p, [field.key]: v || "Otro (escribir)" }));
                                        }}
                                        placeholder="Escriba el valor personalizado..."
                                        className="w-full mt-2 px-3 py-2 rounded-xl border border-[#f97316]/50 bg-[#f97316]/5 dark:bg-[#f97316]/10 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f97316]/30"
                                      />
                                    )}
                                  </>
                                )}

                                {/* Original select fields */}
                                {!isCiudadField && effectiveType !== "smart-select" && field.type === "select" && (
                                  <select
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                    }}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                                  >
                                    <option value="">Seleccionar...</option>
                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                )}

                                {/* Textarea */}
                                {!isCiudadField && field.type === "textarea" && (
                                  <textarea
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                    }}
                                    placeholder={field.placeholder}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30 resize-none"
                                  />
                                )}

                                {/* Standard inputs (text, number, date) */}
                                {!isCiudadField && effectiveType !== "smart-select" && field.type !== "select" && field.type !== "textarea" && (
                                  <input
                                    type={field.type}
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setWizardData(p => {
                                        const next = { ...p, [field.key]: val };
                                        // Auto-generate PRECIO_LETRAS / MONTO_LETRAS
                                        if ((field.key === "PRECIO_TOTAL" || field.key === "MONTO_PRESTAMO") && val) {
                                          const num = parseFloat(val);
                                          if (!isNaN(num) && num > 0) {
                                            const letrasKey = field.key === "PRECIO_TOTAL" ? "PRECIO_LETRAS" : "MONTO_LETRAS";
                                            next[letrasKey] = numberToWords(num);
                                          }
                                        }
                                        return next;
                                      });
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      // Validate on change
                                      const err = validateField(field.key, val, wizardData);
                                      setFieldErrors(prev => {
                                        const next = { ...prev };
                                        if (err) next[field.key] = err; else delete next[field.key];
                                        return next;
                                      });
                                    }}
                                    placeholder={field.placeholder}
                                    step={field.type === "number" ? "0.01" : undefined}
                                    className={cn(
                                      "w-full px-3 py-2 rounded-xl border text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30",
                                      isAutoFilled && !isCiudadField ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10" : validationError ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10" : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
                                    )}
                                  />
                                )}

                                {/* Validation error */}
                                {validationError && (
                                  <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3 shrink-0" /> {validationError}
                                  </p>
                                )}

                                {/* Auto-generated letras preview */}
                                {(field.key === "PRECIO_LETRAS" || field.key === "MONTO_LETRAS") && wizardData[field.key] && (
                                  <p className="text-[10px] text-[#00B4A6] dark:text-emerald-400 mt-1 flex items-center gap-1">
                                    <Info className="h-3 w-3 shrink-0" /> Auto-generado del monto numerico
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 3: Preview */}
                    {wizardStep === 3 && (
                      <div className="space-y-4">
                        {/* Summary Card */}
                        <div className="bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 border border-[#00B4A6]/20 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Scale className="h-4 w-4 text-[#00B4A6]" />
                            <h4 className="text-sm font-bold text-[#00B4A6]">Resumen en Lenguaje Simple</h4>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{generateSummary()}</p>
                        </div>

                        {/* Full Document Preview — with highlighted filled fields */}
                        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-6 sm:p-8 max-h-[60vh] overflow-y-auto">
                          <div className="max-w-[680px] mx-auto font-serif" ref={printRef}>
                            <h2 className="text-center text-base font-bold uppercase tracking-wider mb-1">
                              CONTRATO DE {selectedTemplate.name.toUpperCase()}
                            </h2>
                            <p className="text-center text-xs text-gray-400 mb-6">{selectedTemplate.legalBasis}</p>
                            <div className="border-t-2 border-double border-gray-400 mb-6" />
                            {selectedTemplate.clausulas.map((clause, i) => {
                              // Replace {{KEY}} with highlighted spans for filled data
                              const parts = clause.split(/(\{\{\w+\}\})/g);
                              return (
                                <p key={i} className="text-sm text-gray-700 dark:text-gray-300 mb-4 text-justify leading-relaxed">
                                  {parts.map((part, j) => {
                                    const match = part.match(/^\{\{(\w+)\}\}$/);
                                    if (match) {
                                      const key = match[1];
                                      const val = wizardData[key];
                                      if (val) {
                                        return <span key={j} className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-300 px-0.5 rounded font-semibold">{val}</span>;
                                      }
                                      return <span key={j} className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-0.5 rounded">[{key}]</span>;
                                    }
                                    return <span key={j}>{part}</span>;
                                  })}
                                </p>
                              );
                            })}
                            <div className="mt-12 flex justify-between gap-8">
                              <div className="flex-1 text-center">
                                <div className="border-t border-gray-400 mt-16 pt-2 text-xs text-gray-500">PRIMERA PARTE</div>
                              </div>
                              <div className="flex-1 text-center">
                                <div className="border-t border-gray-400 mt-16 pt-2 text-xs text-gray-500">SEGUNDA PARTE</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Preview legend */}
                        <div className="flex items-center gap-4 text-[10px] text-gray-500">
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300" /> Campos completados</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100 dark:bg-red-900/30 border border-red-300" /> Campos pendientes</span>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Confirm */}
                    {wizardStep === 4 && (
                      <div className="space-y-4">
                        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-6 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-[#00B4A6] flex items-center justify-center text-white">
                              <CheckCircle className="h-6 w-6" />
                            </div>
                            <div>
                              <h4 className="text-base font-bold text-gray-900 dark:text-white">Confirmar Contrato</h4>
                              <p className="text-xs text-gray-500">{selectedTemplate.name} — {selectedTemplate.legalBasis}</p>
                            </div>
                          </div>

                          {/* Data Summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedTemplate.fields.filter(f => wizardData[f.key]).map(f => (
                              <div key={f.key} className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                                <p className="text-[10px] uppercase font-bold text-gray-400">{f.label}</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{wizardData[f.key]}</p>
                              </div>
                            ))}
                          </div>

                          <div className="bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 rounded-xl p-4">
                            <p className="text-sm text-gray-700 dark:text-gray-300">{generateSummary()}</p>
                          </div>

                          {createError && <p className="text-xs text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">{createError}</p>}
                        </div>
                      </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => wizardStep > 0 ? setWizardStep(s => s - 1) : setSelectedTemplate(null)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        {wizardStep === 0 ? "Cancelar" : "Anterior"}
                      </button>
                      <div className="flex gap-2">
                        {wizardStep < 4 && (
                          <button
                            onClick={() => setWizardStep(s => s + 1)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] shadow-sm transition-colors"
                          >
                            Siguiente
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                        {wizardStep === 4 && (
                          <button
                            onClick={handleCreate}
                            disabled={creating}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 shadow-sm transition-colors"
                          >
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar Contrato
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══ EDITOR ═══ */}
            {activeTab === "editor" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Editor de Plantillas</h3>
                  <select
                    value={editorTemplate?.id || ""}
                    onChange={e => {
                      const tpl = PLANTILLAS.find(p => p.id === e.target.value);
                      if (tpl) {
                        setEditorTemplate(tpl);
                        setEditorText(tpl.clausulas.join("\n\n"));
                        setEditorPreview(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                  >
                    <option value="">Seleccionar plantilla...</option>
                    {PLANTILLAS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {editorTemplate && (
                    <button
                      onClick={() => setEditorPreview(!editorPreview)}
                      className={cn("flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
                        editorPreview ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400"
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" /> {editorPreview ? "Editando" : "Preview"}
                    </button>
                  )}
                </div>

                {!editorTemplate ? (
                  <div className="text-center py-12">
                    <Edit3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Selecciona una plantilla para editar sus clausulas</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Editor */}
                    <div className="space-y-3">
                      <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                        <p className="text-xs font-bold text-gray-500 mb-2">Campos disponibles (clic para insertar):</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {editorTemplate.fields.map(f => (
                            <button
                              key={f.key}
                              onClick={() => setEditorText(prev => prev + ` {{${f.key}}}`)}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00B4A6]/10 text-[#00B4A6] hover:bg-[#00B4A6]/20 transition-colors"
                            >
                              {`{{${f.key}}}`}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={editorText}
                          onChange={e => setEditorText(e.target.value)}
                          rows={20}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-sm text-gray-900 dark:text-white font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30 resize-none"
                          placeholder="Escribe o edita las clausulas del contrato..."
                        />
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-6 max-h-[70vh] overflow-y-auto">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Vista Previa</h4>
                      <div className="font-serif space-y-3">
                        {editorText.split("\n\n").filter(p => p.trim()).map((para, i) => (
                          <p key={i} className="text-sm text-gray-700 dark:text-gray-300 text-justify leading-relaxed">
                            {para.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                              const field = editorTemplate.fields.find(f => f.key === key);
                              return `[${field?.label || key}]`;
                            })}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </m.div>
        </AnimatePresence>
      )}

      {/* ═══ CONTRACT DETAIL SHEET ═══ */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div key="ct-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
            <m.div
              key="ct-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-[#1a1a2e] border-l border-gray-200 dark:border-white/10 shadow-2xl overflow-y-auto"
            >
              <div className="p-4 sm:p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Contrato {selected.numero}</h3>
                    <p className="text-xs text-gray-400">{TIPO_LABELS[selected.tipo] || selected.tipo}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                {/* Summary Card */}
                {(() => {
                  const { summary } = getContractContent(selected);
                  if (!summary) return null;
                  return (
                    <div className="bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 border border-[#00B4A6]/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Scale className="h-4 w-4 text-[#00B4A6]" />
                        <h4 className="text-xs font-bold text-[#00B4A6] uppercase">Resumen</h4>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
                    </div>
                  );
                })()}

                {/* Estado Badge */}
                <div className="flex items-center gap-2">
                  <span className={cn("px-3 py-1 rounded-lg text-xs font-bold", ESTADO_STYLES[getEstado(selected)])}>
                    {getEstado(selected)}
                  </span>
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400">
                    {TIPO_LABELS[selected.tipo] || selected.tipo}
                  </span>
                </div>

                {/* Parties */}
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-[#f97316]/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-[#f97316]" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{selected.clienteNombre}</p>
                      <p className="text-xs text-gray-500">{selected.clienteDocumento}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 dark:border-white/10">
                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Monto</p><p className="text-sm font-bold text-[#00B4A6]">{formatCurrency(selected.montoTotal || 0)}</p></div>
                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Fecha</p><p className="text-sm text-gray-700 dark:text-gray-300">{formatDatePeru(selected.fechaContrato || selected.createdAt)}</p></div>
                  </div>

                  {/* Vigencia Timeline */}
                  {selected.fechaVencimiento && (() => {
                    const inicio = new Date(selected.fechaContrato || selected.createdAt).getTime();
                    const vence = new Date(selected.fechaVencimiento).getTime();
                    const hoy = Date.now();
                    const total = vence - inicio;
                    const progreso = total > 0 ? Math.max(0, Math.min(((hoy - inicio) / total) * 100, 100)) : 0;
                    const diasRestantes = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
                    const barColor = progreso >= 100 ? "bg-red-500" : progreso > 80 ? "bg-amber-500" : "bg-[#00B4A6]";
                    return (
                      <div className="pt-3 border-t border-gray-200 dark:border-white/10 space-y-1.5">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Vigencia</p>
                        <div className="relative h-2.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${progreso}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-gray-500">
                          <span>{formatDatePeru(selected.fechaContrato || selected.createdAt)}</span>
                          <span className="font-bold">{diasRestantes > 0 ? `${diasRestantes} dias restantes` : diasRestantes === 0 ? "Vence hoy" : `Vencido hace ${Math.abs(diasRestantes)}d`}</span>
                          <span>{formatDatePeru(selected.fechaVencimiento)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Clausulas */}
                {selected.clausulas.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Clausulas</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {selected.clausulas.map((c, i) => (
                        <div key={i} className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl text-sm text-gray-700 dark:text-gray-300 text-justify leading-relaxed">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Version History */}
                {(() => {
                  const versions = getVersions(selected.id);
                  if (versions.length === 0) return null;
                  return (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <Clock className="h-4 w-4" /> Historial de Versiones
                        <span className="text-[10px] bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded-full">{versions.length}</span>
                      </h4>
                      <div className="space-y-1">
                        {versions.map(v => (
                          <div key={v.version} className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg text-xs flex items-center justify-between">
                            <span className="font-bold text-gray-600 dark:text-gray-400">v{v.version}</span>
                            <span className="text-gray-400">{new Date(v.savedAt).toLocaleString("es-PE")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => downloadPDF(selected)} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] shadow-sm transition-colors">
                      <Printer className="h-4 w-4" /> PDF
                    </button>
                    <button onClick={() => downloadWord(selected)} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 transition-colors">
                      <Download className="h-4 w-4" /> Word
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => downloadTxt(selected)} className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 transition-colors">
                      <FileText className="h-3.5 w-3.5" /> Texto (.txt)
                    </button>
                    <button onClick={() => copyToClipboard(selected)} className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 transition-colors">
                      <ClipboardCopy className="h-3.5 w-3.5" /> Copiar
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const tpl = PLANTILLAS.find(t => {
                        const _c = getContractContent(selected);
                        try { const data = JSON.parse(localStorage.getItem(`contract-content-${selected.id}`) || "{}"); return data.templateId === t.id; } catch { return false; }
                      });
                      if (tpl) {
                        try {
                          const raw = localStorage.getItem(`contract-content-${selected.id}`);
                          if (raw) {
                            const saved = JSON.parse(raw);
                            setSelectedTemplate(tpl);
                            setWizardData(saved.data || {});
                            setWizardStep(0);
                            setSelected(null);
                            setActiveTab("crear");
                          }
                        } catch { /* noop */ }
                      } else {
                        // Duplicate as new contract
                        setActiveTab("plantillas");
                        setSelected(null);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#f97316] bg-[#f97316]/10 hover:bg-[#f97316]/20 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicar Contrato
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
