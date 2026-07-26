"use client";

/**
 * Piezas SVG del radar de cadena de custodia: nodo, arista y las fichas de
 * resumen. Viven acá para que `CtpTrazaRadar` quede con la lógica y no con 200
 * líneas de dibujo.
 *
 * La novedad frente a la primera versión: cada nodo muestra su BALANCE (cuánto
 * de lo declarado tiene respaldo) y cada arista tiene el grosor del volumen que
 * la atraviesa. Antes la cadena se veía "conectada o no"; ahora se ve *cuánto*
 * fluye por cada eslabón, que es lo que se audita.
 */

import { AlertTriangle, Boxes, CheckCircle2 } from "@buleje/design-system/icons";
import type { RadarBalance, RadarEstado } from "@/lib/forestal/ctp-radar";

export const NODE_W = 196;
export const NODE_H = 62;
export const GAP_Y = 14;
export const COL_GAP = 104; // espacio para las líneas entre columnas
export const PAD = 12;

export type NodeKind = "ingreso" | "corrida" | "despacho";

export interface Placed {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  top: string;
  sub: string;
  vol: string;
  cites?: boolean;
  status: RadarEstado;
  bal?: RadarBalance;
  /** Presente sólo si el nodo representa un grupo colapsado de N líneas. */
  grupo?: { cuenta: number };
}

export const KIND_ACCENT: Record<NodeKind, string> = {
  ingreso: "var(--accent)",
  corrida: "var(--data-info-500)",
  despacho: "var(--data-success-600)",
};

/**
 * Color de la barra de atribución. En un INGRESO, lo no consumido es stock en
 * patio (neutro); en un DESPACHO, lo no atribuido es un faltante de origen
 * (ámbar). Pintarlos igual haría ver un problema donde no lo hay, y al revés.
 */
function barColor(kind: NodeKind, bal: RadarBalance): string {
  // Un nodo con hueco va en ámbar aunque su volumen cuadre: el despacho que
  // sale de una corrida sin materia prima tiene el 100% atribuido y ASÍ Y TODO
  // no traza hasta la GTF. Pintarlo verde al lado del "!" se contradice.
  if (bal.estado === "warn") return "var(--data-warning-500)";
  if (kind === "despacho") return bal.sinAtribuir > 0 ? "var(--data-warning-500)" : "var(--data-success-500)";
  return KIND_ACCENT[kind];
}

export function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Volumen legible sin ceros de más (10 m³, no 10.0000 m³). */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function Edge({
  a, b, on, dim, amber, label, flow, width = 2,
}: {
  a?: Placed; b?: Placed; on: boolean; dim: boolean; amber: boolean; label?: string; flow?: boolean; width?: number;
}) {
  if (!a || !b) return null;
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const color = amber ? "var(--data-warning-500)" : on ? "var(--brand-ink)" : "var(--rule-base)";
  // El path termina 7px antes del nodo para dejar lugar a la punta de flecha.
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 7} ${y2}`;
  const w = on ? width : Math.max(1, width * 0.7);
  return (
    <g opacity={dim ? 0.12 : on ? 0.7 : 0.32}>
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={amber ? "5 4" : undefined} strokeLinecap="round" />
      {/* Flujo animado: puntos que corren por la cadena activa (marca la dirección). */}
      {flow && <path d={d} fill="none" stroke={color} strokeWidth={w + 0.5} strokeDasharray="0.5 9" strokeLinecap="round" className="ctp-edge-flow" />}
      {/* Punta de flecha ingreso→corrida→despacho. */}
      <path d={`M ${x2} ${y2} L ${x2 - 8} ${y2 - 4.5} L ${x2 - 8} ${y2 + 4.5} Z`} fill={color} />
      {/* Volumen/cantidad atribuido a ESTE link (lo que fluyó por el eslabón). */}
      {label && !dim && (
        <g transform={`translate(${mx} ${my})`}>
          <rect x={-23} y={-8} width={46} height={15} rx={7.5} fill="var(--surface-raised)" stroke={color} strokeWidth={0.75} />
          <text x={0} y={2.5} fontSize={8} fontWeight={700} textAnchor="middle" fill={amber ? "var(--data-warning-700)" : on ? "var(--text-primary)" : "var(--text-tertiary)"}>{label}</text>
        </g>
      )}
    </g>
  );
}

export function Node({
  n, dim, pinned, match, onHover, onPin,
}: {
  n: Placed; dim: boolean; pinned: boolean; match: boolean; onHover: (id: string | null) => void; onPin: (id: string) => void;
}) {
  const warn = n.status === "warn";
  const parcial = n.status === "parcial";
  const muted = n.status === "muted";
  const accent = KIND_ACCENT[n.kind];
  const fill = muted ? "var(--surface-sunken)" : "var(--surface-raised)";
  const stroke = match || pinned
    ? "var(--accent)"
    : n.cites ? "var(--data-error-500)"
    : warn ? "var(--data-warning-500)"
    : "var(--rule-base)";

  // Barra de atribución: la parte con respaldo documental sobre el total declarado.
  const bal = n.bal;
  const pct = bal?.pct ?? null;
  const barW = NODE_W - 40;
  const aria = `${n.top} — ${n.sub}${pct != null ? ` — ${pct}% con respaldo` : ""}${warn ? " — hueco en la cadena" : ""}`;

  return (
    <g
      transform={`translate(${n.x} ${n.y})`}
      opacity={dim ? 0.2 : muted ? 0.7 : 1}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(ev) => { ev.stopPropagation(); onPin(n.id); }}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={aria}
    >
      {/* Halo de coincidencia: resalta el nodo que matchea la búsqueda. */}
      {match && <rect x={-3} y={-3} width={NODE_W + 6} height={NODE_H + 6} rx={16} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.45} />}
      {/* Un grupo colapsado se dibuja como una pila: se lee que hay más detrás. */}
      {n.grupo && (
        <>
          <rect x={5} y={-5} width={NODE_W - 10} height={NODE_H} rx={14} fill={fill} stroke={stroke} strokeWidth={1} opacity={0.45} />
          <rect x={2.5} y={-2.5} width={NODE_W - 5} height={NODE_H} rx={14} fill={fill} stroke={stroke} strokeWidth={1} opacity={0.7} />
        </>
      )}
      <rect width={NODE_W} height={NODE_H} rx={14} fill={fill} stroke={stroke} strokeWidth={match || pinned ? 2.5 : warn ? 2 : 1.5} strokeDasharray={n.grupo ? "7 3" : undefined} filter={dim ? undefined : "url(#ctp-node-shadow)"} />
      {/* Tinte de alerta ENCIMA de la base opaca: el token `-50` es claro en los
          dos temas y, con el título en --text-primary, en oscuro el nombre del
          nodo desaparecía. Un 12% del -500 tiñe sin tapar el texto. */}
      {warn && <rect width={NODE_W} height={NODE_H} rx={14} fill="var(--data-warning-500)" opacity={0.12} pointerEvents="none" />}
      {/* pill de acento por columna (inset, no borde a sangre) */}
      <rect x={9} y={11} width={3.5} height={NODE_H - 30} rx={1.75} fill={accent} />
      <text x={20} y={20} fontSize={11} fontWeight={700} fill="var(--text-primary)">{trunc(n.top, 22)}</text>
      <text x={20} y={33} fontSize={9.5} fill="var(--text-tertiary)">{trunc(n.sub, 25)}</text>
      {n.vol && <text x={20} y={44} fontSize={8.5} fontWeight={700} fill={accent}>{trunc(n.vol, 26)}</text>}

      {/* Barra: cuánto de lo declarado tiene respaldo. Sin total declarado no se
          dibuja nada — una barra vacía se leería como "0% trazado", que es falso. */}
      {pct != null && bal && (
        <>
          <rect x={20} y={NODE_H - 12} width={barW} height={4} rx={2} fill="var(--surface-sunken)" />
          {/* En 0% no se dibuja relleno: un mínimo de 2px se lee como "algo hay". */}
          {pct > 0 && <rect x={20} y={NODE_H - 12} width={Math.max(2, (barW * pct) / 100)} height={4} rx={2} fill={barColor(n.kind, bal)} />}
          <text x={20 + barW + 4} y={NODE_H - 8} fontSize={7.5} fontWeight={700} fill="var(--text-tertiary)" textAnchor="start">{pct}%</text>
        </>
      )}

      {/* Cuántas líneas hay dentro del grupo + cómo abrirlo. */}
      {n.grupo && (
        <>
          <rect x={NODE_W - 62} y={NODE_H - 21} width={54} height={14} rx={7} fill="var(--surface-sunken)" />
          <text x={NODE_W - 35} y={NODE_H - 11} fontSize={7.5} fontWeight={800} fill="var(--text-secondary)" textAnchor="middle">
            {n.grupo.cuenta} líneas ▸
          </text>
        </>
      )}

      {/* chip de aviso (hueco) / atribución incompleta */}
      {(warn || parcial) && (
        <>
          <circle cx={NODE_W - 13} cy={13} r={5.5} fill={warn ? "var(--data-warning-500)" : "var(--data-info-500)"} />
          <text x={NODE_W - 13} y={16} fontSize={8} fontWeight={800} fill="#fff" textAnchor="middle">{warn ? "!" : "½"}</text>
        </>
      )}
      {n.cites && (
        <>
          <rect x={NODE_W - 54} y={NODE_H - 20} width={35} height={13} rx={6.5} fill="var(--data-error-500)" opacity={0.16} />
          <text x={NODE_W - 36.5} y={NODE_H - 10.5} fontSize={7.5} fontWeight={800} fill="var(--data-error-500)" textAnchor="middle">CITES</text>
        </>
      )}
    </g>
  );
}

export function SummaryChip({
  icon: Icon, tone, value, label, suffix, onClick, activo, pill,
}: {
  icon: typeof CheckCircle2;
  tone: "success" | "warning" | "danger" | "info";
  value: number | string;
  label: string;
  suffix?: string;
  /** Si se pasa, la ficha filtra el grafo al tocarla. */
  onClick?: () => void;
  activo?: boolean;
  /** Píldora de una línea (h-9) en vez de tarjeta: para barras de estado donde
   *  la altura es cara y las seis cifras tienen que caber juntas. */
  pill?: boolean;
}) {
  const dim = value === 0 || value === "0";
  // Clases LITERALES por tono: Tailwind resuelve en build, así que un
  // `border-[${var}]` armado con template literal no genera ninguna regla.
  const PALETA = {
    success: {
      card: "border-[var(--data-success-500)] bg-linear-to-br from-[var(--data-success-50)] to-[var(--surface-raised)] dark:from-[var(--data-success-500)]/12",
      accent: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
      badge: "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]",
    },
    warning: {
      card: "border-[var(--data-warning-500)] bg-linear-to-br from-[var(--data-warning-50)] to-[var(--surface-raised)] dark:from-[var(--data-warning-500)]/12",
      accent: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
      badge: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
    },
    danger: {
      card: "border-[var(--data-error-500)] bg-linear-to-br from-[var(--data-error-50)] to-[var(--surface-raised)] dark:from-[var(--data-error-500)]/12",
      accent: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
      badge: "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
    },
    info: {
      card: "border-[var(--data-info-500)] bg-linear-to-br from-[var(--data-info-50)] to-[var(--surface-raised)] dark:from-[var(--data-info-500)]/12",
      accent: "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
      badge: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]",
    },
  } as const;
  const p = PALETA[tone];
  const card = dim ? "border-[var(--rule-soft)] bg-[var(--surface-raised)]" : p.card;
  const accent = dim ? "text-[var(--text-tertiary)]" : p.accent;
  const badge = dim ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" : p.badge;

  if (pill) {
    const cls = `inline-flex h-9 items-center gap-2 rounded-full border-2 px-3 text-sm transition ${card} ${activo ? "ring-2 ring-[var(--accent)]" : ""}`;
    const dentro = (
      <>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${accent}`} aria-hidden="true" />
        <b className={`font-mono tabular-nums ${accent}`}>{value}{suffix}</b>
        <span className="whitespace-nowrap text-[var(--text-secondary)]">{label}</span>
      </>
    );
    return onClick
      ? <button type="button" onClick={onClick} aria-pressed={activo} className={`${cls} hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}>{dentro}</button>
      : <span className={cls}>{dentro}</span>;
  }

  const contenido = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${badge}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 text-left">
        <div className={`font-mono text-2xl font-bold tabular-nums leading-none ${accent}`}>
          {value}
          {suffix && <span className="ml-0.5 text-sm font-semibold">{suffix}</span>}
        </div>
        <div className="mt-1 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide leading-tight text-[var(--text-tertiary)]">{label}</div>
      </div>
    </>
  );
  const base = `flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 shadow-[var(--shadow-sm)] ${card} ${activo ? "ring-2 ring-[var(--accent)]" : ""}`;

  if (!onClick) return <div className={base}>{contenido}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={activo} className={`${base} text-left transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}>
      {contenido}
    </button>
  );
}

export function Legend({ swatch, icon: Icon, text }: { swatch: string; icon: typeof Boxes; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch }} aria-hidden="true" />
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}

/** Fila de balance para el panel del nodo fijado. */
export function BalanceLinea({ bal, unidad, kind }: { bal: RadarBalance; unidad: string; kind: NodeKind }) {
  const etiqueta = kind === "ingreso" ? "consumido en producción" : kind === "corrida" ? "ya despachado" : "con origen atribuido";
  const faltante = kind === "ingreso" ? "en patio, sin consumir" : kind === "corrida" ? "en stock" : "SIN ORIGEN";
  const alerta = kind === "despacho" && bal.sinAtribuir > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
        {fmtNum(bal.cubierto)} / {fmtNum(bal.total)} {unidad}
      </span>
      <span className="text-[var(--text-tertiary)]">{etiqueta}</span>
      {bal.sinAtribuir > 0 && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${alerta ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
          {alerta && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
          {fmtNum(bal.sinAtribuir)} {unidad} {faltante}
        </span>
      )}
    </div>
  );
}
