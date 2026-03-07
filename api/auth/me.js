// Note 1: /api/auth/me is the "session check" endpoint called on every page
// load. It reads the httpOnly JWT cookie, verifies the cryptographic signature
// and expiry, then returns the user's profile from the token payload.
// No database lookup is needed — the JWT itself is the source of truth.
import { verifyToken, getTokenFromRequest } from "../_lib/jwt.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  const token = getTokenFromRequest(req);
  // Note 2: 401 Unauthorized is the correct status code when credentials are
  // missing or invalid. The frontend (initAuth in script.js) treats any
  // non-2xx response as "logged out" and shows the sign-in panel.
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    // Note 3: verifyToken checks both the HMAC signature (was this token
    // created by us?) and the exp claim (has it expired?). If either check
    // fails, jose throws an error which we catch below.
    const payload = await verifyToken(token);
    // Note 4: We only return the fields the frontend needs. Returning the
    // entire payload (which includes iat/exp timestamps) would expose
    // implementation details unnecessarily.
    res.status(200).json({
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      avatar: payload.avatar,
      provider: payload.provider,
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
