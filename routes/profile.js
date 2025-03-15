const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  const { name, relationship, traits, sayings, memories, user_id } = req.body;

  // Validate required fields
  const requiredFields = [
    'name',
    'relationship',
    'traits',
    'sayings',
    'memories',
    'user_id',
  ];
  const missingFields = requiredFields.filter((field) => !req.body[field]);

  if (missingFields.length > 0) {
    return res.status(400).send({
      error: 'Validation Error',
      message: `Missing required fields: ${missingFields.join(', ')}`,
    });
  }

  try {
    // Insert the profile data into the database
    const { data, error } = await supabase
      .from('profile')
      .insert([
        {
          name,
          relationship,
          traits,
          sayings,
          memories,
          user_id,
        },
      ])
      .select();

    if (error) {
      console.error('Error saving profile:', error.message);
      return res.status(500).send({
        error: 'Database Error',
        message: 'Failed to save profile. Please try again later.',
      });
    }

    // Respond with the inserted profile data
    res.status(201).send({
      message: 'Profile saved successfully',
      profile: data[0],
    });
  } catch (err) {
    console.error('Unexpected server error:', err.message);
    res.status(500).send({
      error: 'Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

router.get('/', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id parameter' });
  }

  try {
    const { data, error } = await supabase
      .from('profile')
      .select('*')
      .eq('user_id', user_id);

    if (error) {
      console.error('❌ Supabase Error:', error.message);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to fetch profiles.',
      });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('❌ Unexpected server error:', err.message);
    res.status(500).json({
      error: 'Server Error',
      message: 'An unexpected error occurred.',
    });
  }
});

module.exports = router;
