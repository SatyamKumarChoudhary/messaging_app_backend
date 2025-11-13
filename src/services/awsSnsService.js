import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

// Initialize SNS Client
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'ap-south-1', // Mumbai region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Send SMS notification to unregistered user via AWS SNS
 * @param {string} toPhone - Phone number WITH country code (+919876543210)
 * @param {string} senderName - Name of person who sent the message
 * @param {string} messagePreview - Preview of the message
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export const sendSMSNotification = async (toPhone, senderName, messagePreview = '') => {
  try {
    // Ensure phone number has country code
    const formattedPhone = toPhone.startsWith('+') ? toPhone : `+91${toPhone}`;
    
    // Create teaser preview (first 20 chars)
    const previewLength = 20;
    const preview = messagePreview.substring(0, previewLength);
    const remainingChars = messagePreview.length - previewLength;
    
    // Create SMS message with mystery and excitement
    const smsBody = `🎭 Mystery message waiting!\n` +
                `👤 From: ${senderGhostName}\n` +
                `💬 '${preview}...'\n` +
                `Open Snap app to read: https://satyamkumarchoudhary.com`;

    console.log(`📲 Sending SMS via AWS SNS to ${formattedPhone}...`);
    console.log(`📝 Message: ${smsBody}`);

    const params = {
      PhoneNumber: formattedPhone,
      Message: smsBody,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional' // Transactional = high priority, better delivery
        }
      }
    };

    const command = new PublishCommand(params);
    const response = await snsClient.send(command);
    
    console.log(`✅ SMS sent successfully via AWS SNS, MessageId: ${response.MessageId}`);
    
    return {
      success: true,
      messageId: response.MessageId,
      provider: 'AWS SNS'
    };

  } catch (error) {
    console.error('❌ AWS SNS SMS sending failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error',
      provider: 'AWS SNS'
    };
  }
};

/**
 * Validate phone number format (basic validation)
 * @param {string} phoneNumber 
 * @returns {boolean}
 */
export const isValidPhoneNumber = (phoneNumber) => {
  // Basic validation: 10 digits for India or international format
  const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
  return phoneRegex.test(phoneNumber);
};