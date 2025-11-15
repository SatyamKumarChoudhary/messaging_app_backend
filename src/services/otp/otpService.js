import admin from './firebaseConfig.js';

export async function verifyOTP(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return {
      success: true,
      uid: decodedToken.uid,
      phone: decodedToken.phone_number
    };
  } catch (error) {
    console.error('OTP Verification Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
