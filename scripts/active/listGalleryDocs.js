require('dotenv').config();
const mongoose = require('mongoose');
const Gallery = require('../../server/models/Gallery');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const docs = await Gallery.find({}, { filename: 1 }).lean();
    console.log(JSON.stringify(docs, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.connection.close();
  }
})();
