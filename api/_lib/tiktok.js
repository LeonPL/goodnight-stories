// Note 1: TikTok's Content Posting API lives under open.tiktokapis.com.
// This is the v2 API endpoint base used by all TikTok for Developers integrations.
// All requests must include an Authorization: Bearer <access_token> header
// using the access token obtained when the operator authorized the app.
const TIKTOK_API = "https://open.tiktokapis.com";

async function getAccessToken() {
  let token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN not configured");
  return token;
}

// Note 2: TikTok access tokens expire after ~24 hours. refreshTikTokToken
// uses the longer-lived refresh_token to obtain a new access_token without
// requiring the operator to log in again. The new tokens should be saved
// back to the environment (e.g. via the Vercel API or a cron job).
export async function refreshTikTokToken() {
  // Note 3: Content-Type: application/x-www-form-urlencoded is required by
  // TikTok's token endpoint. URLSearchParams serializes the JS object into
  // the key=value&key2=value2 format that this content type expects.
  const res = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: process.env.TIKTOK_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || "Token refresh failed");
  }
  return data;
}

// Note 4: initVideoUpload creates a TikTok upload session. TikTok needs the
// total file size upfront so it can calculate how many chunks to expect and
// allocate the upload slot. It returns upload_url (where to PUT chunks) and
// publish_id (to check the post status after all chunks are sent).
export async function initVideoUpload({ title, description, fileSizeBytes }) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${TIKTOK_API}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: title.slice(0, 150),
        description: description?.slice(0, 2200) || "",
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileSizeBytes,
        chunk_size: 10 * 1024 * 1024,
        total_chunk_count: Math.ceil(fileSizeBytes / (10 * 1024 * 1024)),
      },
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error?.code !== "ok") {
    throw new Error(data.error?.message || "TikTok init failed");
  }
  return data.data;
}

// Note 5: uploadChunk sends one binary chunk to TikTok's upload URL.
// The Content-Range header tells TikTok exactly which bytes this chunk
// represents within the full file. TikTok uses this to assemble chunks
// in the correct order and verify no bytes are missing.
export async function uploadChunk({ uploadUrl, chunkBuffer, chunkIndex, fileSizeBytes }) {
  const chunkSize = 10 * 1024 * 1024;
  const start = chunkIndex * chunkSize;
  // Note 6: chunkBuffer.length - 1 because Content-Range uses inclusive byte
  // indices (e.g. "bytes 0-9/100" means 10 bytes). The Math.min ensures the
  // last chunk (which may be smaller) does not exceed the file boundary.
  const end = Math.min(start + chunkBuffer.length - 1, fileSizeBytes - 1);

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      // Note 7: The Content-Range format is "bytes start-end/total" per RFC 7233.
      // This is a standard HTTP header for resumable/chunked uploads used by
      // many APIs (Google Drive, TikTok, etc.) to enable partial uploads.
      "Content-Range": `bytes ${start}-${end}/${fileSizeBytes}`,
      "Content-Length": String(chunkBuffer.length),
    },
    body: chunkBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chunk upload failed (${res.status}): ${text}`);
  }
  return true;
}
