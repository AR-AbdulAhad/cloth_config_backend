import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate } from "../controllers/templateController.js";

const router = express.Router();
const adminMiddleware = authMiddleware("admin");

router.post("/create", adminMiddleware, createTemplate);
router.get("/list", adminMiddleware, listTemplates);
router.get("/:id", adminMiddleware, getTemplate);
router.put("/:id/update", adminMiddleware, updateTemplate);
router.delete("/:id/delete", adminMiddleware, deleteTemplate);

export default router;
