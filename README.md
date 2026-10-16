# Dridri React + Supabase Auth (Google OAuth)

## Rodar localmente
1. Extraia o ZIP e abra a pasta `dridrireact-main` no VS Code.
2. Copie `.env.local.example` para `.env.local`.
3. No `.env.local`, preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os dados do seu próprio projeto Supabase.
4. No terminal, execute `npm install` e depois `npm run dev`.
5. Abra a URL mostrada no terminal (normalmente `http://localhost:5173`).

## Configurar login com Google
1. No Google Cloud Console, crie/selecione um projeto e configure a tela de consentimento OAuth como Externo (conforme as regras da conta da escola).
2. Crie uma credencial OAuth do tipo **Aplicativo da Web**.
3. Em **URIs de redirecionamento autorizados**, adicione a URL de callback exibida em Supabase > Authentication > Providers > Google. Normalmente é `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`.
4. Copie o Client ID e Client Secret para o provedor Google em Supabase > Authentication > Providers.
5. Em Supabase > Authentication > URL Configuration, configure Site URL como `http://localhost:5173` e adicione `http://localhost:5173/**` nas Redirect URLs. Ao publicar o app, adicione também a URL de produção.
6. Reinicie o Vite após alterar `.env.local`.

## O que foi implementado
- Tela responsiva de login/cadastro por e-mail e senha.
- Botão “Continuar com Google” com `signInWithOAuth`.
- React Context API para disponibilizar usuário/sessão globalmente.
- Recuperação de sessão com `getSession()` e escuta via `onAuthStateChange()`.
- Proteção da interface principal/CRUD: sem sessão, o usuário só vê a autenticação.
- Exibição de nome, e-mail e foto do perfil, quando fornecidos pelo Google.
- Logout via `supabase.auth.signOut()`.

## Segurança e validação
- Nunca publique `.env.local`, Client Secret ou qualquer chave privada. O `.env.local` está ignorado pelo Git.
- A chave `anon`/publishable do frontend não substitui as políticas de segurança. Configure RLS nas tabelas `funcionarios` e `registros` e políticas que permitam acesso apenas a usuários autenticados/autorizados. A proteção de interface não protege o banco sozinha.
- Teste o fluxo do Google, confirme os dados de perfil e confira o usuário em Supabase > Authentication > Users.
- Se aparecer `redirect_uri_mismatch`, confira se a callback configurada no Google é exatamente a exibida pelo Supabase.
