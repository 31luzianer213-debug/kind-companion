# 🚀 Guia de Implantação do IPTV Manager na VPS

Este projeto foi 100% otimizado para rodar em qualquer servidor VPS (Ubuntu, Debian, CentOS, Rocky Linux) 24 horas por dia com suporte a PM2, Docker e Nginx.

---

## ⚡ 1. Instalação Rápida em 1 Comando (Ubuntu / Debian)

Acesse sua VPS via SSH e execute o script automatizado:

```bash
chmod +x deploy/install-vps.sh
./deploy/install-vps.sh
```

Esse script faz tudo sozinho:
1. Instala o Node.js 22 LTS e o PM2
2. Instala as dependências do projeto
3. Compila a aplicação em modo standalone (`node-server`)
4. Inicia o serviço no PM2 e habilita o reinício automático no boot do sistema

---

## 🛠️ 2. Instalação Manual Passo a Passo

### Passo 1: Instalar Node.js 22 LTS e PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs
sudo npm install -g pm2
```

### Passo 2: Configurar as Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env` e configure suas chaves:
```bash
cp .env.example .env
nano .env
```

Configurações recomendadas no `.env`:
```env
# Supabase
SUPABASE_URL="https://SEU-PROJETO.supabase.co"
SUPABASE_PUBLISHABLE_KEY="SUA_CHAVE_PUBLICA"
SUPABASE_SERVICE_ROLE_KEY="SUA_CHAVE_PRIVADA"

# WhatsApp (Evolution API) — use os dados da sua própria instância
EVOLUTION_API_URL="https://SUA-EVOLUTION-API"
EVOLUTION_API_KEY="SUA_CHAVE_DA_EVOLUTION"

# Baileys local (a porta 3001 não deve ser exposta à internet)
BAILEYS_API_HOST="127.0.0.1"
BAILEYS_API_TOKEN=""
WHATSAPP_WEBHOOK_TOKEN="GERE_UM_TOKEN_LONGO_ALEATORIO"

# Webhooks de pagamento e rotinas protegidas
MISTICPAY_WEBHOOK_SECRET="SEGREDO_ALEATORIO_COM_32_OU_MAIS_CARACTERES"
SAAS_MERCADOPAGO_WEBHOOK_SECRET="SEGREDO_HMAC_COPIADO_DO_MERCADO_PAGO"
BILLING_CRON_SECRET="SEGREDO_ALEATORIO_COM_32_OU_MAIS_CARACTERES"

# Servidor
PORT=3000
NODE_ENV=production
```

### Passo 3: Aplicar as migrações do banco

Antes de iniciar a versão nova, aplique as migrações pendentes do Supabase na ordem do diretório:

```bash
supabase db push
```

Esta revisão adiciona as migrações `20261104000000_atomic_saas_payment_activation.sql`,
`20261104001000_bot_order_idempotency.sql` e
`20261104002000_whatsapp_bot_trial_claims.sql` e
`20261104003000_invoice_creation_idempotency.sql`. Elas são necessárias para a liquidação
atômica da assinatura SaaS, a reutilização segura de pedidos pendentes e a trava/recuperação
de testes grátis do WhatsApp. Não publique o código sem aplicar as migrações.

### Segredos e rotação

Gere segredos longos com pelo menos 32 caracteres (por exemplo, usando
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
Configure `MISTICPAY_WEBHOOK_SECRET`, `SAAS_MERCADOPAGO_WEBHOOK_SECRET`,
`BILLING_CRON_SECRET` e `WHATSAPP_WEBHOOK_TOKEN` no `.env` da VPS. O segredo
HMAC do Mercado Pago SaaS também precisa ser copiado da configuração de Webhooks
no painel do Mercado Pago. O Asaas usa o Auth Token configurado na tela de pagamentos.

**Importante:** o repositório já teve um arquivo `.env` versionado. A remoção do arquivo
na branch atual não apaga versões antigas do histórico Git. Antes de produção, revogue e
gere novamente a chave secreta da Evolution API (e qualquer outra credencial de API que
tenha sido armazenada no histórico). Não reutilize valores antigos.

### Passo 4: Compilar para Produção (Preset VPS)
```bash
npm install --legacy-peer-deps
npm run build:vps
```

### Passo 5: Iniciar com o PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 🐳 3. Execução via Docker / Docker Compose

Se preferir rodar em contêineres Docker isolados:

```bash
# Iniciar o contêiner em segundo plano
docker compose up -d --build

# Ver os logs
docker compose logs -f
```

---

## 🌐 4. Configuração do Nginx (Proxy Reverso com SSL)

1. Copie o modelo de configuração do Nginx:
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/kind-companion
sudo ln -s /etc/nginx/sites-available/kind-companion /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

2. Instale o Certbot e emita o certificado SSL HTTPS gratuito:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

---

## 🤖 5. Conexão do WhatsApp & Robô Automático

### Webhook na Evolution API
Quando o provedor é Evolution API, configure o webhook por revendedor usando o link exibido em **WhatsApp → Conexão**. Quando o provedor é Baileys, o daemon encaminha as mensagens ao backend em `127.0.0.1` e envia `WHATSAPP_WEBHOOK_TOKEN` no cabeçalho `x-webhook-token`. Não cadastre manualmente um webhook sem o identificador da conta e sem o token.

### Proteção do daemon Baileys

O daemon escuta em `127.0.0.1` por padrão e não habilita CORS público. Não publique a porta `3001` no firewall nem no Nginx. Caso precise escutar em uma interface externa, configure `BAILEYS_API_HOST` e defina obrigatoriamente `BAILEYS_API_TOKEN`; o servidor web envia esse token nas chamadas internas. O webhook interno também exige `WHATSAPP_WEBHOOK_TOKEN`. Se o backend ficar indisponível, o daemon não inventa testes, preços ou códigos Pix: a mensagem não é processada e o erro aparece no log.

### Prevenção de mensagens duplicadas
O sistema possui arquitetura unificada com dois mecanismos de proteção:
1. **Deduplicação por Stanza ID (`messageId`)**: Se a Evolution API emitir mais de um evento para o mesmo pacote, o ID é descartado imediatamente.
2. **Debounce de 4 Segundos por Telefone**: Quando o Baileys emite eventos simultâneos para `@lid` e `@s.whatsapp.net`, o sistema resolve o LID para o telefone real e ignora qualquer disparo redundante na janela de 4 segundos.
3. **Respostas Seguras para `@s.whatsapp.net`**: Todas as respostas são enviadas para o número de telefone primário, prevenindo o aviso *"Aguardando mensagem. Essa ação pode levar alguns instantes"* no WhatsApp do cliente.

---

## 📋 6. Comandos Úteis do PM2

| Comando | Descrição |
| :--- | :--- |
| `pm2 status` | Mostra se o servidor está online |
| `pm2 logs kind-companion` | Exibe os logs de atendimento do robô e do sistema |
| `pm2 restart kind-companion` | Reinicia a aplicação |
| `pm2 stop kind-companion` | Para o serviço |
| `pm2 monitor` | Monitor de uso de memória e CPU |

---

## 💳 7. Liberação automática das assinaturas (Pix)

O acesso do revendedor é liberado sozinho quando o Pix da assinatura é pago. Para
isso, três camadas trabalham juntas:

1. **Webhook** — a operadora avisa o sistema na hora.
   - Mercado Pago: cadastre `https://seudominio.com/api/public/hooks/saas-mercadopago`
   - MisticPay: cadastre `https://seudominio.com/api/public/hooks/saas-misticpay`
2. **Tela de Assinatura** — enquanto o revendedor está na página, o pagamento é
   conferido a cada 5 segundos; depois de 2 minutos aparece o botão
   **"Já paguei, liberar meu acesso"**, que confere direto na operadora.
3. **Rotina periódica** — reconfere os Pix pendentes das últimas 48h e libera quem
   pagou, mesmo que o webhook não tenha chegado.

### Agendamento da rotina (crontab da VPS)

```cron
# Todo dia às 8h: cobranças e liberação das assinaturas pendentes
0 8 * * * curl -s "https://seudominio.com/api/public/hooks/cobranca-diaria?secret=SEU_BILLING_CRON_SECRET" > /dev/null

# A cada 15 minutos: só a conferência das assinaturas (liberação rápida)
*/15 * * * * curl -s "https://seudominio.com/api/public/hooks/saas-reconcile?secret=SEU_BILLING_CRON_SECRET" > /dev/null
```

O valor de `SEU_BILLING_CRON_SECRET` é o mesmo configurado em `BILLING_CRON_SECRET`
no `.env`. O administrador também pode forçar a conferência manualmente em
**Administração → Assinaturas → "Conferir pagamentos pendentes"**.

