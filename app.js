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
import smsRoutes from "./routes/smsRoutes.js";
import { runSmsPipelineScheduler } from "./services/smsScheduler.js";
import cors from "cors";
import path from "path";
import { checkExpiredHoldOrders } from "./utils/expiryWorker.js";

import { Server } from "socket.io";
import http from "http";
import { registerSupportSocketHandlers } from "./controllers/supportController.js";

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
    registerSupportSocketHandlers(io, socket);

    socket.on("disconnect", () => {
    });
});

// Explicit CORS headers and preflight middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    next();
});

app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
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

// Serve static brand assets (e.g. email/PDF logo) directly from the API —
// bypasses the frontend host's CDN image optimization, which was silently
// re-encoding clothLogo.png as WebP and breaking transparency in emails.
app.use("/assets", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    next();
}, express.static(path.join(process.cwd(), "assets")));

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
app.use("/api/sms", smsRoutes);

app.get("/", (req, res) => {
    res.send("StudentLife Cloth Backend is running");
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
    console.log(`Server is running on port ${PORT}`);

    // Start the expiry checking worker interval (every 1 minute)
    checkExpiredHoldOrders(); // Run once immediately on start
    setInterval(() => {
        checkExpiredHoldOrders();
    }, 60000);

    // Start SMS pipeline scheduler (runs on start & every 1 hour)
    runSmsPipelineScheduler();
    setInterval(() => {
        runSmsPipelineScheduler();
    }, 3600000);
});