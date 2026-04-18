import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createCampaign, listCampaigns, getCampaign, updateCampaign, deleteCampaign, sendCampaign, sendCampaignToUser } from "../controllers/campaignController.js";

const router = express.Router();
const adminMiddleware = authMiddleware("admin");

router.post("/create", adminMiddleware, createCampaign);
router.get("/list", adminMiddleware, listCampaigns);
router.get("/:id", adminMiddleware, getCampaign);
router.put("/:id/update", adminMiddleware, updateCampaign);
router.delete("/:id/delete", adminMiddleware, deleteCampaign);
router.post("/:id/send", adminMiddleware, sendCampaign);
router.post("/:id/send-to-user", adminMiddleware, sendCampaignToUser);

export default router;
