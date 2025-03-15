const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const getOrCreateUser = async (req, res) => {
  console.log('📩 Received request at /getOrCreateUser');
  console.log('🔹 Headers:', req.headers);

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.log('❌ Missing Supabase token');
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const { data: userSession, error: sessionError } =
    await supabase.auth.getUser(token);
  if (sessionError || !userSession?.user) {
    console.error('❌ Failed to verify Supabase token:', sessionError);
    return res.status(401).json({ error: 'Unauthorized: Invalid session' });
  }

  const supabaseUserId = userSession.user.id;
  console.log('✅ Verified Supabase user:', supabaseUserId);

  try {
    let { data: user, error } = await supabase
      .from('users')
      .select('id, supabase_user_id, email, name, avatar_url')
      .eq('supabase_user_id', supabaseUserId)
      .single();

    if (error && error.code === 'PGRST116') {
      console.log('👤 User not found, creating new user...');
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          supabase_user_id: supabaseUserId,
          email: userSession.user.email,
        })
        .select('id, supabase_user_id, email, name, avatar_url')
        .single();

      if (insertError) {
        console.error('❌ Failed to insert new user:', insertError);
        return res
          .status(500)
          .json({ error: 'Database error', message: insertError.message });
      }

      user = newUser;
      console.log('✅ New user created:', newUser);
    } else if (error) {
      console.error('❌ Database query error:', error);
      return res
        .status(500)
        .json({ error: 'Database error', message: error.message });
    }

    console.log('✅ User found:', user.id);

    // 🔍 Check for profile
    const { data: profile, error: profileError } = await supabase
      .from('profile')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const needsProfile = !profile;
    console.log(`🔹 needsProfile: ${needsProfile}`);

    return res.status(200).json({ user, needsProfile });
  } catch (err) {
    console.error('❌ Error:', err);
    return res
      .status(500)
      .json({ error: 'Database error', message: err.message });
  }
};

module.exports = getOrCreateUser;
