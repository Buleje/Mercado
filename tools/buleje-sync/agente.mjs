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
const VERSION = "1.2.0";

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

/** Excluidos por defecto en modo soloSubir si el config no trae `excluir`. */
const EXCLUIR_BASE = ["desktop.ini", "*.ini", "Thumbs.db", "~$*", "*.tmp", "*.lnk"];

/** Opciones de línea de comandos: `--config <ruta>`, `--ensayo`, `--subir-distintos`, `--una-vez`. */
function leerArgs(argv) {
  const a = { config: null, ensayo: false, subirDistintos: false, unaVez: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--config") a.config = argv[++i];
    else if (x.startsWith("--config=")) a.config = x.slice(9);
    else if (x === "--ensayo") a.ensayo = true;
    else if (x === "--subir-distintos") a.subirDistintos = true;
    else if (x === "--una-vez") a.unaVez = true;
  }
  return a;
}

function cargarConfig(args) {
  const archivo = args.config ? path.resolve(args.config) : path.join(AQUI, "buleje-sync.config.json");
  let desdeArchivo = {};
  if (fs.existsSync(archivo)) {
    try {
      desdeArchivo = JSON.parse(fs.readFileSync(archivo, "utf8"));
    } catch (e) {
      salirCon(`El archivo de configuración tiene un error de formato: ${e.message}`);
    }
  } else if (args.config) {
    salirCon(`No existe el archivo de configuración ${archivo}`);
  }

  const soloSubir = desdeArchivo.soloSubir === true;
  const cfg = {
    carpeta: process.env.BULEJE_CARPETA ?? desdeArchivo.carpeta,
    api: (process.env.BULEJE_API ?? desdeArchivo.api ?? "").replace(/\/+$/, ""),
    clave: process.env.BULEJE_CLAVE ?? desdeArchivo.clave,
    /** Cada cuánto se revisa el panel por cambios que no vinieron del disco. */
    intervaloSegundos: Number(desdeArchivo.intervaloSegundos ?? 30),
    /** PC → panel únicamente: no baja, no borra, no escribe en la carpeta. */
    soloSubir,
    /** Ruta del archivo de estado; por defecto dentro de la carpeta. */
    estado: desdeArchivo.estado ? path.resolve(desdeArchivo.estado) : null,
    excluir: Array.isArray(desdeArchivo.excluir) ? desdeArchivo.excluir : soloSubir ? EXCLUIR_BASE : [],
    ensayo: args.ensayo,
    subirDistintos: args.subirDistintos,
    unaVez: args.unaVez,
  };

  if (!cfg.carpeta) salirCon("Falta 'carpeta' en la configuración.");
  if (!cfg.api) salirCon("Falta 'api' en la configuración (ej: https://tu-dominio.com).");
  if (!cfg.clave) salirCon("Falta 'clave' (la API key sk_… que genera el panel).");
  if (cfg.ensayo && !cfg.soloSubir) salirCon("--ensayo solo existe con \"soloSubir\": true.");
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
  return cfg.estado ?? path.join(cfg.carpeta, NOMBRE_ESTADO);
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

/**
 * Comodines simples: `*` (sin cruzar `/`), `**` (cruza `/`), `?`. Un patrón sin `/`
 * se prueba contra el NOMBRE de cada archivo y de cada carpeta; con `/` contra la
 * ruta relativa completa. Sin distinguir mayúsculas (Windows).
 */
function compilarExcluir(patrones) {
  return patrones.map((p) => {
    const conRuta = p.includes("/");
    const re = new RegExp(
      "^" +
        p
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, "\u0000")
          .replace(/\*/g, "[^/]*")
          .replace(/\u0000/g, ".*")
          .replace(/\?/g, "[^/]") +
        "$",
      "i",
    );
    return { patron: p, conRuta, re };
  });
}

/** Devuelve el patrón que excluye esta entrada, o null. `rel` usa `/`. */
function patronQueExcluye(reglas, rel, esCarpeta) {
  const nombre = rel.split("/").pop();
  for (const r of reglas) {
    if (r.conRuta ? r.re.test(esCarpeta ? rel + "/" : rel) : r.re.test(nombre)) return r.patron;
  }
  return null;
}

/** Cuenta archivos bajo una carpeta excluida (solo para informar en el ensayo). */
async function contarArchivos(dir) {
  let n = 0;
  try {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      n += e.isDirectory() ? await contarArchivos(path.join(dir, e.name)) : 1;
    }
  } catch {
    // carpeta ilegible: no cuenta
  }
  return n;
}

/**
 * Escaneo liviano para soloSubir: solo `stat`, sin leer contenido. Devuelve
 * `rel -> {size, mtime, completo}` y cuántos se excluyeron por cada patrón.
 */
async function escanearLiviano(base, reglas, dir = base, salida = new Map(), excl = new Map()) {
  let entradas;
  try {
    entradas = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return { salida, excl };
  }
  for (const e of entradas) {
    const completo = path.join(dir, e.name);
    const rel = path.relative(base, completo).split(path.sep).join("/");
    if (e.isDirectory()) {
      if (CARPETAS_IGNORADAS.has(e.name)) continue;
      const p = patronQueExcluye(reglas, rel, true);
      if (p) {
        excl.set(p, (excl.get(p) ?? 0) + (await contarArchivos(completo)));
        continue;
      }
      await escanearLiviano(base, reglas, completo, salida, excl);
      continue;
    }
    if (!e.isFile() || e.name === NOMBRE_ESTADO) continue;
    const p = patronQueExcluye(reglas, rel, false);
    if (p) {
      excl.set(p, (excl.get(p) ?? 0) + 1);
      continue;
    }
    try {
      const st = await fsp.stat(completo);
      salida.set(rel, { size: st.size, mtime: Math.round(st.mtimeMs), completo });
    } catch {
      // bloqueado o desapareció: se reintenta en la próxima vuelta
    }
  }
  return { salida, excl };
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

  // En esta PC (WSL mirrored) un puerto cerrado de 127.0.0.1 CUELGA sin error:
  // todo fetch lleva tope. 20 s para llamadas chicas, más para mover contenido.
  async function pedir(ruta, init = {}, topeMs = 20_000) {
    const res = await fetch(`${cfg.api}${ruta}`, {
      ...init,
      signal: AbortSignal.timeout(topeMs),
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
      const res = await pedir("/api/sync/push", { method: "POST", body: form }, 120_000);
      return res.json();
    },

    async bajar(id) {
      const res = await pedir(`/api/sync/pull/${id}`, {}, 120_000);
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

// ── Modo soloSubir (PC → panel) ──────────────────────────────────────────────

/** Clave de comparación con el panel: NFC, sin distinguir mayúsculas, partes recortadas. */
function claveRuta(ruta) {
  return ruta
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x && x !== ".")
    .join("/")
    .normalize("NFC")
    .toLowerCase();
}

/**
 * Una vuelta de PC → panel. Nunca baja, nunca borra en el panel, nunca escribe en
 * la carpeta del usuario. Con `cfg.ensayo` tampoco escribe el estado ni late.
 *
 * Estado por ruta: `{documentId|null, size, mtime, hash|null}`. `hash: null` = se
 * adoptó por nombre+tamaño sin leer el archivo; si luego cambia size/mtime, se
 * sube como versión nueva.
 */
async function correrCicloSoloSubir(cfg, cliente, log) {
  const previos = leerEstado(cfg);
  const primeraVuelta = Object.keys(previos).length === 0;
  const reglas = compilarExcluir(cfg.excluir);
  const { salida: locales, excl } = await escanearLiviano(cfg.carpeta, reglas);

  const manifiesto = await cliente.manifiesto();
  const remotos = new Map();
  for (const i of manifiesto.items) remotos.set(claveRuta(i.ruta), i);
  const clavesLocales = new Set([...locales.keys()].map(claveRuta));

  const nuevos = { ...previos };
  const r = {
    adoptados: [], aSubir: [], subidos: 0, versiones: [], distintos: [], movidos: [],
    sinSeguir: [], errores: 0, ignoradosPanel: 0,
  };

  // Candidatos a "esto es un movimiento/renombre": seguidos que ya no están en disco
  // y cuyo documento sigue vivo en el panel. Se empareja 1 a 1; ante la duda, se sube.
  const idsVivos = new Set(manifiesto.items.map((i) => i.id));
  const desaparecidos = Object.entries(previos)
    .filter(([ruta, pv]) => !locales.has(ruta) && !clavesLocales.has(claveRuta(ruta)) && pv.documentId && idsVivos.has(pv.documentId))
    .map(([ruta, pv]) => ({ ruta, ...pv }));
  const sinHashPorTam = new Map();
  for (const d of desaparecidos) if (!d.hash) sinHashPorTam.set(d.size, (sinHashPorTam.get(d.size) ?? 0) + 1);
  const nuevosPorTam = new Map();
  for (const [ruta, loc] of locales) {
    if (!previos[ruta] && !remotos.has(claveRuta(ruta))) nuevosPorTam.set(loc.size, (nuevosPorTam.get(loc.size) ?? 0) + 1);
  }
  const usados = new Set();
  const rutasMovidas = new Set();

  /** Devuelve {candidato, buf, hash} si `ruta` es un movimiento claro; si no, null. */
  async function buscarMovimiento(loc) {
    const cands = desaparecidos.filter((d) => d.size === loc.size && !usados.has(d.ruta));
    if (cands.length === 0) return null;
    let buf;
    try {
      buf = await fsp.readFile(loc.completo);
    } catch {
      return null;
    }
    const hash = hashDe(buf);
    const conHash = cands.filter((d) => d.hash === hash);
    if (conHash.length === 1) return { cand: conHash[0], buf, hash };
    if (conHash.length > 1) return null;
    const sinHash = cands.filter((d) => !d.hash);
    if (sinHash.length === 1 && sinHashPorTam.get(loc.size) === 1 && nuevosPorTam.get(loc.size) === 1) {
      return { cand: sinHash[0], buf, hash };
    }
    return null;
  }

  for (const [ruta, loc] of locales) {
    const previo = previos[ruta];
    const remoto = remotos.get(claveRuta(ruta));

    if (previo) {
      if (previo.size === loc.size && previo.mtime === loc.mtime) continue; // sin cambios
      let buf;
      try {
        buf = await fsp.readFile(loc.completo);
      } catch {
        continue; // bloqueado: próxima vuelta
      }
      const hash = hashDe(buf);
      if (previo.hash && previo.hash === hash) {
        nuevos[ruta] = { ...previo, size: loc.size, mtime: loc.mtime };
        continue;
      }
      r.versiones.push(ruta);
      if (cfg.ensayo) continue;
      try {
        const res = await cliente.subir({ ruta, buffer: buf, documentId: previo.documentId ?? remoto?.id ?? null });
        if (!res.ok) throw new Error(res.error ?? "push falló");
        nuevos[ruta] = { documentId: res.documentId, size: loc.size, mtime: loc.mtime, hash };
        r.subidos++;
        log(`  ↑ versión nueva  ${ruta}`);
      } catch (e) {
        r.errores++;
        log(`  ! error en ${ruta}: ${e.message}`);
      }
      continue;
    }

    // Archivo que el estado no conoce.
    if (remoto && remoto.size === loc.size) {
      r.adoptados.push(ruta);
      nuevos[ruta] = { documentId: remoto.id, size: loc.size, mtime: loc.mtime, hash: null };
      continue;
    }
    if (remoto && !cfg.subirDistintos) {
      r.distintos.push({ ruta, local: loc.size, panel: remoto.size });
      continue;
    }

    if (!remoto) {
      const mov = await buscarMovimiento(loc);
      if (mov) {
        usados.add(mov.cand.ruta);
        rutasMovidas.add(mov.cand.ruta);
        r.movidos.push({ de: mov.cand.ruta, a: ruta });
        if (cfg.ensayo) continue;
        try {
          const res = await cliente.mover(mov.cand.documentId, ruta);
          if (!res.ok) throw new Error(res.error ?? "move falló");
          delete nuevos[mov.cand.ruta];
          nuevos[ruta] = { documentId: mov.cand.documentId, size: loc.size, mtime: loc.mtime, hash: mov.hash };
          log(`  → movido  ${mov.cand.ruta}  ⇒  ${ruta}`);
        } catch (e) {
          r.errores++;
          r.movidos.pop();
          rutasMovidas.delete(mov.cand.ruta);
          log(`  ! no se pudo mover ${ruta}: ${e.message} (se reintenta en la próxima vuelta)`);
        }
        continue;
      }
    }

    r.aSubir.push({ ruta, size: loc.size });
    if (cfg.ensayo) continue;
    try {
      const buf = await fsp.readFile(loc.completo);
      const res = await cliente.subir({ ruta, buffer: buf, documentId: remoto?.id ?? null });
      if (!res.ok) throw new Error(res.error ?? "push falló");
      nuevos[ruta] = { documentId: res.documentId, size: loc.size, mtime: loc.mtime, hash: hashDe(buf) };
      r.subidos++;
      log(`  ↑ subido  ${ruta}`);
    } catch (e) {
      r.errores++;
      log(`  ! error en ${ruta}: ${e.message}`);
    }
  }

  // Lo que el estado seguía y ya no está en disco: se deja de seguir, el panel no se toca.
  for (const ruta of Object.keys(previos)) {
    if (!locales.has(ruta) && !clavesLocales.has(claveRuta(ruta)) && !rutasMovidas.has(ruta)) {
      r.sinSeguir.push(ruta);
      delete nuevos[ruta];
    }
  }
  r.ignoradosPanel = [...remotos.keys()].filter((k) => !clavesLocales.has(k)).length;

  if (!cfg.ensayo && (r.adoptados.length || r.subidos || r.movidos.length || r.sinSeguir.length || JSON.stringify(nuevos) !== JSON.stringify(previos))) {
    await fsp.mkdir(path.dirname(rutaEstado(cfg)), { recursive: true });
    await guardarEstado(cfg, nuevos);
  }
  return { ...r, archivos: locales.size, excluidos: excl, primeraVuelta, nuevosEstado: nuevos };
}

function imprimirEnsayo(r, cfg) {
  const L = (m) => console.log(m);
  L(`\n  ENSAYO (no se escribió nada) · ${cfg.carpeta}`);
  L(`  archivos locales considerados: ${r.archivos}${r.primeraVuelta ? " (primera vuelta, sin estado)" : ""}`);
  L(`  adoptados (mismo nombre y tamaño): ${r.adoptados.length}`);
  L(`  a subir (nuevos): ${r.aSubir.length}`);
  for (const x of r.aSubir) L(`      + ${x.ruta}  (${x.size} B)`);
  L(`  movidos/renombrados (se mueven en el panel, no se suben): ${r.movidos.length}`);
  for (const x of r.movidos) L(`      → ${x.de}  ⇒  ${x.a}`);
  L(`  versiones nuevas (cambiaron): ${r.versiones.length}`);
  for (const x of r.versiones) L(`      ~ ${x}`);
  L(`  distintos (mismo nombre, otro tamaño; NO se suben): ${r.distintos.length}`);
  for (const x of r.distintos) L(`      ≠ ${x.ruta}  (PC ${x.local} B · panel ${x.panel} B)`);
  const totEx = [...r.excluidos.values()].reduce((a, b) => a + b, 0);
  L(`  excluidos: ${totEx}`);
  for (const [p, n] of [...r.excluidos].sort((a, b) => b[1] - a[1])) L(`      ${String(n).padStart(5)}  ${p}`);
  L(`  sin seguir (borrados/movidos en la PC): ${r.sinSeguir.length}`);
  L(`  ignorados del panel (solo existen allá): ${r.ignoradosPanel}\n`);
}

// ── Arranque ─────────────────────────────────────────────────────────────────

function ahora() {
  return new Date().toLocaleTimeString("es-PE", { hour12: false });
}

/** Bucle del modo soloSubir: sin fs.watch (por 9p no es confiable), solo intervalo. */
async function mainSoloSubir(cfg, cliente, equipo, log) {
  console.log(`\n  Buleje · solo subir (PC → panel)`);
  console.log(`  carpeta : ${cfg.carpeta}`);
  console.log(`  panel   : ${cfg.api}`);
  console.log(`  revisión: cada ${cfg.intervaloSegundos}s · excluye ${cfg.excluir.length} patrones\n`);

  let corriendo = false;
  async function vuelta(motivo) {
    if (corriendo) return;
    corriendo = true;
    try {
      const r = await correrCicloSoloSubir(cfg, cliente, log);
      if (r.distintos.length) log(`  [${ahora()}] ${r.distintos.length} archivo(s) con el mismo nombre pero otro tamaño que en el panel (no se suben)`);
      const nota = r.sinSeguir.length ? ` · ${r.sinSeguir.length} sin seguir` : "";
      await cliente.latir({
        ...equipo,
        carpeta: cfg.carpeta.slice(0, 300),
        version: VERSION,
        motivo: `${motivo} · solo subir${nota}`.slice(0, 60),
        subidos: r.subidos,
        bajados: 0,
        borrados: 0,
        archivos: r.archivos,
        error: null,
      });
    } catch (e) {
      console.error(`  [${ahora()}] no se pudo sincronizar: ${e.message}`);
      await cliente.latir({ ...equipo, carpeta: cfg.carpeta.slice(0, 300), version: VERSION, motivo, error: e.message.slice(0, 300) });
    } finally {
      corriendo = false;
    }
  }

  await vuelta("arranque");
  if (cfg.unaVez) return;
  setInterval(() => vuelta("revisión periódica"), Math.max(10, cfg.intervaloSegundos) * 1000);
}

async function main() {
  const args = leerArgs(process.argv.slice(2));
  const cfg = cargarConfig(args);
  const log = (m) => console.log(m);
  const equipo = identidadEquipo();
  const cliente = crearCliente(cfg);

  if (cfg.soloSubir) {
    if (!fs.existsSync(cfg.carpeta)) salirCon(`No existe la carpeta ${cfg.carpeta}`);
    if (cfg.ensayo) {
      imprimirEnsayo(await correrCicloSoloSubir(cfg, cliente, log), cfg);
      return;
    }
    return mainSoloSubir(cfg, cliente, equipo, log);
  }

  await fsp.mkdir(cfg.carpeta, { recursive: true });

  console.log(`\n  Buleje · sincronización de escritorio`);
  console.log(`  carpeta : ${cfg.carpeta}`);
  console.log(`  panel   : ${cfg.api}`);
  console.log(`  revisión: cada ${cfg.intervaloSegundos}s (y al toque cuando tocás un archivo)\n`);

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
