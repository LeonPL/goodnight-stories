// Note 1: This endpoint receives one binary video chunk (base64-encoded in JSON),
// decodes it to a Buffer, and immediately forwards it to TikTok's upload URL.
// The video data only exists in process memory for the duration of this call —
// it is never written to disk, satisfying the "no backend storage" requirement.
import { verifyToken, getTokenFromRequest } from "../_lib/jwt.js";
import { uploadChunk } from "../_lib/tiktok.js";

// Note 2: Vercel's default request body limit is 4.5 MB. This config raises
// it to 64 MB for this specific function. TikTok chunks are 10 MB of binary,
// but base64 encoding inflates the payload by ~33%, requiring ~13 MB minimum.
// 64 MB provides a safe margin for the JSON envelope plus encoded chunk data.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64mb",
    },
  },
};

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

  const { uploadUrl, chunkIndex, totalChunks, fileSizeBytes, chunkData } = req.body || {};

  if (!uploadUrl || chunkIndex === undefined || !fileSizeBytes || !chunkData) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Prevent SSRF: only allow TikTok's official upload endpoint.
  if (!uploadUrl.startsWith("https://open-upload.tiktokapis.com/")) {
    return res.status(400).json({ error: "Invalid upload URL" });
  }

  try {
    // Note 3: Buffer.from(data, "base64") decodes the base64 string back into
    // raw binary bytes. This is the reverse of the btoa() call in script.js.
    // The resulting Buffer is passed directly to the TikTok upload PUT request.
    const chunkBuffer = Buffer.from(chunkData, "base64");
    await uploadChunk({ uploadUrl, chunkBuffer, chunkIndex, fileSizeBytes });
    // Note 4: Returning chunkIndex in the response lets the frontend verify
    // it received the correct acknowledgement and log progress accurately.
    res.status(200).json({ ok: true, chunkIndex });
  } catch (err) {
    console.error("chunk upload error:", err);
    res.status(502).json({ error: "Upload failed. Please try again." });
  }
}
