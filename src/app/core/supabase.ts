import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

// lido antes do createClient, que limpa o hash do link de redefinição de senha
export const linkRecuperacao = /type=recovery/.test(location.hash);

export const supabase = createClient(environment.supabaseUrl || 'http://localhost', environment.supabaseKey || 'x', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Lança o erro do Supabase ou devolve os dados */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}
