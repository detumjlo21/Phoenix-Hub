import { AccessToken } from "livekit-server-sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { roomName, identity, displayName } = req.body || {};

    if (!roomName || !identity) {
      return res.status(400).json({ error: "Missing roomName or identity" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(500).json({ error: "LiveKit env missing" });
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: displayName || identity,
      ttl: "2h",
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return res.status(200).json({
      token: await token.toJwt(),
      url: livekitUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Token generation failed" });
  }
}
