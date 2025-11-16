// import admin from 'firebase-admin';
// import { readFileSync } from 'fs';
// import { fileURLToPath } from 'url';
// import { dirname, join } from 'path';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// const serviceAccount = JSON.parse(
//   readFileSync(join(__dirname, 'serviceAccountKey.json'), 'utf8')
// );

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

// export default admin;



import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try environment variable first (for Railway)
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  // Fallback to file (for local development)
  const serviceAccount = JSON.parse(
    readFileSync(join(__dirname, 'serviceAccountKey.json'), 'utf8')
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

export default admin;