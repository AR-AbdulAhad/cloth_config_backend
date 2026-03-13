import jwt from "jsonwebtoken";

export const authMiddleware = (requiredRole) => {
    return (req, res, next) => {
        const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>

        if (!token) {
            return res.status(401).json({ message: "Authentication required" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
            req.user = decoded;

            // Allow both admin and class_representative to have elevated access
            if (requiredRole && 
                req.user.role !== requiredRole && 
                req.user.role !== 'admin' && 
                req.user.role !== 'class_representative') {
                return res.status(403).json({ message: "Insufficient permissions" });
            }

            next();
        } catch (error) {
            return res.status(401).json({ message: "Invalid token" });
        }
    };
};