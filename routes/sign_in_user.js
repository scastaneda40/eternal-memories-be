const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const signInUser = async (req, res) => {
  console.log('📩 Received request at /auth/signin');

  const { email, password } = req.body;

  if (!email || !password) {
    console.error('❌ Missing email or password');
    return res.status(400).json({ error: 'Missing email or password' });
  }

  console.log('🛠 Attempting Supabase sign-in...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('❌ Supabase sign-in error:', error.message);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  console.log('✅ Supabase sign-in successful:', data.user.id);

  const token = data.session?.access_token;
  if (!token) {
    console.error('❌ No access token received.');
    return res.status(500).json({ error: 'Authentication failed' });
  }

  console.log('🔹 Fetching user data from DB...');
  let { data: user, error: dbError } = await supabase
    .from('users')
    .select('id, email, name, avatar_url')
    .eq('id', data.user.id)
    .single();

  if (dbError || !user) {
    console.log('👤 User not found, creating new user...');

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: data.user.id, // ✅ Use Supabase's user.id directly
        email,
      })
      .select('id, email, name, avatar_url')
      .single();

    if (insertError) {
      console.error('❌ Failed to insert new user:', insertError);
      return res.status(500).json({ error: 'Database error' });
    }

    user = newUser;
    console.log('✅ New user created:', newUser);
  }

  console.log('✅ User found:', user.id);

  // Check if the user needs to complete a profile
  // Check if the user needs to complete a profile
  const { data: profiles, error: profileError } = await supabase
    .from('profile')
    .select('id')
    .eq('user_id', user.id);

  if (profileError) {
    console.error('❌ Error fetching profile:', profileError);
    return res.status(500).json({ error: 'Database error' });
  }

  const needsProfile = !profiles || profiles.length === 0;
  console.log(
    `🔹 User needs profile? ${needsProfile}, Found profiles:`,
    profiles.length
  );

  return res.status(200).json({ token, user, needsProfile });
};

module.exports = signInUser;
