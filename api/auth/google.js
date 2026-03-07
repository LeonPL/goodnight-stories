// Note 1: Google OAuth 2.0 Authorization Code flow — Step 1 of 2.
// This handler redirects the user to Google's consent screen. Google then
// redirects back to /api/auth/google-callback with a one-time code.
// We never see the user's Google password; Google handles authentication
// entirely and only returns an identity token if the user consents.
import { randomBytes } from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export default function handler(req, res) {
  // Note 2: The state parameter is a random 16-byte hex token (32 chars).
  // We set it as a short-lived cookie and pass it to Google. On callback
  // we verify it matches, preventing CSRF attacks where a malicious page
  // tricks the user's browser into completing someone else's login flow.
  const state = randomBytes(16).toString("hex");

  // Note 3: Max-Age=600 means this CSRF cookie expires in 10 minutes —
  // long enough for the user to complete the Google consent flow, but
  // short enough that a stale state cannot be replayed later.
  res.setHeader("Set-Cookie", `oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`);

  // Note 4: scope="openid email profile" requests only identity data.
  // access_type="offline" requests a refresh_token (not used here but
  // useful if you later need to call Google APIs on behalf of the user).
  // prompt="select_account" shows the Google account picker even if the
  // user is already signed in, allowing them to switch accounts.
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`}/api/auth/google-callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  // Note 5: HTTP 302 is a temporary redirect. The browser follows it
  // immediately, navigating to Google. After consent, Google performs
  // its own 302 back to our redirect_uri with code and state params.
  res.redirect(302, `${GOOGLE_AUTH_URL}?${params}`);
}
