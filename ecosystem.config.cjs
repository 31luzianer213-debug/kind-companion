try {
  process.loadEnvFile(require("node:path").resolve(__dirname, ".env"));
} catch {}

module.exports = {
  apps: [
    {
      name: "iptv-web",
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        PORT: process.env.PORT || 3000,
        NODE_ENV: "production",
        BAILEYS_API_URL: process.env.BAILEYS_API_URL,
        BAILEYS_API_TOKEN: process.env.BAILEYS_API_TOKEN,
        WHATSAPP_WEBHOOK_TOKEN: process.env.WHATSAPP_WEBHOOK_TOKEN,
        MISTICPAY_WEBHOOK_SECRET: process.env.MISTICPAY_WEBHOOK_SECRET,
        BILLING_CRON_SECRET: process.env.BILLING_CRON_SECRET,
        SAAS_MERCADOPAGO_WEBHOOK_SECRET: process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET,
      },
      max_memory_restart: "800M",
      restart_delay: 2000,
      autorestart: true,
      watch: false,
      error_file: "logs/web-err.log",
      out_file: "logs/web-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "iptv-bot-24h",
      script: "scripts/whatsapp-bot-daemon.mjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000,
        BAILEYS_API_HOST: process.env.BAILEYS_API_HOST || "127.0.0.1",
        BAILEYS_API_TOKEN: process.env.BAILEYS_API_TOKEN,
        WHATSAPP_WEBHOOK_TOKEN: process.env.WHATSAPP_WEBHOOK_TOKEN,
      },
      max_memory_restart: "400M",
      restart_delay: 3000,
      autorestart: true,
      watch: false,
      error_file: "logs/bot-err.log",
      out_file: "logs/bot-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
