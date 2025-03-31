const express = require('express');
const router = express.Router();
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  // Fetch dynamic capsule details
  const dynamicCapsuleDetails = await fetchCapsuleDetails(capsule.id);
  if (!dynamicCapsuleDetails) {
    return res.status(404).send({ error: 'Capsule not found.' });
  }

  const capsuleDetails = {
    ...capsule,
    ...dynamicCapsuleDetails,
    images: dynamicCapsuleDetails.images || [], // Include extracted images
    videos: dynamicCapsuleDetails.videos || [], // Include extracted videos
  };

  try {
    // Send Emails
    if (notificationType === 'email' || notificationType === 'both') {
      const emailRecipients = contacts.filter((contact) => contact.email);
      console.log('Email Recipients:', emailRecipients);

      const emailPromises = emailRecipients.map((contact) => {
        console.log('Sending email to:', contact.email);

        return sgMail.send({
          to: contact.email,
          from: 'stephen.castaneda40@gmail.com', // Replace with your verified sender email
          subject: `Hi ${
            contact.name || 'there'
          }, You're Invited to View a Capsule: ${
            capsuleDetails.title || 'Special Memories'
          }`,
          html: generateEmailHtml(capsuleDetails), // Pass updated capsuleDetails
        });
      });

      await Promise.all(emailPromises);
    }
    console.log(generateEmailHtml(capsuleDetails));
    // Send SMS
    // Send SMS
    if (notificationType === 'text' || notificationType === 'both') {
      const smsRecipients = contacts.filter(
        (contact) => contact.phone && validatePhoneNumber(contact.phone)
      );
      console.log('Valid SMS Recipients:', smsRecipients);

      const smsPromises = smsRecipients.map((contact) => {
        const rawMessage = `Hi ${
          contact.name || 'there'
        }, You're Invited to View a Capsule: ${capsuleDetails.title}. ${
          capsuleDetails.description
        } Celebrate and relive the memories here: ${
          capsuleDetails.detailsPageUrl
        }`;
        const message = truncateMessage(rawMessage);

        console.log(
          `Final SMS message length for ${contact.phone}: ${message.length}`
        );
        console.log(`Final SMS content: ${message}`);

        // Select the first image for MMS (if available)
        const mediaUrl = capsuleDetails.images[0] || null;

        return twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: contact.phone,
          mediaUrl: mediaUrl ? [mediaUrl] : undefined, // Include image if available
        });
      });

      for (const promise of smsPromises) {
        try {
          await promise;
        } catch (smsErr) {
          console.error(
            '❌ Failed to send SMS to one recipient:',
            smsErr.message,
            smsErr
          );
        }
      }
      console.log('Text messages sent successfully.');
    }

    console.log('Notifications sent successfully.');
    res.status(200).send({ success: true });
  } catch (error) {
    console.error(
      'Error occurred while sending notifications:',
      error.message,
      error
    );
    res.status(500).send({ error: 'Failed to send notifications.' });
  }
});

module.exports = router;
