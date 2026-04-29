import express from "express";
import { sendInquiry } from "../controllers/contactController.js";

const router = express.Router();

// POST /api/contact/inquiry
// Public — no auth required
router.post("/inquiry", sendInquiry);

export default router;
