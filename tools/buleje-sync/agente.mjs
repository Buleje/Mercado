#!/usr/bin/env node
/**
 * Agente de sincronización de escritorio del Drive de Buleje (ADR-307).
 *
 * Vigila una carpeta de Windows y la mantiene igual que el Drive del panel, en los dos
 * sentidos. Lo que hacés en la carpeta sube; lo que sube al panel o al celular, baja.
 *
 * SIN DEPENDENCIAS a propósito: es un solo archivo que corre con `node agente.mjs`.
 * Nada de npm install, nada de node_modules. Usa `fs.watch` recursivo (nativo en
 * Windows) y `fetch`/`FormData` de Node.
 *
 * Config: `buleje-sync.config.json` al lado de este archivo, o variables de entorno
 * BULEJE_CARPETA / BULEJE_API / BULEJE_CLAVE.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Se reporta al panel para saber si hay un agente viejo dando vueltas. */
const VERSION = "1.1.0";

/**
 * Identidad del equipo: hostname + usuario. Estable entre reinicios (el panel
 * agrupa los latidos por acá) y no depende de guardar un id en disco, que se
 * perdería al reinstalar.
 */
function identidadEquipo() {
  const host = (os.hostname() || "equipo").trim();
  const usuario = (os.userInfo().username || "usuario").trim();
  return { equipoId: `${host}/${usuario}`.slice(0, 80), nombre: host.slice(0, 80) };
}

// ── Configuración ────────────────────────────────────────────────────────────

function cargarConfig() {
  const archivo = path.join(AQUI, "buleje-sync.config.json");
  let desdeArchivo = {};
  if (fs.existsSync(archivo)) {
    try {
      desdeArchivo = JSON.parse(fs.readFileSync(archivo, "utf8"));
    } catch (e) {
      salirCon(`El archivo de configuración tiene un error de formato: ${e.message}`);
    }
  }

  const cfg = {
    carpeta: process.env.BULEJE_CARPETA ?? desdeArchivo.carpeta,
    api: (process.env.BULEJE_API ?? desdeArchivo.api ?? "").replace(/\/+$/, ""),
    clave: process.env.BULEJE_CLAVE ?? desdeArchivo.clave,
    /** Cada cuánto se revisa el panel por cambios que no vinieron del disco. */
    intervaloSegundos: Number(desdeArchivo.intervaloSegundos ?? 30),
  };

  if (!cfg.carpeta) salirCon("Falta 'carpeta' en la configuración.");
  if (!cfg.api) salirCon("Falta 'api' en la configuración (ej: https://tu-dominio.com).");
  if (!cfg.clave) salirCon("Falta 'clave' (la API key sk_… que genera el panel).");
  return cfg;
}

function salirCon(mensaje) {
  console.error(`\n  ✖ ${mensaje}\n`);
  process.exit(1);
}

// ── Estado local ─────────────────────────────────────────────────────────────
// Recuerda, por ruta: qué documento del panel es, y cómo estaba la última vez que
// los dos lados coincidieron. Sin esto no se puede distinguir "lo borraron acá" de
// "todavía no lo bajé".

const NOMBRE_ESTADO = ".buleje-sync.json";

function rutaEstado(cfg) {
  return path.join(cfg.carpeta, NOMBRE_ESTADO);
}

function leerEstado(cfg) {
  try {
    const crudo = fs.readFileSync(rutaEstado(cfg), "utf8");
    const j = JSON.parse(crudo);
    return j.archivos ?? {};
  } catch {
    return {};
  }
}

async function guardarEstado(cfg, archivos) {
  const tmp = rutaEstado(cfg) + ".tmp";
  const cuerpo = JSON.stringify({ version: 1, actualizado: new Date().toISOString(), archivos }, null, 2);
  // Escritura atómica: si se corta la luz a mitad, el estado viejo sobrevive.
  await fsp.writeFile(tmp, cuerpo, "utf8");
  await fsp.rename(tmp, rutaEstado(cfg));
}

// ── Utilidades de archivos ───────────────────────────────────────────────────

/** Nombres y carpetas que nunca se sincronizan. */
const IGNORADOS = new Set([NOMBRE_ESTADO, "desktop.ini", "Thumbs.db", ".DS_Store"]);
const CARPETAS_IGNORADAS = new Set([".git", "node_modules", "$RECYCLE.BIN", "System Volume Information"]);

function hashDe(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Windows no acepta estos caracteres en un nombre de archivo, ni los de control,
// ni que el nombre termine en punto o espacio. Un documento del panel puede
// llamarse asi igual ("Reunion 10:30.pdf"), asi que hay que poder escribirlo.
// Ojo: espacios y guiones son VALIDOS y no se tocan.
const CHARS_PROHIBIDOS = ["<", ">", ":", String.fromCharCode(34), "|", "?", "*", String.fromCharCode(92), "/"];
/** Nombres de dispositivo que Windows reserva: no puede existir un archivo asi. */
const RESERVADOS_WINDOWS = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

function nombreSeguroWindows(nombre) {
  let limpio = "";
  for (const ch of nombre) {
    limpio += CHARS_PROHIBIDOS.includes(ch) || ch.charCodeAt(0) < 32 ? "_" : ch;
  }
  limpio = limpio.replace(/[. ]+$/, "");
  if (RESERVADOS_WINDOWS.test(limpio)) limpio = "_" + limpio;
  return limpio.slice(0, 200) || "sin-nombre";
}

function rutaSeguraWindows(rutaLogica) {
  return rutaLogica.split("/").map(nombreSeguroWindows).join(path.sep);
}

/** Recorre la carpeta y devuelve `ruta lógica -> {hash, size, mtime}`. */
async function escanearCarpeta(dir, base = dir, salida = new Map()) {
  let entradas;
  try {
    entradas = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return salida;
  }

  for (const e of entradas) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (CARPETAS_IGNORADAS.has(e.name)) continue;
      await escanearCarpeta(completo, base, salida);
      continue;
    }
    if (!e.isFile() || IGNORADOS.has(e.name)) continue;

    try {
      const st = await fsp.stat(completo);
      const buf = await fsp.readFile(completo);
      const rel = path.relative(base, completo).split(path.sep).join("/");
      salida.set(rel, { hash: hashDe(buf), size: st.size, mtime: st.mtimeMs, buffer: buf });
    } catch {
      // Archivo bloqueado por otro programa (Excel abierto, antivirus). Se reintenta
      // en el próximo ciclo en vez de romper toda la corrida.
    }
  }
  return salida;
}

// ── Cliente HTTP del panel ───────────────────────────────────────────────────

function crearCliente(cfg) {
  const cabeceras = { Authorization: `Bearer ${cfg.clave}` };

  async function pedir(ruta, init = {}) {
    const res = await fetch(`${cfg.api}${ruta}`, {
      ...init,
      headers: { ...cabeceras, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} en ${ruta}: ${detalle.slice(0, 200)}`);
    }
    return res;
  }

  return {
    async manifiesto() {
      const res = await pedir("/api/sync/manifest");
      return res.json();
    },

    async subir({ ruta, buffer, documentId }) {
      const form = new FormData();
      form.append("file", new Blob([buffer]), path.basename(ruta));
      form.append("ruta", ruta);
      if (documentId) form.append("documentId", documentId);
      const res = await pedir("/api/sync/push", { method: "POST", body: form });
      return res.json();
    },

    async bajar(id) {
      const res = await pedir(`/api/sync/pull/${id}`);
      return Buffer.from(await res.arrayBuffer());
    },

    async borrar(documentIds) {
      const res = await pedir("/api/sync/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentIds }),
      });
      return res.json();
    },

    /**
     * Le cuenta al panel qué pasó en el ciclo. Si falla no se propaga: es
     * telemetría, y romper la sincronización porque no se pudo avisar sería
     * cambiar algo que funciona por algo que informa.
     */
    async latir(cuerpo) {
      try {
        await pedir("/api/sync/latido", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
      } catch {
        // El panel se queda sin el dato de este ciclo; el próximo lo trae.
      }
    },

    async mover(documentId, ruta) {
      const res = await pedir("/api/sync/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, ruta }),
      });
      return res.json();
    },
  };
}

// ── Reconciliación ───────────────────────────────────────────────────────────

/**
 * Compara los tres estados (disco, panel, y cómo estaban la última vez) y decide
 * qué hacer con cada ruta.
 *
 * La clave es el estado previo: sin él, "está en el panel pero no en disco" es
 * ambiguo — puede ser un archivo nuevo del panel o uno que borraste acá.
 */
function decidirAcciones({ locales, remotos, previos }) {
  const acciones = [];
  const rutas = new Set([...locales.keys(), ...remotos.keys(), ...Object.keys(previos)]);

  for (const ruta of rutas) {
    const local = locales.get(ruta);
    const remoto = remotos.get(ruta);
    const previo = previos[ruta];

    if (local && !remoto) {
      // Estaba sincronizado y el panel ya no lo tiene → lo borraron allá.
      if (previo?.documentId) acciones.push({ tipo: "borrar-local", ruta });
      else acciones.push({ tipo: "subir", ruta, documentId: null });
      continue;
    }

    if (!local && remoto) {
      // Lo teníamos y desapareció del disco → lo borraste vos.
      if (previo) acciones.push({ tipo: "borrar-remoto", ruta, documentId: remoto.id });
      else acciones.push({ tipo: "bajar", ruta, documentId: remoto.id, updatedAt: remoto.updatedAt });
      continue;
    }

    if (!local && !remoto) continue; // fantasma del estado previo

    const cambioLocal = !previo || previo.hash !== local.hash;
    const cambioRemoto = !previo || previo.serverUpdatedAt !== remoto.updatedAt;

    if (cambioLocal && cambioRemoto) {
      acciones.push({ tipo: "conflicto", ruta, documentId: remoto.id, updatedAt: remoto.updatedAt });
    } else if (cambioLocal) {
      acciones.push({ tipo: "subir", ruta, documentId: remoto.id });
    } else if (cambioRemoto) {
      acciones.push({ tipo: "bajar", ruta, documentId: remoto.id, updatedAt: remoto.updatedAt });
    }
  }

  return acciones;
}

/** `nota.txt` → `nota (del panel).txt`, para no pisar nada cuando hay conflicto. */
function nombreDeConflicto(ruta) {
  const ext = path.extname(ruta);
  return `${ruta.slice(0, ruta.length - ext.length)} (del panel)${ext}`;
}

// ── Ciclo principal ──────────────────────────────────────────────────────────

/**
 * Traduce lo que hay en disco a rutas lógicas del Drive.
 *
 * Hace falta porque un documento puede llamarse `Reunión 10:30.pdf` en el panel y
 * tener que guardarse como `Reunión 10_30.pdf` en Windows. Sin esta traducción, el
 * escaneo siguiente vería un archivo desconocido y lo subiría duplicado.
 */
function aRutasLogicas(escaneadas, previos) {
  const inverso = new Map();
  for (const [logica, dato] of Object.entries(previos)) {
    if (dato.rutaLocal) inverso.set(dato.rutaLocal, logica);
  }

  const salida = new Map();
  for (const [rutaLocal, dato] of escaneadas) {
    const logica = inverso.get(rutaLocal) ?? rutaLocal;
    salida.set(logica, { ...dato, rutaLocal });
  }
  return salida;
}

async function correrCiclo(cfg, cliente, log) {
  const previos = leerEstado(cfg);
  const escaneadas = await escanearCarpeta(cfg.carpeta);
  const locales = aRutasLogicas(escaneadas, previos);

  const manifiesto = await cliente.manifiesto();
  const remotos = new Map(manifiesto.items.map((i) => [i.ruta, i]));

  const acciones = decidirAcciones({ locales, remotos, previos });
  // El detalle se reporta igual cuando no hubo nada que hacer: "sin cambios" es
  // justo lo que el panel necesita para decir "está al día".
  if (acciones.length === 0) {
    return { cambios: 0, subidos: 0, bajados: 0, borrados: 0, conflictos: [], archivos: locales.size };
  }

  const nuevos = { ...previos };
  const aBorrarRemoto = [];
  /** Rutas donde hubo conflicto: van al latido para que el panel las muestre. */
  const conflictos = [];
  let hechas = 0;

  for (const acc of acciones) {
    try {
      switch (acc.tipo) {
        case "subir": {
          const local = locales.get(acc.ruta);
          const r = await cliente.subir({
            ruta: acc.ruta,
            buffer: local.buffer,
            documentId: acc.documentId,
          });
          if (!r.ok) throw new Error(r.error ?? "push falló");
          nuevos[acc.ruta] = {
            documentId: r.documentId,
            hash: local.hash,
            size: local.size,
            rutaLocal: local.rutaLocal,
            // El servidor devuelve el updatedAt que quedó guardado; sin esto el
            // ciclo siguiente creería que el panel cambió y re-bajaría lo recién subido.
            serverUpdatedAt: r.updatedAt ?? null,
          };
          log(`  ↑ subido    ${acc.ruta}${r.accion === "version" ? " (versión nueva)" : ""}`);
          hechas++;
          break;
        }

        case "bajar": {
          const buf = await cliente.bajar(acc.documentId);
          const rutaLocal = rutaSeguraWindows(acc.ruta).split(path.sep).join("/");
          const destino = path.join(cfg.carpeta, rutaSeguraWindows(acc.ruta));
          await fsp.mkdir(path.dirname(destino), { recursive: true });
          await fsp.writeFile(destino, buf);
          nuevos[acc.ruta] = {
            documentId: acc.documentId,
            hash: hashDe(buf),
            size: buf.length,
            rutaLocal,
            serverUpdatedAt: acc.updatedAt,
          };
          log(`  ↓ bajado    ${acc.ruta}${rutaLocal !== acc.ruta ? ` (guardado como ${rutaLocal})` : ""}`);
          hechas++;
          break;
        }

        case "borrar-remoto": {
          aBorrarRemoto.push({ ruta: acc.ruta, id: acc.documentId });
          break;
        }

        case "borrar-local": {
          // Se borra por la ruta REAL en disco, que puede diferir de la lógica.
          const rel = previos[acc.ruta]?.rutaLocal ?? rutaSeguraWindows(acc.ruta);
          const destino = path.join(cfg.carpeta, rel.split("/").join(path.sep));
          await fsp.rm(destino, { force: true });
          delete nuevos[acc.ruta];
          log(`  ✖ borrado local (ya no está en el panel)  ${acc.ruta}`);
          hechas++;
          break;
        }

        case "conflicto": {
          // Nadie pierde: se guarda la del panel al lado y se sube la tuya como versión.
          //
          // El ORDEN importa y no es negociable: si se sube primero, el documento del
          // panel queda con el contenido local y lo que se baje después sería una copia
          // de lo mismo — justo lo que el conflicto tiene que evitar.
          const local = locales.get(acc.ruta);

          const delPanel = await cliente.bajar(acc.documentId);
          const rutaCopia = nombreDeConflicto(acc.ruta);
          const destino = path.join(cfg.carpeta, rutaSeguraWindows(rutaCopia));
          await fsp.mkdir(path.dirname(destino), { recursive: true });
          await fsp.writeFile(destino, delPanel);

          const r = await cliente.subir({
            ruta: acc.ruta,
            buffer: local.buffer,
            documentId: acc.documentId,
          });
          if (!r.ok) throw new Error(r.error ?? "push falló");

          nuevos[acc.ruta] = {
            documentId: r.documentId,
            hash: local.hash,
            size: local.size,
            rutaLocal: local.rutaLocal,
            serverUpdatedAt: r.updatedAt ?? null,
          };
          conflictos.push(acc.ruta);
          log(`  ⚠ conflicto ${acc.ruta} — subí la tuya y guardé la del panel como "${path.basename(rutaCopia)}"`);
          hechas++;
          break;
        }
      }
    } catch (e) {
      log(`  ! error en ${acc.ruta}: ${e.message}`);
    }
  }

  if (aBorrarRemoto.length > 0) {
    try {
      await cliente.borrar(aBorrarRemoto.map((x) => x.id));
      for (const x of aBorrarRemoto) {
        delete nuevos[x.ruta];
        log(`  ✖ a la papelera del panel  ${x.ruta}`);
        hechas++;
      }
    } catch (e) {
      log(`  ! no se pudo mandar a la papelera: ${e.message}`);
    }
  }

  await guardarEstado(cfg, nuevos);
  return {
    cambios: hechas,
    subidos: acciones.filter((a) => a.tipo === "subir").length,
    bajados: acciones.filter((a) => a.tipo === "bajar").length,
    borrados: aBorrarRemoto.length,
    conflictos,
    archivos: locales.size,
  };
}

// ── Arranque ─────────────────────────────────────────────────────────────────

function ahora() {
  return new Date().toLocaleTimeString("es-PE", { hour12: false });
}

async function main() {
  const cfg = cargarConfig();
  const log = (m) => console.log(m);
  const equipo = identidadEquipo();

  await fsp.mkdir(cfg.carpeta, { recursive: true });

  console.log(`\n  Buleje · sincronización de escritorio`);
  console.log(`  carpeta : ${cfg.carpeta}`);
  console.log(`  panel   : ${cfg.api}`);
  console.log(`  revisión: cada ${cfg.intervaloSegundos}s (y al toque cuando tocás un archivo)\n`);

  const cliente = crearCliente(cfg);

  let corriendo = false;
  let pendiente = false;

  async function ciclo(motivo) {
    if (corriendo) {
      pendiente = true;
      return;
    }
    corriendo = true;
    try {
      const r = await correrCiclo(cfg, cliente, log);
      if (r.cambios > 0) console.log(`  [${ahora()}] ${r.cambios} cambio(s) · ${motivo}\n`);
      await cliente.latir({ ...equipo, carpeta: cfg.carpeta, version: VERSION, motivo, ...r, error: null });
    } catch (e) {
      console.error(`  [${ahora()}] no se pudo sincronizar: ${e.message}`);
      // El error también late: el panel tiene que poder decir "reportó y falló",
      // que es distinto de "no reporta".
      await cliente.latir({ ...equipo, carpeta: cfg.carpeta, version: VERSION, motivo, error: e.message });
    } finally {
      corriendo = false;
      if (pendiente) {
        pendiente = false;
        setTimeout(() => ciclo("cambios encolados"), 500);
      }
    }
  }

  await ciclo("arranque");

  // Reacción inmediata a lo que pasa en la carpeta. El watcher no aplica cambios por
  // su cuenta: solo pide un ciclo, que es quien decide. Así no hay bucle cuando el
  // propio agente escribe un archivo que bajó.
  let debounce = null;
  try {
    fs.watch(cfg.carpeta, { recursive: true }, (_evento, archivo) => {
      if (archivo && IGNORADOS.has(path.basename(archivo))) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => ciclo("cambio en la carpeta"), 1200);
    });
  } catch {
    console.log("  (este sistema no soporta vigilancia recursiva; se usa solo el intervalo)");
  }

  setInterval(() => ciclo("revisión periódica"), Math.max(10, cfg.intervaloSegundos) * 1000);
}

main().catch((e) => salirCon(e.message));
