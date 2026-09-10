module.exports = {
  apps: [
    {
      name: "kind-companion",
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
      max_memory_restart: "800M",
      restart_delay: 2000,
      autorestart: true,
      watch: false,
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
