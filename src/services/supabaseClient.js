import { createClient } from '@supabase/supabase-js';

// Resgatando as variáveis injetadas em tempo de execução pelo Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabaseClient] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não estão definidas. ' +
    'Confira se o arquivo .env.local existe na raiz do projeto e se o servidor (npm run dev) foi reiniciado após criá-lo.'
  );
}

// Instanciando e exportando o cliente de dados
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
