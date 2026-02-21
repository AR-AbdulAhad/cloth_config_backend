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

            if (requiredRole && req.user.role !== requiredRole && req.user.role !== 'admin') {
                // Admin usually has access to everything, but check specific requirements
                // "Class Representative: Access to own class only" -> logic inside controller usually
                return res.status(403).json({ message: "Insufficient permissions" });
            }

            next();
        } catch (error) {
            return res.status(401).json({ message: "Invalid token" });
        }
    };
};