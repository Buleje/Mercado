import type { ReactNode } from "react";
import MotionProvider from "@/components/MotionProvider";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
