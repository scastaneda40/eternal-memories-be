const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

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

// ✅ **Fetch memories with media URLs**
router.get('/', async (req, res) => {
  const { profile_id } = req.query;

  console.log(`[GET /memories] Profile ID: ${profile_id}`);

  if (!profile_id) {
    return res
      .status(400)
      .json({ error: 'Validation Error', message: 'Profile ID is required.' });
  }

  try {
    const { data, error } = await supabase
      .from('memories')
      .select(
        `
                *,
                memory_media (
                    media_bank (
                        url
                    )
                )
            `
      )
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching memories from database:', error.message);
      return res
        .status(500)
        .json({ error: 'Database Error', message: error.message });
    }

    if (!data || data.length === 0) {
      return res
        .status(404)
        .json({ error: 'No memories found for this profile.' });
    }

    // 🔄 **Format memories to include media URLs**
    const formattedMemories = data.map((memory) => {
      const file_urls =
        memory.memory_media?.map((media) => media.media_bank?.url) || [];
      return { ...memory, file_urls };
    });

    console.log('✅ Fetched formatted memories:', formattedMemories);
    res.status(200).json(formattedMemories);
  } catch (err) {
    console.error('Unexpected server error:', err.message);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

// ✅ Function to upload local files to Supabase storage
async function uploadFileToSupabase(localFilePath) {
  try {
    if (!localFilePath.startsWith('file:///')) {
      return localFilePath; // Already a valid URL
    }

    const filePath = new URL(localFilePath).pathname; // ✅ Convert to usable path
    const fileName = path.basename(filePath); // Extract file name
    const fileBuffer = fs.readFileSync(filePath); // ✅ Read file from correct path

    const { data, error } = await supabase.storage
      .from('eternal-moment-uploads')
      .upload(`uploads/${fileName}`, fileBuffer, {
        contentType: mime.lookup(fileName) || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      console.error(
        `❌ Error uploading ${fileName} to Supabase:`,
        error.message
      );
      return null;
    }

    return `https://lgyrbjjnuagmqcnmutfc.supabase.co/storage/v1/object/public/eternal-moment-uploads/uploads/${fileName}`;
  } catch (err) {
    console.error('❌ Unexpected error uploading file:', err.message);
    return null;
  }
}

// ✅ Route to update a memory
router.put('/update', async (req, res) => {
  const { id, title, actual_date, description, location, address, file_urls } =
    req.body;

  console.log(`[PUT /memories/update] Memory ID: ${id}, Updating memory...`);

  if (!id || !title || !actual_date || !description) {
    return res
      .status(400)
      .json({ error: 'Validation Error', message: 'All fields are required.' });
  }

  // ✅ Convert location to GeoJSON format
  const formattedLocation = location
    ? {
        type: 'Point',
        coordinates: location.coordinates,
      }
    : null;

  try {
    // ✅ Step 1: Update memory details
    const { data: updatedMemory, error: updateError } = await supabase
      .from('memories')
      .update({
        title,
        actual_date,
        description,
        location: formattedLocation,
        address,
      })
      .eq('id', id)
      .select();

    if (updateError) {
      console.error('❌ Error updating memory:', updateError.message);
      return res
        .status(500)
        .json({ error: 'Database Error', message: updateError.message });
    }

    console.log('✅ Memory successfully updated:', updatedMemory);

    // ✅ Step 2: Upload local files to Supabase and get URLs
    const uploadedFileUrls = await Promise.all(
      file_urls.map(async (url) => await uploadFileToSupabase(url))
    );

    // ✅ Filter out failed uploads
    const validUrls = uploadedFileUrls.filter((url) => url !== null);

    // ✅ Step 3: Fetch existing media URLs for this memory
    const { data: existingMedia, error: fetchError } = await supabase
      .from('memory_media')
      .select('media_bank(url), media_id')
      .eq('memory_id', id);

    if (fetchError) {
      console.error('❌ Error fetching existing media:', fetchError.message);
      return res
        .status(500)
        .json({ error: 'Database Error', message: fetchError.message });
    }

    // ✅ Convert existing media to a lookup map
    const existingMediaMap = new Map(
      existingMedia.map((media) => [
        media['media_bank'].url.toLowerCase(),
        media.media_id,
      ])
    );

    console.log('🔹 Existing media URLs:', Array.from(existingMediaMap.keys()));

    // ✅ Step 4: Identify unique new media to insert
    const normalizedNewMediaUrls = validUrls.map((url) =>
      url.trim().toLowerCase()
    );
    const uniqueNewMediaUrls = normalizedNewMediaUrls.filter(
      (url) => !existingMediaMap.has(url)
    );

    console.log('🆕 Unique new media to insert:', uniqueNewMediaUrls);

    if (uniqueNewMediaUrls.length > 0) {
      // ✅ Fetch media IDs from media_bank in one query
      const { data: mediaBankRecords, error: mediaBankError } = await supabase
        .from('media_bank')
        .select('id, url')
        .in('url', uniqueNewMediaUrls);

      if (mediaBankError) {
        console.error(
          '❌ Error fetching media_bank records:',
          mediaBankError.message
        );
        return res
          .status(500)
          .json({ error: 'Database Error', message: mediaBankError.message });
      }

      const mediaBankMap = new Map(
        mediaBankRecords.map((entry) => [entry.url.toLowerCase(), entry.id])
      );

      const insertData = uniqueNewMediaUrls
        .map((url) => mediaBankMap.get(url))
        .filter((mediaId) => mediaId)
        .map((mediaId) => ({
          memory_id: id,
          media_id: mediaId,
        }));

      if (insertData.length > 0) {
        const { error: insertError } = await supabase
          .from('memory_media')
          .insert(insertData);

        if (insertError) {
          console.error(
            '❌ Error inserting media into memory_media:',
            insertError.message
          );
          return res
            .status(500)
            .json({ error: 'Database Error', message: insertError.message });
        }

        console.log(
          `✅ Successfully inserted ${insertData.length} new media entries.`
        );
      }
    } else {
      console.log('⚠️ No new media found to insert.');
    }

    // ✅ Step 5: Delete media that is no longer associated with this memory
    const mediaToDelete = Array.from(existingMediaMap.keys()).filter(
      (url) => !normalizedNewMediaUrls.includes(url)
    );
    console.log('❌ Media to delete:', mediaToDelete);

    if (mediaToDelete.length > 0) {
      // ✅ Fetch media IDs from media_bank for deletion
      const { data: mediaIds, error: mediaBankError } = await supabase
        .from('media_bank')
        .select('id')
        .in('url', mediaToDelete);

      if (mediaBankError) {
        console.error(
          '❌ Error fetching media IDs for deletion:',
          mediaBankError.message
        );
      } else if (mediaIds.length > 0) {
        const mediaIdsToDelete = mediaIds.map((m) => m.id);

        const { error: deleteError } = await supabase
          .from('memory_media')
          .delete()
          .eq('memory_id', id)
          .in('media_id', mediaIdsToDelete);

        if (deleteError) {
          console.error('❌ Error deleting media:', deleteError.message);
        } else {
          console.log('✅ Removed old media successfully.');
        }
      }
    }

    console.log(`🆔 Memory ID to Query Later: ${id}`);

    return res
      .status(200)
      .json({ message: 'Memory updated successfully', data: updatedMemory });
  } catch (err) {
    console.error('❌ Unexpected server error:', err.message);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

module.exports = router;

module.exports = router;
