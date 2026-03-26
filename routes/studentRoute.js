import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { getConfiguratorData } from "../controllers/orderController.js";
import { placeOrder, getMyOrder, getMyOrderHistory, deleteHistory } from "../controllers/studentController.js";
import { listSchoolLogos } from "../controllers/logoController.js";
import { listBackDesigns, getConfiguratorBackDesign, listMyBackDesigns, getMyClassBackDesign } from "../controllers/designController.js";

const router = express.Router();
const studentAuth = authMiddleware("student");

router.get("/dashboard/:schoolId/:classId", studentAuth, getConfiguratorData);
router.get("/my-order", studentAuth, getMyOrder);
router.get("/my-order-history", studentAuth, getMyOrderHistory);
router.delete("/history/:id", studentAuth, deleteHistory);
// router.post("/back-designs", studentAuth, listMyBackDesigns);
router.post("/back-designs", studentAuth, getMyClassBackDesign);
router.post("/place-order", studentAuth, placeOrder);
router.post("/logos", studentAuth, listSchoolLogos);
router.post("/class-back-designs", studentAuth, listBackDesigns);
router.get("/configurator-back-design", studentAuth, getConfiguratorBackDesign);

export default router;

