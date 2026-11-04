// Grupo «documentos»: drive de documentos del panel. Subir y mandar a la papelera piden OK (29-10).
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { revisarArchivo, revisarCarpeta } from "../archivos.mjs";
import { z, negocio, idRuta, limpiar, lista, ficha, numero, claveNombre, claveCantidad, dia, linea60, conMarca, fichaPorId, filasCompletas, otrosNombres, verificado } from "../util-herramientas.mjs";

/** Solo para los tests: raíces y casa de prueba para revisarArchivo/revisarCarpeta. En producción queda vacío. */
export const ajustes = /** @type {{ raices?: string[], casa?: string }} */ ({});

const MAX_POR_LOTE = 20; // tope de `proponer` (pedidos por propuesta)
const MAX_BYTES_LOTE = 200 * 1024 * 1024;
const MAX_PROFUNDIDAD = 5;
// Red de seguridad (30-10): un archivo cuyo NOMBRE parece guardar una clave no sube nunca, ni a pedido.
const PARECE_CLAVE = /clave|contrase|password/i;

const mb = (b) => `${numero(b / 1024 / 1024, b < 1024 * 1024 ? 2 : 1)} MB`;

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "docs_buscar",
    grupo: "documentos",
    tipo: "lectura",
    descripcion: "Busca documentos del drive (GET /api/admin/documents): por texto, carpeta, categoría, etiquetas o los que vencen en N días. Devuelve nombre, categoría, fecha y tamaño. Máx. 50.",
    entrada: {
      negocio,
      q: z.string().max(200).optional(),
      carpetaId: z.string().max(60).optional(),
      categoria: z.string().max(40).optional(),
      etiquetas: z.string().max(200).optional().describe("Separadas por coma"),
      favoritos: z.boolean().optional(),
      venceEnDias: z.number().int().min(1).max(365).optional(),
      limite: z.number().int().min(1).max(50).optional(),
    },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/documents", query: limpiar({ q: a.q, folderId: a.carpetaId, category: a.categoria, tags: a.etiquetas, favorite: a.favoritos ? "1" : undefined, expiring: a.venceEnDias, limite: a.limite ?? 50 }) }),
    formatear: (d) => lista(d, { titulo: "Documentos", cols: [["Nombre", ["name", "nombre"]], ["Categoría", ["category", "categoria"]], ["Fecha", ["createdAt", "updatedAt"], "f"], ["Vence", ["expiresAt", "venceEn"], "f"], ["Id", ["id"]]] }),
  },
  {
    nombre: "doc_ver",
    grupo: "documentos",
    tipo: "lectura",
    descripcion: "Datos de un documento por id (GET /api/admin/documents/[id]): nombre, categoría, etiquetas, estado, versiones.",
    entrada: { negocio, id: idRuta },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/admin/documents/${a.id}` }),
    formatear: (d) => ficha(d, { titulo: "Documento", campos: [["Nombre", ["name"]], ["Categoría", ["category"]], ["Estado", ["status"]], ["Creado", ["createdAt"], "f"], ["Vence", ["expiresAt"], "f"]] }),
  },
  {
    nombre: "doc_subir",
    grupo: "documentos",
    tipo: "confirmar",
    descripcion: "Sube un archivo local al drive (POST /api/admin/documents, multipart). Solo archivos de «Semana actual», Descargas de Windows o ~/Descargas, hasta 25 MB; nada oculto ni .env. Saca una copia de la PC: pide OK de Brandon.",
    entrada: {
      negocio,
      ruta: z.string().min(1).max(500).describe("Ruta absoluta del archivo en esta PC"),
      carpetaId: z.string().max(60).optional(),
    },
    // Sin previa (o si la revisión falló) no hay sello: el cliente no manda nada. Con previa va la ruta REAL y su sha256.
    pedido: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { metodo: "POST", ruta: "/api/admin/documents", cuerpo: limpiar({ folderId: a.carpetaId }), archivo: { ruta: p?.ok ? p.real : a.ruta, campo: "file", sha256: p?.ok ? p.sha256 : "", bytes: p?.ok ? p.bytes : 0 } };
    },
    // Lee el archivo en la PC (no la red): carpeta permitida, realpath, tamaño y sello. El contenido no sale de acá.
    previa: async (a) => {
      const r = await revisarArchivo(a.ruta);
      if (!r.ok) return { ok: false, motivo: r.motivo };
      let hermanos = [];
      try { hermanos = (await readdir(dirname(r.real))).filter((n) => n !== r.nombre && !n.startsWith(".")).slice(0, 40); } catch { /* sin otros nombres: la ventana usa parecidos */ }
      return { ok: true, real: r.real, nombre: r.nombre, bytes: r.bytes, sha256: r.sha256, hermanos };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      if (!p?.ok) return `Subir un archivo al drive: NO se puede (${p?.motivo ?? "no se pudo revisar el archivo"}). Si confirmas, no se manda nada.`;
      return `Subir «${p.nombre}» (${mb(p.bytes)}) al drive del panel${a.carpetaId ? ` (carpeta ${a.carpetaId})` : ""}. Sale una copia de esta PC: ${p.real}.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.ok ? claveNombre(p.nombre, p.hermanos, { etiqueta: "Archivo", palabra: "nombre de archivo" }) : null,
        filas: p?.ok ? [{ etiqueta: "Tamaño", valor: mb(p.bytes) }, { etiqueta: "Carpeta de la PC", valor: dirname(p.real).split("/").slice(-2).join("/") }] : [{ etiqueta: "Archivo", valor: "no se puede subir" }],
      };
    },
  },
  {
    nombre: "docs_subir_lote",
    grupo: "documentos",
    tipo: "confirmar",
    descripcion: "Sube TODA una carpeta de la PC al drive del panel (POST /api/admin/documents, uno por archivo) en una sola propuesta con un solo OK de Brandon. `carpeta` = ruta absoluta (de «Semana actual», «BLAS SAC», Descargas o ~/Descargas); `carpetaDrive` = destino en el drive (se crea si no existe), ej. «Trámites/Agrobanco 2026-10». recursivo=true: cada subcarpeta de la PC se vuelve subcarpeta del drive. patron = nombres tipo «*.pdf». Nunca sube ocultos, desktop.ini ni archivos cuyo NOMBRE diga clave/contraseña/password (los lista como «no subido»). Hasta 20 archivos y 200 MB por propuesta (25 MB cada uno): si hay más, dice «son N: van en K lotes» y se sigue con desde=20, 40… vinculoTipo+vinculoId enlazan los documentos a una parte, trámite, requisito, alquiler o pago. siExiste=\"saltar\" (por defecto) no repite lo que ya está igual. Si uno falla, corta y dice cuántos subieron: no hay deshacer. Pide OK de Brandon. Ej.: carpeta=\"/mnt/c/Users/Usuario/OneDrive/Documentos/Escritorio/BLAS SAC/Drucila\", carpetaDrive=\"Trámites/Agrobanco 2026-10\", recursivo=true.",
    entrada: {
      negocio,
      carpeta: z.string().min(1).max(500).describe("Ruta absoluta de la carpeta en esta PC"),
      patron: z.string().min(1).max(80).regex(/^[^/\\]+$/, "El patrón es un nombre con * o ?, sin barras").optional().describe("Ej.: *.pdf"),
      recursivo: z.boolean().optional().describe("true = también las subcarpetas (se crean en el drive)"),
      carpetaDrive: z.string().min(1).max(200).refine((v) => !v.split(/[\\/]/).some((x) => x.trim() === ".." || x.trim() === "."), "sin «..» en la ruta del drive").describe("Destino en el drive, con «/»"),
      categoria: z.string().max(40).optional(),
      etiquetas: z.array(z.string().min(1).max(40)).max(20).optional(),
      vence: dia.optional().describe("Fecha de vencimiento de los documentos (AAAA-MM-DD)"),
      vinculoTipo: z.enum(["parte", "tramite", "requisito", "alquiler", "pago_alquiler"]).optional(),
      vinculoId: z.string().regex(/^[\w:-]{1,90}$/, "Id con letras, números, _ - y :").optional().describe("requisito = <tramiteId>:<requisitoId>"),
      siExiste: z.enum(["saltar", "subir"]).default("saltar"),
      desde: z.number().int().min(0).max(100000).default(0).describe("Para seguir un lote grande: cuántos archivos ya se subieron"),
    },
    // Sin previa (o si la revisión falló) queda UN pedido sin sello: el cliente no manda nada. Con previa, N pedidos sellados.
    pedido: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const destino = rutaDrive(a.carpetaDrive);
      const meta = limpiar({ category: a.categoria, tags: a.etiquetas?.length ? JSON.stringify(a.etiquetas) : undefined, expiresAt: a.vence, vinculoTipo: a.vinculoId ? a.vinculoTipo : undefined, vinculoId: a.vinculoTipo ? a.vinculoId : undefined, siExiste: a.siExiste ?? "saltar" });
      if (!p?.ok || !p.archivos?.length) return [{ metodo: "POST", ruta: "/api/admin/documents", cuerpo: { carpetaRuta: destino, ...meta }, archivo: { ruta: a.carpeta, campo: "file", sha256: "", bytes: 0 } }];
      return p.archivos.map((f) => ({ metodo: "POST", ruta: "/api/admin/documents", cuerpo: { carpetaRuta: f.rel ? `${destino}/${f.rel}` : destino, ...meta }, archivo: { ruta: f.real, campo: "file", sha256: f.sha256, bytes: f.bytes } }));
    },
    // Lee la carpeta en la PC (no la red): carpeta permitida, sin ocultos ni claves, cada archivo revisado y sellado.
    previa: async (a) => {
      const c = await revisarCarpeta(a.carpeta, ajustes);
      if (!c.ok) return { ok: false, motivo: c.motivo };
      /** @type {{ abs: string, nombre: string, rel: string }[]} */ const candidatos = [];
      /** @type {{ nombre: string, motivo: string }[]} */ const noSubidos = [];
      const patron = a.patron ? new RegExp(`^${a.patron.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i") : null;
      try { await recorrer(c.real, "", a.recursivo === true, patron, candidatos, noSubidos, 0); } catch { return { ok: false, motivo: "no se pudo leer la carpeta" }; }
      const total = candidatos.length;
      const desde = a.desde ?? 0;
      /** @type {{ real: string, nombre: string, rel: string, bytes: number, sha256: string }[]} */ const archivos = [];
      let bytes = 0;
      let i = desde;
      for (; i < total && archivos.length < MAX_POR_LOTE; i++) {
        const f = candidatos[i];
        const r = await revisarArchivo(f.abs, ajustes);
        if (!r.ok) { noSubidos.push({ nombre: f.rel ? `${f.rel}/${f.nombre}` : f.nombre, motivo: r.motivo }); continue; }
        if (bytes + r.bytes > MAX_BYTES_LOTE && archivos.length) break;
        bytes += r.bytes;
        archivos.push({ real: r.real, nombre: f.nombre, rel: f.rel, bytes: r.bytes, sha256: r.sha256 });
      }
      const siguiente = i < total ? i : null;
      return { ok: true, archivos, noSubidos, total, desde, siguiente, bytes, lotes: Math.max(1, Math.ceil(total / MAX_POR_LOTE)) };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      if (!p?.ok) return `Subir una carpeta al drive: NO se puede (${p?.motivo ?? "no se pudo revisar la carpeta"}). Si confirmas, no se manda nada.`;
      if (!p.archivos.length) return `Subir una carpeta al drive: no hay archivos para subir${p.noSubidos.length ? ` (${p.noSubidos.length} quedan fuera: ${p.noSubidos.slice(0, 5).map((x) => `${linea60(x.nombre, 40)} → ${x.motivo}`).join("; ")})` : ""}. Si confirmas, no se manda nada.`;
      const n = p.archivos.length;
      const mas = p.siguiente !== null ? ` Son ${p.total}: van en ${p.lotes} lotes, sigue con desde=${p.siguiente}.` : "";
      const fuera = p.noSubidos.length ? ` No subido (${p.noSubidos.length}): ${p.noSubidos.slice(0, 6).map((x) => `${linea60(x.nombre, 40)} (${x.motivo})`).join("; ")}.` : "";
      return `Subir ${n} archivo${n === 1 ? "" : "s"} (${mb(p.bytes)}) de la carpeta «${linea60(a.carpeta.split("/").filter(Boolean).slice(-2).join("/"), 50)}» al drive, en «${rutaDrive(a.carpetaDrive)}»${a.recursivo ? " (con subcarpetas)" : ""}. Primeros: ${p.archivos.slice(0, 8).map((f) => conMarca(f.rel ? `${f.rel}/${f.nombre}` : f.nombre)).join(", ")}.${a.vinculoTipo ? ` Se enlazan a ${a.vinculoTipo} ${a.vinculoId ?? ""}.` : ""}${fuera}${mas} Sale una copia de esta PC; no hay deshacer.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      if (!p?.ok || !p.archivos?.length) return { clave: null, filas: [{ etiqueta: "Carpeta", valor: "no hay nada que subir" }] };
      const nombres = p.archivos.slice(0, 8).map((f) => f.nombre);
      return {
        clave: claveCantidad(p.archivos.length, { etiqueta: "Archivos a subir" }),
        filas: [
          { etiqueta: "Cantidad", valor: `${p.archivos.length} archivos · ${mb(p.bytes)}${p.noSubidos.length ? ` · ${p.noSubidos.length} fuera` : ""}` },
          { etiqueta: "Destino", valor: rutaDrive(a.carpetaDrive) },
          { etiqueta: "Archivos", valor: nombres.slice(0, 4).join(", ") },
          ...(nombres.length > 4 ? [{ etiqueta: "Y también", valor: `${nombres.slice(4).join(", ")}${p.archivos.length > 8 ? ` y ${p.archivos.length - 8} más` : ""}` }] : []),
        ],
      };
    },
  },
  {
    nombre: "doc_papelera",
    grupo: "documentos",
    tipo: "confirmar",
    descripcion: "Manda un documento a la papelera (DELETE /api/admin/documents/[id], sin purgar): se puede restaurar desde la papelera del panel. Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id del documento: el nombre del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/admin/documents/${a.id}` }),
    previa: async (a, leer) => {
      const f = /** @type {any} */ (await fichaPorId(leer, `/api/admin/documents/${a.id}`, "document"));
      const nombre = f?.name ?? f?.originalName;
      const vecinos = nombre ? await filasCompletas(leer, "/api/admin/documents", { folderId: f?.folderId ?? undefined, limite: 50 }) : null;
      return { nombre, otros: otrosNombres(vecinos, a.id) };
    },
    resumen: (a, previa) => `Mandar a la papelera el documento «${verificado(/** @type {any} */ (previa)?.nombre)}». Se puede restaurar.`,
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Documento", palabra: "nombre de documento" }) : null, filas: [] };
    },
  },
];

/** «Trámites\\Agrobanco/» → «Trámites/Agrobanco». */
function rutaDrive(v) {
  return String(v ?? "").split(/[\\/]/).map((x) => x.trim()).filter(Boolean).join("/");
}

/**
 * Recorre una carpeta de la PC: sin ocultos (incluye .en-curso), sin desktop.ini ni temporales de Office, sin enlaces.
 * Archivo o subcarpeta con nombre de clave → a `noSubidos`. Orden estable por nombre.
 */
async function recorrer(dir, rel, recursivo, patron, candidatos, noSubidos, nivel) {
  const entradas = (await readdir(dir, { withFileTypes: true })).sort((x, y) => x.name.localeCompare(y.name, "es"));
  for (const e of entradas) {
    const n = e.name;
    if (n.startsWith(".") || n.startsWith("~$") || n.toLowerCase() === "desktop.ini") continue;
    const nombreRel = rel ? `${rel}/${n}` : n;
    if (e.isDirectory()) {
      if (!recursivo || nivel >= MAX_PROFUNDIDAD) continue;
      if (PARECE_CLAVE.test(n)) { noSubidos.push({ nombre: nombreRel, motivo: "carpeta que parece tener una clave" }); continue; }
      await recorrer(join(dir, n), nombreRel, recursivo, patron, candidatos, noSubidos, nivel + 1);
    } else if (e.isFile()) {
      if (patron && !patron.test(n)) continue;
      if (PARECE_CLAVE.test(n)) { noSubidos.push({ nombre: nombreRel, motivo: "parece tener una clave" }); continue; }
      candidatos.push({ abs: join(dir, n), nombre: n, rel });
    }
  }
}
