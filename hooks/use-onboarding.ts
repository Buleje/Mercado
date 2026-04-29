"use client";

import { useState, useCallback } from "react";

const STORAGE_KEY = "bodega_onboarding_done";

export function useOnboarding() {
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 8;

  // 2026-04-28: Bypass tour para QA admin (Brandon usa qaadmin para demos).
  // El tour de 8 pasos bloqueaba la interacción durante walkthroughs.
  // Detectamos por session cookie del backend O cookie qaadmin-flag.
  const isQAAdmin = typeof document !== "undefined"
    ? /(?:^|;\s*)bsm-qa-admin=1\b/.test(document.cookie) ||
      /(?:^|;\s*)admin-username=qaadmin\b/.test(document.cookie)
    : false;

  // SuperAdmin impersonating a tenant is never treated as a first-time visitor
  // QA admin tampoco — para no romper demos / walkthroughs.
  const isFirstVisit = typeof window !== "undefined"
    ? !localStorage.getItem(STORAGE_KEY) &&
      !localStorage.getItem("superadmin-impersonate-tenant") &&
      !isQAAdmin
    : false;

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsTourActive(true);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= totalSteps - 1) return prev;
      return prev + 1;
    });
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const markDone = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
  }, []);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    setCurrentStep(0);
    markDone();
  }, [markDone]);

  const completeTour = useCallback(() => {
    setIsTourActive(false);
    setCurrentStep(0);
    markDone();
  }, [markDone]);

  const resetTour = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setCurrentStep(0);
    setIsTourActive(true);
  }, []);

  return {
    isFirstVisit,
    isTourActive,
    currentStep,
    totalSteps,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
    resetTour,
  };
}
