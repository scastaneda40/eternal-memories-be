const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const getOrCreateUser = async (req, res) => {
  console.log("Received request:", req.body);

  const { clerk_user_id, email } = req.body;

  if (!clerk_user_id || !email) {
    console.error("Missing required fields:", { clerk_user_id, email });
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name, avatar_url")
      .eq("clerk_user_id", clerk_user_id)
      .single();
    console.log('user', data)
    if (error && error.code === "PGRST116") {
      console.log("User not found, creating new user...");
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({ clerk_user_id, email })
        .select("id, email, name, avatar_url")
        .single();

      if (insertError) throw insertError;

      console.log("New user created:", newUser);
      return res.status(200).json(newUser);
    } else if (error) {
      console.error("Database query error:", error);
      throw error;
    }

    console.log("User found:", data.id);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
};

module.exports = getOrCreateUser;
