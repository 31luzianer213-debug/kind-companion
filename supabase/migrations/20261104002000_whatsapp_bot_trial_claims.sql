-- Atomic and recoverable WhatsApp free-trial claims.
-- A reseller/phone pair can have only one in-flight or active claim.
CREATE TABLE IF NOT EXISTS public.whatsapp_bot_trial_claims (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  claim_token UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  username TEXT,
  password TEXT,
  m3u_url TEXT,
  epg_url TEXT,
  server_name TEXT,
  streaming_dns TEXT,
  PRIMARY KEY (user_id, phone)
);

ALTER TABLE public.whatsapp_bot_trial_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_bot_trial_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_bot_trial_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_bot_trial(
  p_user_id UUID,
  p_phone TEXT,
  p_phone_variants TEXT[],
  p_block_repeat_days INTEGER,
  p_claim_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.whatsapp_bot_trial_claims%ROWTYPE;
  v_block_days INTEGER := GREATEST(0, LEAST(365, COALESCE(p_block_repeat_days, 0)));
  v_recent_client BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL OR length(regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g')) NOT BETWEEN 10 AND 15 THEN
    RAISE EXCEPTION 'Conta ou telefone inválido.';
  END IF;
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'Token da reserva inválido.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT), hashtext(p_phone));

  SELECT *
    INTO v_claim
    FROM public.whatsapp_bot_trial_claims
   WHERE user_id = p_user_id
     AND phone = p_phone
   FOR UPDATE;

  IF FOUND THEN
    IF v_claim.status = 'active'
       AND v_claim.expires_at > now()
       AND COALESCE(v_claim.username, '') <> ''
       AND COALESCE(v_claim.password, '') <> ''
       AND COALESCE(v_claim.m3u_url, '') <> '' THEN
      RETURN jsonb_build_object(
        'status', 'reuse',
        'username', v_claim.username,
        'password', v_claim.password,
        'm3uUrl', v_claim.m3u_url,
        'epgUrl', COALESCE(v_claim.epg_url, ''),
        'serverName', COALESCE(v_claim.server_name, ''),
        'streamingDns', COALESCE(v_claim.streaming_dns, '')
      );
    END IF;

    IF v_claim.status = 'processing' AND v_claim.created_at > now() - interval '10 minutes' THEN
      RETURN jsonb_build_object('status', 'processing');
    END IF;

    -- Uma reserva processing antiga pode ter sido abandonada antes de criar
    -- o cliente. Não bloqueia o telefone por dias só porque o processo caiu.
    IF v_claim.status = 'active'
       AND v_block_days > 0
       AND v_claim.created_at >= now() - make_interval(days => v_block_days) THEN
      RETURN jsonb_build_object('status', 'repeated');
    END IF;
  END IF;

  IF v_block_days > 0 THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.clients
       WHERE user_id = p_user_id
         AND phone = ANY(COALESCE(p_phone_variants, ARRAY[p_phone]))
         AND created_at >= now() - make_interval(days => v_block_days)
    )
    INTO v_recent_client;

    IF v_recent_client THEN
      RETURN jsonb_build_object('status', 'repeated');
    END IF;
  END IF;

  INSERT INTO public.whatsapp_bot_trial_claims (
    user_id, phone, claim_token, status, created_at, updated_at,
    expires_at, username, password, m3u_url, epg_url, server_name, streaming_dns
  )
  VALUES (
    p_user_id, p_phone, p_claim_token, 'processing', now(), now(),
    NULL, NULL, NULL, NULL, NULL, NULL, NULL
  )
  ON CONFLICT (user_id, phone) DO UPDATE SET
    claim_token = EXCLUDED.claim_token,
    status = 'processing',
    created_at = now(),
    updated_at = now(),
    expires_at = NULL,
    username = NULL,
    password = NULL,
    m3u_url = NULL,
    epg_url = NULL,
    server_name = NULL,
    streaming_dns = NULL;

  RETURN jsonb_build_object('status', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_bot_trial(
  p_user_id UUID,
  p_phone TEXT,
  p_claim_token UUID,
  p_username TEXT,
  p_password TEXT,
  p_m3u_url TEXT,
  p_epg_url TEXT,
  p_server_name TEXT,
  p_streaming_dns TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_bot_trial_claims
     SET status = 'active',
         updated_at = now(),
         expires_at = p_expires_at,
         username = p_username,
         password = p_password,
         m3u_url = p_m3u_url,
         epg_url = p_epg_url,
         server_name = p_server_name,
         streaming_dns = p_streaming_dns
   WHERE user_id = p_user_id
     AND phone = p_phone
     AND claim_token = p_claim_token
     AND status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_whatsapp_bot_trial_claim(
  p_user_id UUID,
  p_phone TEXT,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_bot_trial_claims
   WHERE user_id = p_user_id
     AND phone = p_phone
     AND claim_token = p_claim_token
     AND status = 'processing';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_bot_trial(UUID, TEXT, TEXT[], INTEGER, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_whatsapp_bot_trial(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_whatsapp_bot_trial_claim(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_bot_trial(UUID, TEXT, TEXT[], INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_bot_trial(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_whatsapp_bot_trial_claim(UUID, TEXT, UUID) TO service_role;
