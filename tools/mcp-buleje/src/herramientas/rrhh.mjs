// Grupo «rrhh»: colaboradores, asistencia y pago semanal. Pagar y marcar asistencia piden OK (29-10).
// El servidor tapa DNI, celulares y sueldos de todo lo que vuelve de este grupo (src/tapar.mjs).

import { z, negocio, idRuta, dia, limpiar, lista, ficha, soles, claveMonto, claveCantidad as claveCantidadLocal, claveNombre, NO_VERIFICADO, fichaPorId, filaIdentidad, filasCompletas, otrosNombres, verificado, linea60, conMarca, antesDelPanel, colaDe4, leerSeguro, filasDe } from "../util-herramientas.mjs";

/** Nombre del colaborador por id en la lista del panel + otros nombres (señuelos). */
async function colaboradorDeLista(id, leer) {
  const filas = await filasCompletas(leer, "/api/rrhh/colaboradores", { incluirCesados: "1" });
  const f = filas?.find((x) => x && String(x.id) === String(id));
  return { nombre: f?.nombre, ficha: f, otros: otrosNombres(filas, id) };
}

const ESTADOS = ["PRESENTE", "TARDANZA", "MEDIO_DIA", "FALTA", "PERMISO", "DESCANSO", "VACACIONES", "LICENCIA"];

// ── Carril C (29-10): trabajadores, tarifas y puestos ───────────────────────────────────────────────
/** Ficha del colaborador por id (GET por id) + su nombre y otros nombres de la lista (señuelos). Nunca lo que escribió el modelo. */
async function trabajadorPorId(id, leer) {
  const [f, lis] = await Promise.all([fichaPorId(leer, `/api/rrhh/colaboradores/${id}`), filasCompletas(leer, "/api/rrhh/colaboradores", { incluirCesados: "1" })]);
  const c = /** @type {any} */ (f)?.colaborador ?? f;
  const enLista = lis?.find((x) => x && String(x.id) === String(id));
  return { nombre: c?.nombre ?? enLista?.nombre, ficha: c, tarifa: c?.tarifaVigente ?? undefined, otros: otrosNombres(lis, id) };
}

const TIPOS_DOC = ["DNI", "CE", "PASAPORTE", "OTRO"];
const MODALIDADES_PAGADAS = ["HORA", "DIA", "SEMANA", "MES"];
const textoNull = (n) => z.string().max(n).nullable().optional();
/** Campos de la ficha (iguales en crear y editar). null = quitar el dato. */
const camposTrabajador = {
  nombre: z.string().min(2).max(120).describe("Nombre completo (2-120 letras)"),
  apodo: textoNull(40).describe("Apodo; null lo quita"),
  tipoDocumento: z.enum(/** @type {[string, ...string[]]} */ (TIPOS_DOC)).nullable().optional(),
  documento: textoNull(20).describe("Número de documento; null lo quita"),
  celular: textoNull(20),
  direccion: textoNull(300),
  contactoEmergenciaNombre: textoNull(120),
  contactoEmergenciaCelular: textoNull(20),
  puestoId: idRuta.nullable().optional().describe("Id del puesto (rrhh_ver vista=puestos); null lo quita"),
  fechaIngreso: dia.nullable().optional(),
  observaciones: textoNull(2000),
  fotoUrl: z.string().max(600).regex(/^https:\/\//, "La foto va como URL https").nullable().optional(),
  grupoSanguineo: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable().optional(),
  alergias: textoNull(200),
  eventual: z.boolean().optional().describe("true = personal de paso"),
};
const cuerpoTrabajador = (a) => limpiarConNull({ nombre: a.nombre, apodo: a.apodo, tipoDocumento: a.tipoDocumento, documento: a.documento, celular: a.celular, direccion: a.direccion, contactoEmergenciaNombre: a.contactoEmergenciaNombre, contactoEmergenciaCelular: a.contactoEmergenciaCelular, puestoId: a.puestoId, fechaIngreso: a.fechaIngreso, observaciones: a.observaciones, fotoUrl: a.fotoUrl, grupoSanguineo: a.grupoSanguineo, alergias: a.alergias, eventual: a.eventual });
/** Quita solo lo no enviado (undefined): un null explícito SÍ viaja (= quitar el dato en el panel). */
function limpiarConNull(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)); }
const tarifaTexto = (t) => (t && t.monto !== undefined ? `${soles(Number(t.monto))} por ${String(t.modalidad ?? "").toLowerCase()}` : undefined);
const tarifaInput = z.object({
  modalidad: z.enum(/** @type {[string, ...string[]]} */ (MODALIDADES_PAGADAS)).describe("HORA, DIA, SEMANA o MES"),
  monto: z.number().positive().max(9999999).describe("S/ por esa modalidad"),
  horasJornada: z.number().positive().max(24).optional().describe("Horas de la jornada (1-24)"),
  vigenteDesde: dia.describe("Desde qué día rige"),
});

/** Replica las reglas del servidor (lib/rrhh/asistencia.ts incluidosEnMasivo): salta no activos, los que aún no ingresaron, eventuales y los ya marcados (sin sobrescribir). */
function incluidosMasivo(filas, a, vivas) {
  const filtro = a.colaboradorIds?.length ? new Set(a.colaboradorIds.map(String)) : null;
  const incluidos = [];
  const omitidos = { eventuales: 0, noIngresados: 0, yaMarcados: 0, noActivos: 0 };
  for (const c of filas) {
    if (!c || (filtro && !filtro.has(String(c.id)))) continue;
    if (c.estado && c.estado !== "ACTIVO") { omitidos.noActivos++; continue; }
    if (c.fechaIngreso && String(c.fechaIngreso).slice(0, 10) > a.fecha) { omitidos.noIngresados++; continue; }
    if (c.eventual) { omitidos.eventuales++; continue; }
    if (!a.sobrescribir && vivas.has(String(c.id))) { omitidos.yaMarcados++; continue; }
    incluidos.push(c);
  }
  return { cuantos: incluidos.length, nombres: incluidos.slice(0, 6).map((x) => x.nombre).filter(Boolean), omitidos };
}
const textoOmitidos = (o) => [o?.eventuales && `${o.eventuales} eventual(es)`, o?.noIngresados && `${o.noIngresados} que aún no ingresaron`, o?.yaMarcados && `${o.yaMarcados} ya marcado(s)`, o?.noActivos && `${o.noActivos} no activo(s)`].filter(Boolean).join(", ");

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
const herramientasCarrilC = [
  {
    nombre: "trabajador_ver",
    grupo: "rrhh",
    tipo: "lectura",
    descripcion: "Ficha de un trabajador por id (GET /api/rrhh/colaboradores/[id]): puesto, estado, ingreso y, para admin/dueño, su tarifa vigente. DNI, celular y sueldos salen tapados. El id sale de rrhh_ver vista=colaboradores. Ej.: id de un trabajador.",
    entrada: { negocio, id: idRuta.describe("Id del trabajador") },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/rrhh/colaboradores/${a.id}` }),
    formatear: (d) => {
      const c = /** @type {any} */ (d)?.colaborador ?? d;
      return ficha(c, { titulo: "Trabajador", campos: [["Nombre", ["nombre"]], ["Apodo", ["apodo"]], ["Estado", ["estado"]], ["Ingreso", ["fechaIngreso"], "f"], ["Cese", ["fechaCese"], "f"], ["Documento", ["documento"]], ["Eventual", ["eventual"]], ["Id", ["id"]]] }) + (c?.puesto?.nombre ? `\nPuesto: ${c.puesto.nombre}` : "");
    },
  },
  {
    nombre: "trabajador_crear",
    grupo: "rrhh",
    tipo: "escritura",
    descripcion: "Da de alta un trabajador (POST /api/rrhh/colaboradores). Solo el nombre es obligatorio. Con tarifaInicial (S/, solo admin/dueño) pide OK de Brandon porque define lo que se le paga. Devuelve la ficha con su id. Ej.: nombre=\"Pedro Ramírez\", puestoId=<id de un puesto>.",
    entrada: {
      negocio,
      ...camposTrabajador,
      estado: z.enum(["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"]).optional().describe("Por defecto ACTIVO"),
      beneficiarioId: idRuta.nullable().optional().describe("Vincula con un beneficiario de adelantos (solo admin/dueño)"),
      tarifaInicial: tarifaInput.nullable().optional().describe("Tarifa con la que empieza (solo admin/dueño); define el pago"),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/rrhh/colaboradores", cuerpo: limpiarConNull({ ...cuerpoTrabajador(a), estado: a.estado, beneficiarioId: a.beneficiarioId, tarifaInicial: a.tarifaInicial }) }),
    confirmarSi: (a) => a.tarifaInicial != null || (a.beneficiarioId != null && a.beneficiarioId !== ""),
    resumen: (a) => `Dar de alta a ${linea60(a.nombre)} ${a.tarifaInicial ? `con una tarifa de ${soles(a.tarifaInicial.monto)} por ${String(a.tarifaInicial.modalidad).toLowerCase()} desde ${a.tarifaInicial.vigenteDesde}` : "sin tarifa"}.${a.beneficiarioId ? ` Lo vincula al beneficiario de adelantos ${linea60(a.beneficiarioId)} (sus adelantos se descuentan del pago).` : ""} Define lo que se le paga cada semana.`,
    ventana: (a) => ({
      clave: a.tarifaInicial ? claveMonto(a.tarifaInicial.monto, { etiqueta: "Tarifa inicial" }) : null,
      filas: [{ etiqueta: "Trabajador nuevo", valor: linea60(a.nombre) }, { etiqueta: "Modalidad", valor: a.tarifaInicial ? String(a.tarifaInicial.modalidad).toLowerCase() : "—" }, ...(a.beneficiarioId ? [{ etiqueta: "Beneficiario de adelantos", valor: linea60(a.beneficiarioId) }] : [])],
    }),
  },
  {
    nombre: "trabajador_editar",
    grupo: "rrhh",
    tipo: "escritura",
    descripcion: "Edita la ficha de un trabajador (PATCH /api/rrhh/colaboradores/[id], action editar): solo manda lo que cambia; null quita un dato. Cambiar nombre, documento o celular pide OK de Brandon (cambia QUIÉN es). Ej.: id=<id>, puestoId=<id de otro puesto>.",
    entrada: { negocio, id: idRuta.describe("Id del trabajador (rrhh_ver vista=colaboradores)"), ...Object.fromEntries(Object.entries(camposTrabajador).map(([k, v]) => [k, k === "nombre" ? v.optional() : v])) },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/rrhh/colaboradores/${a.id}`, cuerpo: { action: "editar", ...cuerpoTrabajador(a) } }),
    confirmarSi: (a) => a.nombre !== undefined || a.documento !== undefined || a.celular !== undefined || a.tipoDocumento !== undefined,
    previa: (a, leer) => trabajadorPorId(a.id, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const cambios = [];
      if (a.nombre !== undefined) cambios.push(`nombre «${linea60(p?.nombre) || "(no se pudo leer)"}» → «${conMarca(a.nombre)}»`);
      if (a.documento !== undefined) cambios.push(`documento ${antesDelPanel(p?.ficha, p?.ficha?.documento, colaDe4)} → ${a.documento === null ? "(quitar)" : linea60(a.documento, 20)}`);
      if (a.celular !== undefined) cambios.push(`celular ${antesDelPanel(p?.ficha, p?.ficha?.celular, colaDe4)} → ${a.celular === null ? "(quitar)" : linea60(a.celular, 20)}`);
      const otros = Object.keys(camposTrabajador).filter((k) => !["nombre", "documento", "celular"].includes(k) && a[k] !== undefined);
      return `Editar a ${verificado(p?.nombre)}: ${cambios.length ? cambios.join("; ") : "sin cambios de nombre, documento ni celular"}.${otros.length ? ` También cambia: ${otros.join(", ")}.` : ""}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Trabajador" }) : null,
        filas: [filaIdentidad(p?.ficha), ...(a.nombre !== undefined ? [{ etiqueta: "Nombre nuevo", valor: linea60(a.nombre) }] : []), ...(a.documento !== undefined ? [{ etiqueta: "Documento nuevo", valor: a.documento === null ? "(quitar)" : linea60(a.documento, 20) }] : []), ...(a.celular !== undefined ? [{ etiqueta: "Celular nuevo", valor: a.celular === null ? "(quitar)" : linea60(a.celular, 20) }] : [])],
      };
    },
  },
  {
    nombre: "tarifa_guardar",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Pone una nueva tarifa de pago a un trabajador (PUT /api/rrhh/colaboradores/[id]/tarifas, solo admin/dueño): monto en S/ por HORA, DIA, SEMANA o MES, vigente desde un día. Cambia lo que se le paga. Pide OK de Brandon. Ej.: id=<id>, modalidad=DIA, monto=60, vigenteDesde=2026-11-02.",
    entrada: {
      negocio,
      id: idRuta.describe("Id del trabajador: el nombre del aviso lo saca el panel"),
      modalidad: z.enum(/** @type {[string, ...string[]]} */ (["HORA", "DIA", "SEMANA", "MES", "SIN_PAGO"])).describe("HORA, DIA, SEMANA, MES o SIN_PAGO (SIN_PAGO exige monto 0)"),
      monto: z.number().min(0).max(9999999).describe("S/ por esa modalidad (0 solo si SIN_PAGO)"),
      vigenteDesde: dia.describe("Desde qué día rige"),
      horasJornada: z.number().positive().max(24).optional().describe("Horas de la jornada (1-24)"),
      motivo: z.string().max(300).optional().describe("Por qué cambia (opcional)"),
    },
    pedido: (a) => ({ metodo: "PUT", ruta: `/api/rrhh/colaboradores/${a.id}/tarifas`, cuerpo: limpiar({ modalidad: a.modalidad, monto: a.monto, horasJornada: a.horasJornada, vigenteDesde: a.vigenteDesde, motivo: a.motivo }) }),
    previa: (a, leer) => trabajadorPorId(a.id, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const antes = tarifaTexto(p?.tarifa);
      return `Poner a ${verificado(p?.nombre)} una tarifa de ${soles(a.monto)} por ${String(a.modalidad).toLowerCase()} desde el ${a.vigenteDesde}.${antes ? ` Hoy: ${antes}.` : ""} Cambia lo que se le paga.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: claveMonto(a.monto, { etiqueta: "Tarifa nueva" }),
        filas: [{ etiqueta: "A quién", valor: verificado(p?.nombre) }, filaIdentidad(p?.ficha), { etiqueta: "Por", valor: String(a.modalidad).toLowerCase() }, { etiqueta: "Desde", valor: a.vigenteDesde }],
      };
    },
  },
  {
    nombre: "puesto_crear",
    grupo: "rrhh",
    tipo: "escritura",
    descripcion: "Crea un puesto de trabajo (POST /api/rrhh/puestos): nombre, jornada en horas, hora de entrada HH:MM y minutos de tolerancia. Con tarifaSugerida (S/, solo admin/dueño) pide OK. Devuelve el puesto con su id. Ej.: nombre=\"Ayudante de patio\", horaEntrada=\"07:30\".",
    entrada: {
      negocio,
      nombre: z.string().min(2).max(80).describe("Nombre del puesto (2-80)"),
      descripcion: z.string().max(300).nullable().optional(),
      tarifaSugerida: z.object({ modalidad: z.enum(/** @type {[string, ...string[]]} */ (MODALIDADES_PAGADAS)), monto: z.number().positive().max(9999999).describe("S/") }).nullable().optional().describe("Tarifa que se propone a los nuevos (solo admin/dueño)"),
      horasJornada: z.number().positive().max(24).optional().describe("Horas de la jornada"),
      horaEntrada: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe("HH:MM; con ella la tardanza se juzga sola"),
      toleranciaMin: z.number().int().min(0).max(240).optional().describe("Minutos de gracia (0-240)"),
      orden: z.number().int().min(0).max(999).optional(),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/rrhh/puestos", cuerpo: limpiarConNull({ nombre: a.nombre, descripcion: a.descripcion, tarifaSugerida: a.tarifaSugerida, horasJornada: a.horasJornada, horaEntrada: a.horaEntrada, toleranciaMin: a.toleranciaMin, orden: a.orden }) }),
    confirmarSi: (a) => a.tarifaSugerida != null,
    resumen: (a) => `Crear el puesto «${linea60(a.nombre)}» con tarifa sugerida de ${a.tarifaSugerida ? `${soles(a.tarifaSugerida.monto)} por ${String(a.tarifaSugerida.modalidad).toLowerCase()}` : "(ninguna)"}.`,
    ventana: (a) => ({ clave: a.tarifaSugerida ? claveMonto(a.tarifaSugerida.monto, { etiqueta: "Tarifa sugerida" }) : null, filas: [{ etiqueta: "Puesto nuevo", valor: linea60(a.nombre) }] }),
  },
  {
    nombre: "puesto_editar",
    grupo: "rrhh",
    tipo: "escritura",
    descripcion: "Edita un puesto (PATCH /api/rrhh/puestos/[id]): solo manda lo que cambia. Con tarifaSugerida (S/) pide OK. Ej.: id=<id del puesto>, horaEntrada=\"08:00\", toleranciaMin=10.",
    entrada: {
      negocio,
      id: idRuta.describe("Id del puesto (rrhh_ver vista=puestos)"),
      nombre: z.string().min(2).max(80).optional(),
      descripcion: z.string().max(300).nullable().optional(),
      tarifaSugerida: z.object({ modalidad: z.enum(/** @type {[string, ...string[]]} */ (MODALIDADES_PAGADAS)), monto: z.number().positive().max(9999999).describe("S/") }).nullable().optional().describe("Tarifa que se propone a los nuevos (solo admin/dueño)"),
      horasJornada: z.number().positive().max(24).optional(),
      horaEntrada: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe("HH:MM"),
      toleranciaMin: z.number().int().min(0).max(240).optional(),
      orden: z.number().int().min(0).max(999).optional(),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/rrhh/puestos/${a.id}`, cuerpo: limpiarConNull({ nombre: a.nombre, descripcion: a.descripcion, tarifaSugerida: a.tarifaSugerida, horasJornada: a.horasJornada, horaEntrada: a.horaEntrada, toleranciaMin: a.toleranciaMin, orden: a.orden }) }),
    confirmarSi: (a) => a.tarifaSugerida != null,
    previa: async (a, leer) => {
      const filas = await filasCompletas(leer, "/api/rrhh/puestos");
      const f = filas?.find((x) => x && String(x.id) === String(a.id));
      return { nombre: f?.nombre, otros: otrosNombres(filas, a.id) };
    },
    resumen: (a, previa) => `Editar el puesto «${verificado(/** @type {any} */ (previa)?.nombre)}»: tarifa sugerida ${a.tarifaSugerida ? `${soles(a.tarifaSugerida.monto)} por ${String(a.tarifaSugerida.modalidad).toLowerCase()}` : "(sin cambio)"}.`,
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: a.tarifaSugerida ? claveMonto(a.tarifaSugerida.monto, { etiqueta: "Tarifa sugerida" }) : null, filas: [{ etiqueta: "Puesto", valor: verificado(p?.nombre) }] };
    },
  },
];

// ── P2: estado, cese y reingreso (PATCH [id], una acción por pedido), notas y masivo de asistencia, deshacer pago ──
const filasTrabajador = (p, extra = []) => [filaIdentidad(p?.ficha), { etiqueta: "Estado hoy", valor: p?.ficha?.estado ? String(p.ficha.estado).toLowerCase() : "no se pudo leer" }, ...extra];
const claveTrabajador = (p, etiqueta = "Trabajador") => (p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta }) : null);

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
const herramientasCarrilCP2 = [
  {
    nombre: "trabajador_estado",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Cambia el estado de un trabajador (PATCH /api/rrhh/colaboradores/[id], action cambiar_estado): ACTIVO, VACACIONES, LICENCIA o SUSPENDIDO. Cambia si se le paga. Pide OK de Brandon. Ej.: id=<id>, estado=\"VACACIONES\".",
    entrada: { negocio, id: idRuta.describe("Id del trabajador: el nombre del aviso lo saca el panel"), estado: z.enum(["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"]), sinPagoDesde: dia.optional().describe("Desde qué día no se le paga (opcional)") },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/rrhh/colaboradores/${a.id}`, cuerpo: limpiar({ action: "cambiar_estado", estado: a.estado, sinPagoDesde: a.sinPagoDesde }) }),
    previa: (a, leer) => trabajadorPorId(a.id, leer),
    resumen: (a, previa) => `Pasar a ${verificado(/** @type {any} */ (previa)?.nombre)} de «${String(/** @type {any} */ (previa)?.ficha?.estado ?? "(no se pudo leer)").toLowerCase()}» a «${a.estado.toLowerCase()}»${a.sinPagoDesde ? `, sin pago desde el ${a.sinPagoDesde}` : ""}.`,
    ventana: (a, previa) => ({ clave: claveTrabajador(/** @type {any} */ (previa)), filas: filasTrabajador(previa, [{ etiqueta: "Pasa a", valor: a.estado.toLowerCase() }]) }),
  },
  {
    nombre: "trabajador_cesar",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Da de baja (cesa) a un trabajador (PATCH /api/rrhh/colaboradores/[id], action cesar): fecha de cese y motivo (3-300). Deja de aparecer en la asistencia desde esa fecha. Pide OK de Brandon. Ej.: id=<id>, fechaCese=2026-11-05, motivo=\"Renunció\".",
    entrada: { negocio, id: idRuta.describe("Id del trabajador: el nombre del aviso lo saca el panel"), fechaCese: dia.describe("Último día en la empresa"), motivo: z.string().min(3).max(300).describe("Por qué se va (3-300)"), aceptarMarcasPosteriores: z.boolean().optional().describe("true = cesar aunque tenga marcas de asistencia después de esa fecha (el panel avisa antes)") },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/rrhh/colaboradores/${a.id}`, cuerpo: limpiar({ action: "cesar", fechaCese: a.fechaCese, motivo: a.motivo, confirmar: a.aceptarMarcasPosteriores ? true : undefined }) }),
    previa: (a, leer) => trabajadorPorId(a.id, leer),
    resumen: (a, previa) => `Cesar a ${verificado(/** @type {any} */ (previa)?.nombre)} el ${a.fechaCese}. Motivo: ${linea60(a.motivo, 100)}.${a.aceptarMarcasPosteriores ? " Se acepta cesar aunque tenga marcas de asistencia posteriores a esa fecha." : ""}`,
    ventana: (a, previa) => ({ clave: claveTrabajador(/** @type {any} */ (previa)), filas: filasTrabajador(previa, [{ etiqueta: "Cese", valor: a.fechaCese }, ...(a.aceptarMarcasPosteriores ? [{ etiqueta: "Marcas posteriores", valor: "se aceptan" }] : [])]) }),
  },
  {
    nombre: "trabajador_reingresar",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Reingresa a un trabajador cesado (PATCH /api/rrhh/colaboradores/[id], action reingresar) desde una fecha. Con tarifa (S/, solo admin/dueño) define su pago. Pide OK de Brandon. Ej.: id=<id>, fecha=2026-11-10.",
    entrada: { negocio, id: idRuta.describe("Id del trabajador: el nombre del aviso lo saca el panel"), fecha: dia.describe("Día en que vuelve"), tarifa: tarifaInput.nullable().optional().describe("Tarifa con la que vuelve (S/)") },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/rrhh/colaboradores/${a.id}`, cuerpo: limpiarConNull({ action: "reingresar", fecha: a.fecha, tarifa: a.tarifa }) }),
    previa: (a, leer) => trabajadorPorId(a.id, leer),
    resumen: (a, previa) => `Reingresar a ${verificado(/** @type {any} */ (previa)?.nombre)} el ${a.fecha}${a.tarifa ? ` con tarifa de ${soles(a.tarifa.monto)} por ${String(a.tarifa.modalidad).toLowerCase()}` : ""}.`,
    ventana: (a, previa) => ({ clave: a.tarifa ? claveMonto(a.tarifa.monto, { etiqueta: "Tarifa al volver" }) : claveTrabajador(/** @type {any} */ (previa)), filas: filasTrabajador(previa, [{ etiqueta: "Vuelve", valor: a.fecha }]) }),
  },
  {
    nombre: "asistencia_nota",
    grupo: "rrhh",
    tipo: "escritura",
    descripcion: "Pone la nota de un día de un trabajador sin marca (PUT /api/rrhh/asistencia/nota), 1-300 letras; con borrar=true la quita (DELETE). Ej.: colaboradorId=<id>, fecha=2026-10-29, nota=\"Llegó con permiso\".",
    entrada: { negocio, colaboradorId: idRuta, fecha: dia, nota: z.string().min(1).max(300).optional().describe("Texto de la nota (no hace falta si borrar=true)"), borrar: z.boolean().optional().describe("true = quita la nota de ese día") },
    pedido: (a) => (a.borrar ? { metodo: "DELETE", ruta: "/api/rrhh/asistencia/nota", query: { colaboradorId: a.colaboradorId, fecha: a.fecha } } : { metodo: "PUT", ruta: "/api/rrhh/asistencia/nota", cuerpo: { colaboradorId: a.colaboradorId, fecha: a.fecha, nota: a.nota ?? "" } }),
  },
  {
    nombre: "asistencia_masiva",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Marca asistencia a varios trabajadores a la vez (POST /api/rrhh/asistencia/masivo): estado (por defecto PRESENTE) para los ids dados o, sin ids, para TODOS los incluibles. Sin sobrescribir no pisa marcas hechas. La asistencia define el pago: pide OK de Brandon.",
    entrada: { negocio, fecha: dia, estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS)).optional().describe("Por defecto PRESENTE"), entrada: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:MM"), salida: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:MM"), colaboradorIds: z.array(idRuta).max(500).optional().describe("Vacío o ausente = todos"), sobrescribir: z.boolean().optional().describe("true = pisa marcas ya hechas"), nota: z.string().max(300).optional() },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/rrhh/asistencia/masivo", cuerpo: limpiar({ fecha: a.fecha, estado: a.estado, entrada: a.entrada, salida: a.salida, colaboradorIds: a.colaboradorIds?.length ? a.colaboradorIds : undefined, sobrescribir: a.sobrescribir, nota: a.nota }) }),
    previa: async (a, leer) => {
      const filas = await filasCompletas(leer, "/api/rrhh/colaboradores");
      const hoja = await leerSeguro(leer, "/api/rrhh/asistencia", { desde: a.fecha, hasta: a.fecha }, { sinRecorte: true });
      const vivas = new Set(hoja.ok ? filasDe(hoja.datos && typeof hoja.datos === "object" && Array.isArray(/** @type {any} */ (hoja.datos).marcas) ? /** @type {any} */ (hoja.datos).marcas : []).map((m) => String(m?.colaboradorId)) : []);
      const r = incluidosMasivo(filas ?? [], a, vivas);
      return { ...r, leido: Array.isArray(filas) && hoja.ok };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Marcar ${String(a.estado ?? "PRESENTE").replace("_", " ").toLowerCase()} el ${a.fecha} a ${p?.leido ? `${p.cuantos} trabajador(es)` : NO_VERIFICADO}${a.sobrescribir ? ", pisando marcas ya hechas" : ""}${p?.leido && textoOmitidos(p.omitidos) ? ` (el panel salta: ${textoOmitidos(p.omitidos)})` : ""}. Cambia lo que se les paga.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.leido && p.cuantos > 0 ? claveCantidadLocal(p.cuantos) : null, filas: [{ etiqueta: "Día", valor: a.fecha }, { etiqueta: "Marca", valor: String(a.estado ?? "PRESENTE").replace("_", " ").toLowerCase() }, { etiqueta: "Incluye a", valor: p?.nombres?.length ? p.nombres.map((n) => linea60(n, 20)).join(", ") + (p.cuantos > p.nombres.length ? "…" : "") : "(no se pudo leer)" }, { etiqueta: "Pisa marcas", valor: a.sobrescribir ? "sí" : "no" }, { etiqueta: "Se salta", valor: p?.leido ? textoOmitidos(p.omitidos) || "nadie" : "no se pudo leer" }] };
    },
  },
  {
    nombre: "pago_semana_deshacer",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Deshace el pago de una semana a un trabajador (DELETE /api/rrhh/pago-semana, solo admin/dueño): reabre sus adelantos, borra el gasto y devuelve el neto a la caja abierta. Pide OK de Brandon. Ej.: colaboradorId=<id>, desde=<lunes de esa semana>.",
    entrada: { negocio, colaboradorId: idRuta.describe("Id del trabajador: el nombre del aviso lo saca el panel"), desde: dia.describe("Lunes de la semana pagada") },
    pedido: (a) => ({ metodo: "DELETE", ruta: "/api/rrhh/pago-semana", cuerpo: { colaboradorId: a.colaboradorId, desde: a.desde } }),
    previa: async (a, leer) => {
      const t = await trabajadorPorId(a.colaboradorId, leer);
      const r = await leerSeguro(leer, "/api/rrhh/pago-semana", { semana: a.desde }, { sinRecorte: true });
      const fila = r.ok ? filasDe(r.datos).find((f) => f && String(f.colaboradorId) === String(a.colaboradorId)) : undefined;
      const neto = Number(fila?.pagado?.neto);
      return { ...t, pago: { leido: r.ok, hayPago: Boolean(fila?.pagado), neto: Number.isFinite(neto) ? neto : undefined, salioDeCaja: Boolean(fila?.pagado?.salioDeCaja) } };
    },
    resumen: (a, previa) => {
      const pg = /** @type {any} */ (previa)?.pago;
      const neto = pg?.neto === undefined ? "el neto pagado" : `el neto de ${soles(pg.neto)}${pg.salioDeCaja ? " (salió de la caja)" : ""}`;
      return `Deshacer el pago de la semana del ${a.desde} a ${verificado(/** @type {any} */ (previa)?.nombre)}: reabre sus adelantos, borra el gasto y devuelve ${neto} a la caja abierta.${pg?.neto === undefined ? " OJO: no pude leer cuánto se pagó." : ""}${pg?.leido && !pg.hayPago ? " OJO: el panel no muestra un pago de esa semana." : ""}`;
    },
    ventana: (a, previa) => {
      const pg = /** @type {any} */ (previa)?.pago;
      return { clave: pg?.neto !== undefined ? claveMonto(pg.neto, { etiqueta: "Neto devuelto a la caja" }) : claveTrabajador(/** @type {any} */ (previa)), filas: filasTrabajador(previa, [{ etiqueta: "Semana del", valor: a.desde }, { etiqueta: "Neto pagado", valor: pg?.neto === undefined ? "no se pudo leer" : soles(pg.neto) }]) };
    },
  },
];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "rrhh_ver",
    grupo: "rrhh",
    tipo: "lectura",
    descripcion: "Consulta RRHH. vista=resumen, colaboradores (q, estado, puestoId, incluirCesados), puestos (lista de puestos con su id), asistencia (desde/hasta, máx. 62 días) o pago_semana (semana = lunes AAAA-MM-DD; montos en S/). Ej.: vista=colaboradores, q=\"Juan\".",
    entrada: {
      negocio,
      vista: z.enum(["resumen", "colaboradores", "puestos", "asistencia", "pago_semana"]).default("resumen"),
      q: z.string().max(100).optional(),
      estado: z.string().max(40).optional(),
      puestoId: idRuta.optional().describe("Solo colaboradores: filtra por puesto (id sale de vista=puestos)"),
      incluirCesados: z.boolean().optional(),
      desde: dia.optional(),
      hasta: dia.optional(),
      semana: dia.optional().describe("Lunes de la semana, solo pago_semana"),
    },
    pedido: (a) => {
      const v = a.vista ?? "resumen";
      if (v === "colaboradores") return { metodo: "GET", ruta: "/api/rrhh/colaboradores", query: limpiar({ q: a.q, estado: a.estado, puestoId: a.puestoId, incluirCesados: a.incluirCesados ? "1" : undefined }) };
      if (v === "puestos") return { metodo: "GET", ruta: "/api/rrhh/puestos" };
      if (v === "asistencia") return { metodo: "GET", ruta: "/api/rrhh/asistencia", query: limpiar({ desde: a.desde, hasta: a.hasta }) };
      if (v === "pago_semana") return { metodo: "GET", ruta: "/api/rrhh/pago-semana", query: limpiar({ semana: a.semana }) };
      return { metodo: "GET", ruta: "/api/rrhh/resumen" };
    },
    formatear: (d, a) => lista(d, { titulo: `RRHH (${a?.vista ?? "resumen"})`, cols: [["Nombre", ["nombre", "name", "colaborador"]], ["Puesto", ["puesto", "puestoNombre"]], ["Personas", ["personas"], "n"], ["Id", ["id"]], ["Estado", ["estado", "status"]], ["Neto", ["neto", "netoSemana", "monto"], "s"], ["Horas", ["horas"], "n"]], vacio: "Sin filas (la respuesta puede ser un resumen: pídelo de nuevo con leer_get si hace falta)." }),
  },
  {
    nombre: "asistencia_marcar",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Marca asistencia de un colaborador en un día (PUT /api/rrhh/asistencia). estado=null quita la marca. Corregir una marca ya hecha exige un motivo real. La asistencia define el pago: pide OK de Brandon.",
    entrada: {
      negocio,
      colaboradorId: z.string().min(1).max(40),
      fecha: dia,
      estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS)).nullable(),
      entrada: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:MM"),
      salida: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:MM"),
      refrigerioMin: z.number().int().min(0).max(240).optional().describe("Minutos de refrigerio (0-240)"),
      horas: z.number().positive().max(24).optional(),
      nota: z.string().max(300).optional(),
      motivo: z.string().max(300).optional().describe("Obligatorio si corriges una marca ya hecha: por qué (una frase real, no «ok»). Va en el mismo pedido que la marca"),
    },
    // `motivo` va al lado de `marcas` (guardarMarcasSchema): sin él el panel rechaza corregir una marca existente.
    pedido: (a) => ({
      metodo: "PUT",
      ruta: "/api/rrhh/asistencia",
      cuerpo: limpiar({ marcas: [{ ...limpiar({ colaboradorId: a.colaboradorId, fecha: a.fecha, entrada: a.entrada, salida: a.salida, refrigerioMin: a.refrigerioMin, horas: a.horas, nota: a.nota }), estado: a.estado }], motivo: a.motivo }),
    }),
    previa: (a, leer) => colaboradorDeLista(a.colaboradorId, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const horario = [a.entrada && `entra ${a.entrada}`, a.salida && `sale ${a.salida}`, a.horas && `${a.horas} h`].filter(Boolean).join(", ");
      const que = a.estado ? `Marcar ${a.estado.replace("_", " ").toLowerCase()}` : "Quitar la marca de asistencia";
      return `${que} a ${verificado(p?.nombre)} el ${a.fecha}${horario ? ` (${horario})` : ""}.${a.motivo ? ` Motivo: ${a.motivo}.` : ""} Cambia lo que se le paga esa semana.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Colaborador" }) : null,
        filas: [filaIdentidad(p?.ficha), { etiqueta: "Día", valor: a.fecha }, { etiqueta: "Marca", valor: a.estado ? a.estado.replace("_", " ").toLowerCase() : "quitar la marca" }],
      };
    },
  },
  {
    nombre: "pago_semana_pagar",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Paga la semana a un colaborador (POST /api/rrhh/pago-semana). Si saleDeCaja, el efectivo sale de la caja. Si el neto del servidor difiere de netoEsperado, responde 409 con los números nuevos. Montos en S/. Pide OK de Brandon.",
    entrada: {
      negocio,
      colaboradorId: idRuta.describe("Id del colaborador: el nombre del aviso lo saca el panel"),
      desde: dia.describe("Lunes de la semana que se paga"),
      netoEsperado: z.number().min(0).max(1000000).describe("S/ que se ve en pantalla"),
      metodo: z.enum(["efectivo", "yape", "plin", "transferencia"]),
      saleDeCaja: z.boolean(),
      montoManual: z.number().positive().max(1000000).nullable().optional().describe("S/, solo si no tiene tarifa"),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/rrhh/pago-semana", cuerpo: limpiar({ colaboradorId: a.colaboradorId, desde: a.desde, montoManual: a.montoManual, metodo: a.metodo, saleDeCaja: a.saleDeCaja, netoEsperado: a.netoEsperado }) }),
    previa: async (a, leer) => {
      const f = /** @type {any} */ (await fichaPorId(leer, `/api/rrhh/colaboradores/${a.colaboradorId}`));
      const c = f?.colaborador ?? f;
      return { nombre: c?.nombre, ficha: c };
    },
    resumen: (a, previa) => `Pagar ${soles(a.netoEsperado)} a ${verificado(/** @type {any} */ (previa)?.nombre)} por la semana del ${a.desde}, en ${a.metodo}${a.saleDeCaja ? " (sale de la caja)" : ""}.`,
    ventana: (a, previa) => ({
      clave: claveMonto(a.netoEsperado, { etiqueta: "Monto a pagar" }),
      filas: [{ etiqueta: "A quién", valor: verificado(/** @type {any} */ (previa)?.nombre) }, filaIdentidad(/** @type {any} */ (previa)?.ficha), { etiqueta: "Semana del", valor: a.desde }, { etiqueta: "Caja", valor: a.saleDeCaja ? `sale en ${a.metodo}` : "no se toca" }],
    }),
  },
  ...herramientasCarrilC,
  ...herramientasCarrilCP2,
];
