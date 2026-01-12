const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, '../data/users.json');

// Ensure data directory exists
const ensureDataDir = async () => {
  const dataDir = path.dirname(USERS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
};

// Read users from file
const readUsers = async () => {
  try {
    await ensureDataDir();
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return default admin user
    return [
      {
        id: "1",
        email: "admin@echo-catering.com",
        password: "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // "admin123"
        role: "admin",
        name: "Admin User",
        createdAt: new Date().toISOString()
      }
    ];
  }
};

// Write users to file
const writeUsers = async (users) => {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
};

// Find user by email
const findUserByEmail = async (email) => {
  const users = await readUsers();
  return users.find(user => user.email === email);
};

// Find user by username/login
const findUserByUsername = async (username) => {
  const users = await readUsers();
  return users.find(user => user.username === username || user.login === username);
};

// Find user by email or username/login
const findUserByEmailOrUsername = async (identifier) => {
  const users = await readUsers();
  return users.find(user => 
    user.email === identifier || 
    user.username === identifier || 
    user.login === identifier
  );
};

// Find user by ID
const findUserById = async (id) => {
  const users = await readUsers();
  return users.find(user => user.id === id);
};

// Verify password
const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Create new user
const createUser = async (userData) => {
  const users = await readUsers();
  const newUser = {
    id: Date.now().toString(),
    ...userData,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  await writeUsers(users);
  return newUser;
};

module.exports = {
  readUsers,
  writeUsers,
  findUserByEmail,
  findUserByUsername,
  findUserByEmailOrUsername,
  findUserById,
  verifyPassword,
  createUser
};


