"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const AIAssistant = dynamic(() => import("@/components/admin/AIAssistant"), { ssr: false });

interface Props {
  moduleContext?: string;
}

export default function AIFloatingButton({ moduleContext }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg",
          "flex items-center justify-center transition-all duration-200",
          "bg-[#2d6a4f] hover:bg-[#245a42] text-white hover:scale-105",
          open && "rotate-90"
        )}
        aria-label={open ? "Cerrar asistente" : "Abrir asistente IA"}
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Chat popup */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[400px] h-[520px] rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border overflow-hidden bg-white dark:bg-card"
          >
            <AIAssistant embedded moduleContext={moduleContext} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
