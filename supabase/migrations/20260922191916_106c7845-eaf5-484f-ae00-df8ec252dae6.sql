CREATE TABLE IF NOT EXISTS public.telegram_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  chat_id TEXT NOT NULL,
  phone TEXT,
  display_name TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chat_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_chats TO authenticated;
GRANT ALL ON public.telegram_chats TO service_role;

ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own telegram chats" ON public.telegram_chats;
CREATE POLICY "Users manage own telegram chats" ON public.telegram_chats
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);