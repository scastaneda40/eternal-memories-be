const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();
const multer = require('multer');
const mime = require('mime-types');
const fs = require('fs');
const path = require('path');
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ Use SERVICE ROLE for admin access
);

router.get('/', async (req, res) => {
  try {
    const { user_id } = req.query; // ✅ Get user ID from query params

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log('🔍 Fetching media for user:', user_id);

    // ✅ Query `media_bank` table in Supabase Database (not Storage)
    const { data, error } = await supabase
      .from('media_bank') // ✅ This is the DB table (not storage)
      .select('*')
      .eq('user_id', user_id);

    if (error) {
      console.error('❌ Error fetching media from DB:', error.message);
      return res.status(500).json({ error: error.message });
    }

    // ✅ Fetch Public URLs for each file from Supabase Storage
    const media = data.map((file) => ({
      id: file.id,
      name: file.name, // ✅ Use correct field name for the file
      url: file.url,
    }));

    console.log('✅ Successfully fetched media:', media);
    return res.json({ media });
  } catch (err) {
    console.error('❌ Server Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

function getPublicUrl(filePath) {
  return `https://lgyrbjjnuagmqcnmutfc.supabase.co/storage/v1/object/public/eternal-moment-uploads/${filePath}`;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { user_id } = req.body;
    const file = req.file;

    if (!user_id || !file) {
      return res.status(400).json({ error: 'Missing user_id or file' });
    }

    const fileName = `${Date.now()}_${file.originalname}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('eternal-moment-uploads')
      .upload(filePath, file.buffer, {
        contentType:
          mime.lookup(file.originalname) || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Upload failed:', uploadError.message);
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    const publicUrl = getPublicUrl(filePath);

    const media_type = file.mimetype.startsWith('video') ? 'video' : 'photo';

    const { data: inserted, error: insertError } = await supabase
      .from('media_bank')
      .insert([{ url: publicUrl, media_type, user_id }])
      .select();

    if (insertError) {
      console.error('❌ Insert to media_bank failed:', insertError.message);
      return res.status(500).json({ error: 'Failed to record media in DB' });
    }

    res.status(201).json(inserted[0]);
  } catch (err) {
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ error: 'Unexpected error during upload' });
  }
});

module.exports = router;
