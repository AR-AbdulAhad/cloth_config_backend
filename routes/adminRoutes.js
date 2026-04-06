import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { addSchool, listSchools, editSchool, removeSchool, getSchoolStats, getSchoolClasses } from "../controllers/schoolController.js";
import { addClassRep, listClassReps, editClassRep, removeClassRep, adminResetPassword } from "../controllers/userController.js";
import { addClass, editClass, removeClass, listAllClasses, toggleClassStatus, lockClass, unlockClass, updateClassProcessStatus } from "../controllers/classController.js";
import { listSchoolLogos, approveLogo, rejectLogo, adminUploadLogo, adminUploadBackDesign } from "../controllers/logoController.js";
import { listBackDesigns, approveBackDesign, rejectBackDesign, getClassBackDesigns, uploadLibraryDesign, getLibraryDesignsByCountry, getStudyTripCountries } from "../controllers/designController.js";
import { listCountries, addCountry, editCountry, removeCountry } from "../controllers/countryController.js";
import { listFonts, getActiveFonts, setNameListFont, addFont, removeFont } from "../controllers/fontController.js";
import { generateProductionFiles, listProductionPackages, sendClassStatusEmail, sendFollowUpToClass } from "../controllers/productionController.js";
import { assignClassRep } from "../controllers/classController.js";
import { getDashboardStats, toggleEntityStatus, sendDeadlineReminder, testEmail, getClassStudents, getClassRep } from "../controllers/adminController.js";
import { getSettings, updateSetting, updateSettings } from "../controllers/settingController.js";
import { getClassNameList, approveNameList, rejectNameList, getAllNameList, unlockNameList } from "../controllers/nameListControllers.js";
import { getAllOrders, getOrderDetails, getOrderHistory, unlockOrder, lockOrder } from "../controllers/orderController.js";

const router = express.Router();
const adminMiddleware = authMiddleware("admin");

const libraryStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, "uploads/class_back_designs/"),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        cb(null, `library_${Date.now()}${ext}`);
    }
});
const uploadLibrary = multer({ storage: libraryStorage, limits: { fileSize: 5 * 1024 * 1024 } });

const logoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, "uploads/school_logo/"),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        cb(null, `admin_logo_${Date.now()}${ext}`);
    }
});
const uploadAdminLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } });

router.get("/dashboard", adminMiddleware, getDashboardStats);

// School Routes
router.post("/school/create", adminMiddleware, addSchool);
router.post("/schools", adminMiddleware, listSchools);
router.put("/school/:id/update", adminMiddleware, editSchool);
router.delete("/school/:id/delete", adminMiddleware, removeSchool);
router.get("/school/:id/stats", adminMiddleware, getSchoolStats);
router.post("/school/:id/classes", adminMiddleware, getSchoolClasses);
router.patch("/:entityType/:id/toggle-status", adminMiddleware, toggleEntityStatus);
// Class Rep Routes
router.post("/class-rep/create", adminMiddleware, addClassRep);
router.post("/class-reps", adminMiddleware, listClassReps);
router.put("/class-rep/:id/update", adminMiddleware, editClassRep);
router.delete("/class-rep/:id/delete", adminMiddleware, removeClassRep);
router.post("/user/:userId/reset-password", adminMiddleware, adminResetPassword);
router.patch("/:entityType/:id/toggle-status", adminMiddleware, toggleEntityStatus);

// Class Routes
router.post("/class/create", adminMiddleware, addClass);
router.put("/class/:id/update", adminMiddleware, editClass);
router.delete("/class/:id/delete", adminMiddleware, removeClass);
router.get("/class/:id/toggle-status", toggleClassStatus);
router.post("/class/assign-rep", adminMiddleware, assignClassRep);
router.post("/classes", adminMiddleware, listAllClasses);
router.post("/class/:classId/students", adminMiddleware, getClassStudents);
router.get("/class/:classId/rep", adminMiddleware, getClassRep);

// Logos
router.post("/logos", adminMiddleware, listSchoolLogos);
router.put("/approve-logo/:logoId", adminMiddleware, approveLogo);
router.put("/reject-logo/:logoId", adminMiddleware, rejectLogo);
router.post("/logo/upload", adminMiddleware, uploadAdminLogo.single("logo"), adminUploadLogo);

// Countries
router.post("/countries", adminMiddleware, listCountries);
router.post("/country/create", adminMiddleware, addCountry);
router.put("/country/:id/update", adminMiddleware, editCountry);
router.delete("/country/:id/delete", adminMiddleware, removeCountry);

// Fonts
router.post("/fonts", adminMiddleware, listFonts);
router.post("/font/create", adminMiddleware, addFont);
router.delete("/font/:id/delete", adminMiddleware, removeFont);

// Back designs
router.post("/back-designs", adminMiddleware, listBackDesigns);
router.get("/class/:classId/back-designs", adminMiddleware, getClassBackDesigns);
router.put("/approve-back-design/:id", adminMiddleware, approveBackDesign);
router.put("/reject-back-design/:id", adminMiddleware, rejectBackDesign);
router.post("/back-design/upload", adminMiddleware, uploadLibrary.single("design"), adminUploadBackDesign);
router.post("/library-design/upload", adminMiddleware, uploadLibrary.single("design"), uploadLibraryDesign);
router.get("/library-designs", adminMiddleware, getLibraryDesignsByCountry);
router.get("/study-trip-countries", adminMiddleware, getStudyTripCountries);
router.put("/lock-class/:classId", adminMiddleware, lockClass);
router.put("/unlock-class/:classId", adminMiddleware, unlockClass);
router.put("/class/:classId/process-status", adminMiddleware, updateClassProcessStatus);


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

// Settings
router.get("/settings", adminMiddleware, getSettings);
router.put("/setting", adminMiddleware, updateSetting);
router.put("/settings", adminMiddleware, updateSettings);

export default router;
