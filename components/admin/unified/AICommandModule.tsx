"use client";

import dynamic from "next/dynamic";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const ComandosIA = dynamic(() => import("@/components/admin/comandos-ia/ComandosIA"), { loading: S });

/*
 * Comandos IA (Brandon 2026-10-09): lo que la IA hace por ti. Sin
 * AdminModuleHeader propio: el hub «Asistente IA» ya pone el título y la
 * pestaña «Comandos IA» dice dónde estás.
 */
export default function AICommandModule() {
  return <ComandosIA />;
}
