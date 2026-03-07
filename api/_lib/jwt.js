// Note 1: 'jose' is a pure JavaScript implementation of JOSE standards
// (JSON Object Signing and Encryption). It works in both Node.js and
// browser/edge runtimes, making it ideal for Vercel serverless functions
// which can run in the Edge Runtime. Unlike the popular 'jsonwebtoken' library,
// jose does not depend on Node.js crypto C++ bindings.
import { SignJWT, jwtVerify } from "jose";

// Note 2: TextEncoder converts a JavaScript string into a Uint8Array (raw bytes).
// The HMAC-SHA256 algorithm used to sign JWTs operates on bytes, not strings,
// so this conversion is required. The secret key should be at least 32 bytes
// (256 bits) for HS256. A short or weak secret makes JWTs forgeable.
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production"
);

// Note 3: "7d" is a human-readable duration string parsed by jose. The JWT
// will automatically be rejected after 7 days, limiting the window of exposure
// if a token is stolen. Shorter expiry = more secure but requires more frequent
// re-logins. Adjust based on your security requirements.
const EXPIRY = "7d";

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, SECRET);
  return payload;
}

export function getTokenFromRequest(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? match[1] : null;
}

// Note 4: HttpOnly prevents JavaScript from reading this cookie via
// document.cookie, protecting against XSS attacks that try to steal tokens.
// Path=/ makes the cookie sent on all requests. SameSite=Lax blocks the
// cookie from being sent in cross-site POST requests (CSRF protection) while
// still allowing it on top-level navigations. Secure is only added in
// production so local development (http://localhost) still works.
export function setCookieHeader(token) {
  return `auth_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearCookieHeader() {
  return "auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
}
