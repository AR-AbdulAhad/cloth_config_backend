import express from "express";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { 
    createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate,
    // NEW: Automation endpoints
    getAutomationTemplates, updateAutomationSettings, toggleTemplateStatus, 
    sendTestEmail, getTemplateCategories
} from "../controllers/templateController.js";

const router = express.Router();
const adminMiddleware = authMiddleware("admin");

// NEW: Test token generator (remove in production)
router.get("/generate-test-token", (req, res) => {
    const testUser = {
        id: 1,
        email: 'admin@test.com',
        role: 'admin',
        name: 'Test Admin'
    };
    
    const token = jwt.sign(testUser, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    
    res.json({ 
        success: true, 
        token,
        message: "Use this token in Authorization header as 'Bearer <token>'"
    });
});

// NEW: Automation routes (specific routes before /:id)
router.get("/automation/list", adminMiddleware, getAutomationTemplates);
router.get("/categories/stats", adminMiddleware, getTemplateCategories);

// Existing routes
router.post("/create", adminMiddleware, createTemplate);
router.get("/list", adminMiddleware, listTemplates);
router.get("/:id", adminMiddleware, getTemplate);
router.put("/:id/update", adminMiddleware, updateTemplate);
router.put("/:id/automation", adminMiddleware, updateAutomationSettings);
router.patch("/:id/toggle-status", adminMiddleware, toggleTemplateStatus);
router.post("/:id/test-send", adminMiddleware, sendTestEmail);
router.delete("/:id/delete", adminMiddleware, deleteTemplate);

export default router;
