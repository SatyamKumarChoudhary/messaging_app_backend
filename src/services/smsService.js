// Import using CommonJS style for msg91
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const msg91 = require('msg91').default;

// Initialize MSG91
msg91.initialize({ authKey: process.env.MSG91_AUTH_KEY });

/**
 * Send SMS notification to unregistered user
 * @param {string} toPhone - Phone number WITH country code (+919876543210)
 * @param {string} senderName - Name of person who sent the message
 * @param {string} messagePreview - Preview of the message
 */
export const sendMessageNotificationSMS = async (toPhone, senderName, messagePreview = '') => {
  try {
    // Format phone: Remove + sign (MSG91 expects: 919876543210)
    const formattedPhone = toPhone.replace('+', '');

    // SMS message (keep under 160 chars for single SMS cost)
    const smsBody = `Hi! ${senderName} sent you a message on Snap!\n` +
                    `"${messagePreview.substring(0, 35)}${messagePreview.length > 35 ? '...' : ''}"\n` +
                    `Register: https://snap.app`;

    console.log(`📲 Sending SMS to ${formattedPhone}...`);
    console.log(`📝 Message: ${smsBody}`);

    // Get SMS instance
    const sms = msg91.getSMS();
    
    // Correct format for msg91 SDK
    const response = await sms.send(
      process.env.MSG91_SENDER_ID || 'MSG91',  // sender
      formattedPhone,                           // mobile (without +)
      smsBody,                                  // message
      '4'                                       // route (4 = transactional)
    );

    console.log(`✅ SMS sent successfully:`, response);
    
    return {
      success: true,
      messageId: response.message || response.request_id,
      cost: '₹0.25',
      response: response
    };

  } catch (error) {
    console.error('❌ SMS sending failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
};

/**
 * Check MSG91 account balance
 */
export const checkSMSBalance = async () => {
  try {
    console.log('💰 Check balance in MSG91 dashboard');
    return null;
  } catch (error) {
    console.error('Error checking balance:', error);
    return null;
  }
};