import express from "express";
import path from "path";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { getStudentOverview, listStudents, generateRegistrationLink } from "../controllers/userController.js";
import { listMyClass, editClass, getAssignedClass } from "../controllers/classController.js";
import { uploadSchoolLogo, listMyLogos } from "../controllers/logoController.js";
import { uploadClassBackDesign, listMyBackDesigns, getConfiguratorBackDesign, reUploadClassBackDesign } from "../controllers/designController.js";
import multer from "multer";
import { getNameListForUser, addNameListItem, updateNameListItem, reorderNameListItems, markNameListReady, createNameList, deleteNameListItem } from "../controllers/nameListControllers.js";

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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for designs
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
// router.put("/class/:id/update", middleware, editClass);

// Student Management
router.post("/students", middleware, listStudents);
router.get("/generate-registration-link", middleware, generateRegistrationLink);


// Design & Assets
router.post("/upload-logo", middleware, uploadLogo.single("logo"), uploadSchoolLogo);
router.post("/upload-back-design", middleware, uploadBackDesign.single("backDesign"), uploadClassBackDesign);
router.post("/upload-back-design/:id", middleware, uploadBackDesign.single("backDesign"), reUploadClassBackDesign);
router.post("/my-logos", middleware, listMyLogos);
router.post("/back-designs", middleware, listMyBackDesigns);
router.get("/class/:classId/configurator-back-design", middleware, getConfiguratorBackDesign);
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


export default router;
