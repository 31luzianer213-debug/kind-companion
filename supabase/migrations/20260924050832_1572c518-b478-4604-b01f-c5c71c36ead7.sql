ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS sigma_server_name text,
  ADD COLUMN IF NOT EXISTS sigma_streaming_dns text;

CREATE TABLE public.bot_conversations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  session jsonb,
  ai_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_conversations TO authenticated;
GRANT ALL ON public.bot_conversations TO service_role;
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own bot conversations" ON public.bot_conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bot_conversations_updated BEFORE UPDATE ON public.bot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX bot_conversations_updated_idx ON public.bot_conversations(updated_at);