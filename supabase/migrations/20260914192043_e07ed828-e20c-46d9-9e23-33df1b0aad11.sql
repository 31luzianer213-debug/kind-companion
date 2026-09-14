-- lovable-cron-fallback-reviewed: 1440 runs/day; webhook delivery from the external Evolution server is unreliable, so a 1-minute reconciliation poll is required for chatbot replies to arrive within a usable window
CREATE TABLE IF NOT EXISTS public.whatsapp_processed_messages (
  message_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_processed_messages TO service_role;
ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_wpm_processed_at ON public.whatsapp_processed_messages (processed_at);

SELECT cron.unschedule('whatsapp-poll-minuto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-poll-minuto');
SELECT cron.schedule(
  'whatsapp-poll-minuto',
  '* * * * *',
  $$ SELECT net.http_get(url := 'https://embrace-essence-app.lovable.app/api/public/hooks/whatsapp-poll?secret=cron_iptv_seguro', timeout_milliseconds := 25000) $$
);