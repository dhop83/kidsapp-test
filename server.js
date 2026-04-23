import express from 'express';
import { validate, activate, deactivate, enforceMiddleware } from './enforcement-client.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// Your EMS entitlement ID — set in Railway env vars
const ENTITLEMENT_ID = process.env.ENTITLEMENT_ID || 'aa58231b-92e9-450a-af9f-4bdc6e3...';

app.use(express.json());
app.use(express.static('public'));

// ─── Unprotected ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', entitlementId: ENTITLEMENT_ID });
});

// ─── Protected Routes (feature-level enforcement) ─────────────────────────────

// MindBloom feature — uses middleware (validate only, no token consumption)
app.get(
  '/api/mindbloom',
  enforceMiddleware(ENTITLEMENT_ID, 'MindBloom'),
  (req, res) => {
    res.json({
      feature: 'MindBloom',
      data: { message: 'Welcome to MindBloom! 🌱', content: 'Mindfulness content here...' },
      entitlement: req.entitlement,
    });
  }
);

// ChoreChampion feature — uses middleware (validate only, no token consumption)
app.get(
  '/api/chorechampion',
  enforceMiddleware(ENTITLEMENT_ID, 'ChoreChampion'),
  (req, res) => {
    res.json({
      feature: 'ChoreChampion',
      data: { message: 'ChoreChampion activated! 🏆', tasks: ['Clean room', 'Do dishes'] },
      entitlement: req.entitlement,
    });
  }
);

// ─── Session: Activate (consume token) ───────────────────────────────────────

app.post('/session/start', async (req, res) => {
  const { userId, feature } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const result = await activate(ENTITLEMENT_ID, feature || 'MindBloom', userId);

  if (!result.success) {
    return res.status(403).json({
      error: 'session_denied',
      reason: result.reason,
      detail: result.detail,
    });
  }

  // In production: store activationId in session/JWT
  res.json({
    sessionStarted: true,
    userId,
    activationId: result.activationId,
    feature: result.feature,
    customer: result.customer,
    latencyMs: result.latencyMs,
  });
});

// ─── Session: Deactivate (return token) ──────────────────────────────────────

app.post('/session/end', async (req, res) => {
  const { activationId } = req.body;

  if (!activationId) return res.status(400).json({ error: 'activationId is required' });

  const result = await deactivate(ENTITLEMENT_ID, activationId);
  res.json({ sessionEnded: result.success, activationId });
});

// ─── Debug: Raw validate ──────────────────────────────────────────────────────

app.get('/debug/validate', async (req, res) => {
  const { feature } = req.query;
  const result = await validate(ENTITLEMENT_ID, feature);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`[test-app] Running on port ${PORT}`);
  console.log(`[test-app] Entitlement: ${ENTITLEMENT_ID}`);
  console.log(`[test-app] Enforcement: ${process.env.ENFORCEMENT_SERVICE_URL}`);
});
