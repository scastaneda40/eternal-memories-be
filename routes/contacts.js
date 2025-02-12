const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get contacts
router.get("/contacts", async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json(data);
});

// Add a contact
router.post("/contacts", async (req, res) => {
  const { user_id, name, email, phone } = req.body;

  if (!user_id || !name) {
    return res.status(400).json({ error: "User ID and name are required" });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({ user_id, name, email, phone });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// Export the router
module.exports = router;
