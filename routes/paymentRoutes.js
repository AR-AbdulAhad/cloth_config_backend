import express from "express";
import { createCheckoutSession, stripeWebhook } from "../controllers/paymentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/create-checkout-session", authMiddleware("student"), createCheckoutSession);
router.post("/webhook", stripeWebhook);

export default router;
