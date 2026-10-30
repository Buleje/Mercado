// Grupo «directorio»: libreta de partes, permisos, fletes, especies, trámites, plantaciones y planes (negocio forestal).
import { z, negocio, idRuta, dia, limpiar, lista, ficha, soles, numero, pick, claveMonto, claveNombre, filasCompletas, filasDe, leerSeguro, otrosNombres, filaIdentidad, verificado, linea60, conMarca, colaDe4, antesDelPanel, NO_VERIFICADO } from "../util-herramientas.mjs";

const RUTA = "/api/admin/forestal";
const ROLES_PARTE = ["proveedor", "destinatario", "transportista", "conductor", "cliente", "establecimiento", "cubicador"];
const TIPOS_CONTRATO = ["PER-FMP", "PER-FMC", "REG-PLT", "CONCESION", "CONTRATO", "DEMA", "PMFI", "PO", "otro"];
const ESTADOS_CONTRATO = ["vigente", "vencido", "cerrado", "suspendido"];

/** Una fila de una lista del panel por id (lista entera, sin el recorte de 50). */
async function filaPorId(leer, ruta, query, id) {
  const filas = await filasCompletas(leer, ruta, query);
  const f = /** @type {any} */ (filas?.find((x) => x && String(x.id) === String(id)));
  return { f, filas };
}

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  // ── Directorio de partes ──────────────────────────────────────────────────
  {
    nombre: "directorio_ver",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Libreta de partes del Libro CTP (GET /api/admin/forestal/directorio): proveedores, destinatarios, transportistas, conductores, clientes, establecimientos y cubicadores, con documento, rol y contacto; y los vehículos (placa). Filtra por rol o texto. Ej.: rol=transportista, q=Pérez.",
    entrada: {
      negocio,
      rol: z.enum(/** @type {[string, ...string[]]} */ (ROLES_PARTE)).optional().describe("Solo las partes con ese rol"),
      q: z.string().max(80).optional().describe("Texto a buscar en nombre o documento"),
      inactivos: z.boolean().optional().describe("Incluir las dadas de baja"),
      vehiculos: z.boolean().default(true).describe("false = no traer los vehículos"),
    },
    pedido: (a) => ({ metodo: "GET", ruta: `${RUTA}/directorio`, query: limpiar({ rol: a.rol, q: a.q, inactivos: a.inactivos ? "1" : undefined, vehiculos: a.vehiculos === false ? "0" : undefined }) }),
    formatear: (d) => {
      const partes = lista(d, { titulo: "Partes del directorio", cols: [["Nombre", ["nombre"]], ["Roles", ["roles"]], ["Doc.", ["docNumero"]], ["Id", ["id"]]] });
      const veh = /** @type {any} */ (d)?.vehiculos;
      const vtxt = Array.isArray(veh) && veh.length ? `\nVehículos (${veh.length}): ${veh.slice(0, 20).map((v) => v.placa).join(", ")}` : "";
      return partes + vtxt;
    },
  },
  {
    nombre: "parte_guardar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Crea o corrige una parte de la libreta (POST /api/admin/forestal/directorio): nombre, roles y datos de contacto. OJO: se guarda por documento, así que un docNumero que ya existe CORRIGE a esa parte. Con id se edita esa ficha. Cambiar documento, teléfono, correo, nombre de una ya existente o datos de banco pide OK de Brandon. Ej.: nombre=\"Transportes Pérez SAC\", roles=[\"transportista\"], docTipo=\"RUC\", docNumero=\"20123456789\".",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Con id edita esa ficha; sin id crea (o corrige la del mismo documento)"),
      nombre: z.string().min(2).max(200),
      roles: z.array(z.enum(/** @type {[string, ...string[]]} */ (ROLES_PARTE))).min(1).describe("Uno o más roles"),
      categoria: z.enum(["empresa", "ccnn", "aserradero"]).optional(),
      docTipo: z.enum(["RUC", "DNI", "CE", "PASAPORTE"]).optional(),
      docNumero: z.string().max(20).optional().describe("RUC/DNI, sin guiones"),
      codigoCtp: z.string().max(60).optional(),
      direccion: z.string().max(250).optional(),
      region: z.string().max(80).optional(),
      provincia: z.string().max(80).optional(),
      distrito: z.string().max(80).optional(),
      zona: z.string().max(80).optional().describe("Sector o caserío"),
      telefono: z.string().max(40).optional(),
      whatsapp: z.string().max(30).optional(),
      email: z.string().max(160).optional(),
      representante: z.string().max(160).optional(),
      representanteDni: z.string().max(15).optional(),
      contactoNombre: z.string().max(160).optional(),
      contactoTelefono: z.string().max(30).optional(),
      licencia: z.string().max(30).optional(),
      registroMtc: z.string().max(40).optional(),
      tituloHabilitante: z.string().max(80).optional(),
      resolucion: z.string().max(120).optional(),
      planManejo: z.string().max(120).optional(),
      arffs: z.string().max(120).optional(),
      banco: z.string().max(80).optional(),
      cuentaNumero: z.string().max(40).optional(),
      cuentaCci: z.string().max(30).optional(),
      cuentaTitular: z.string().max(160).optional(),
      condicionPago: z.enum(["contado", "credito"]).optional(),
      diasCredito: z.number().int().min(0).max(365).optional().describe("Días de crédito"),
    },
    pedido: (a) => {
      const { negocio: _n, seco: _s, ...resto } = a;
      return { metodo: "POST", ruta: `${RUTA}/directorio`, cuerpo: limpiar(resto) };
    },
    // Cambiar QUIÉN es (nombre/documento), cómo ubicarlo o a dónde se le paga pide OK; una alta sin esos datos, no.
    confirmarSi: (a) => Boolean(a.id) || ["docNumero", "docTipo", "telefono", "whatsapp", "email", "contactoTelefono", "representanteDni", "banco", "cuentaNumero", "cuentaCci", "cuentaTitular"].some((k) => a[k] !== undefined),
    previa: async (a, leer) => {
      if (a.id) return (await filaPorId(leer, `${RUTA}/directorio`, { vehiculos: "0", inactivos: "1" }, a.id)).f ?? null;
      if (a.docNumero) {
        const filas = await filasCompletas(leer, `${RUTA}/directorio`, { q: a.docNumero, vehiculos: "0", inactivos: "1" });
        return /** @type {any} */ (filas?.find((x) => x && String(x.docNumero ?? "").replace(/\W/g, "") === a.docNumero.replace(/\W/g, ""))) ?? null;
      }
      return null;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const cambios = [];
      if (p && a.nombre !== undefined) cambios.push(`nombre «${linea60(p.nombre)}» → «${conMarca(a.nombre)}»`);
      if (a.docNumero !== undefined) cambios.push(`documento ${antesDelPanel(p, p?.docNumero, colaDe4)} → ${colaDe4(a.docNumero)}`);
      if (a.telefono !== undefined) cambios.push(`teléfono ${antesDelPanel(p, p?.telefono, colaDe4)} → ${colaDe4(a.telefono)}`);
      const pago = ["banco", "cuentaNumero", "cuentaCci", "cuentaTitular"].filter((k) => a[k] !== undefined);
      if (pago.length) cambios.push(`datos de pago (${pago.join(", ")})`);
      const otros = ["whatsapp", "email", "contactoTelefono", "representanteDni"].filter((k) => a[k] !== undefined);
      if (otros.length) cambios.push(`contacto (${otros.join(", ")})`);
      const quien = p ? `la parte «${verificado(p.nombre)}»${a.id ? "" : " (mismo documento: se CORRIGE, no se crea otra)"}` : a.id ? `la parte ${NO_VERIFICADO}` : `una parte nueva «${conMarca(a.nombre)}»`;
      return `${a.id || p ? "Corregir" : "Crear"} ${quien}: ${cambios.length ? cambios.join("; ") : "sin cambios de identidad ni de pago"}.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: a.nombre ? claveNombre(a.nombre, p?.nombre ? [p.nombre] : [], { etiqueta: "Nombre que queda" }) : null,
        filas: [{ etiqueta: "Parte (hoy)", valor: p ? verificado(p.nombre) : "(nueva)" }, filaIdentidad(p), ...(a.docNumero !== undefined ? [{ etiqueta: "Documento nuevo", valor: colaDe4(a.docNumero) }] : [])],
      };
    },
  },
  {
    nombre: "parte_borrar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Da de baja una parte de la libreta (DELETE /api/admin/forestal/directorio?id=): deja de ofrecerse en las guías. Solo admin/dueño. Pide OK de Brandon. Ej.: id de directorio_ver.",
    entrada: { negocio, id: idRuta.describe("Id de la parte: el nombre del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `${RUTA}/directorio`, query: { id: a.id } }),
    previa: async (a, leer) => {
      const { f, filas } = await filaPorId(leer, `${RUTA}/directorio`, { vehiculos: "0" }, a.id);
      return f ? { ...f, otros: otrosNombres(filas, a.id, ["nombre"]) } : null;
    },
    resumen: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Dar de baja a la parte «${verificado(p?.nombre)}» (${Array.isArray(p?.roles) ? p.roles.join(", ") : "roles " + NO_VERIFICADO}). Deja de ofrecerse en las guías y documentos nuevos.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Parte", palabra: "nombre" }) : null, filas: [filaIdentidad(p)] };
    },
  },

  // ── Permisos (contratos) ──────────────────────────────────────────────────
  {
    nombre: "permisos_ver",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Permisos de aprovechamiento (GET /api/admin/forestal/contratos): código, titular, tipo, estado y vigencia. vista=lista (con balances = lo extraído en PT/m³ y la plata de cada uno), candidatos (códigos escritos en el libro sin permiso), o con id: ficha, balance (con desde/hasta), usos o volumen (por especie, en m³). Ej.: vista=lista, balances=true.",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Un permiso"),
      vista: z.enum(["lista", "candidatos", "ficha", "balance", "usos", "volumen"]).default("lista"),
      balances: z.boolean().optional().describe("En la lista, traer el balance de cada permiso"),
      todos: z.boolean().optional().describe("En la lista, incluir los cerrados o dados de baja"),
      desde: dia.optional().describe("Para balance"),
      hasta: dia.optional().describe("Para balance"),
    },
    pedido: (a) => {
      const v = a.vista ?? "lista";
      if (v === "candidatos") return { metodo: "GET", ruta: `${RUTA}/contratos`, query: { candidatos: "1" } };
      if (v === "lista" || !a.id) return { metodo: "GET", ruta: `${RUTA}/contratos`, query: limpiar({ balances: a.balances ? "1" : undefined, todos: a.todos ? "1" : undefined }) };
      if (v === "balance") return { metodo: "GET", ruta: `${RUTA}/contratos/${a.id}`, query: limpiar({ balance: "1", desde: a.desde, hasta: a.hasta }) };
      if (v === "usos") return { metodo: "GET", ruta: `${RUTA}/contratos/${a.id}`, query: { usos: "1" } };
      if (v === "volumen") return { metodo: "GET", ruta: `${RUTA}/contratos/${a.id}`, query: { volumen: "1" } };
      return { metodo: "GET", ruta: `${RUTA}/contratos/${a.id}` };
    },
    formatear: (d, a) => {
      const v = a?.vista ?? "lista";
      if (v === "lista" || !a?.id) {
        const o = /** @type {any} */ (d);
        const base = lista(filasDe(o?.contratos ?? o?.candidatos ?? d).map((c) => ({ ...c, vigenciaHasta: c?.vigenciaHasta ? String(c.vigenciaHasta).slice(0, 10) : undefined })), { titulo: v === "candidatos" ? "Códigos sin permiso" : "Permisos", cols: [["Código", ["codigo"]], ["Alias", ["alias"]], ["Titular", ["titularNombre"]], ["Tipo", ["tipo"]], ["Estado", ["estado"]], ["Hasta", ["vigenciaHasta"]], ["Id", ["id"]]] });
        return base;
      }
      return d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3500) : "Sin datos.";
    },
  },
  {
    nombre: "permiso_editar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Corrige los datos de un permiso (PATCH /api/admin/forestal/contratos/[id]); solo admin/dueño. Cambiar estado, vigencia, código, titular o plan (lo que decide cuánta madera se puede sacar) o vincular el libro a su código pide OK de Brandon. Ej.: id=…, vigenciaHasta=\"2027-06-30\". Con vincular=true ata al permiso todo lo que ya trae su código en el libro.",
    entrada: {
      negocio,
      id: idRuta.describe("Id del permiso"),
      vincular: z.boolean().optional().describe("true = vincular lo que ya trae este código en el libro (no acepta otros campos)"),
      codigo: z.string().min(3).max(60).optional(),
      alias: z.string().max(120).optional(),
      tipo: z.enum(/** @type {[string, ...string[]]} */ (TIPOS_CONTRATO)).optional(),
      estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS_CONTRATO)).optional(),
      titularNombre: z.string().min(1).max(200).optional(),
      titularId: z.string().max(40).optional(),
      titularDoc: z.string().max(20).optional(),
      titularDocTipo: z.string().max(12).optional(),
      resolucionNumero: z.string().max(120).optional(),
      resolucionFecha: dia.optional(),
      vigenciaDesde: dia.optional(),
      vigenciaHasta: dia.optional(),
      areaHa: z.number().nonnegative().optional().describe("Hectáreas"),
      region: z.string().max(80).optional(),
      provincia: z.string().max(80).optional(),
      distrito: z.string().max(80).optional(),
      arffs: z.string().max(120).optional(),
      planId: z.string().max(40).optional(),
      notas: z.string().max(2000).optional(),
    },
    pedido: (a) => {
      if (a.vincular) return { metodo: "PATCH", ruta: `${RUTA}/contratos/${a.id}`, cuerpo: { accion: "vincular" } };
      const { negocio: _n, seco: _s, id: _i, vincular: _v, ...campos } = a;
      return { metodo: "PATCH", ruta: `${RUTA}/contratos/${a.id}`, cuerpo: limpiar(campos) };
    },
    confirmarSi: (a) => Boolean(a.vincular) || ["estado", "vigenciaDesde", "vigenciaHasta", "codigo", "titularNombre", "titularId", "titularDoc", "planId", "tipo", "areaHa"].some((k) => a[k] !== undefined),
    previa: async (a, leer) => {
      const r = await leerSeguro(leer, `${RUTA}/contratos/${a.id}`);
      const c = /** @type {any} */ (r.datos)?.contrato;
      return r.ok && c && typeof c === "object" ? c : null;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const quien = `${verificado(pick(p, ["codigo"]))}${p?.alias ? ` (${linea60(p.alias, 30)})` : ""} de ${verificado(p?.titularNombre)}`;
      if (a.vincular) return `Vincular al permiso ${quien} todo lo que el libro ya trae con su código. Cambia a qué permiso se atribuye la madera.`;
      const cambios = [];
      const campo = (k, et, f = (v) => linea60(v, 40)) => { if (a[k] !== undefined) cambios.push(`${et} ${antesDelPanel(p, p?.[k], f)} → ${linea60(a[k], 40) || "(vacío)"}`); };
      campo("estado", "estado"); campo("vigenciaDesde", "vigencia desde", (v) => String(v).slice(0, 10)); campo("vigenciaHasta", "vigencia hasta", (v) => String(v).slice(0, 10));
      campo("codigo", "código"); campo("titularNombre", "titular"); campo("planId", "plan"); campo("tipo", "tipo"); campo("areaHa", "área (ha)", (v) => numero(Number(v), 2));
      const otros = Object.keys(a).filter((k) => !["negocio", "seco", "id", "vincular", "estado", "vigenciaDesde", "vigenciaHasta", "codigo", "titularNombre", "planId", "tipo", "areaHa"].includes(k) && a[k] !== undefined);
      return `Corregir el permiso ${quien}: ${cambios.length ? cambios.join("; ") : "sin cambios clave"}.${otros.length ? ` También cambia: ${otros.join(", ")}.` : ""}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const cod = pick(p, ["codigo"]);
      return {
        clave: cod ? claveNombre(String(cod), [], { etiqueta: "Permiso", palabra: "código" }) : null,
        filas: [{ etiqueta: "Permiso", valor: verificado(cod) }, { etiqueta: "Titular", valor: verificado(p?.titularNombre) }, { etiqueta: "Estado hoy", valor: p?.estado ? String(p.estado) : NO_VERIFICADO }, ...(a.estado !== undefined ? [{ etiqueta: "Estado nuevo", valor: a.estado }] : [])],
      };
    },
  },
  {
    nombre: "permiso_crear",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Da de alta un permiso de aprovechamiento (POST /api/admin/forestal/contratos); solo admin/dueño. Obligatorio: código (3+ letras) y titularNombre. Ej.: codigo=\"PER-FMP-2025-001\", titularNombre=\"Comunidad Nativa X\", vigenciaHasta=\"2030-12-31\".",
    entrada: {
      negocio,
      codigo: z.string().min(3).max(60),
      titularNombre: z.string().min(1).max(200),
      alias: z.string().max(120).optional(),
      tipo: z.enum(/** @type {[string, ...string[]]} */ (TIPOS_CONTRATO)).optional(),
      estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS_CONTRATO)).optional(),
      titularId: z.string().max(40).optional(),
      titularDoc: z.string().max(20).optional(),
      titularDocTipo: z.string().max(12).optional(),
      resolucionNumero: z.string().max(120).optional(),
      resolucionFecha: dia.optional(),
      vigenciaDesde: dia.optional(),
      vigenciaHasta: dia.optional(),
      areaHa: z.number().nonnegative().optional().describe("Hectáreas"),
      region: z.string().max(80).optional(),
      provincia: z.string().max(80).optional(),
      distrito: z.string().max(80).optional(),
      arffs: z.string().max(120).optional(),
      planId: z.string().max(40).optional(),
      notas: z.string().max(2000).optional(),
    },
    pedido: (a) => {
      const { negocio: _n, seco: _s, ...campos } = a;
      return { metodo: "POST", ruta: `${RUTA}/contratos`, cuerpo: limpiar(campos) };
    },
    // Un permiso nuevo queda «vigente» y con plan: decide cuánta madera puede salir. Siempre pide OK.
    confirmarSi: () => true,
    previa: async (a, leer) => {
      if (!a.planId) return { plan: null };
      const r = await leerSeguro(leer, `${RUTA}/plan`, { planId: a.planId });
      const d = /** @type {any} */ (r.datos);
      const plan = d?.plan ?? d;
      return { plan: r.ok && plan && typeof plan === "object" && (plan.planNumber || plan.planType) ? plan : undefined };
    },
    resumen: (a, previa) => {
      const pl = /** @type {any} */ (previa)?.plan;
      const planTxt = a.planId ? (pl ? `plan ${verificado(`${pl.planType ?? ""} ${pl.planNumber ?? ""}`.trim())}` : `plan ${NO_VERIFICADO}`) : "sin plan";
      return `Dar de alta el permiso ${linea60(a.codigo, 40)} de ${linea60(a.titularNombre, 60)} (${a.estado ?? "vigente"}, ${planTxt}, vigencia ${a.vigenciaDesde ?? "—"} a ${a.vigenciaHasta ?? "—"}${a.areaHa != null ? `, ${numero(a.areaHa, 2)} ha` : ""}). Código y titular los escribió Claude; el plan lo verificó el panel.`;
    },
    ventana: (a, previa) => {
      const pl = /** @type {any} */ (previa)?.plan;
      return { clave: null, filas: [{ etiqueta: "Código (de Claude)", valor: linea60(a.codigo, 40) }, { etiqueta: "Plan (del panel)", valor: a.planId ? (pl ? verificado(`${pl.planType ?? ""} ${pl.planNumber ?? ""}`.trim()) : NO_VERIFICADO) : "sin plan" }, { etiqueta: "Vigencia", valor: `${a.vigenciaDesde ?? "—"} a ${a.vigenciaHasta ?? "—"}` }] };
    },
  },

  // ── Fletes ────────────────────────────────────────────────────────────────
  {
    nombre: "fletes_ver",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Fletes (viajes de transporte de madera) (GET /api/admin/forestal/fletes): fecha, guía, transportista, placa, volumen en m³, monto en S/ y si está pagado. Filtros: estadoPago, gtf, desde/hasta. candidatos=true = guías sin flete anotado. Ej.: estadoPago=pendiente.",
    entrada: {
      negocio,
      estadoPago: z.enum(["pendiente", "pagado"]).optional(),
      gtf: z.string().max(40).optional().describe("N.º de guía"),
      desde: dia.optional(),
      hasta: dia.optional(),
      candidatos: z.boolean().optional().describe("true = guías que todavía no tienen flete"),
    },
    pedido: (a) => ({ metodo: "GET", ruta: `${RUTA}/fletes`, query: limpiar({ estadoPago: a.estadoPago, gtf: a.gtf, desde: a.desde, hasta: a.hasta, candidatos: a.candidatos ? "1" : undefined }) }),
    formatear: (d) => {
      const o = /** @type {any} */ (d);
      return lista(filasDe(o?.fletes ?? o?.candidatos ?? d).map((f) => ({ ...f, fecha: f?.fecha ? String(f.fecha).slice(0, 10) : undefined })), { titulo: o?.candidatos ? "Guías sin flete" : "Fletes", cols: [["Fecha", ["fecha"]], ["Guía", ["gtfNumber"]], ["Transportista", ["transportistaNombre"]], ["Placa", ["placa"]], ["m³", ["volumenM3"], "n"], ["Monto", ["monto"], "s"], ["Pago", ["estadoPago"]], ["Id", ["id"]]] });
    },
  },
  {
    nombre: "flete_anotar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Anota un flete NUEVO, siempre como pendiente de pago (POST /api/admin/forestal/fletes): fecha, tipo ingreso o despacho, guía, transportista, placa, volumen en m³ y monto en S/ (o tarifaPorPt en S por pie tablar y el panel calcula el monto). Para marcarlo pagado usa flete_pago. Ej.: fecha=\"2026-10-28\", tipo=\"ingreso\", gtfNumber=\"001-0456\", monto=850.",
    entrada: {
      negocio,
      fecha: dia.describe("Día del viaje"),
      tipo: z.enum(["ingreso", "despacho"]).default("ingreso"),
      gtfNumber: z.string().max(40).optional(),
      placa: z.string().max(15).optional(),
      transportistaId: z.string().max(40).optional().describe("Id de la libreta (directorio_ver)"),
      transportistaNombre: z.string().max(200).optional(),
      conductorId: z.string().max(40).optional(),
      conductorNombre: z.string().max(200).optional(),
      tipoTransporte: z.enum(["privado", "publico"]).default("privado"),
      proveedorId: z.string().max(40).optional(),
      proveedorNombre: z.string().max(200).optional(),
      volumenM3: z.number().nonnegative().max(9999).optional().describe("m³"),
      monto: z.number().nonnegative().max(9999999).optional().describe("S/"),
      pagaQuien: z.enum(["ctp", "proveedor", "destinatario"]).default("ctp"),
      contratoId: z.string().max(64).optional().describe("Permiso bajo el que se hizo el viaje"),
      tarifaPorPt: z.number().positive().max(1000).optional().describe("S/ por pie tablar: el panel pone el monto (tarifa × PT de la guía)"),
      ptVisto: z.number().nonnegative().max(10000000).optional().describe("PT de la guía que viste; si cambió, 409"),
      notas: z.string().max(500).optional(),
    },
    pedido: (a) => {
      const { negocio: _n, seco: _s, ...campos } = a;
      return { metodo: "POST", ruta: `${RUTA}/fletes`, cuerpo: limpiar({ ...campos, estadoPago: "pendiente" }) };
    },
  },
  {
    nombre: "flete_pago",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Marca un flete como pagado o pendiente (PATCH /api/admin/forestal/fletes): es plata (S/). Solo admin/dueño. Pide OK de Brandon; el monto y el transportista los saca el panel. Ej.: id de fletes_ver, estadoPago=pagado.",
    entrada: { negocio, id: idRuta.describe("Id del flete"), estadoPago: z.enum(["pendiente", "pagado"]) },
    pedido: (a) => ({ metodo: "PATCH", ruta: `${RUTA}/fletes`, cuerpo: { id: a.id, estadoPago: a.estadoPago } }),
    previa: async (a, leer) => (await filaPorId(leer, `${RUTA}/fletes`, undefined, a.id)).f ?? null,
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Marcar como ${a.estadoPago} el flete de ${verificado(p?.transportistaNombre)} (guía ${p?.gtfNumber ? linea60(p.gtfNumber, 30) : "sin guía"}, placa ${linea60(p?.placa ?? "—", 12)}): ${p?.monto != null ? soles(Number(p.monto)) : `monto ${NO_VERIFICADO}`}. Hoy está ${p?.estadoPago ?? NO_VERIFICADO}.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const m = Number(p?.monto);
      return { clave: Number.isFinite(m) && m > 0 ? claveMonto(m, { etiqueta: `Monto del flete (${a.estadoPago})` }) : null, filas: [{ etiqueta: "Transportista", valor: verificado(p?.transportistaNombre) }, { etiqueta: "Guía", valor: p?.gtfNumber ? String(p.gtfNumber) : "—" }, { etiqueta: "Estado hoy", valor: p?.estadoPago ? String(p.estadoPago) : NO_VERIFICADO }] };
    },
  },
  {
    nombre: "flete_borrar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Borra un flete anotado (DELETE /api/admin/forestal/fletes?id=): quita su monto en S/ de las cuentas. Solo admin/dueño. No se puede deshacer. Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id del flete") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `${RUTA}/fletes`, query: { id: a.id } }),
    previa: async (a, leer) => (await filaPorId(leer, `${RUTA}/fletes`, undefined, a.id)).f ?? null,
    resumen: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Borrar el flete de ${verificado(p?.transportistaNombre)} (guía ${p?.gtfNumber ? linea60(p.gtfNumber, 30) : "sin guía"}): ${p?.monto != null ? soles(Number(p.monto)) : `monto ${NO_VERIFICADO}`}, ${p?.estadoPago ?? NO_VERIFICADO}. No se puede deshacer.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      const m = Number(p?.monto);
      return { clave: Number.isFinite(m) && m > 0 ? claveMonto(m, { etiqueta: "Monto del flete" }) : null, filas: [{ etiqueta: "Transportista", valor: verificado(p?.transportistaNombre) }, { etiqueta: "Guía", valor: p?.gtfNumber ? String(p.gtfNumber) : "—" }] };
    },
  },

  // ── Especies, trámites, plantaciones y planes (solo lectura) ─────────────
  {
    nombre: "especies_ver",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Catálogo de especies de madera del negocio (GET /api/admin/forestal/especies): nombre común, científico y grupo. libro=true agrega las especies que ya aparecen en el libro. Ej.: libro=true.",
    entrada: { negocio, libro: z.boolean().optional().describe("true = también las especies usadas en el libro") },
    pedido: (a) => ({ metodo: "GET", ruta: `${RUTA}/especies`, query: limpiar({ libro: a.libro ? "1" : undefined }) }),
    formatear: (d) => lista(d, { titulo: "Especies", cols: [["Nombre", ["nombre", "name", "common", "nombreComun", "clave"]], ["Científico", ["cientifico", "scientific"]], ["Grupo", ["grupo", "grupoNombre"]]] }),
  },
  {
    nombre: "tramites_ver",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Trámites y oficios ante ARFFS, SERFOR u OSINFOR (GET /api/admin/forestal/tramites): asunto, autoridad, estado, expediente y fechas. Ej.: sin filtros.",
    entrada: { negocio },
    pedido: () => ({ metodo: "GET", ruta: `${RUTA}/tramites` }),
    formatear: (d) => lista(d, { titulo: "Trámites", cols: [["Asunto", ["asunto"]], ["Autoridad", ["autoridad"]], ["Estado", ["estado"]], ["Expediente", ["expedienteAutoridad"]], ["Límite", ["fechaLimite"], "f"], ["Id", ["id"]]] }),
  },
  {
    nombre: "plantaciones_ver",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Plantaciones forestales registradas (GET /api/admin/forestal/plantaciones; con id, una sola): nombre, especie, hectáreas y estado. Ej.: sin filtros.",
    entrada: { negocio, id: idRuta.optional() },
    pedido: (a) => ({ metodo: "GET", ruta: a.id ? `${RUTA}/plantaciones/${a.id}` : `${RUTA}/plantaciones` }),
    formatear: (d) => lista(d, { titulo: "Plantaciones", cols: [["Predio", ["predioNombre", "nombre", "name"]], ["Titular", ["titularRazonSocial", "titularNombres"]], ["Tipo", ["tipoTramite"]], ["Ha", ["predioAreaTotalHa", "areaHa", "hectareas"], "n"], ["Estado", ["estado"]], ["Id", ["id"]]] }),
  },
  {
    nombre: "planes_ver",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Planes de manejo (PGMF, PMFI, PO, DEMA, plantación) (GET /api/admin/forestal/plan): vista=lista, activo (el vigente), detalle (con planId: especies autorizadas y resumen del censo) o balance (con planId: lo extraído contra lo autorizado, en m³). Ej.: vista=detalle, planId=….",
    entrada: { negocio, vista: z.enum(["lista", "activo", "detalle", "balance"]).default("lista"), planId: idRuta.optional().describe("Para detalle o balance") },
    pedido: (a) => {
      const v = a.vista ?? "lista";
      if (v === "activo") return { metodo: "GET", ruta: `${RUTA}/plan`, query: { active: "1" } };
      if (v === "detalle" && a.planId) return { metodo: "GET", ruta: `${RUTA}/plan`, query: { planId: a.planId } };
      if (v === "balance" && a.planId) return { metodo: "GET", ruta: `${RUTA}/plan`, query: { balance: a.planId } };
      return { metodo: "GET", ruta: `${RUTA}/plan` };
    },
    formatear: (d, a) => {
      const v = a?.vista ?? "lista";
      if (v === "lista" || !a?.planId && v !== "activo") return lista(/** @type {any} */ (d)?.plans ?? d, { titulo: "Planes", cols: [["Tipo", ["planType"]], ["N.º", ["planNumber"]], ["Titular", ["titularName"]], ["Estado", ["status", "estado"]], ["Id", ["id"]]] });
      return d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3500) : "Sin datos.";
    },
  },
  // ── Escrituras de trámites, especies y plantaciones ──────────────────────
  {
    nombre: "tramite_guardar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Guarda un trámite/oficio ante ARFFS, SERFOR u OSINFOR (POST /api/admin/forestal/tramites; admin/dueño/almacenero). Sin id crea; con id corrige. emitir=true SELLA la carta con su código para imprimir, y cambiar el estado: ambos piden OK de Brandon. Ej.: formatoId=\"descargo-osinfor\", autoridad=\"osinfor\", asunto=\"Descargo de la guía 001-0456\".",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Con id corrige un trámite; sin id crea uno"),
      formatoId: z.string().min(1).max(60).describe("Formato de la carta, ej. descargo-osinfor, cambio-regente, relacion-guias-serfor, anulacion-gtf"),
      formatoNombre: z.string().max(120).optional(),
      autoridad: z.enum(["arffs", "serfor", "osinfor", "otra"]),
      asunto: z.string().max(300).optional(),
      datos: z.record(z.string().max(60), z.string()).optional().describe("Casilleros de la carta: clave → texto (ej. {firmante:\"Juan Pérez\"})"),
      estado: z.enum(["borrador", "presentado", "observado", "resuelto", "desistido"]).optional(),
      expedienteAutoridad: z.string().max(80).optional().describe("N.º de expediente que dio la autoridad"),
      fechaPresentacion: dia.optional(),
      fechaRespuesta: dia.optional(),
      fechaLimite: dia.optional(),
      notas: z.string().max(2000).optional(),
      emitir: z.boolean().optional().describe("true = sellar la carta para imprimir (pide OK)"),
    },
    pedido: (a) => ({ metodo: "POST", ruta: `${RUTA}/tramites`, cuerpo: limpiar({ id: a.id, formatoId: a.formatoId, formatoNombre: a.formatoNombre, autoridad: a.autoridad, asunto: a.asunto, datos: a.datos, estado: a.estado, expedienteAutoridad: a.expedienteAutoridad, fechaPresentacion: a.fechaPresentacion, fechaRespuesta: a.fechaRespuesta, fechaLimite: a.fechaLimite, notas: a.notas, emitir: a.emitir }) }),
    // Sellar, o dejar un trámite en cualquier estado que no sea borrador (también al crearlo), pide OK.
    confirmarSi: (a) => a.emitir === true || (a.estado != null && a.estado !== "borrador"),
    previa: async (a, leer) => {
      if (!a.id) return null;
      const { f } = await filaPorId(leer, `${RUTA}/tramites`, undefined, a.id);
      return f ?? null;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const asunto = a.id ? verificado(p?.asunto) : `${linea60(a.asunto ?? a.formatoId, 60)} (nuevo, lo escribió Claude)`;
      const formato = a.id ? verificado(p?.formatoNombre ?? p?.formatoId) : linea60(a.formatoId, 40);
      return `${a.emitir ? "SELLAR e imprimir" : "Dejar en estado " + (a.estado ?? "—")} el trámite «${asunto}» (formato ${formato}, ${a.autoridad}${a.estado && a.emitir ? `, estado ${a.estado}` : ""}). ${a.id ? `Estado hoy: ${p?.estado ?? NO_VERIFICADO}.` : "Es un trámite nuevo."}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: null, filas: [{ etiqueta: "Trámite (del panel)", valor: a.id ? verificado(p?.asunto) : NO_VERIFICADO }, { etiqueta: "Formato (del panel)", valor: a.id ? verificado(p?.formatoNombre ?? p?.formatoId) : NO_VERIFICADO }, { etiqueta: "Autoridad", valor: a.autoridad }, { etiqueta: "Acción", valor: a.emitir ? "sellar la carta" : `estado ${a.estado ?? "—"}` }] };
    },
  },
  {
    nombre: "tramite_borrar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Borra un trámite (DELETE /api/admin/forestal/tramites?id=). Solo admin/dueño. No se puede deshacer. Pide OK de Brandon; el asunto lo saca el panel. Ej.: id de tramites_ver.",
    entrada: { negocio, id: idRuta.describe("Id del trámite (de tramites_ver)") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `${RUTA}/tramites`, query: { id: a.id } }),
    previa: async (a, leer) => {
      const { f, filas } = await filaPorId(leer, `${RUTA}/tramites`, undefined, a.id);
      return f ? { ...f, otros: otrosNombres(filas, a.id, ["asunto"]) } : null;
    },
    resumen: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Borrar el trámite «${verificado(p?.asunto)}» (${p?.autoridad ?? NO_VERIFICADO}, estado ${p?.estado ?? NO_VERIFICADO}). No se puede deshacer.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.asunto ? claveNombre(p.asunto, p.otros, { etiqueta: "Trámite", palabra: "asunto" }) : null, filas: [{ etiqueta: "Autoridad", valor: p?.autoridad ?? NO_VERIFICADO }, { etiqueta: "Estado", valor: p?.estado ?? NO_VERIFICADO }] };
    },
  },
  {
    nombre: "especie_guardar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Agrega una especie al catálogo (POST /api/admin/forestal/especies) o corrige una (PATCH, con clave). admin/dueño/almacenero. Solo nombre y científico: no toca grupos ni precios, ni unifica filas del libro. Ej.: nombre=\"Marupá\", cientifico=\"Simarouba amara\".",
    entrada: {
      negocio,
      clave: z.string().min(1).max(160).optional().describe("Con clave corrige esa especie (la clave sale de especies_ver); sin clave agrega una nueva"),
      nombre: z.string().min(1).max(120).optional().describe("Nombre común (obligatorio al agregar)"),
      cientifico: z.string().max(160).optional().describe("Nombre científico"),
    },
    pedido: (a) => a.clave
      ? { metodo: "PATCH", ruta: `${RUTA}/especies`, cuerpo: limpiar({ clave: a.clave, nombre: a.nombre, cientifico: a.cientifico }) }
      : { metodo: "POST", ruta: `${RUTA}/especies`, cuerpo: limpiar({ nombre: a.nombre, cientifico: a.cientifico }) },
  },
  {
    nombre: "plantacion_guardar",
    grupo: "directorio",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Registra una plantación nueva (POST /api/admin/forestal/plantaciones; admin/dueño/almacenero) con titular y predio. SOLO ALTA: corregir una existente reescribe todos sus bloques, así que no se hace por acá (falta endpoint parcial). Pasar a completo/listo_presentar pide OK de Brandon. Ej.: tipoTramite=\"inscripcion\", titularRazonSocial=\"Maderera X SAC\", predioNombre=\"Fundo Esperanza\", predioAreaTotalHa=12.5.",
    entrada: {
      negocio,
      tipoTramite: z.enum(["inscripcion", "actualizacion"]),
      estado: z.enum(["borrador", "en_elaboracion", "completo", "pendiente_documentos", "listo_presentar"]).optional(),
      codigoPlantacionSerfor: z.string().max(60).optional(),
      titularTipoPersona: z.enum(["natural", "juridica"]).optional(),
      titularTipoDocumento: z.string().max(20).optional().describe("DNI o RUC"),
      titularNumeroDocumento: z.string().max(20).optional(),
      titularRazonSocial: z.string().max(200).optional(),
      titularNombres: z.string().max(120).optional(),
      titularApellidoPaterno: z.string().max(80).optional(),
      titularApellidoMaterno: z.string().max(80).optional(),
      titularCelular: z.string().max(20).optional(),
      titularEmail: z.string().max(150).optional(),
      predioNombre: z.string().max(200).optional(),
      predioAreaTotalHa: z.number().nonnegative().max(1000000).optional().describe("Hectáreas del predio"),
      predioDepartamento: z.string().max(80).optional(),
      predioProvincia: z.string().max(80).optional(),
      predioDistrito: z.string().max(80).optional(),
      notas: z.string().max(2000).optional(),
    },
    pedido: (a) => {
      const { negocio: _n, ...resto } = a;
      return { metodo: "POST", ruta: `${RUTA}/plantaciones`, cuerpo: { ...limpiar(resto), bloques: [] } };
    },
    confirmarSi: (a) => a.estado === "completo" || a.estado === "listo_presentar",
    resumen: (a) => `Registrar la plantación «${linea60(a.predioNombre ?? a.titularRazonSocial ?? "sin nombre", 60)}» y marcarla ${a.estado ?? "borrador"}.`,
  },
];
