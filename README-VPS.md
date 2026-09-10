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
SUPABASE_URL="https://tcwhewlfwetlhywpghtk.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sua_chave_aqui"
SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key_aqui"

# WhatsApp (Evolution API)
EVOLUTION_API_URL="https://cobrancas-whatsapp.shop"
EVOLUTION_API_KEY="evolutionApiGlobalTokenSecure2026"
EVOLUTION_INSTANCE="iptv_ccd7362726074f97"

# Servidor
PORT=3000
NODE_ENV=production
```

### Passo 3: Compilar para Produção (Preset VPS)
```bash
npm install --legacy-peer-deps
npm run build:vps
```

### Passo 4: Iniciar com o PM2
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
Quando rodando na VPS com domínio ou IP público, a Evolution API entrega todas as mensagens diretamente no endpoint:
`https://seudominio.com/api/public/hooks/whatsapp-bot`

### Prevenção Total de Duplicatas
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
