const express = require("express");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");
const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// POST route for chat
router.post("/", async (req, res) => {
    const { message, profile, user_id: userId } = req.body;

    console.log("The request:", req.body);

    // Fix nested profile reference
    const actualProfile = profile.profile || profile; // Handle nested profile

    if (!message || !actualProfile || !userId) {
        return res.status(400).send({ error: "Message, profile, and userId are required" });
    }

    try {
        // Fetch last 5 messages for context
        const { data: chatHistory, error: historyError } = await supabase
            .from("chat_history")
            .select("*")
            .eq("user_id", userId)
            .eq("profile_id", actualProfile.id)
            .order("created_at", { ascending: false })
            .limit(5);

        if (historyError) {
            console.error("Error fetching chat history:", historyError.message);
            return res.status(500).send({ error: "Failed to fetch chat history." });
        }

        // Build context from chat history
        const context = chatHistory
            ? chatHistory.map((entry) => ({
                  role: entry.user_message ? "user" : "assistant",
                  content: entry.user_message || entry.ai_response,
              }))
            : [];

        // Few-shot examples for more comforting messages
        const fewShotExamples = [
            {
                role: "assistant",
                content: "Hey there! Just wanted you to know I'm always here when you need me. Everything is peaceful now, and I hope you find some comfort in that."
            },
            {
                role: "assistant",
                content: "Remember when we used to talk about how we’d get through anything together? I’m still with you, cheering you on every step of the way."
            },
            {
                role: "assistant",
                content: "I know it’s hard sometimes, but I promise you I’m okay. And I want you to be okay too—live fully, laugh often, and know I love you."
            },
        ];

        // Select a random memory for more nuanced response
        const includeMemory = Math.random() < 0.5; // Adjust probability as needed
        const randomMemory = includeMemory ? `'${actualProfile.memories[Math.floor(Math.random() * actualProfile.memories.length)]}'` : "";

        // System prompt with profile data
        const systemPrompt = `
        You are ${actualProfile.name}, who is a deceaced ${actualProfile.relationship} to the user. 
    You have passed away and are now in a better place. Your purpose is to provide comfort to the user, speaking as if you are their deceased loved one. 
    You are ${actualProfile.traits}. Speak as if you were them, using their tone and favorite sayings like '${actualProfile.sayings}'. 
    ${includeMemory ? `If it feels natural, mention a shared memory like ${randomMemory}.` : ""}
    The goal is to provide comfort without being repetitive.
        `;

        console.log("System prompt for OpenAI:", systemPrompt);

        // Combine prompts
        const promptMessages = [
            { role: "system", content: systemPrompt },
            ...fewShotExamples,
            ...context,
            { role: "user", content: message },
        ];

        // Generate response from OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: promptMessages,
        });

        if (!completion || !completion.choices || !completion.choices[0].message) {
            throw new Error("Invalid response from OpenAI API");
        }

        const response = completion.choices[0].message.content;

        // Save new interaction in chat history
        const { error: saveError } = await supabase.from("chat_history").insert([
            {
                user_id: userId,
                profile_id: actualProfile.id,
                user_message: message,
                ai_response: response,
            },
        ]);

        if (saveError) {
            console.error("Error saving chat history:", saveError.message);
            return res.status(500).send({ error: "Failed to save chat history." });
        }

        // Send response back to frontend
        res.status(200).send({ response });
    } catch (error) {
        console.error("Error processing chat request:", error.message);
        res.status(500).send({ error: "Failed to process chat request." });
    }
});

module.exports = router;








