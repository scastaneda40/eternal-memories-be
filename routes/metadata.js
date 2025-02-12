const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Initialize Supabase Client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post("/", async (req, res) => {
    try {
        const { title, description, tags, fileUrl } = req.body;

        const { data, error } = await supabase
            .from("memories")
            .insert([
                {
                    title,
                    description,
                    tags,
                    file_url: fileUrl,
                    created_at: new Date(),
                },
            ]);

        if (error) throw error;

        res.status(200).send({ id: data[0].id, message: "Metadata saved successfully" });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

module.exports = router;
