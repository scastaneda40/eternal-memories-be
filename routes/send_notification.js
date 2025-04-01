const express = require('express');
const router = express.Router();
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('twilio phone', process.env.TWILIO_PHONE_NUMBER);
// Configure SendGrid and Twilio
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Function to validate phone numbers in E.164 format
const validatePhoneNumber = (number) => /^\+?[1-9]\d{1,14}$/.test(number);

// Function to fetch capsule details dynamically
const fetchCapsuleDetails = async (capsuleId) => {
  try {
    const { data: capsule, error: capsuleError } = await supabase
      .from('capsules')
      .select('*')
      .eq('id', capsuleId)
      .single();

    if (capsuleError) {
      console.error('Error fetching capsule details:', capsuleError.message);
      return null;
    }

    const { data: capsuleMedia, error: mediaError } = await supabase
      .from('capsule_media')
      .select(
        `
        media_bank (
          id,
          url,
          name,
          media_type
        )
      `
      )
      .eq('capsule_id', capsuleId);

    if (mediaError) {
      console.error('Error fetching capsule media:', mediaError.message);
      return null;
    }

    const mediaFiles = capsuleMedia.map((entry) => entry.media_bank);
    console.log('Raw capsule media:', capsuleMedia);

    const images = mediaFiles
      .filter((media) => media.media_type === 'photo')
      .map((media) => media.url);

    const videos = mediaFiles
      .filter((media) => media.media_type === 'video')
      .map((media) => media.url);

    const imageUrl = images[0] || null; // Use the first image if available
    const videoUrl = videos[0] || null; // Use the first video if available

    console.log('Extracted images:', images);
    console.log('Extracted videos:', videos);

    return { ...capsule, imageUrl, videoUrl, mediaFiles, images, videos };
  } catch (err) {
    console.error('Unexpected error fetching capsule details:', err.message);
    return null;
  }
};

// Function to generate email HTML
const generateEmailHtml = (capsule) => {
  console.log('Generating email HTML for capsule:', capsule);

  let mediaGrid = ''; // Default to no media grid

  // Extract the first image
  const primaryImage = [...new Set(capsule.images)][0];

  // Build media grid with one image only
  if (primaryImage) {
    mediaGrid = `
      <div style="display: flex; justify-content: center; align-items: center; padding: 20px 0;">
        <img src="${primaryImage}" alt="Primary Image" style="width: 100%; max-width: 600px; height: auto; object-fit: cover; border-radius: 8px; box-sizing: border-box;" />
      </div>
    `;
  }

  // Generate the email HTML
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9; box-sizing: border-box;">
      <h1 style="text-align: center; color: #19747E;">The Capsule is Open &ndash; Don&rsquo;t Miss It!
      </h1>
      ${mediaGrid}
      <p style="font-size: 16px; color: #333; line-height: 1.5; margin-bottom: 20px; padding: 0;">
        ${
          capsule.description ||
          'Discover special memories curated just for you!'
        }
      </p>
      <a href="${
        capsule.detailsPageUrl
      }" style="display: block; width: 200px; margin: 20px auto; text-align: center; padding: 10px; background-color: #19747E; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">View Capsule</a>
    </div>
  `;
};

// Function to truncate SMS messages
const truncateMessage = (message, limit = 800) => {
  if (message.length > limit) {
    console.log(
      `Original message length: ${message.length}. Truncating to ${limit} characters.`
    );
    return message.slice(0, limit - 3) + '...'; // Truncate and add ellipsis
  }
  console.log(`Message length is within the limit: ${message.length}`);
  return message;
};

router.post('/send-notification', async (req, res) => {
  const { contacts, notificationType, capsule } = req.body;

  // Optional: validate capsule exists
  const capsuleDetails = await fetchCapsuleDetails(capsule.id);
  if (!capsuleDetails) {
    return res.status(404).send({ error: 'Capsule not found.' });
  }

  // Combine capsule and contact info into one payload
  const fullPayload = {
    capsuleId: capsule.id,
    title: capsule.title,
    description: capsule.description,
    imageUrl: capsule.imageUrl || null,
    videoUrl: capsule.videoUrl || null,
    detailsPageUrl: capsule.detailsPageUrl,
    contacts,
    notificationType,
  };

  try {
    const { error } = await supabase.from('scheduled_notifications').insert([
      {
        capsule_id: capsule.id,
        contacts, // Optional: keep for direct access
        notification_type: notificationType, // must match your enum ('email', 'text', 'both')
        sent: false,
        payload: fullPayload, // 💾 Store full payload for later use
      },
    ]);

    if (error) {
      console.error('Failed to schedule notification:', error.message);
      return res
        .status(500)
        .send({ error: 'Failed to schedule notification.' });
    }

    console.log('✅ Notification scheduled for release day.');
    res.status(200).send({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error.message);
    res.status(500).send({ error: 'Failed to schedule notification.' });
  }
});

router.post('/run-scheduled-notifications', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  const today = new Date().toISOString().split('T')[0];

  const { data: notifications, error } = await supabase
    .from('scheduled_notifications')
    .select('*')
    .eq('sent', false);

  if (error) {
    console.error('Error fetching scheduled notifications:', error.message);
    return res
      .status(500)
      .send({ error: 'Error fetching scheduled notifications' });
  }

  for (const notif of notifications) {
    const capsule = await fetchCapsuleDetails(notif.capsule_id);

    if (!capsule) continue;

    // Only send if today is the capsule release day
    const releaseDate = new Date(capsule.release_date)
      .toISOString()
      .split('T')[0];
    if (releaseDate !== today) continue;

    const { contacts, notification_type } = notif;

    if (notification_type === 'email' || notification_type === 'both') {
      const emailRecipients = contacts.filter((c) => c.email);

      for (const contact of emailRecipients) {
        try {
          await sgMail.send({
            to: contact.email,
            from: 'stephen.castaneda40@gmail.com',
            subject: `Hi ${contact.name || 'there'}, a Capsule is ready!`,
            html: generateEmailHtml(capsule),
          });
        } catch (err) {
          console.error(`Failed to email ${contact.email}:`, err.message);
        }
      }
    }

    // future: SMS logic here...

    // Mark as sent
    await supabase
      .from('scheduled_notifications')
      .update({ sent: true })
      .eq('id', notif.id);
  }

  res.status(200).send({ success: true });
});

module.exports = router;
