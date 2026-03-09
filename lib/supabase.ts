import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Supabase client — para Storage, Auth y funciones edge de Supabase.
 * Para queries de base de datos usa Prisma (lib/prisma.ts).
 */
export const supabase = createClient(supabaseUrl, supabaseKey);
