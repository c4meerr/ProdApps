const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const stripe = require("stripe");

admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// ── 1. CREATE CHECKOUT SESSION ──────────────────────────────────────────
exports.createCheckoutSession = onRequest(
  { secrets: [STRIPE_SECRET_KEY], cors: true },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { userId, userEmail } = req.body;
    if (!userId || !userEmail) return res.status(400).send("Missing fields");

    const stripeClient = stripe(STRIPE_SECRET_KEY.value());

    try {
      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: "myr",
              unit_amount: 999, // RM9.99
              recurring: { interval: "month" },
              product_data: {
                name: "Minerva Student Pro",
                description: "Unlimited projects, habits, focus sounds, analytics",
              },
            },
            quantity: 1,
          },
        ],
        metadata: { userId, userEmail },
        success_url: "https://fsktm-29ed3.web.app/index.html?payment=success",
        cancel_url:  "https://fsktm-29ed3.web.app/index.html?payment=cancelled",
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error("Stripe error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── 2. STRIPE WEBHOOK ───────────────────────────────────────────────────
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], rawBody: true },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      const stripeClient = stripe(STRIPE_SECRET_KEY.value());
      event = stripeClient.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err) {
      console.error("Webhook error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;

      if (userId) {
        await db.collection("users").doc(userId).set(
          {
            plan: "pro",
            stripeCustomerId: session.customer,
            upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await db.collection("leaderboard").doc(userId).set(
          { plan: "pro" },
          { merge: true }
        );
      }
    }

    res.json({ received: true });
  }
);