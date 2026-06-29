import express from "express";
import {
    createCheckoutSession,
    stripeWebhook,
    getOrderPricing,
    getOrderPaymentBreakdown,
    verifyPaymentSession,
    testAmount
} from "../controllers/paymentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Student: initiate Stripe checkout (first payment or additional/partial payment)
router.post("/create-checkout-session", authMiddleware("student"), createCheckoutSession);

// Student: get per-product payment breakdown for an order
router.get("/breakdown/:orderId", authMiddleware("student"), getOrderPaymentBreakdown);

// Student: success-page fallback — verify a Checkout Session directly with Stripe
// in case the webhook hasn't reached this server yet (e.g. local dev without a tunnel)
router.get("/verify-session/:sessionId", authMiddleware("student"), verifyPaymentSession);

// Student: calculate pricing before placing order
router.post("/calculate-pricing", authMiddleware("student"), getOrderPricing);

// Stripe webhook (no auth — raw body required)
router.post("/webhook", stripeWebhook);

// Dev/test only — remove in production
router.post("/test-amount", testAmount);

export default router;
