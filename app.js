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

// ✅ Enable CORS globally
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/class-rep", classRepRoutes);
app.use("/api/student", studentRoutes);

app.get("/", (req, res) => {
    res.send("StudentLife Backend API v1.5 is running");
});

// Multer error handler
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