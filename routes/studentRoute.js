import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { getConfiguratorData, resetOrder, createFreshOrder } from "../controllers/orderController.js";
import { placeOrder, getMyOrder, getMyOrderHistory, deleteHistory, getMyProfile, updateMyProfile, getClassesBySchool } from "../controllers/studentController.js";
import { listSchoolLogos } from "../controllers/logoController.js";
import { listBackDesigns, getConfiguratorBackDesign, listMyBackDesigns, getMyClassBackDesign } from "../controllers/designController.js";
import { getSettings } from "../controllers/settingController.js";
import { listSchools } from "../controllers/schoolController.js";

const router = express.Router();
const studentAuth = authMiddleware("student");

router.get("/dashboard/:schoolId/:classId", studentAuth, getConfiguratorData);
router.get("/my-order", studentAuth, getMyOrder);
router.get("/my-order-history", studentAuth, getMyOrderHistory);
router.delete("/history/:id", studentAuth, deleteHistory);
router.get("/profile", studentAuth, getMyProfile);
router.put("/profile", studentAuth, updateMyProfile);
// router.post("/back-designs", studentAuth, listMyBackDesigns);
router.post("/back-designs", studentAuth, getMyClassBackDesign);
router.post("/place-order", studentAuth, placeOrder);
router.post("/logos", studentAuth, listSchoolLogos);
router.post("/class-back-designs", studentAuth, listBackDesigns);
router.get("/configurator-back-design", studentAuth, getConfiguratorBackDesign);
router.get("/settings", studentAuth, getSettings);
router.post("/schools", studentAuth, listSchools);
router.post("/schools/:schoolId/classes", studentAuth, getClassesBySchool);

// New routes for order reset functionality
router.post("/reset-order/:orderId", studentAuth, resetOrder);
router.post("/create-fresh-order", studentAuth, createFreshOrder);

export default router;

