// Extracts the Bearer token from the Authorization header.
export function getTokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

// Auth is not yet implemented. This placeholder always rejects tokens
// so no unauthenticated request can reach protected handlers.
// Replace with real verification (e.g. Google ID token or signed JWT)
// before the upload feature goes live.
export async function verifyToken(_token) {
  throw new Error("Authentication not yet implemented");
}
