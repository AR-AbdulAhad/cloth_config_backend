import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
    getConfiguratorData,
    placeOrder,
    getMyOrder
} from "../controllers/orderController.js";
import { listSchoolLogos } from "../controllers/logoController.js";
import { listBackDesigns } from "../controllers/designController.js";

const router = express.Router();
const studentAuth = authMiddleware("student");

router.get("/dashboard/:schoolId/:classId", studentAuth, getConfiguratorData);
router.get("/my-order", studentAuth, getMyOrder);
router.post("/place-order", studentAuth, placeOrder);
router.post("/logos", studentAuth, listSchoolLogos);
router.post("/class-back-designs", studentAuth, listBackDesigns);

export default router;
