"use client";

import { useState, useCallback } from "react";

const STORAGE_KEY = "bodega_onboarding_done";

export function useOnboarding() {
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 8;

  const isFirstVisit = typeof window !== "undefined"
    ? !localStorage.getItem(STORAGE_KEY)
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
