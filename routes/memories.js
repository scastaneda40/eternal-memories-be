const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");

const router = express.Router();

// Initialize Supabase Client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch memories
router.get("/", async (req, res) => {
    const { profile_id } = req.query;

    console.log(`[GET /memories] Profile ID: ${profile_id}`);

    if (!profile_id) {
        return res.status(400).json({ error: "Validation Error", message: "Profile ID is required." });
    }

    try {
        const { data, error } = await supabase
            .from("memories")
            .select("*")
            .eq("profile_id", profile_id);

        if (error) {
            console.error("Error fetching memories from database:", error.message);
            return res.status(500).json({ error: "Database Error", message: error.message });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: "No memories found for this profile." });
        }

        console.log("Fetched memories:", data);
        res.status(200).json(data);
    } catch (err) {
        console.error("Unexpected server error:", err.message);
        res.status(500).json({ error: "Server Error", message: err.message });
    }
});

module.exports = router;
