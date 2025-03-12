require("dotenv").config();
const express = require("express");
const cors = require("cors");

const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors({ origin: "*" })); // Allow all origins

const PORT = process.env.PORT || 5000;

// Middleware
 // Adjust origin if needed

app.use(bodyParser.json());

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true }));


// Initialize Supabase Client
const isProd = process.env.NODE_ENV === "production";
const supabase = createClient(
    process.env.SUPABASE_URL,
    isProd ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY
);

// Authentication Middleware
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).send({ message: "Unauthorized" });

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error) throw error;
        req.user = user;
        next();
    } catch (error) {
        res.status(403).send({ error: error.message });
    }
};

// Routes
const uploadRoutes = require("./routes/upload");
const metadataRoutes = require("./routes/metadata");

app.use("/upload", uploadRoutes);
app.use("/metadata", authenticate, metadataRoutes);

// Test Route
app.get("/", (req, res) => {
    res.send("Eternal Moments Backend is running!");
});

// Start Server
app.listen(5000, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

const chatRoutes = require("./routes/chat");
app.use(express.json());
app.use("/chat", chatRoutes);

const profileRoutes = require("./routes/profile");

app.use("/profile", profileRoutes);

const memoriesRoutes = require("./routes/memories"); // New route
app.use("/api/memories", memoriesRoutes); 

const capsuleRoutes = require("./routes/capsules"); // Adjust path to where capsules.js is located
app.use("/api", capsuleRoutes); // Prefix all capsule routes with /api

const mediaBankRouter = require("./routes/media_bank");
app.use("/api/media-bank", mediaBankRouter); 

const avatarUploadRouter = require("./routes/avatar_upload");
app.use("/api/avatar-upload", avatarUploadRouter);

const getOrCreateUser = require("./routes/get_or_create_user"); 
app.post("/users", getOrCreateUser);

app.post("/users", (req, res) => {
    console.log("Received request:", req.body);
    if (!req.body.email) {
      console.error("Missing required fields:", req.body);
      return res.status(400).json({ error: "Missing required fields" });
    }
  
    // Continue processing
  });

  app.get("/users", (req, res) => {
    res.send("Eternal Moments Backend users is running!");
});

const contactsRoutes = require("./routes/contacts");
app.use("/api", contactsRoutes);

const sendNotificationRoutes = require("./routes/send_notification");
app.use("/api", sendNotificationRoutes)
