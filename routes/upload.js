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

router.post("/", upload.any(), async (req, res) => {
  const files = req.files;
  try {
    const {
      user_id,
      profile_id: receivedProfileId,
      tags,
      description,
      actual_date,
      address,
      location,
    } = req.body;

    if (!receivedProfileId) {
      return res.status(400).send({ error: "Profile ID is required" });
    }

    const profile_id = receivedProfileId;

    if (!files || files.length === 0) {
      return res.status(400).send({ error: "No files uploaded" });
    }

    // Parse location coordinates
    let geoPoint = null;
    if (location) {
      try {
        const parsedLocation = JSON.parse(location);
        if (parsedLocation.latitude && parsedLocation.longitude) {
          geoPoint = `POINT(${parsedLocation.longitude} ${parsedLocation.latitude})`;
        }
      } catch (err) {
        console.error("Error parsing location JSON:", err.message);
      }
    }

    // Insert memory
    const { data: memoryData, error: memoryError } = await supabase
      .from("memories")
      .insert([
        {
          user_id,
          profile_id,
          title: req.body.title || null,
          tags,
          description,
          actual_date,
          address: address || null,
          location: geoPoint,
        },
      ])
      .select("id, title, description")
      .single();

    if (memoryError) {
      console.error("Error inserting memory:", memoryError);
      return res.status(500).send({ error: memoryError.message });
    }

    const memory_id = memoryData.id;

    // Handle media uploads
    const mediaEntries = [];
    for (const file of files) {
      const filePath = `uploads/${Date.now()}_${file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("eternal-moment-uploads")
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (uploadError) {
        console.error(`Error uploading file ${file.originalname}:`, uploadError);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from("eternal-moment-uploads")
        .getPublicUrl(filePath);

      const fileUrl = publicUrlData?.publicUrl;

      const mediaType = file.mimetype.startsWith("image/")
        ? "photo"
        : file.mimetype.startsWith("video/")
        ? "video"
        : "audio";

      const { data: mediaBankData, error: mediaBankError } = await supabase
        .from("media_bank")
        .insert([
          {
            user_id,
            profile_id,
            url: fileUrl,
            name: file.originalname,
            media_type: mediaType,
            meta: JSON.stringify({}),
          },
        ])
        .select("id")
        .single();

      if (mediaBankError) {
        console.error(
          `Error inserting media ${file.originalname} for memory ID ${memory_id}:`,
          mediaBankError
        );
        continue;
      }

      mediaEntries.push({
        memory_id,
        media_id: mediaBankData.id,
      });
    }

    // Insert into memory_media
    if (mediaEntries.length > 0) {
      const { error: associationError } = await supabase
        .from("memory_media")
        .insert(mediaEntries);

      if (associationError) {
        console.error(
          "Error inserting into memory_media:",
          associationError
        );
        return res.status(500).send({ error: associationError.message });
      }
    } else {
      await supabase.from("memories").delete().eq("id", memory_id);
      return res.status(400).send({ error: "No media could be uploaded." });
    }

    res.status(200).send({
      message: "Memory and media saved successfully",
      memory_id,
      media_ids: mediaEntries.map((entry) => entry.media_id),
    });
  } catch (error) {
    console.error("Upload endpoint error:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

module.exports = router;

