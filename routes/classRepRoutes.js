import express from "express";
import path from "path";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { generateRegistrationLink } from "../controllers/userController.js";
import { listClasses, getStudentOverview, listStudents, getAssignedClass, listMyLogos, listMyBackDesigns, setMyClassExpectedStudentCount, getMyClassStudentCount } from "../controllers/classRepController.js";
import { listMyClass, editClass } from "../controllers/classController.js";
import { uploadSchoolLogo, deleteMyLogo, editMyLogo } from "../controllers/logoController.js";
import { uploadClassBackDesign, getConfiguratorBackDesign, reUploadClassBackDesign, setClassStudyTripCountry, getLibraryDesignsForMyClass, getStudyTripCountries, deleteMyBackDesign, editMyBackDesign, saveConfiguratorState, loadConfiguratorState } from "../controllers/designController.js";
import multer from "multer";
import { getNameListForUser, addNameListItem, updateNameListItem, reorderNameListItems, markNameListReady, createNameList, deleteNameListItem } from "../controllers/nameListControllers.js";
import { getActiveFonts, setNameListFont } from "../controllers/fontController.js";
import { getStudentDetails, deleteStudent } from "../controllers/studentController.js";

const logoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, "uploads/school_logo/");
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        const schoolId = req.user?.school_id ?? req.body?.school_id ?? "unknown";
        const uniqueName = `school_${schoolId}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

const uploadLogo = multer({
    storage: logoStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
    }
});

const backDesignStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, "uploads/class_back_designs/");
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        const classId = req.user?.class_id ?? req.body?.class_id ?? req.body?.classId ?? "unknown";
        const uniqueName = `class_${classId}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

const uploadBackDesign = multer({
    storage: backDesignStorage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB for designs
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
    }
});
const router = express.Router();
const middleware = authMiddleware("class_representative");

// Class Management
router.get("/get-class", middleware, listMyClass);
router.get("/assigned-class", middleware, getAssignedClass);
router.put("/class/:classId/expected-students", middleware, setMyClassExpectedStudentCount);
router.get("/class/:classId/student-count", middleware, getMyClassStudentCount);
// router.put("/class/:id/update", middleware, editClass);

// Student Management
router.post("/students", middleware, listStudents);
router.get("/student/:id/details", middleware, getStudentDetails);
router.delete("/student/:id/delete", middleware, deleteStudent);
router.get("/generate-registration-link", middleware, generateRegistrationLink);


// Design & Assets
router.post("/upload-logo", middleware, uploadLogo.single("logo"), uploadSchoolLogo);
router.post("/upload-back-design", middleware, uploadBackDesign.fields([
    { name: "backDesign", maxCount: 1 },
    { name: "backDesign_2", maxCount: 1 }
]), uploadClassBackDesign);
router.post("/upload-back-design/:id", middleware, uploadBackDesign.fields([
    { name: "backDesign", maxCount: 1 },
    { name: "backDesign_2", maxCount: 1 }
]), reUploadClassBackDesign);
router.post("/my-logos", middleware, listMyLogos);
router.delete("/logo/:logoId/delete", middleware, deleteMyLogo);
router.put("/logo/:logoId/edit", middleware, editMyLogo);
router.post("/back-designs", middleware, listMyBackDesigns);
router.delete("/back-design/:designId/delete", middleware, deleteMyBackDesign);
router.put("/back-design/:designId/edit", middleware, uploadBackDesign.fields([
    { name: "configuredDesign", maxCount: 1 },
    { name: "configuredDesign_2", maxCount: 1 },
    { name: "backDesign", maxCount: 1 },
    { name: "backDesign_2", maxCount: 1 }
]), editMyBackDesign);
router.post("/configurator/save-state", middleware, saveConfiguratorState);
router.get("/configurator/load-state", middleware, loadConfiguratorState);
router.get("/class/:classId/configurator-back-design", middleware, getConfiguratorBackDesign);
router.get("/study-trip-countries", middleware, getStudyTripCountries);
router.put("/set-study-trip-country", middleware, setClassStudyTripCountry);
router.get("/library-designs", middleware, getLibraryDesignsForMyClass);
// Name List & Overview
router.get("/name-list", middleware, getNameListForUser);
router.post("/student-overview", middleware, getStudentOverview);
router.post("/student-overview/:classId", middleware, getStudentOverview);

router.post("/namelist/:name_list_id/item", middleware, addNameListItem);
router.put("/namelist/item/:item_id", middleware, updateNameListItem);
router.put("/namelist/reorder/:name_list_id", middleware, reorderNameListItems);
router.put("/namelist/:name_list_id/ready", middleware, markNameListReady);
router.post("/namelist/create", middleware, createNameList);
router.delete("/namelist/item/:item_id", middleware, deleteNameListItem);
router.get("/fonts", middleware, getActiveFonts);
router.put("/namelist/set-font", middleware, setNameListFont);


export default router;
