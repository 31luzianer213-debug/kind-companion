# Kind Companion

Este projeto foi construído com [Lovable](https://lovable.dev).

## Plano de migração sem Supabase

O sistema atualmente depende do Supabase nos seguintes pontos:

### Autenticação e sessão

- `src/routes/auth.tsx`: cadastro, login, OAuth Google, confirmação de e-mail por código, reenvio do código e criação do perfil.
- `src/integrations/supabase/client.ts`: cliente de autenticação no navegador, persistência da sessão e renovação automática do token.
- `src/integrations/supabase/auth-attacher.ts`: anexa o token da sessão às server functions.
- `src/integrations/supabase/auth-middleware.ts`: valida tokens e disponibiliza `userId` para operações protegidas.
- `src/integrations/supabase/previewAuthStorage.ts`: armazenamento especial de sessão no preview do Lovable.
- `src/routes/_authenticated/route.tsx`: bloqueia o acesso às rotas privadas usando `supabase.auth.getUser()`.
- `src/integrations/lovable/index.ts`: login OAuth fornecido pela integração do Lovable, atualmente conectado ao cliente Supabase.

### Banco de dados e autorização

As telas abaixo usam o cliente Supabase diretamente para consultas, inserções, atualizações e exclusões:

- `src/routes/_authenticated/clientes.tsx`: tabela `clients` e relacionamento com `iptv_lists`.
- `src/routes/_authenticated/listas.tsx`: tabela `iptv_lists` e relacionamento com `clients`.
- `src/routes/_authenticated/cobrancas.tsx`: tabelas `invoices`, `clients` e `whatsapp_settings`.
- `src/routes/_authenticated/painel.tsx`: tabelas `clients`, `iptv_lists`, `invoices` e `message_logs`.
- `src/routes/_authenticated/configuracoes.tsx`: configurações do WhatsApp, pagamentos e integrações externas.
- `src/lib/*.functions.ts` e `src/lib/*.server.ts`: operações de servidor que usam autenticação e dados do Supabase.
- `src/integrations/supabase/client.server.ts`: cliente administrativo com `SUPABASE_SERVICE_ROLE_KEY`.
- `src/integrations/supabase/types.ts`: tipos gerados das tabelas e operações do banco.
- `src/routes/api/public/hooks/cobranca-diaria.ts`: consulta contas no Supabase para executar cobranças automáticas.

### Solução substituta escolhida

A migração deverá usar:

1. PostgreSQL próprio ou hospedado em outro provedor.
2. Drizzle ORM para schema, migrações e consultas tipadas.
3. Autenticação própria no servidor com senha armazenada usando Argon2id ou bcrypt.
4. Sessões opacas armazenadas no banco, identificadas por cookie `HttpOnly`, `Secure` e `SameSite=Lax`.
5. Tokens de verificação de e-mail armazenados com hash, expiração curta e uso único.
6. Nodemailer ou Resend para envio de códigos de verificação pelo Gmail/SMTP escolhido.
7. Middleware do TanStack Start para validar a sessão e disponibilizar o usuário autenticado às rotas protegidas.

A senha de aplicativo do Gmail nunca deverá ser enviada ao navegador nem commitada no repositório. Ela ficará somente em variável secreta do ambiente do servidor.

### Ordem segura da migração

1. Criar a camada de banco, schema e migrações sem alterar as telas atuais.
2. Criar autenticação, sessões e verificação de e-mail no servidor.
3. Migrar a proteção de rotas e substituir o fluxo da tela `src/routes/auth.tsx`.
4. Migrar consultas das telas e das server functions para a nova camada de banco.
5. Migrar o webhook e os jobs de cobrança automática.
6. Validar a migração dos dados antes de remover o Supabase.
7. Remover clientes, middleware, tipos gerados, variáveis de ambiente e dependências do Supabase.

A remoção definitiva do Supabase só deve ocorrer depois que autenticação, sessão, dados, RLS equivalente e integrações de cobrança estiverem funcionando no novo ambiente.

## Desenvolvimento

Preferindo trabalhar localmente? Você precisa de Node.js e npm — instale com nvm.

sh
npm i
npm run dev


## Variáveis que serão substituídas

As variáveis atuais relacionadas ao Supabase são:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Durante a migração, elas serão substituídas por variáveis server-side para conexão PostgreSQL, sessão e SMTP. Nenhuma credencial privada deverá usar prefixo `VITE_`.

## Build with Lovable

Continue desenvolvendo no [editor do Lovable](https://lovable.dev/projects/fc93ce00-47f0-4a70-85e2-921aba213661).

- **Ship faster**: descreva o que você quer construir e o Lovable ajuda a implementar.
- **Full ownership**: o código permanece no seu repositório.
