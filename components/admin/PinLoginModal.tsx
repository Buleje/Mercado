"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PinLoginModalProps {
  onSuccess: () => void;
  onClose?: () => void;
  title?: string;
}

interface LockState {
  attempts: number;
  lockedUntil: number | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const LS_KEY = "pin_lock_state";
const MAX_ATTEMPTS = 3;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const PIN_LENGTH = 4;

const NUM_PAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getLockState(): LockState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { attempts: 0, lockedUntil: null };
    return JSON.parse(raw) as LockState;
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

function saveLockState(state: LockState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable
  }
}

function clearLockState() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

function fmtSeconds(ms: number) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PinLoginModal({ onSuccess, onClose, title = "Ingresa tu PIN" }: PinLoginModalProps) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Init: check existing lock ────────────────────────────────────────────────
  useEffect(() => {
    const state = getLockState();
    if (state.lockedUntil) {
      const remaining = state.lockedUntil - Date.now();
      if (remaining > 0) {
        setRemainingMs(remaining);
        setAttemptsLeft(0);
      } else {
        clearLockState();
      }
    } else {
      setAttemptsLeft(MAX_ATTEMPTS - state.attempts);
    }
  }, []);

  // ── Countdown timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (remainingMs <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          clearLockState();
          setAttemptsLeft(MAX_ATTEMPTS);
          setErrorMsg("");
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [remainingMs]);

  // ── Auto-focus first input ───────────────────────────────────────────────────
  useEffect(() => {
    if (remainingMs <= 0) {
      inputRefs.current[0]?.focus();
    }
  }, [remainingMs]);

  // ── Trigger shake animation ──────────────────────────────────────────────────
  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }, []);

  // ── Handle digit input ───────────────────────────────────────────────────────
  const handleDigitInput = useCallback(
    (index: number, value: string) => {
      if (remainingMs > 0) return;
      const char = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = char;
      setDigits(next);
      setErrorMsg("");

      if (char && index < PIN_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits, remainingMs]
  );

  // ── Handle keydown for backspace navigation ──────────────────────────────────
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  // ── Numpad press ─────────────────────────────────────────────────────────────
  const handleNumPad = useCallback(
    (key: string) => {
      if (remainingMs > 0) return;
      if (key === "⌫") {
        const lastFilled = digits.map((d, i) => (d ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
        if (lastFilled >= 0) {
          const next = [...digits];
          next[lastFilled] = "";
          setDigits(next);
          inputRefs.current[lastFilled]?.focus();
        }
        return;
      }
      if (key === "") return;
      const firstEmpty = digits.findIndex((d) => !d);
      if (firstEmpty === -1) return;
      handleDigitInput(firstEmpty, key);
    },
    [digits, remainingMs, handleDigitInput]
  );

  // ── Submit PIN ───────────────────────────────────────────────────────────────
  const submitPin = useCallback(async () => {
    const pin = digits.join("");
    if (pin.length !== PIN_LENGTH || loading) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        clearLockState();
        onSuccess();
        return;
      }

      // Failed attempt
      const state = getLockState();
      const newAttempts = state.attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCK_DURATION_MS;
        saveLockState({ attempts: newAttempts, lockedUntil });
        setRemainingMs(LOCK_DURATION_MS);
        setAttemptsLeft(0);
        setErrorMsg("Demasiados intentos. Bloqueado por 5 minutos.");
      } else {
        saveLockState({ attempts: newAttempts, lockedUntil: null });
        setAttemptsLeft(MAX_ATTEMPTS - newAttempts);
        setErrorMsg(`PIN incorrecto. ${MAX_ATTEMPTS - newAttempts} intento${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""} restante${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""}.`);
      }

      triggerShake();
      setDigits(["", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setErrorMsg("Error de conexion. Intenta de nuevo.");
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [digits, loading, onSuccess, triggerShake]);

  // ── Auto-submit when all digits filled ──────────────────────────────────────
  useEffect(() => {
    if (digits.every((d) => d !== "") && digits.length === PIN_LENGTH) {
      submitPin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const isLocked = remainingMs > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={cn(
          "relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-8",
          shake && "animate-shake"
        )}
        style={
          shake
            ? {
                animation: "shake 0.5s cubic-bezier(.36,.07,.19,.97) both",
              }
            : undefined
        }
      >
        {/* Shake keyframes injected via style tag */}
        <style>{`
          @keyframes shake {
            10%, 90% { transform: translateX(-2px); }
            20%, 80% { transform: translateX(4px); }
            30%, 50%, 70% { transform: translateX(-6px); }
            40%, 60% { transform: translateX(6px); }
          }
        `}</style>

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        )}

        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-full bg-[#00B4A6]/10 flex items-center justify-center">
            <Lock size={26} className="text-[#00B4A6]" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">{title}</h2>
        </div>

        {/* Locked state */}
        {isLocked ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertTriangle size={32} className="text-red-500" />
            <p className="text-red-600 dark:text-red-400 font-medium text-center">Cuenta bloqueada temporalmente</p>
            <div className="text-3xl font-mono font-bold text-gray-800 dark:text-gray-200">
              {fmtSeconds(remainingMs)}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Podras intentar de nuevo cuando el tiempo expire
            </p>
          </div>
        ) : (
          <>
            {/* PIN dots / inputs */}
            <div className="flex justify-center gap-3 mb-2">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitInput(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={loading}
                  className={cn(
                    "w-14 h-14 rounded-xl border-2 text-center text-2xl font-bold outline-none transition-all duration-150",
                    "bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white",
                    digit
                      ? "border-[#00B4A6] bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10"
                      : "border-gray-300 dark:border-gray-600",
                    "focus:border-[#00B4A6] focus:ring-2 focus:ring-[#00B4A6]/20",
                    "disabled:opacity-60"
                  )}
                />
              ))}
            </div>

            {/* Attempts left indicator */}
            {attemptsLeft < MAX_ATTEMPTS && attemptsLeft > 0 && (
              <div className="flex justify-center gap-1 mb-1">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-full",
                      i < attemptsLeft ? "bg-amber-400" : "bg-gray-200 dark:bg-gray-700"
                    )}
                  />
                ))}
              </div>
            )}

            {/* Error message */}
            {errorMsg && (
              <p className="text-center text-sm text-red-500 dark:text-red-400 mt-2 mb-0">{errorMsg}</p>
            )}

            {/* Numeric keypad */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {NUM_PAD.flat().map((key, idx) => (
                <button
                  key={idx}
                  onClick={() => handleNumPad(key)}
                  disabled={loading || key === ""}
                  className={cn(
                    "h-14 rounded-xl text-lg font-semibold transition-all duration-100 select-none",
                    key === ""
                      ? "invisible"
                      : key === "⌫"
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-[#00B4A6]/10 hover:text-[#00B4A6] dark:hover:bg-[#00B4A6]/20 active:scale-95",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Submit button */}
            <button
              onClick={submitPin}
              disabled={digits.some((d) => !d) || loading}
              className={cn(
                "mt-4 w-full h-12 rounded-xl font-semibold text-white transition-all duration-150",
                "bg-[#00B4A6] hover:bg-[#235c42] active:scale-[0.98]",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {loading ? "Verificando..." : "Confirmar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
