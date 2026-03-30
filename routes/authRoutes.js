import express from "express";
import { login, register, decodeRegistrationToken, setUserPassword, getSidebarMenus } from "../controllers/authController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { studentLogin } from "../controllers/studentController.js";

const router = express.Router();

// POST /api/auth/login - For Admin, Class Rep, and Student
router.post("/login", login);
router.post("/student-login", studentLogin);

// POST /api/auth/register - Student Self-Registration
router.post("/register", register);
router.get("/decode-registration-token", decodeRegistrationToken);
router.post("/set-password", setUserPassword);
// GET /api/auth/me/menus - Get dynamic sidebar menus based on role
router.get("/sidebar-menus", authMiddleware(), getSidebarMenus);
 
export default router;
