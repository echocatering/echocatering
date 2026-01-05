const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const resetPassword = async () => {
  const usersPath = path.join(__dirname, '../server/data/users.json');
  
  // New password: "admin123"
  const newPassword = 'admin123';
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  // Read current users
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  
  // Update admin user password
  const adminUser = users.find(u => u.email === 'admin@echo-catering.com');
  if (adminUser) {
    adminUser.password = hashedPassword;
    
    // Write back to file
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    
    console.log('✅ Admin password reset successfully!');
    console.log('📧 Email: admin@echo-catering.com');
    console.log('🔑 Password: admin123');
    console.log('\nYou can now log in to the admin panel.');
  } else {
    console.log('❌ Admin user not found');
  }
};

resetPassword().catch(console.error);

