// Note 1: Logout in a cookie-based auth system means overwriting the cookie
// with an empty value and Max-Age=0, which instructs the browser to delete it
// immediately. There is no server-side session to invalidate because JWTs are
// stateless — the token simply stops being sent once the cookie is gone.
import { clearCookieHeader } from "../_lib/jwt.js";

export default function handler(req, res) {
  // Note 2: clearCookieHeader() returns a Set-Cookie string with Max-Age=0.
  // The browser interprets Max-Age=0 as "delete this cookie right now".
  // This is the standard way to log a user out in a cookie-based system.
  res.setHeader("Set-Cookie", clearCookieHeader());
  res.status(200).json({ ok: true });
}
