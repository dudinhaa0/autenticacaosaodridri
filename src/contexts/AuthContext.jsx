import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Erro ao recuperar sessão:', error.message);
      if (alive) {
        setSession(data?.session ?? null);
        setLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  async function signInGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error };
  }
  async function signInEmail(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }
  async function signUpEmail(fullName, email, password) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    return { error };
  }
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Erro ao sair:', error.message);
  }

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signInGoogle, signInEmail, signUpEmail, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
