import express from "express";
import dotenv from "dotenv";
import multer from "multer";
import adminRoutes from "./routes/adminRoutes.js";
import classRepRoutes from "./routes/classRepRoutes.js";
import studentRoutes from "./routes/studentRoute.js";
import authRoutes from "./routes/authRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import cors from "cors";
import path from "path";

import { Server } from "socket.io";
import http from "http";

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT;

// ✅ Attach io to app for access in routes
app.set("io", io);

// ✅ Socket.io Connection Logic
io.on("connection", (socket) => {
    socket.on("join", (roomId) => {
        socket.join(roomId);
    });

    socket.on("disconnect", () => {
    });
});

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Need raw body for Stripe webhook signature verification
app.use(express.json({
    limit: '100mb', // Increase limit for large HTML templates
    verify: (req, res, buf) => {
        if (req.originalUrl.includes("/webhook")) {
            req.rawBody = buf.toString();
        }
    }
}));
app.use(express.urlencoded({
    extended: true,
    limit: '100mb' // Increase limit for form data as well
}));

// Serve uploads with CORS headers so images load cross-origin
app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    next();
}, express.static(path.join(process.cwd(), "uploads")));

// Intermediate Middleware to inject io 
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/class-rep", classRepRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/contact", contactRoutes);

app.get("/", (req, res) => {
    res.send("StudentLife Backend API v1.5 with Realtime Sockets is running");
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

app.use((req, res, next) => {
    const time = new Date().toISOString();
    next();
});

httpServer.listen(PORT, () => {
});