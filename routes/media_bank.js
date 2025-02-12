const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Configure Multer for Memory Storage
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Route to add media to the Media Bank
router.post("/", upload.single("file"), async (req, res) => {
  console.log("Media Bank upload endpoint called");

  try {
    const { user_id, profile_id, meta } = req.body;

    if (!user_id) {
      console.error("User ID is missing");
      return res.status(400).send({ error: "User ID is required" });
    }

    if (!profile_id) {
      console.error("Profile ID is missing");
      return res.status(400).send({ error: "Profile ID is required" });
    }

    const file = req.file;
    if (!file) {
      console.error("No file uploaded");
      return res.status(400).send({ error: "No file uploaded" });
    }

    const filePath = `media_bank/${Date.now()}_${file.originalname}`;

    // Upload file to Supabase storage
    const { data, error: uploadError } = await supabase.storage
      .from("eternal-moment-uploads")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return res.status(403).send({ error: uploadError.message });
    }

    console.log("File uploaded successfully:", data);

    // Generate public URL
    const { data: publicUrlData } = supabase.storage
      .from("eternal-moment-uploads")
      .getPublicUrl(filePath);

    const fileUrl = publicUrlData?.publicUrl;

    if (!fileUrl) {
      console.error("Failed to generate public URL");
      return res.status(500).send({ error: "Failed to generate public URL" });
    }

    console.log("Generated file URL:", fileUrl);

    // Save metadata to the media_bank table
    console.log("Saving media to the media_bank table...");
    const { error: metadataError } = await supabase.from("media_bank").insert([
      {
        user_id,
        profile_id,
        file_url: fileUrl,
        file_name: file.originalname,
        meta: meta || null,
      },
    ]);

    if (metadataError) {
      console.error("Error saving media to media_bank:", metadataError);
      return res.status(500).send({ error: metadataError.message });
    }

    console.log("Media saved successfully to the media_bank");
    res.status(200).send({ message: "Media added to the media bank successfully" });
  } catch (error) {
    console.error("Media Bank upload endpoint error:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

module.exports = router;
