import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://uwtnvfwijofvshlzfzto.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zLqtqHBTAvySajv51eTJ9w_BG9DsapJ";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bearer = req.headers.authorization || "";
    const accessToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (!accessToken) return res.status(401).json({ error: "Missing auth token" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: auth, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !auth.user) return res.status(401).json({ error: "Invalid session" });

    const { roomId, password = "" } = req.body || {};
    if (!roomId) return res.status(400).json({ error: "Missing roomId" });

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id,display_name,status")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();

    if (memberError || !member || member.status !== "active") {
      return res.status(403).json({ error: "Member not approved" });
    }

    const { data: joinResult, error: joinError } = await supabase.rpc("join_voice_room", {
      target_room_id: roomId,
      room_password: password
    });

    if (joinError) return res.status(403).json({ error: joinError.message });
    if (!joinResult?.ok) return res.status(403).json({ error: joinResult?.message || "Cannot join room" });

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(500).json({ error: "LiveKit env missing" });
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: member.id,
      name: member.display_name,
      ttl: "2h",
      metadata: JSON.stringify({ phoenixMemberId: member.id })
    });

    token.addGrant({
      roomJoin: true,
      room: joinResult.livekit_room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    return res.status(200).json({
      token: await token.toJwt(),
      url: livekitUrl,
      room: joinResult.room,
      isHost: joinResult.is_host === true
    });
  } catch (err) {
    console.error("livekit-token:", err);
    return res.status(500).json({ error: "Token generation failed" });
  }
}
