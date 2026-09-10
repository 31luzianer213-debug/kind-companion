@echo off
title Robo WhatsApp 24h - IPTV Manager
color 0A
echo ========================================================
echo   INICIANDO ROBO WHATSAPP 24H EM SEGUNDO PLANO
echo ========================================================
echo.
echo  O robo ficara monitorando e respondendo 24h por dia
echo  todas as mensagens de clientes (testes, faturas PIX,
echo  links de apps para Android, iOS, PC e Smart TV).
echo.
echo  Pode fechar o navegador tranquilamente!
echo  Para encerrar o robo, feche esta janela.
echo ========================================================
echo.
node scripts/whatsapp-bot-daemon.mjs
pause
