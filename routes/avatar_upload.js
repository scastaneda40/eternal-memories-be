const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Supabase client (Use a secure service role key)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload route
router.post("/", upload.single("file"), async (req, res) => {
    try {
      console.log("Received request:", req.body, req.file);
  
      const { userId } = req.body;
      const file = req.file;
  
      if (!file) return res.status(400).json({ error: "File is missing" });
      if (!userId) return res.status(400).json({ error: "User ID is missing" });
  
      console.log(`Uploading file for user: ${userId}`);
  
      // ✅ Ensure correct path inside Supabase storage
      const fileName = `${userId}-${Date.now()}.jpg`; // FIXED: Ensure it's inside avatars/
  
      // ✅ Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from("avatars")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });
  
      console.log("📂 Supabase Upload Response:", { data, error });
  
      if (error || !data) {
        console.error("❌ Supabase Upload Error:", error);
        return res.status(500).json({ error: "Supabase storage upload failed" });
      }
  
      // ✅ Ensure the correct public URL format
      const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/avatars/${fileName}`;
      console.log("🌐 Corrected Public URL:", publicUrl);
  
      if (!publicUrl) {
        console.error("❌ Failed to generate avatar URL");
        return res.status(500).json({ error: "Failed to generate avatar URL" });
      }
  
      console.log(`✅ Successfully uploaded: ${publicUrl}`);
  
      // ✅ Update user avatar in DB
      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
  
      if (updateError) {
        console.error("❌ Database Update Error:", updateError);
        return res.status(500).json({ error: "Database update failed" });
      }
  
      res.json({ success: true, avatarUrl: publicUrl });
    } catch (error) {
      console.error("🚨 Upload error:", error);
      res.status(500).json({ error: "Upload failed", message: error.message });
    }
  });


module.exports = router;
