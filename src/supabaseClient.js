import { createClient } from '@supabase/supabase-js';

// Configuração para Vite: as variáveis têm de começar com VITE_
// e estão definidas em .env (ver .env.example na raiz).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase não configurado: define VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ficheiro .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
