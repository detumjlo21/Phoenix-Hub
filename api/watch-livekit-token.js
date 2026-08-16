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

    const { data: profileResult, error: profileError } =
      await supabase.rpc("get_my_member_profile");

    if (profileError || !profileResult?.ok || !profileResult?.member) {
      return res.status(403).json({ error: "Member not approved" });
    }

    // Xác minh member có quyền vào đúng Watch Party và password đúng.
    const { data: joinResult, error: joinError } =
      await supabase.rpc("join_watch_room", {
        target_room_id: roomId,
        room_password: password
      });

    if (joinError || !joinResult?.ok) {
      return res.status(403).json({
        error: joinError?.message || joinResult?.message || "Cannot join watch room"
      });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(500).json({ error: "LiveKit env missing" });
    }

    const member = profileResult.member;
    const livekitRoom = `watch-${String(roomId).replace(/-/g, "")}`;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: member.id,
      name: member.display_name,
      ttl: "4h",
      metadata: JSON.stringify({
        phoenixMemberId: member.id,
        watchRoomId: roomId
      })
    });

    token.addGrant({
      roomJoin: true,
      room: livekitRoom,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    return res.status(200).json({
      token: await token.toJwt(),
      url: livekitUrl,
      livekitRoom,
      isHost: joinResult.is_host === true
    });
  } catch (err) {
    console.error("watch-livekit-token:", err);
    return res.status(500).json({ error: "Watch voice token generation failed" });
  }
}
