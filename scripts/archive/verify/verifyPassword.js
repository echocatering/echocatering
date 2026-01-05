const bcrypt = require('bcryptjs');

const storedHash = '$2a$10$aHX3k1Euu4mKIG8RFISVseglGO9q3ibBpvCwDSXGyHBt0HjtiP3CC';
const testPassword = 'admin123';

bcrypt.compare(testPassword, storedHash, (err, result) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  if (result) {
    console.log('✅ Password "admin123" matches the stored hash');
    console.log('📧 Email: admin@echo-catering.com');
    console.log('🔑 Password: admin123');
    console.log('\nYou can log in with these credentials.');
  } else {
    console.log('❌ Password "admin123" does NOT match the stored hash');
    console.log('🔧 Run: node scripts/archive/setup/resetAdminPassword.js to reset the password');
  }
});

