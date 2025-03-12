const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Unauthorized: No token provided" });
        }

        const token = authHeader.split(" ")[1]; // Extract token
        const decodedToken = jwt.decode(token); // Decode JWT

        if (!decodedToken || !decodedToken.sub) {
            return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        req.user = { id: decodedToken.sub }; // Attach user ID to request
        next();
    } catch (error) {
        return res.status(401).json({ error: "Unauthorized: Token verification failed" });
    }
};

module.exports = authMiddleware;
