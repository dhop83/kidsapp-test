// enforcement-client.js
// Drop this file into any Node.js app.
// Reads ENFORCEMENT_SERVICE_URL and ENFORCEMENT_API_KEY from env.

const SERVICE_URL = process.env.ENFORCEMENT_SERVICE_URL;
const API_KEY     = process.env.ENFORCEMENT_API_KEY;
const TIMEOUT_MS  = parseInt(process.env.ENFORCEMENT_TIMEOUT_MS || '3000');

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-enforcement-key': API_KEY } : {}),
  };
}

async function post(path, body) {
  if (!SERVICE_URL) throw new Error('ENFORCEMENT_SERVICE_URL is not set');

  const res = await fetch(`${SERVICE_URL}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  return res.json();
}

// ─── validate ─────────────────────────────────────────────────────────────────
// Check if entitlement is valid + feature is accessible + qty available
// Does NOT consume a token
//
// Returns: { valid: bool, reason: string, availableQuantity, latencyMs, ... }

export async function validate(entitlementId, feature) {
  return post('/validate', { entitlementId, feature });
}

// ─── activate ────────────────────────────────────────────────────────────────
// Validate + consume 1 token from the entitlement pool
// Call this when a user starts a session / uses a feature
//
// Returns: { success: bool, activationId, latencyMs, ... }

export async function activate(entitlementId, feature, userId) {
  return post('/activate', { entitlementId, feature, userId });
}

// ─── deactivate ───────────────────────────────────────────────────────────────
// Return token back to pool
// Call this on logout or session end
//
// Returns: { success: bool }

export async function deactivate(entitlementId, activationId) {
  return post('/deactivate', { entitlementId, activationId });
}

// ─── Express middleware factory ───────────────────────────────────────────────
// Usage:
//   import { enforceMiddleware } from './enforcement-client.js'
//   app.use('/api/mindbloom', enforceMiddleware(ENTITLEMENT_ID, 'MindBloom'))

export function enforceMiddleware(entitlementId, feature) {
  return async (req, res, next) => {
    try {
      const result = await validate(entitlementId, feature);

      if (!result.valid) {
        return res.status(403).json({
          error: 'access_denied',
          reason: result.reason,
          feature,
          ...(result.availableQuantity !== undefined && {
            availableQuantity: result.availableQuantity,
            totalQuantity: result.totalQuantity,
          }),
        });
      }

      // Attach to request for downstream use
      req.entitlement = result;
      next();
    } catch (err) {
      // Enforcement service unreachable — fail-open by default
      console.warn('[enforcement-client] Service unreachable:', err.message);
      next();
    }
  };
}
