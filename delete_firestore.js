const http = require('http');
const url = require('url');
const admin = require('firebase-admin');
const config = require('./config.js');
const { env } = require('process');

const TOKEN = process.env.SYNC_TOKEN;
const PORT = process.env.PORT || 4000;

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccount.json')),
});

// =============================
// DELETE FIRESTORE DATA (BATCHED, LIMITED)
// =============================
const deleteFirestoreDataWithLimit = async (firestoreConfig, firestoreDocs, dailyLimit) => {
  try {
    const BATCH_SIZE = 500;
    let deletedCount = 0;

    console.log(`Deleting up to ${dailyLimit} documents from ${firestoreConfig.collection}...`);

    for (let i = 0; i < firestoreDocs.length && deletedCount < dailyLimit; i += BATCH_SIZE) {
      const batch = admin.firestore().batch();
      const chunk = firestoreDocs.slice(i, i + BATCH_SIZE);
      // If adding this batch exceeds dailyLimit, truncate the batch
      if (deletedCount + chunk.length > dailyLimit) {
        chunk.splice(dailyLimit - deletedCount);
      }
      chunk.forEach(doc => {
        const docRef = admin.firestore().collection(firestoreConfig.collection).doc(doc.id);
        batch.delete(docRef);
      });
      await batch.commit();
      deletedCount += chunk.length;
      console.log(`Deleted batch of ${chunk.length} documents from ${firestoreConfig.collection}`);
    }
    console.log(`Deleted a total of ${deletedCount} documents from ${firestoreConfig.collection}`);
    return deletedCount;
  } catch (error) {
    console.error(`Error deleting documents from ${firestoreConfig.collection}:`, error);
    throw error;
  }
};

// =============================
// HTTP SERVER
// =============================
http.createServer(async (req, res) => {
  if (req.url === '/delete-firestore' && req.method === 'POST') {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Expect "Bearer <TOKEN>"
    if (token !== TOKEN) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Forbidden: Invalid token' }));
      return;
    }
    try {
      const DAILY_LIMIT = 200//20000; // max documents per day
      let totalDeleted = 0;
      // Loop through all collections from config.js
      for (const firestoreDb in config.firestore) {
        if (totalDeleted >= DAILY_LIMIT) break;
        const firestoreConfig = config.firestore[firestoreDb];
        const firestoreData = await admin.firestore()
          .collection(firestoreConfig.collection)
          .get();
        if (firestoreData.empty) {
          console.log(`No documents to delete in ${firestoreConfig.collection}`);
          continue;
        }
        const remainingLimit = DAILY_LIMIT - totalDeleted;
        const deleted = await deleteFirestoreDataWithLimit(firestoreConfig, firestoreData.docs, remainingLimit);
        totalDeleted += deleted;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Deleted ${totalDeleted} documents from Firestore` }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Deletion failed', error: error.message }));
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Firestore deletion server running');
}).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});