const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// ✅ Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ Use SERVICE ROLE for admin access
);

router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query; // ✅ Get user ID from query params

    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    console.log("🔍 Fetching media for user:", user_id);

    // ✅ Query `media_bank` table in Supabase Database (not Storage)
    const { data, error } = await supabase
      .from("media_bank") // ✅ This is the DB table (not storage)
      .select("*")
      .eq("user_id", user_id);

    if (error) {
      console.error("❌ Error fetching media from DB:", error.message);
      return res.status(500).json({ error: error.message });
    }

    // ✅ Fetch Public URLs for each file from Supabase Storage
    const media = data.map((file) => ({
      id: file.id,
      name: file.name, // ✅ Use correct field name for the file
      url: file.url
    }));

    console.log("✅ Successfully fetched media:", media);
    return res.json({ media });

  } catch (err) {
    console.error("❌ Server Error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;


