const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const signUpUser = async (req, res) => {
  console.log('📩 Received request at /auth/signup');

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  console.log('🛠 Attempting Supabase sign-up...');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error('❌ Supabase sign-up error:', error.message);
    return res.status(400).json({ error: error.message });
  }

  console.log('✅ Supabase sign-up successful:', data);

  return res.status(200).json({
    message: 'User registered successfully. Check your email for confirmation.',
  });
};

module.exports = signUpUser;
