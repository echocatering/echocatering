# 🍽️ Echo Catering Admin Panel

A professional, full-stack admin panel for managing the Echo Catering website content. Built with React, Node.js, Express, and MongoDB.

## 🚀 Features

### ✅ **Menu Gallery Management**
- Upload and manage cocktail videos
- Edit cocktail information (name, concept, ingredients, global origins, etc.)
- Organize cocktails by categories (Originals, Classics, Spirits, Hors d'Oeuvres)
- Reorder cocktails within categories
- Toggle active/inactive status

### ✅ **Gallery Management**
- Upload multiple images at once
- Categorize images (Hero, Gallery, Footer, Events, Food, Cocktails)
- Add tags and descriptions
- Set featured images
- Bulk operations

### ✅ **Content Management**
- Edit information boxes across all pages
- Rich text editing capabilities
- Page-specific content organization
- Position and styling controls

### ✅ **User Management**
- Secure authentication system
- Role-based access control (Admin/Editor)
- User activity tracking
- Password management

### ✅ **Professional Features**
- Responsive design (mobile & desktop)
- Real-time updates
- File upload with validation
- Search and filtering
- Export capabilities

## 🛠️ Technology Stack

### **Backend**
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Multer** - File uploads
- **bcryptjs** - Password hashing

### **Frontend**
- **React** - UI framework
- **React Router** - Navigation
- **Context API** - State management
- **CSS3** - Styling

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v14 or higher)
- **MongoDB** (v4.4 or higher)
- **npm** or **yarn**

## 🔧 Installation & Setup

### 1. **Clone the Repository**
```bash
git clone <your-repo-url>
cd echo-catering
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Set Up MongoDB**
Make sure MongoDB is running on your system:
```bash
# Start MongoDB (macOS with Homebrew)
brew services start mongodb-community

# Or start manually
mongod
```

### 4. **Initialize the Database**
```bash
npm run setup
```

This will:
- Create the default admin user
- Migrate existing cocktail data
- Import existing gallery images
- Set up initial database structure

### 5. **Start the Development Servers**
```bash
# Start both backend and frontend
npm run dev

# Or start them separately:
npm run server  # Backend (port 5000)
npm start       # Frontend (port 3000)
```

### 6. **Access the Admin Panel**
- **URL**: http://localhost:3000/admin
- **Default Login**: 
  - Email: `admin@echo-catering.com`
  - Password: `admin123`

## 📁 Project Structure

```
echo-catering/
├── server/                 # Backend API
│   ├── models/            # Database models
│   ├── routes/            # API routes
│   ├── middleware/        # Custom middleware
│   ├── uploads/           # File uploads
│   └── index.js           # Server entry point
├── src/
│   ├── admin/             # Admin panel frontend
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   └── App.js         # Admin app entry
│   └── ...                # Main website files
├── public/                # Static files
└── package.json
```

## 🔐 Authentication

The admin panel uses JWT (JSON Web Tokens) for authentication:

- **Token Expiry**: 24 hours
- **Secure Storage**: LocalStorage with automatic cleanup
- **Role-based Access**: Admin and Editor roles
- **Password Security**: bcrypt hashing with salt rounds

## 📊 API Endpoints

### **Authentication**
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Create new user (admin only)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - User logout

### **Cocktails**
- `GET /api/cocktails` - Get all cocktails
- `POST /api/cocktails` - Create new cocktail
- `PUT /api/cocktails/:id` - Update cocktail
- `DELETE /api/cocktails/:id` - Delete cocktail
- `PUT /api/cocktails/:id/toggle` - Toggle active status

### **Gallery**
- `GET /api/gallery` - Get all images
- `POST /api/gallery` - Create new image entry
- `PUT /api/gallery/:id` - Update image
- `DELETE /api/gallery/:id` - Delete image

### **Content**
- `GET /api/content` - Get all content
- `POST /api/content` - Create new content
- `PUT /api/content/:id` - Update content
- `DELETE /api/content/:id` - Delete content

### **File Uploads**
- `POST /api/upload/cocktail` - Upload cocktail video
- `POST /api/upload/gallery` - Upload gallery images
- `GET /api/upload/files/:type` - List uploaded files

## 🎨 Customization

### **Styling**
The admin panel uses a custom CSS framework. Main styles are in:
- `src/admin/App.css` - Core styles
- Component-specific styles can be added as needed

### **Configuration**
Environment variables can be set in a `.env` file:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/echo-catering
JWT_SECRET=your-secret-key
NODE_ENV=development
```

## 🔒 Security Features

- **CORS Protection** - Configured for specific origins
- **Rate Limiting** - API request throttling
- **Input Validation** - Server-side validation
- **File Upload Security** - Type and size restrictions
- **SQL Injection Protection** - Mongoose ODM
- **XSS Protection** - Helmet.js middleware

## 📱 Responsive Design

The admin panel is fully responsive:
- **Desktop**: Full sidebar navigation
- **Tablet**: Collapsible sidebar
- **Mobile**: Hamburger menu with overlay

## 🚀 Deployment

### **Development**
```bash
npm run dev
```

### **Production**
```bash
# Build the frontend
npm run build

# Start production server
NODE_ENV=production npm run server
```

### **Environment Variables for Production**
```env
NODE_ENV=production
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-secret
CORS_ORIGIN=https://yourdomain.com
```

## 🐛 Troubleshooting

### **Common Issues**

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check connection string in setup

2. **Port Already in Use**
   - Change port in `.env` file
   - Kill existing processes

3. **File Upload Issues**
   - Check upload directory permissions
   - Verify file size limits

4. **Authentication Errors**
   - Clear browser localStorage
   - Check JWT secret configuration

## 📈 Future Enhancements

- **Real-time Updates** - WebSocket integration
- **Advanced Analytics** - Usage statistics
- **Backup System** - Automated data backups
- **Multi-language Support** - Internationalization
- **Advanced Search** - Full-text search capabilities
- **Bulk Operations** - Mass edit/delete features

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is proprietary software for Echo Catering.

## 📞 Support

For support or questions:
- Email: support@echo-catering.com
- Documentation: See inline code comments
- Issues: Create GitHub issues for bugs

---

**Built with ❤️ for Echo Catering**


