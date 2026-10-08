import { createClient } from '@supabase/supabase-js';

// Configuração para Vite: as variáveis têm de começar com VITE_
// e estão definidas em .env (ver .env.example na raiz).
// No Vercel: Project Settings → Environment Variables.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.error(
    'Supabase não configurado: define VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ficheiro .env (local) ou nas Environment Variables do Vercel.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
