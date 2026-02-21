import express from "express";
import dotenv from "dotenv";
import multer from "multer";
import adminRoutes from "./routes/adminRoutes.js";
import classRepRoutes from "./routes/classRepRoutes.js";
import studentRoutes from "./routes/studentRoute.js";
import authRoutes from "./routes/authRoutes.js";
import cors from "cors";
import path from "path";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(cors());
// app.use(cors({
//     origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://localhost:3001","*"],
//     methods: ["GET", "POST", "PUT", "DELETE", "PATCH",],
//     credentials: false
// }));
const allowedOrigins = [
    "*",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:3001",
    "https://cloth-config-dashboard-2026.vercel.app",
];

// app.use(cors({
//     origin: function (origin, callback) {
//         if (!origin) return callback(null, true); // Postman / curl
//         if (allowedOrigins.indexOf(origin) === -1) {
//             const msg = "The CORS policy for this site does not allow access from the specified Origin.";
//             return callback(new Error(msg), false);
//         }
//         return callback(null, true);
//     },
//     methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
//     credentials: true
// }));
// Serve uploaded files (logos, back designs) so frontend can use /uploads/school_logo/xxx.png
// app.use("/uploads", cors(), express.static("uploads"));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {

    setHeaders: (res, path) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
}));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/class-rep", classRepRoutes);
app.use("/api/student", studentRoutes);

app.get("/", (req, res) => {
    res.send("StudentLife Backend API v1.5 is running");
});

// Multer errors (file size, file type) -> JSON response
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ success: false, message: "File too large" });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err.message === "Only image files are allowed") {
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});