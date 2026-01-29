const admin = require('firebase-admin');
const config = require('./config.js');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccount.json')),
});

const db = admin.firestore();

const TOTAL_LIMIT = 200;
const BATCH_SIZE = 500;

async function deleteWithLimit(collectionName, limit) {
  let deleted = 0;

  console.log(`\n▶ Deleting from collection: ${collectionName}`);

  while (deleted < limit) {
    const remaining = limit - deleted;

    const snapshot = await db
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(Math.min(BATCH_SIZE, remaining))
      .get();

    if (snapshot.empty) {
      console.log('No more documents');
      break;
    }

    const batch = db.batch();

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    deleted += snapshot.size;
    console.log(`Deleted ${snapshot.size} docs`);
  }

  console.log(`✔ Finished ${collectionName}: ${deleted} deleted`);
  return deleted;
}

async function main() {
  try {
    let totalDeleted = 0;

    for (const key in config.firestore) {
      if (totalDeleted >= TOTAL_LIMIT) break;

      const { collection } = config.firestore[key];
      const remaining = TOTAL_LIMIT - totalDeleted;

      const deleted = await deleteWithLimit(collection, remaining);
      totalDeleted += deleted;
    }

    console.log(`\n✅ TOTAL DELETED: ${totalDeleted}`);
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

main();
