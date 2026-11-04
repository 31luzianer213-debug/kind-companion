export type WhatsappBotTrialClaim =
  | { status: "claimed" }
  | { status: "processing" }
  | { status: "repeated" }
  | {
      status: "reuse";
      username: string;
      password: string;
      m3uUrl: string;
      epgUrl: string;
      serverName: string;
      streamingDns: string;
    };

export async function claimWhatsappBotTrial(
  supabase: any,
  input: {
    userId: string;
    phone: string;
    phoneVariants: string[];
    blockRepeatDays: number;
    claimToken: string;
  },
): Promise<WhatsappBotTrialClaim> {
  const { data, error } = await supabase.rpc("claim_whatsapp_bot_trial", {
    p_user_id: input.userId,
    p_phone: input.phone,
    p_phone_variants: input.phoneVariants,
    p_block_repeat_days: input.blockRepeatDays,
    p_claim_token: input.claimToken,
  });
  if (error) throw new Error(error.message || "Falha ao reservar teste.");
  if (!data || typeof data !== "object" || !("status" in data)) {
    throw new Error("Resposta inválida ao reservar teste.");
  }
  const result = data as Record<string, unknown>;
  if (result.status === "claimed" || result.status === "processing" || result.status === "repeated") {
    return { status: result.status };
  }
  if (
    result.status === "reuse" &&
    typeof result.username === "string" &&
    typeof result.password === "string" &&
    typeof result.m3uUrl === "string" &&
    typeof result.epgUrl === "string"
  ) {
    return {
      status: "reuse",
      username: result.username,
      password: result.password,
      m3uUrl: result.m3uUrl,
      epgUrl: result.epgUrl,
      serverName: String(result.serverName || ""),
      streamingDns: String(result.streamingDns || ""),
    };
  }
  throw new Error("Resposta de reserva do teste não reconhecida.");
}

export async function completeWhatsappBotTrial(
  supabase: any,
  input: {
    userId: string;
    phone: string;
    claimToken: string;
    username: string;
    password: string;
    m3uUrl: string;
    epgUrl: string;
    serverName: string;
    streamingDns: string;
    expiresAt: string;
  },
): Promise<void> {
  const fields = {
    status: "active",
    updated_at: new Date().toISOString(),
    expires_at: input.expiresAt,
    username: input.username,
    password: input.password,
    m3u_url: input.m3uUrl,
    epg_url: input.epgUrl,
    server_name: input.serverName,
    streaming_dns: input.streamingDns,
  };
  const { data, error } = await supabase.rpc("complete_whatsapp_bot_trial", {
    p_user_id: input.userId,
    p_phone: input.phone,
    p_claim_token: input.claimToken,
    p_username: input.username,
    p_password: input.password,
    p_m3u_url: input.m3uUrl,
    p_epg_url: input.epgUrl,
    p_server_name: input.serverName,
    p_streaming_dns: input.streamingDns,
    p_expires_at: input.expiresAt,
  });
  if (!error && data === true) return;

  // Fallback de persistência pela mesma reserva/token caso a RPC tenha erro
  // transitório depois de o cliente ter sido gravado no Sigma e no banco.
  const { data: updated, error: updateError } = await supabase
    .from("whatsapp_bot_trial_claims")
    .update(fields)
    .eq("user_id", input.userId)
    .eq("phone", input.phone)
    .eq("claim_token", input.claimToken)
    .eq("status", "processing")
    .select("phone")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error(
      error?.message || updateError?.message || "A reserva do teste não foi finalizada.",
    );
  }
}

export async function releaseWhatsappBotTrialClaim(
  supabase: any,
  userId: string,
  phone: string,
  claimToken: string,
): Promise<void> {
  const { error } = await supabase.rpc("release_whatsapp_bot_trial_claim", {
    p_user_id: userId,
    p_phone: phone,
    p_claim_token: claimToken,
  });
  if (error) throw new Error(error.message || "Falha ao liberar reserva do teste.");
}
