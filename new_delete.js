const express = require('express');
const admin = require('firebase-admin');
const config = require('./config.js');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccount.json')),
});

const db = admin.firestore();
const app = express();

const TOTAL_LIMIT = 19999;
const BATCH_SIZE = 500;

async function deleteWithLimit(collectionName, limit) {
  let deleted = 0;

  while (deleted < limit) {
    const remaining = limit - deleted;

    const snapshot = await db
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(Math.min(BATCH_SIZE, remaining))
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    deleted += snapshot.size;
     console.log(`Deleted ${snapshot.size} docs`);
  }
  console.log(`✔ Finished ${collectionName}: ${deleted} deleted`);
  return deleted;
}

app.post('/newdelete', async (req, res) => {
  try {
    let totalDeleted = 0;

    for (const key in config.firestore) {
      if (totalDeleted >= TOTAL_LIMIT) break;

      const { collection } = config.firestore[key];
      const remaining = TOTAL_LIMIT - totalDeleted;

      const deleted = await deleteWithLimit(collection, remaining);
      totalDeleted += deleted;
    }

    res.json({ success: true, totalDeleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(4000, () => {
  console.log('Delete service running on port 4000');
});
