import { VocabularyProvider } from "@/contexts/vocabulary-context";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <VocabularyProvider>{children}</VocabularyProvider>;
}
