#!/usr/bin/env node
/**
 * motion — duraciones y curvas literales → tokens del ADR-071 (contrato de
 * diseño, ADR-489).
 *
 * - framer (archivos que importan framer-motion, motion/react o el `m` de
 *   @/components/admin/providers, o que dibujan `<m.*>`):
 *   `duration: 0.2` → `duration: DURATION.base` con los mismos cortes que el
 *   ADR-071 usa para Tailwind (≤ 0,09 micro · ≤ 0,175 fast · ≤ 0,35 base ·
 *   ≤ 0,55 slow · ≤ 1 slower); más de 1 s queda «a revisar» (un pulso, una
 *   cuenta regresiva). `ease: [0.22, 1, 0.36, 1]` → `EASE.editorial` (y las
 *   otras curvas de motion.ts); una curva desconocida, «a revisar».
 * - Tailwind: `duration-150` → `duration-[var(--dur-fast)]` con la tabla del
 *   ADR-071 (75 micro · 100/150 fast · 200/300 base · 400/500 slow · 700/1000
 *   slower) y `duration-[180ms]` por los mismos cortes.
 * - `transition-all` NO: va a mano (hay que elegir qué propiedad anima).
 * - Un archivo de framer sin "use client" (o con su propio DURATION/EASE) deja las
 *   cifras de framer «a revisar»: motion.ts es de cliente y en el servidor leer
 *   `DURATION.fast` da error 500.
 *
 *   node scripts/codemods/motion.mjs --seco [--carpeta components/admin/pos] [--muestra 3]
 */
import { asegurarImport, correr, esDeCliente, esPrincipal, nombreOcupado } from "./_comun.mjs";

const MODULO = "@/components/ui-system/motion";

const CURVAS = {
  "0.22,1,0.36,1": "editorial",
  "0.4,0,0.1,1": "snap",
  "0.4,0,0.2,1": "soft",
  "0.16,1,0.3,1": "entrance",
  "0.7,0,0.84,0": "exit",
  "0.34,1.56,0.64,1": "bounce",
};

/** Segundos → clave de DURATION (null = a revisar). */
export function claveDuracion(seg) {
  if (seg <= 0.09) return "micro";
  if (seg <= 0.175) return "fast";
  if (seg <= 0.35) return "base";
  if (seg <= 0.55) return "slow";
  if (seg <= 1) return "slower";
  return null;
}

const TAILWIND = { 50: "micro", 75: "micro", 100: "fast", 150: "fast", 200: "base", 300: "base", 400: "slow", 500: "slow", 700: "slower", 1000: "slower" };

export function transformar(texto) {
  let cambios = 0;
  let revisar = 0;
  const ejemplos = [];
  const usados = new Set();
  let nuevo = texto;

  /* framer llega directo o por el reexport del panel (`m` de @/components/admin/providers). */
  const usaFramer =
    /from\s+["'](?:framer-motion|motion\/react|@\/components\/admin\/providers)["']/.test(texto) || /<(?:m|motion)\.\w+/.test(texto);
  if (usaFramer) {
    const ejemplosAntes = ejemplos.length;
    nuevo = nuevo.replace(/\bduration:\s*(\d*\.?\d+)\b/g, (todo, num) => {
      const seg = Number(num);
      if (seg >= 3) return todo; // milisegundos de un toast u otra cosa: no es framer
      const k = claveDuracion(seg);
      if (!k) {
        revisar++;
        return todo;
      }
      cambios++;
      usados.add("DURATION");
      if (ejemplos.length < 2) ejemplos.push([todo, `duration: DURATION.${k}`]);
      return `duration: DURATION.${k}`;
    });
    nuevo = nuevo.replace(/\bease:\s*\[([^\]]*)\]/g, (todo, lista) => {
      const k = CURVAS[lista.replace(/\s+/g, "")];
      if (!k) {
        revisar++;
        return todo;
      }
      cambios++;
      usados.add("EASE");
      if (ejemplos.length < 3) ejemplos.push([todo, `ease: EASE.${k}`]);
      return `ease: EASE.${k}`;
    });
    /* DURATION y EASE son objetos de motion.ts, que es "use client": leerlos en un
       archivo que corre en el servidor da error 500. Sin "use client" en el archivo
       (o con un DURATION/EASE propio), las cifras de framer quedan «a revisar»; las
       clases de Tailwind de abajo se cambian igual (son texto, no importan nada). */
    if (cambios && (!esDeCliente(texto) || [...usados].some((n) => nombreOcupado(texto, n, MODULO)))) {
      nuevo = texto;
      revisar += cambios;
      cambios = 0;
      usados.clear();
      ejemplos.length = ejemplosAntes;
    }
  }

  nuevo = nuevo.replace(/(?<![\w:-])duration-(\d+)(?![\w-])/g, (todo, ms) => {
    const k = TAILWIND[ms];
    if (!k) {
      revisar++;
      return todo;
    }
    cambios++;
    if (ejemplos.length < 3) ejemplos.push([todo, `duration-[var(--dur-${k})]`]);
    return `duration-[var(--dur-${k})]`;
  });
  nuevo = nuevo.replace(/(?<![\w:-])duration-\[(\d+)ms\]/g, (todo, ms) => {
    const k = claveDuracion(Number(ms) / 1000);
    if (!k) {
      revisar++;
      return todo;
    }
    cambios++;
    return `duration-[var(--dur-${k})]`;
  });

  for (const nombre of usados) nuevo = asegurarImport(nuevo, nombre, MODULO);
  return { texto: cambios ? nuevo : texto, cambios, revisar, ejemplos };
}

if (esPrincipal(import.meta.url)) {
  process.exit(correr({ nombre: "motion", que: "duraciones/curvas literales → DURATION/EASE y duration-[var(--dur-*)]", transformar }));
}
