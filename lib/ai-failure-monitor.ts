import "server-only";

/**
 * lib/ai-failure-monitor.ts
 *
 * Monitors AI API failures and triggers alerts when too many happen.
 * Like a smoke detector — if the AI keeps failing, someone needs to know.
 *
 * Tracks failures in a rolling time window. When failures exceed threshold,
 * logs a critical alert and sets a flag visible in the health dashboard.
 */

import { logger } from "@/lib/logger";

// ── Config ────────────────────────────────────────────────────────────────────

/** Time window to track failures (5 minutes) */
const WINDOW_MS = 5 * 60 * 1000;

/** Number of failures in the window that triggers an alert */
const FAILURE_THRESHOLD = 5;

/** Cooldown between alerts (don't spam — 15 minutes) */
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

// ── In-memory state ───────────────────────────────────────────────────────────

interface FailureEntry {
  timestamp: number;
  label: string;
  error: string;
}

const recentFailures: FailureEntry[] = [];
let lastAlertTimestamp = 0;
let alertActive = false;
let totalFailuresSinceStart = 0;
let totalSuccessesSinceStart = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a failed AI API call. Triggers alert if threshold exceeded.
 */
export function recordAIFailure(label: string, error: string): void {
  const now = Date.now();
  totalFailuresSinceStart++;

  // Add to rolling window
  recentFailures.push({ timestamp: now, label, error });

  // Prune old entries
  pruneOldEntries(now);

  // Check threshold
  if (recentFailures.length >= FAILURE_THRESHOLD) {
    if (now - lastAlertTimestamp > ALERT_COOLDOWN_MS) {
      alertActive = true;
      lastAlertTimestamp = now;

      logger.error("[AI-ALERT] 🚨 Múltiples fallos de IA detectados", {
        failuresInWindow: recentFailures.length,
        threshold: FAILURE_THRESHOLD,
        windowMinutes: WINDOW_MS / 60000,
        recentErrors: recentFailures.slice(-3).map((f) => ({
          label: f.label,
          error: f.error.slice(0, 100),
        })),
      });
    }
  }
}

/**
 * Record a successful AI API call. Clears alert if enough successes.
 */
export function recordAISuccess(label: string): void {
  totalSuccessesSinceStart++;

  // If we were in alert state, check if things recovered
  if (alertActive) {
    const now = Date.now();
    pruneOldEntries(now);

    // If failures dropped below threshold, clear alert
    if (recentFailures.length < FAILURE_THRESHOLD / 2) {
      alertActive = false;
      logger.info("[AI-ALERT] ✅ Sistema de IA recuperado", {
        label,
        remainingFailures: recentFailures.length,
      });
    }
  }
}

/**
 * Get current alert status (used by health dashboard).
 */
export function getAIAlertStatus() {
  pruneOldEntries(Date.now());

  return {
    alertActive,
    recentFailureCount: recentFailures.length,
    threshold: FAILURE_THRESHOLD,
    windowMinutes: WINDOW_MS / 60000,
    totalFailures: totalFailuresSinceStart,
    totalSuccesses: totalSuccessesSinceStart,
    successRate:
      totalSuccessesSinceStart + totalFailuresSinceStart > 0
        ? Math.round(
            (totalSuccessesSinceStart /
              (totalSuccessesSinceStart + totalFailuresSinceStart)) *
              100,
          )
        : 100,
    lastAlertAt: lastAlertTimestamp > 0 ? new Date(lastAlertTimestamp).toISOString() : null,
    recentErrors: recentFailures.slice(-3).map((f) => ({
      label: f.label,
      error: f.error.slice(0, 100),
      ago: `${Math.round((Date.now() - f.timestamp) / 1000)}s ago`,
    })),
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function pruneOldEntries(now: number): void {
  const cutoff = now - WINDOW_MS;
  while (recentFailures.length > 0 && recentFailures[0].timestamp < cutoff) {
    recentFailures.shift();
  }
}
