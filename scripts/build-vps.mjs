import { execSync } from "child_process";

process.env.NITRO_PRESET = "node-server";
console.log("🔨 Compilando servidor autônomo Node.js para VPS (NITRO_PRESET=node-server)...");
try {
  execSync("vite build", { stdio: "inherit", env: process.env });
  console.log("✅ Servidor Node.js para VPS compilado com sucesso em .output/server/index.mjs!");
} catch (error) {
  console.error("❌ Falha na compilação:", error);
  process.exit(1);
}
