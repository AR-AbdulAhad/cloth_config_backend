import express from "express";
import { createCheckoutSession, stripeWebhook, getOrderPricing, testAmount } from "../controllers/paymentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/create-checkout-session", authMiddleware("student"), createCheckoutSession);
router.post("/webhook", stripeWebhook);
router.post("/calculate-pricing", authMiddleware("student"), getOrderPricing);
router.post("/test-amount", testAmount); // Test endpoint (remove in production)

export default router;
