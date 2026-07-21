import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { addSchool, listSchools, editSchool, removeSchool, getSchoolStats, getSchoolClasses } from "../controllers/schoolController.js";
import { addClassRep, listClassReps, editClassRep, removeClassRep, adminResetPassword } from "../controllers/userController.js";
import { addClass, editClass, removeClass, listAllClasses, toggleClassStatus, lockClass, unlockClass, updateClassProcessStatus, setExpectedStudentCount, getStudentCount } from "../controllers/classController.js";
import { listSchoolLogos, approveLogo, rejectLogo, adminUploadLogo, adminUploadBackDesign, adminDeleteLogo, adminPermanentDeleteLogo, adminEditLogo, editBackDesign } from "../controllers/logoController.js";
import { listBackDesigns, approveBackDesign, rejectBackDesign, getClassBackDesigns, uploadLibraryDesign, getLibraryDesignsByCountry, getStudyTripCountries, adminDeleteBackDesign, adminPermanentDeleteBackDesign, adminDeleteLibraryDesign, adminPermanentDeleteLibraryDesign } from "../controllers/designController.js";
import { listCountries, addCountry, editCountry, removeCountry, permanentDeleteCountry, toggleCountryStatus } from "../controllers/countryController.js";
import { listFonts, getActiveFonts, setNameListFont, addFont, removeFont, permanentDeleteFont, toggleFontStatus, editFont } from "../controllers/fontController.js";
import { generateProductionFiles, generateOrderProductionFiles, listProductionPackages, sendClassStatusEmail, sendFollowUpToClass } from "../controllers/productionController.js";
import { assignClassRep } from "../controllers/classController.js";
import { studentLogin, getDashboardData, placeOrder, getMyOrder, getMyOrderHistory, deleteHistory, getMyProfile, updateMyProfile, getClassesBySchool, checkClassSignup, getStudentDetails, deleteStudent, permanentDeleteStudent, listAllStudents } from "../controllers/studentController.js";
import { getDashboardStats, toggleEntityStatus, sendDeadlineReminder, testEmail, getClassStudents, getClassRep, getAllClassesWithStudentCount } from "../controllers/adminController.js";
import { getSettings, updateSetting, updateSettings } from "../controllers/settingController.js";
import { listShippingRates, getShippingRate, createShippingRate, updateShippingRate, toggleShippingRateStatus, deleteShippingRate } from "../controllers/shippingController.js";
import { getClassNameList, approveNameList, rejectNameList, getAllNameList, unlockNameList } from "../controllers/nameListControllers.js";
import { getAllOrders, getOrderDetails, getOrderHistory, unlockOrder, lockOrder, debugOrderHistory } from "../controllers/orderController.js";
import { addEducationProgram, listEducationPrograms, editEducationProgram, deleteEducationProgram } from "../controllers/educationProgramController.js";
import { listAllTickets, getTicketMessages, closeTicket, getRatingSummary } from "../controllers/supportController.js";

const router = express.Router();
const adminMiddleware = authMiddleware("admin");

const libraryStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, "uploads/class_back_designs/"),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        const uniqueName = `library_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, uniqueName);
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
router.post("/classes-with-student-count", adminMiddleware, getAllClassesWithStudentCount);
router.post("/class/:classId/students", adminMiddleware, getClassStudents);
router.get("/class/:classId/rep", adminMiddleware, getClassRep);
router.put("/class/:classId/expected-students", adminMiddleware, setExpectedStudentCount);
router.get("/class/:classId/student-count", adminMiddleware, getStudentCount);

// Logos
router.post("/logos", adminMiddleware, listSchoolLogos);
router.put("/approve-logo/:logoId", adminMiddleware, approveLogo);
router.put("/reject-logo/:logoId", adminMiddleware, rejectLogo);
router.post("/logo/upload", adminMiddleware, uploadAdminLogo.single("logo"), adminUploadLogo);
router.put("/logo/:logoId/edit", adminMiddleware, adminEditLogo);
router.delete("/logo/:logoId/delete", adminMiddleware, adminDeleteLogo);
router.delete("/logo/:logoId/permanent-delete", adminMiddleware, adminPermanentDeleteLogo);

// Countries
router.post("/countries", adminMiddleware, listCountries);
router.post("/country/create", adminMiddleware, addCountry);
router.put("/country/:id/update", adminMiddleware, editCountry);
router.delete("/country/:id/delete", adminMiddleware, removeCountry);
router.delete("/country/:id/permanent-delete", adminMiddleware, permanentDeleteCountry);
router.put("/country/:id/toggle-status", adminMiddleware, toggleCountryStatus);

// Fonts
router.post("/fonts", adminMiddleware, listFonts);
router.post("/font/create", adminMiddleware, addFont);
router.put("/font/:id/update", adminMiddleware, editFont);
router.delete("/font/:id/delete", adminMiddleware, removeFont);
router.delete("/font/:id/permanent-delete", adminMiddleware, permanentDeleteFont);
router.put("/font/:id/toggle-status", adminMiddleware, toggleFontStatus);

// Back designs
router.post("/back-designs", adminMiddleware, listBackDesigns);
router.get("/class/:classId/back-designs", adminMiddleware, getClassBackDesigns);
router.put("/approve-back-design/:id", adminMiddleware, approveBackDesign);
router.put("/reject-back-design/:id", adminMiddleware, rejectBackDesign);
router.post("/back-design/upload", adminMiddleware, uploadLibrary.fields([
    { name: "design", maxCount: 1 },
    { name: "design_2", maxCount: 1 }
]), adminUploadBackDesign);
router.put("/back-design/:designId/edit", adminMiddleware, uploadLibrary.fields([
    { name: "design", maxCount: 1 },
    { name: "design_2", maxCount: 1 }
]), editBackDesign);
router.post("/library-design/upload", adminMiddleware, uploadLibrary.fields([
    { name: "design", maxCount: 1 },
    { name: "design_2", maxCount: 1 }
]), uploadLibraryDesign);
router.get("/library-designs", adminMiddleware, getLibraryDesignsByCountry);
router.get("/study-trip-countries", adminMiddleware, getStudyTripCountries);
router.delete("/back-design/:designId/delete", adminMiddleware, adminDeleteBackDesign);
router.delete("/back-design/:designId/permanent-delete", adminMiddleware, adminPermanentDeleteBackDesign);
router.delete("/library-design/:designId/delete", adminMiddleware, adminDeleteLibraryDesign);
router.delete("/library-design/:designId/permanent-delete", adminMiddleware, adminPermanentDeleteLibraryDesign);
router.put("/lock-class/:classId", adminMiddleware, lockClass);
router.put("/unlock-class/:classId", adminMiddleware, unlockClass);
router.put("/class/:classId/process-status", adminMiddleware, updateClassProcessStatus);


// NameList (Admin)
router.get("/namelist/list", adminMiddleware, getAllNameList);
router.get("/namelist/:class_id/class", adminMiddleware, getClassNameList);
router.put("/namelist/:id/approve", adminMiddleware, approveNameList);
router.put("/namelist/:id/reject", adminMiddleware, rejectNameList);
router.put("/namelist/:id/unlock", adminMiddleware, unlockNameList);

// Education Programs
router.post("/education-program/create", adminMiddleware, addEducationProgram);
router.get("/education-programs", adminMiddleware, listEducationPrograms);
router.put("/education-program/:id/update", adminMiddleware, editEducationProgram);
router.delete("/education-program/:id/delete", adminMiddleware, deleteEducationProgram);

// Production Packages
router.get("/orders/list", adminMiddleware, getAllOrders);
router.get("/orders/:orderId/details", adminMiddleware, getOrderDetails);
router.get("/orders/:orderId/history", adminMiddleware, getOrderHistory);
router.put("/orders/:orderId/unlock", adminMiddleware, unlockOrder);
router.put("/orders/:orderId/lock", adminMiddleware, lockOrder);
router.get("/debug/order-history", adminMiddleware, debugOrderHistory);

// Student Routes (Admin)
router.post("/students", adminMiddleware, listAllStudents);
router.get("/student/:id/details", adminMiddleware, getStudentDetails);
router.delete("/student/:id/delete", adminMiddleware, deleteStudent);
router.delete("/student/:id/permanent-delete", adminMiddleware, permanentDeleteStudent);

// Production Packages
router.post("/generate-files/:classId", adminMiddleware, generateProductionFiles);
router.post("/generate-files/order/:orderId", adminMiddleware, generateOrderProductionFiles);
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

// Shipping Rates
router.get("/shipping-rates", adminMiddleware, listShippingRates);
router.get("/shipping-rate/:id", adminMiddleware, getShippingRate);
router.post("/shipping-rate/create", adminMiddleware, createShippingRate);
router.put("/shipping-rate/:id/update", adminMiddleware, updateShippingRate);
router.put("/shipping-rate/:id/toggle-status", adminMiddleware, toggleShippingRateStatus);
router.delete("/shipping-rate/:id/delete", adminMiddleware, deleteShippingRate);

// Support Tickets
router.get("/support/tickets", adminMiddleware, listAllTickets);
router.get("/support/rating-summary", adminMiddleware, getRatingSummary);
router.get("/support/ticket/:ticketId", adminMiddleware, getTicketMessages);
router.get("/support/ticket/:ticketId/messages", adminMiddleware, getTicketMessages); // alias
router.patch("/support/:ticketId/close", adminMiddleware, closeTicket);

export default router;
