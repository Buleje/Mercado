/* Banco de testas-cv.ts sobre las escenas de scripts/testas-escena-sintetica.cjs: error por troza contra la verdad (Ø CON corteza).
   Uso: npx tsx scripts/testas-banco.ts <carpeta o escena-*.jpg…> [--detalle]
   Si están las dos caras de una carga (escena-<seed>-<q>.jpg y escena-<seed>-<q2>-adelante.jpg), también las empareja
   (`emparejarCaras`) y cuenta cuántas parejas salen bien contra la verdad (`n` = qué troza es).
   --tocar (F4): además «toca» CADA troza donde la tocaría el operador (`toque` de la verdad: el centro de lo que se ve, ± un 25 % del
   radio de dedo) y cuenta, por dificultad (barro, sombra, tapada, contraste, ninguna), cuántas recorta bien `testaEn` y con qué error.
   «auto o toque» = la vio la foto o, si no, la recortó el toque (lo que le queda al operador después de tocar las que faltaron).
   Escenas difíciles: `node scripts/testas-escena-sintetica.cjs <seed 1-5> gira15 0.8 reports/testas-banco/dificiles atras <barro|sombra|tapada|contraste>`.

   F4, cómo se eligió el toque (16-10, 20 escenas difíciles = 224 trozas; acierto = centro a < 0,4 radios):
   | camino                                   | recorta | err medio | peor   | ms por toque          | descarga |
   | antes: rayos desde el toque (testas-cv)  | 77,7 %  | 1,09 cm   | 15,5   | 4                     | 0        |
   | (a) consenso de círculos (segmentar-toque)| 100 %   | 0,73 cm   | 3,4    | 72 (Node, 1 hilo)     | 0        |
   | (a) + «madera adentro» (MADERA_ADENTRO)  | 100 %   | 0,48 cm   | 5,3    | 92                    | 0        |
   | (b) SlimSAM-77 cuantizado, ONNX WASM 1 hilo| 93,7 % | 1,1-7,6 cm| —      | 145 + 7.500 por foto  | 13,8 MB  |
   (b) acierto = Ø a ±25 %: corta la madera sin la corteza (sesgo −1 a −3,3 cm) y en la tapada sólo lo que se ve (−4,9).
   Licencias verificadas en el LICENSE de cada repo: SlimSAM, MobileSAM y EfficientSAM = Apache-2.0. Va (a); (b) queda acá.
   «Madera adentro»: el puntaje con tolerancia que crece con el radio premiaba el círculo de afuera de la corteza; ≤2 cm 93,3 %;
   en sombra dura (8 trozas) sigue en 1,28 cm.
   Escenas base (carril-m, 460 trozas): el toque nuevo recorta 100 % (antes 97,8 %, peor 21,8 cm → 2,6; err 0,48, ≤2 cm 98 %)
   y lo automático no cambia (455/460, 0,16 cm). */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { medirCara, crearDetectorHojas, type OpenCvTestas } from "@/components/admin/forestal/camaras/testas-cv";
import { testaEn } from "@/components/admin/forestal/camaras/segmentar-toque";
import { emparejarCaras, radiosBuscados, type CaraMedida } from "@/lib/forestal/testas-medicion";

const req = createRequire(import.meta.url);
const RAIZ = process.cwd();
const sharp = req(path.join(RAIZ, "node_modules/sharp"));

interface Verdad {
  n: number;
  x: number;
  y: number;
  dCm: number;
  aMm: number;
  cortezaMm?: number;
  dif?: string[];
  toque?: [number, number];
}

/** Por dificultad: cuántas, cuántas vio la foto, cuántas recortó el toque, sus errores y su tiempo. */
interface Grupo {
  n: number;
  auto: number;
  toque: number;
  errToque: number[];
  autoOToque: number;
  ms: number[];
}

async function cargarCv(): Promise<OpenCvTestas> {
  let cv = req(path.join(RAIZ, "node_modules/@techstark/opencv-js"));
  if (cv instanceof Promise || typeof cv.then === "function") cv = await cv;
  else if (!cv.Mat) await new Promise<void>((r) => (cv.onRuntimeInitialized = r));
  return cv as OpenCvTestas;
}

const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

(async () => {
  const args = process.argv.slice(2);
  const detalle = args.includes("--detalle");
  const tocar = args.includes("--tocar");
  const grupos = new Map<string, Grupo>();
  let semilla = 12345;
  const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);
  const jpgs = args
    .filter((a) => !a.startsWith("--"))
    .flatMap((a) => (fs.statSync(a).isDirectory() ? fs.readdirSync(a).filter((f) => /^escena-.*\.jpg$/.test(f)).map((f) => path.join(a, f)) : [a]))
    .sort((p, q) => p.localeCompare(q, "es", { numeric: true }));
  const cv = await cargarCv();
  const det = crearDetectorHojas(cv);
  const resumen: Record<string, unknown>[] = [];
  const errCon: number[] = [];
  const errSin: number[] = [];
  let total = 0;
  let falsasTot = 0;
  /* Por carga: la cara medida y, por testa, qué troza de la verdad es. */
  const cargas = new Map<string, { atras?: { cara: CaraMedida; troza: Map<string, number> }; adelante?: { cara: CaraMedida; troza: Map<string, number> } }>();
  for (const jpg of jpgs) {
    const verdad = JSON.parse(fs.readFileSync(jpg.replace(/\.jpg$/, ".json"), "utf8")).trozas as Verdad[];
    const { data, info } = await sharp(jpg).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    const gris = new cv.Mat(info.height, info.width, cv.CV_8UC1);
    gris.data.set(data);
    const esAdelante = /-adelante\.jpg$/.test(jpg);
    const r = medirCara(cv, gris, det, esAdelante ? "adelante" : "atras");
    gris.delete();
    if (!r.ok) {
      console.log(jpg, "SIN HOJA", r.otrosIds);
      continue;
    }
    const { cara, marco } = r;
    const usados = new Set<number>();
    const filas: string[] = [];
    const errs: number[] = [];
    const troza = new Map<string, number>();
    verdad.forEach((v, i) => {
      let bi = -1;
      let bd = 1e9;
      cara.testas.forEach((t, j) => {
        const x = t.cx * marco.mmPorPx + marco.origenMm[0];
        const y = t.cy * marco.mmPorPx + marco.origenMm[1];
        const d = Math.hypot(x - v.x, y - v.y);
        if (d < bd && !usados.has(j)) {
          bd = d;
          bi = j;
        }
      });
      if (bi >= 0 && bd < 0.4 * v.aMm) {
        usados.add(bi);
        const t = cara.testas[bi]!;
        troza.set(t.id, v.n ?? i);
        const e = Math.round((t.dCm - v.dCm) * 10) / 10;
        errs.push(e);
        (v.cortezaMm ? errCon : errSin).push(e);
        filas.push(`${t.id}: ${t.dCm} vs ${v.dCm}${v.cortezaMm ? "" : " (sin corteza)"} (${e >= 0 ? "+" : ""}${e})`);
      } else filas.push(`troza ${i}: NO VISTA (${v.dCm})`);
    });
    if (tocar) {
      /* El radio con el que se busca: el de las otras (como `use-cara-por-foto`), o el medio del rango. */
      const radios = cara.testas.map((t) => (t.aPx + t.bPx) / 2).sort((p, q) => p - q);
      const rb = radiosBuscados(marco.mmPorPx);
      const rRef = radios[Math.floor(radios.length / 2)] ?? (rb.min + rb.max) / 2;
      const vistaPorAuto = new Set([...troza.values()]);
      verdad.forEach((v, i) => {
        const [tx, ty] = v.toque ?? [v.x, v.y];
        const ang = azar() * 2 * Math.PI;
        const dr = 0.25 * v.aMm * Math.sqrt(azar());
        const x = (tx + dr * Math.cos(ang) - marco.origenMm[0]) / marco.mmPorPx;
        const y = (ty + dr * Math.sin(ang) - marco.origenMm[1]) / marco.mmPorPx;
        const t0 = performance.now();
        const t = testaEn(cv, r.suave, x, y, rRef, marco.mmPorPx, `m${i}`);
        const ms = performance.now() - t0;
        const bien =
          t != null && Math.hypot(t.cx * marco.mmPorPx + marco.origenMm[0] - v.x, t.cy * marco.mmPorPx + marco.origenMm[1] - v.y) < 0.4 * v.aMm;
        const auto = vistaPorAuto.has(v.n ?? i);
        for (const clave of v.dif?.length ? v.dif : ["ninguna"]) {
          const g = grupos.get(clave) ?? { n: 0, auto: 0, toque: 0, errToque: [], autoOToque: 0, ms: [] };
          g.n++;
          g.ms.push(ms);
          if (auto) g.auto++;
          if (bien) {
            g.toque++;
            g.errToque.push(Math.round((t.dCm - v.dCm) * 10) / 10);
          }
          if (auto || bien) g.autoOToque++;
          grupos.set(clave, g);
        }
        if (detalle && !(bien && Math.abs(t.dCm - v.dCm) <= 2))
          console.log(`  toque ${path.basename(jpg)} troza ${v.n ?? i} [${v.dif?.join(",") || "-"}]: ${t ? `${t.dCm} vs ${v.dCm}${bien ? "" : " (otra)"}` : "nada"}`);
      });
    }
    total += verdad.length;
    falsasTot += cara.testas.length - errs.length;
    const abs = errs.map(Math.abs);
    const nombre = path.basename(jpg);
    const clave = nombre.replace(/^escena-(\d+)-.*$/, "$1");
    const c = cargas.get(clave) ?? {};
    c[esAdelante ? "adelante" : "atras"] = { cara, troza };
    cargas.set(clave, c);
    resumen.push({ escena: nombre, trozas: verdad.length, vistas: errs.length, falsas: cara.testas.length - errs.length, errAbsMedio: r2(media(abs)), sesgo: r2(media(errs)), max: Math.max(...abs), hojaPx: cara.ladoHojaPx.join("/"), ms: r.ms });
    if (detalle) console.log(nombre, "→", filas.join(" · "));
    r.enderezada.delete();
    r.suave.delete();
  }
  console.table(resumen);
  const todos = [...errCon, ...errSin];
  const fila = (nombre: string, e: number[]) => ({ grupo: nombre, trozas: e.length, errAbsMedio: r2(media(e.map(Math.abs))), sesgo: r2(media(e)), peor: Math.max(0, ...e.map(Math.abs)) });
  console.log(`Vistas ${todos.length}/${total} · falsas ${falsasTot}`);
  console.table([fila("con corteza", errCon), fila("sin corteza", errSin), fila("todas", todos)]);

  if (tocar) {
    const pct = (a: number, n: number) => `${((100 * a) / (n || 1)).toFixed(1)} %`;
    const filaG = (nombre: string, g: Grupo) => {
      const abs = g.errToque.map(Math.abs);
      return {
        dificultad: nombre,
        trozas: g.n,
        "vio la foto": pct(g.auto, g.n),
        "recorta el toque": pct(g.toque, g.n),
        "err medio toque": r2(media(abs)),
        sesgo: r2(media(g.errToque)),
        peor: Math.max(0, ...abs),
        "≤2 cm": pct(abs.filter((e) => e <= 2).length, g.n),
        "auto o toque": pct(g.autoOToque, g.n),
        "ms/toque": Math.round(media(g.ms)),
      };
    };
    const todas = [...grupos.values()].reduce<Grupo>(
      (a, g) => ({ n: a.n + g.n, auto: a.auto + g.auto, toque: a.toque + g.toque, errToque: [...a.errToque, ...g.errToque], autoOToque: a.autoOToque + g.autoOToque, ms: [...a.ms, ...g.ms] }),
      { n: 0, auto: 0, toque: 0, errToque: [], autoOToque: 0, ms: [] },
    );
    console.table([...[...grupos].sort(([p], [q]) => p.localeCompare(q)).map(([k, g]) => filaG(k, g)), filaG("todas (una troza puede estar en dos)", todas)]);
  }

  /* Emparejado: por carga con las dos caras, sobre las testas que la verdad reconoce en las dos. */
  let bien = 0;
  let comparables = 0;
  let dudosasBien = 0;
  let dudosas = 0;
  let cargasPerfectas = 0;
  let cargasConDos = 0;
  for (const [clave, c] of cargas) {
    if (!c.atras || !c.adelante) continue;
    cargasConDos++;
    const { parejas } = emparejarCaras(c.atras.cara, c.adelante.cara);
    const enAdelante = new Map([...c.adelante.troza].map(([id, n]) => [n, id]));
    let malas = 0;
    for (const p of parejas) {
      const n = c.atras.troza.get(p.atras);
      if (n == null || !enAdelante.has(n)) continue;
      comparables++;
      const ok = p.adelante != null && c.adelante.troza.get(p.adelante) === n;
      if (ok) bien++;
      else malas++;
      if (p.dudosa) {
        dudosas++;
        if (ok) dudosasBien++;
      }
      if (!ok && detalle) console.log(`carga ${clave}: ${p.atras} (troza ${n}) ↔ ${p.adelante ?? "nada"} — debía ${enAdelante.get(n)}${p.dudosa ? " [dudosa]" : ""}`);
    }
    if (malas === 0) cargasPerfectas++;
  }
  if (cargasConDos) {
    console.log(
      `Emparejado: ${bien}/${comparables} bien (${((100 * bien) / (comparables || 1)).toFixed(1)} %) · cargas sin un error ${cargasPerfectas}/${cargasConDos} · marcadas dudosas ${dudosas} (de ellas bien ${dudosasBien})`,
    );
  }
})().catch((e) => {
  console.error("FALLO", e);
  process.exit(1);
});
