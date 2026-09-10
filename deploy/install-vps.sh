#!/usr/bin/env bash
set -e

echo "========================================================="
echo "🚀 INSTALAÇÃO AUTOMÁTICA DO IPTV MANAGER NA VPS (NODE.JS)"
echo "========================================================="

# 1. Atualiza repositórios
sudo apt update && sudo apt upgrade -y

# 2. Instala dependências essenciais
sudo apt install -y curl git ufw nginx

# 3. Instala Node.js 22 LTS caso não esteja instalado
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
fi

echo "✅ Node.js $(node -v) e NPM $(npm -v) instalados!"

# 4. Instala PM2 globalmente
sudo npm install -g pm2

# 5. Instala dependências do projeto
echo "📦 Instalando dependências do projeto..."
npm install --legacy-peer-deps

# 6. Compila para produção em modo Node Server
echo "🔨 Compilando servidor para Node.js (preset node-server)..."
export NITRO_PRESET=node-server
npm run build

# 7. Inicia com PM2
echo "⚡ Iniciando serviço no PM2..."
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u $USER --hp $HOME

echo ""
echo "========================================================="
echo "🎉 INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
echo "Aplicação rodando na porta 3000."
echo "Para verificar status: pm2 status"
echo "Para verificar logs:   pm2 logs kind-companion"
echo "========================================================="
