/**
 * Structured Logger
 *
 * In production: emits JSON lines to stdout (compatible with Vercel log drains,
 * Datadog, Loki, Papertrail, etc.)
 * In development: pretty-prints with colours and a compact format.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Order created", { orderId, tenantId });
 *   logger.error("DB failed", { err, requestId });
 *
 * In route handlers the x-request-id header is available via:
 *   const requestId = req.headers.get("x-request-id") ?? undefined;
 *   logger.info("...", { requestId });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? (IS_PRODUCTION ? "info" : "debug");

// ── Colour codes for pretty dev output ───────────────────────────────────────

const COLOURS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info:  "\x1b[32m", // green
  warn:  "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

// ── Core emit ─────────────────────────────────────────────────────────────────

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

  const ts = new Date().toISOString();

  if (IS_PRODUCTION) {
    // Structured JSON — one line per log entry
    const entry: Record<string, unknown> = {
      level,
      timestamp: ts,
      message,
      ...context,
    };
    const output = JSON.stringify(entry);
    if (level === "error") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  } else {
    // Human-friendly dev output
    const colour = COLOURS[level];
    const prefix = `${colour}[${level.toUpperCase()}]${RESET} ${ts}`;
    const extra = context && Object.keys(context).length > 0
      ? " " + JSON.stringify(context, null, 0)
      : "";
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`${prefix} ${message}${extra}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    emit("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>): void {
    emit("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    emit("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    emit("error", message, context);
  },
};
