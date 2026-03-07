// Note 1: This endpoint opens a TikTok upload session. It validates the user
// is logged in, then tells TikTok the file size and metadata upfront.
// TikTok returns an uploadUrl and publishId used by the chunk endpoint.
import { verifyToken, getTokenFromRequest } from "../_lib/jwt.js";
import { initVideoUpload } from "../_lib/tiktok.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    await verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }

  const { title, description, fileSizeBytes } = req.body || {};
  if (!title || !fileSizeBytes) {
    return res.status(400).json({ error: "title and fileSizeBytes are required" });
  }

  try {
    const session = await initVideoUpload({ title, description, fileSizeBytes });
    const chunkSize = 10 * 1024 * 1024;
    res.status(200).json({
      publishId: session.publish_id,
      uploadUrl: session.upload_url,
      chunkSize,
      totalChunks: Math.ceil(fileSizeBytes / chunkSize),
    });
  } catch (err) {
    console.error("init upload error:", err);
    res.status(502).json({ error: "Upload failed. Please try again." });
  }
}
