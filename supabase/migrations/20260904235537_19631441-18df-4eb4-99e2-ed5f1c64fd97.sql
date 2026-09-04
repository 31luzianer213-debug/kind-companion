ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS pix_key_type text NOT NULL DEFAULT 'aleatoria',
  ADD COLUMN IF NOT EXISTS pix_holder text,
  ADD COLUMN IF NOT EXISTS payment_link text,
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS mercadopago_token text,
  ADD COLUMN IF NOT EXISTS asaas_token text,
  ADD COLUMN IF NOT EXISTS asaas_env text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS overdue_template text NOT NULL DEFAULT 'Oi {nome}, sua mensalidade de {valor} venceu em {vencimento} ({dias} dias atrás). Para não perder o acesso, faça o pagamento pelo PIX {pix}. 🙏',
  ADD COLUMN IF NOT EXISTS welcome_template text NOT NULL DEFAULT 'Seja bem-vindo(a), {nome}! 🎉

Seus dados de acesso:
Lista: {lista}
Servidor: {servidor}
Usuário: {usuario}
Senha: {senha}

Vencimento todo dia {vencimento}. Qualquer dúvida é só chamar!';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS iptv_username text,
  ADD COLUMN IF NOT EXISTS iptv_password text,
  ADD COLUMN IF NOT EXISTS screens integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS activated_at date;