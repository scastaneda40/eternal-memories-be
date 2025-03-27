const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer'); // Middleware for handling file uploads
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Store in memory before upload

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function uploadFileToSupabase(fileBuffer, originalName) {
  try {
    const fileName = `${Date.now()}_${originalName}`;
    const filePath = `uploads/${fileName}`;

    const { data, error } = await supabase.storage
      .from('eternal-moment-uploads') // ✅ Make sure this matches your storage bucket
      .upload(filePath, fileBuffer, {
        contentType: mime.lookup(originalName) || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      console.error(
        `❌ Error uploading ${originalName} to Supabase:`,
        error.message
      );
      return null;
    }

    return `https://lgyrbjjnuagmqcnmutfc.supabase.co/storage/v1/object/public/eternal-moment-uploads/${filePath}`;
  } catch (err) {
    console.error('❌ Unexpected error uploading file:', err.message);
    return null;
  }
}

router.post('/capsules', upload.array('mediaFiles'), async (req, res) => {
  try {
    const {
      title,
      description,
      release_date,
      timezone,
      user_id,
      privacy_level,
      profile_id,
    } = req.body;

    if (
      !title ||
      !release_date ||
      !timezone ||
      !user_id ||
      !privacy_level ||
      !profile_id
    ) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // ✅ Step 1: Insert Capsule
    const { data: capsuleData, error: capsuleError } = await supabase
      .from('capsules')
      .insert([
        {
          title,
          description,
          release_date,
          timezone,
          user_id,
          privacy_level,
          profile_id,
        },
      ])
      .select();

    if (capsuleError) {
      console.error('Capsule Insertion Error:', capsuleError);
      return res.status(500).json({ error: 'Failed to save capsule.' });
    }

    const newCapsule = capsuleData[0];
    console.log('✅ Capsule created:', newCapsule);

    let uploadedMedia = [];

    // ✅ Step 2: Upload Media to Supabase Storage & Insert in `media_bank`
    if (req.files && req.files.length > 0) {
      uploadedMedia = await Promise.all(
        req.files.map(async (file) => {
          try {
            // ✅ Upload file to Supabase and get the URL
            const publicUrl = await uploadFileToSupabase(
              file.buffer,
              file.originalname
            );

            if (!publicUrl) {
              console.error(
                `❌ Failed to generate public URL for ${file.originalname}`
              );
              return null;
            }

            console.log('🔗 Generated public URL:', publicUrl);

            // ✅ Insert media entry into media_bank
            const { data: mediaData, error: mediaError } = await supabase
              .from('media_bank')
              .insert([
                {
                  url: publicUrl,
                  media_type: file.mimetype.includes('image')
                    ? 'photo'
                    : 'video',
                  user_id,
                },
              ])
              .select();

            if (mediaError) {
              console.error('Database Insert Error:', mediaError);
              return null;
            }

            return {
              id: mediaData[0].id,
              url: publicUrl, // ✅ Ensure the URL is included
              media_type: mediaData[0].media_type,
            };
          } catch (err) {
            console.error('Upload Exception:', err.message);
            return null;
          }
        })
      );

      uploadedMedia = uploadedMedia.filter(Boolean); // ✅ Remove any failed uploads
    }

    // ✅ Step 3: Link Media to Capsule
    if (uploadedMedia.length > 0) {
      const mediaInsertData = uploadedMedia.map((media) => ({
        capsule_id: newCapsule.id,
        media_id: media.id,
      }));

      const { error: mediaLinkError } = await supabase
        .from('capsule_media')
        .insert(mediaInsertData);

      if (mediaLinkError) {
        console.error('Error linking media to capsule:', mediaLinkError);
        return res
          .status(500)
          .json({ error: 'Failed to link media to capsule.' });
      }
    }

    res.status(201).json({ ...newCapsule, mediaFiles: uploadedMedia });
  } catch (err) {
    console.error('Unexpected Error:', err.message);
    res.status(500).json({ error: 'Server error occurred.' });
  }
});

router.get('/capsules', async (req, res) => {
  const { user_id, profile_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id query parameter.' });
  }

  try {
    console.log('🟢 Fetching capsules from the database...');
    let query = supabase.from('capsules').select('*').eq('user_id', user_id);

    if (profile_id) {
      query = query.eq('profile_id', profile_id);
    }

    const { data: capsules, error: capsuleError } = await query;

    if (capsuleError) {
      console.error('❌ Error fetching capsules:', capsuleError);
      return res.status(500).json({ error: 'Failed to fetch capsules.' });
    }

    // ✅ Fetch media files for each capsule
    const enrichedCapsules = await Promise.all(
      capsules.map(async (capsule) => {
        const { data: capsuleMedia, error: mediaError } = await supabase
          .from('capsule_media')
          .select(
            `
            media_id,
            media_bank (
              id,
              url,
              media_type
            )
          `
          )
          .eq('capsule_id', capsule.id);

        if (mediaError) {
          console.error(
            `❌ Error fetching media for capsule ${capsule.id}:`,
            mediaError.message
          );
          return { ...capsule, mediaFiles: [] };
        }

        // ✅ Ensure media URLs are present
        const mediaFiles = capsuleMedia
          .map((entry) => entry.media_bank)
          .filter((media) => media.url); // ✅ Filter out null URLs

        return { ...capsule, mediaFiles };
      })
    );

    res.status(200).json(enrichedCapsules);
  } catch (err) {
    console.error('❌ Unexpected error fetching capsules:', err.message);
    res.status(500).json({ error: 'Failed to fetch capsules.' });
  }
});

router.put('/capsules/:id', async (req, res) => {
  const capsuleId = req.params.id;
  const {
    title,
    description,
    release_date,
    privacy_level,
    profile_id,
    timezone,
    user_id,
    media_urls = [],
  } = req.body;

  try {
    // 1. Update the capsule
    const { error: updateError } = await supabase
      .from('capsules')
      .update({
        title,
        description,
        release_date,
        privacy_level,
        profile_id,
        timezone,
      })
      .eq('id', capsuleId);

    if (updateError) {
      console.error('❌ Error updating capsule:', updateError);
      return res.status(500).json({ error: 'Failed to update capsule.' });
    }

    // 2. Optionally re-link media (delete old + insert new)
    await supabase.from('capsule_media').delete().eq('capsule_id', capsuleId);

    if (media_urls.length > 0) {
      const { data: mediaBank } = await supabase
        .from('media_bank')
        .select('id, url')
        .in('url', media_urls);

      const mediaLinkData = mediaBank.map((media) => ({
        capsule_id: capsuleId,
        media_id: media.id,
      }));

      await supabase.from('capsule_media').insert(mediaLinkData);
    }

    return res.status(200).json({ message: 'Capsule updated successfully' });
  } catch (err) {
    console.error('❌ Error in PUT /capsules/:id:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
