// Note 1: Google OAuth 2.0 Authorization Code flow — Step 2 of 2.
// Google redirects here after the user grants consent. This handler:
//   1. Verifies the CSRF state cookie
//   2. Exchanges the one-time code for tokens
//   3. Fetches the user's profile
//   4. Issues a JWT session cookie and redirects back to the homepage
import { signToken, setCookieHeader } from "../_lib/jwt.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export default async function handler(req, res) {
  // Note 2: Vercel populates req.query for serverless functions. The fallback
  // URL parsing handles edge cases where req.query may be undefined.
  const { code, state, error } = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);

  // Note 3: Google may redirect with error=access_denied if the user clicks
  // "Cancel" on the consent screen. Always check for error before proceeding.
  if (error) {
    return res.redirect(302, `/?auth_error=${encodeURIComponent(error)}`);
  }

  // Note 4: Parse the cookie header into a key/value map to retrieve the
  // oauth_state we stored in google.js. Comparing it to the state Google
  // returned proves this callback was initiated by our own redirect.
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split(";").map(c => c.trim().split("="))
  );
  if (!state || state !== cookies.oauth_state) {
    return res.redirect(302, "/?auth_error=invalid_state");
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`;

  // Note 5: The code is single-use and short-lived (~60 seconds). We send it
  // to Google's token endpoint along with our client_secret to prove we are
  // the legitimate app. Never expose client_secret to the browser.
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${baseUrl}/api/auth/google-callback`,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok || tokens.error) {
    return res.redirect(302, `/?auth_error=${encodeURIComponent(tokens.error || "token_exchange_failed")}`);
  }

  // Note 6: We use the access_token to call Google's userinfo endpoint which
  // returns name, email, and picture. We do NOT store this access_token — it
  // is only needed here to get the profile. The user's identity is then
  // encoded in our own JWT cookie which we control.
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = await userRes.json();

  // Note 7: user.sub is Google's stable unique identifier for this Google
  // account. It never changes, even if the user changes their email address.
  // Using sub (not email) as the user ID prevents account confusion.
  const jwt = await signToken({
    sub: user.sub,
    name: user.name,
    email: user.email,
    avatar: user.picture,
    provider: "google",
  });

  // Note 8: Setting two cookies at once by passing an array to setHeader.
  // The second entry clears the CSRF state cookie (Max-Age=0) since it is
  // no longer needed after the state has been verified.
  res.setHeader("Set-Cookie", [
    setCookieHeader(jwt),
    "oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
  ]);
  res.redirect(302, "/");
}
