import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

export const authMiddleware = (requiredRole) => {
    return async (req, res, next) => {
        const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>

        if (!token) {
            return res.status(401).json({ message: "Authentication required" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

            // Fetch fresh user status from DB to block disabled (status=1) accounts
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: { id: true, status: true, role: true }
            });

            if (!user) {
                return res.status(401).json({ message: "Account not found" });
            }

            if (user.status === 1) {
                return res.status(403).json({ message: "Account is disabled. Contact support." });
            }

            if (user.status === 2) {
                return res.status(403).json({ message: "Account has been deleted." });
            }

            req.user = decoded;

            // Allow both admin and class_representative to have elevated access
            if (requiredRole && 
                req.user.role !== requiredRole && 
                req.user.role !== 'admin' ) {
                return res.status(403).json({ message: "Insufficient permissions" });
            }
// && 
//                 req.user.role !== 'class_representative'
            next();
        } catch (error) {
            return res.status(401).json({ message: "Invalid token" });
        }
    };
};