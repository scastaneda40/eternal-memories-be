const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post("/capsules", async (req, res) => {
  const {
    title,
    description,
    release_date,
    timezone,
    user_id,
    privacy_id,
    profile_id,
    location, // Geometry: e.g., "POINT(-122.4194 37.7749)"
    address,  // Human-readable address
  } = req.body;

  if (!title || !release_date || !timezone || !user_id || !privacy_id || !profile_id) {
    console.error("Validation Error: Missing required fields.");
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    console.log("Saving capsule with details:", {
      title,
      description,
      release_date,
      timezone,
      location,
      address,
    });

    const { data, error } = await supabase
      .from("capsules")
      .insert([
        {
          title,
          description,
          release_date,
          timezone,
          user_id,
          privacy_id,
          profile_id,
          location, // Save the location as a geometry point
          address,  // Save the human-readable address
        },
      ])
      .select();

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ error: "Failed to save capsule." });
    }

    console.log("Capsule saved successfully:", data[0]);
    res.status(201).json(data[0]);
  } catch (err) {
    console.error("Unexpected Error:", err.message);
    res.status(500).json({ error: "Server error occurred." });
  }
});


router.get("/capsules", async (req, res) => {
    const { user_id } = req.query;
    console.log("Request received for user_id:", user_id);
  if (!user_id) {
    console.error("Validation Error: Missing user_id query parameter.");
    return res.status(400).json({ error: "Missing user_id query parameter." });
  }

  try {
    console.log("Fetching capsules for user:", user_id);

    const { data, error } = await supabase
      .from("capsules")
      .select("*")
      .eq("user_id", user_id);

    if (error) throw error;

    console.log("Raw capsules data from DB:", data);

    // Convert UTC release_date to the user's local timezone for display
    const adjustedData = data.map((capsule) => {
      const convertedDate = new Date(capsule.release_date).toLocaleString(undefined, {
        timeZone: capsule.timezone,
      });
      console.log(`Converting release_date for capsule ${capsule.id}:`, {
        original: capsule.release_date,
        timezone: capsule.timezone,
        converted: convertedDate,
      });

      return {
        ...capsule,
        release_date: convertedDate,
      };
    });

    console.log("Adjusted capsules data:", adjustedData);
    res.status(200).json(adjustedData);
  } catch (err) {
    console.error("Error fetching capsules:", err.message);
    res.status(500).json({ error: "Failed to fetch capsules." });
  }
});

module.exports = router;
