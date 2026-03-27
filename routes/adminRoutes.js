import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { addSchool, listSchools, editSchool, removeSchool } from "../controllers/schoolController.js";
import { addClassRep, listClassReps, editClassRep, removeClassRep } from "../controllers/userController.js";
import { addClass, editClass, removeClass, listAllClasses, toggleClassStatus, lockClass, unlockClass } from "../controllers/classController.js";
import { listSchoolLogos, approveLogo, rejectLogo } from "../controllers/logoController.js";
import { listBackDesigns, approveBackDesign, rejectBackDesign, getClassBackDesigns } from "../controllers/designController.js";
import { generateProductionFiles, listProductionPackages, sendClassStatusEmail, sendFollowUpToClass } from "../controllers/productionController.js";
import { assignClassRep } from "../controllers/classController.js";
import { getDashboardStats, toggleEntityStatus, sendDeadlineReminder, testEmail } from "../controllers/adminController.js";
import { getClassNameList, approveNameList, rejectNameList, getAllNameList, unlockNameList } from "../controllers/nameListControllers.js";
import { getAllOrders, getOrderDetails, getOrderHistory, unlockOrder, lockOrder } from "../controllers/orderController.js";

const router = express.Router();

const adminMiddleware = authMiddleware("admin");

router.get("/dashboard", adminMiddleware, getDashboardStats);

// School Routes
router.post("/school/create", adminMiddleware, addSchool);
router.post("/schools", adminMiddleware, listSchools);
router.put("/school/:id/update", adminMiddleware, editSchool);
router.delete("/school/:id/delete", adminMiddleware, removeSchool);
router.patch("/:entityType/:id/toggle-status", adminMiddleware, toggleEntityStatus);
// Class Rep Routes
router.post("/class-rep/create", adminMiddleware, addClassRep);
router.post("/class-reps", adminMiddleware, listClassReps);
router.put("/class-rep/:id/update", adminMiddleware, editClassRep);
router.delete("/class-rep/:id/delete", adminMiddleware, removeClassRep);
router.patch("/:entityType/:id/toggle-status", adminMiddleware, toggleEntityStatus);

// Class Routes
router.post("/class/create", adminMiddleware, addClass);
router.put("/class/:id/update", adminMiddleware, editClass);
router.delete("/class/:id/delete", adminMiddleware, removeClass);
router.get("/class/:id/toggle-status", toggleClassStatus);
router.post("/class/assign-rep", adminMiddleware, assignClassRep);
router.post("/classes", adminMiddleware, listAllClasses);

// Logos
router.post("/logos", adminMiddleware, listSchoolLogos);
router.put("/approve-logo/:logoId", adminMiddleware, approveLogo);
router.put("/reject-logo/:logoId", adminMiddleware, rejectLogo);

// Back designs
router.post("/back-designs", adminMiddleware, listBackDesigns);
router.get("/class/:classId/back-designs", adminMiddleware, getClassBackDesigns);
router.put("/approve-back-design/:id", adminMiddleware, approveBackDesign);
router.put("/reject-back-design/:id", adminMiddleware, rejectBackDesign);
router.put("/lock-class/:classId", adminMiddleware, lockClass);
router.put("/unlock-class/:classId", adminMiddleware, unlockClass);


// NameList (Admin)
router.get("/namelist/list", adminMiddleware, getAllNameList);
router.get("/namelist/:class_id/class", adminMiddleware, getClassNameList);
router.put("/namelist/:id/approve", adminMiddleware, approveNameList);
router.put("/namelist/:id/reject", adminMiddleware, rejectNameList);
router.put("/namelist/:id/unlock", adminMiddleware, unlockNameList);

// Production Packages
router.get("/orders/list", adminMiddleware, getAllOrders);
router.get("/orders/:orderId/details", adminMiddleware, getOrderDetails);
router.get("/orders/:orderId/history", adminMiddleware, getOrderHistory);
router.put("/orders/:orderId/unlock", adminMiddleware, unlockOrder);
router.put("/orders/:orderId/lock", adminMiddleware, lockOrder);

// Production Packages
router.post("/generate-files/:classId", adminMiddleware, generateProductionFiles);
router.post("/production-packages", adminMiddleware, listProductionPackages);

// Email Actions
router.post("/class/:classId/send-deadline-reminder", adminMiddleware, sendDeadlineReminder);
router.post("/class/:classId/send-status-email", adminMiddleware, sendClassStatusEmail);
router.post("/class/:classId/send-followup-email", adminMiddleware, sendFollowUpToClass);
router.post("/test-email", adminMiddleware, testEmail);

export default router;
