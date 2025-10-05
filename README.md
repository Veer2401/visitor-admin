# 🏥 Visitor Management System - Admin Dashboard

A comprehensive **Admin Dashboard** for the Visitor Management System, built with **Next.js 15**, **Firebase**, and **TypeScript**. This application provides real-time access to visitor records with full CRUD operations synced to Firestore, featuring Google Authentication and a modern responsive interface.

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Screenshots](#-screenshots)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Firebase Configuration](#firebase-configuration)
  - [Running the Project](#running-the-project)
- [Project Structure](#-project-structure)
- [Usage](#-usage)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### 🔐 **Authentication & Security**
- **Google Sign-In Integration** - Secure authentication using Firebase Auth
- **Protected Routes** - Admin dashboard accessible only to authenticated users
- **Session Management** - Persistent login sessions with auto-logout

### 📊 **Real-time Dashboard**
- **Live Data Sync** - Real-time updates from Firestore using `onSnapshot`
- **Responsive Design** - Works perfectly on desktop, tablet, and mobile devices
- **Professional UI** - Clean, modern interface built with Tailwind CSS

### 👥 **Visitor Management**
- **Complete CRUD Operations**:
  - ➕ **Add** new visitor entries
  - ✏️ **Edit** existing visitor information
  - 🗑️ **Delete** visitor records (with confirmation)
  - 👁️ **View** all visitor data in real-time
- **Status Management** - Quick check-in/check-out functionality
- **Indian Mobile Validation** - Automatic +91 prefix with 10-digit validation

### 📋 **Data Fields**
- **Patient Name** - Name of the patient being visited
- **Visitor Name** - Name of the person visiting
- **Visitor Number** - Auto-incremented index for easy tracking
- **Visitor Mobile** - Phone number with Indian format validation
- **Email** - Contact email address
- **Date** - Visit date (auto-populated)
- **Check-In Time** - Timestamp when visitor arrives
- **Check-Out Time** - Timestamp when visitor leaves
- **Status** - Current visitor status (Checked In/Checked Out)
- **Updated At** - Last modification timestamp

### 🎨 **User Experience**
- **Form Validation** - Client-side validation with clear error messages
- **Loading States** - Smooth loading indicators for all operations
- **Empty States** - Helpful messages when no data is available
- **Hover Effects** - Interactive elements with smooth transitions
- **Mobile-First** - Optimized for mobile devices with touch-friendly interfaces

## 🛠 Tech Stack

### **Frontend**
- **[Next.js 15](https://nextjs.org/)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[React](https://reactjs.org/)** - Component-based UI library

### **Backend & Database**
- **[Firebase](https://firebase.google.com/)** - Backend-as-a-Service platform
- **[Firestore](https://firebase.google.com/docs/firestore)** - NoSQL document database
- **[Firebase Auth](https://firebase.google.com/docs/auth)** - Authentication service

### **Development Tools**
- **[ESLint](https://eslint.org/)** - Code linting and formatting
- **[Turbopack](https://turbo.build/pack)** - Fast bundler for development
- **npm** - Package manager

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download here](https://git-scm.com/)
- **Firebase Account** - [Create account](https://firebase.google.com/)

### Installation

#### 1. **Fork the Repository**
Click the "Fork" button at the top right of this repository to create your own copy.

#### 2. **Clone Your Fork**
```bash
# Clone your forked repository
git clone https://github.com/YOUR_USERNAME/visitor-management-admin.git

# Navigate to the project directory
cd visitor-management-admin

# Navigate to the main application folder
cd vms-admin
```

#### 3. **Install Dependencies**
```bash
# Install all required packages
npm install
```

### Firebase Configuration

#### 1. **Create Firebase Project**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Follow the setup wizard

#### 2. **Enable Services**
1. **Authentication**: Go to Authentication → Sign-in method → Enable Google
2. **Firestore**: Go to Firestore Database → Create database

#### 3. **Get Configuration**
1. Go to Project Settings → General
2. Scroll down to "Your apps" → Web app
3. Copy the configuration object

#### 4. **Environment Setup**
Create a `.env.local` file in the `vms-admin` directory:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

#### 5. **Firestore Security Rules**
Update your Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write visits
    match /visits/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Running the Project

#### **Development Mode**
```bash
# Start the development server
npm run dev

# The application will be available at:
# http://localhost:3000
```

#### **Production Build**
```bash
# Build for production
npm run build

# Start production server
npm start
```

#### **Other Commands**
```bash
# Lint the code
npm run lint

# Type checking
npx tsc --noEmit
```

## 📁 Project Structure

```
visitor-management-admin/
├── README.md
└── vms-admin/
    ├── src/
    │   ├── app/
    │   │   ├── admin/
    │   │   │   └── page.tsx      # Main admin dashboard
    │   │   ├── globals.css       # Global styles
    │   │   ├── layout.tsx        # Root layout
    │   │   └── page.tsx          # Home page
    │   ├── components/
    │   │   └── VisitsTable.tsx   # Legacy table component
    │   └── lib/
    │       ├── auth.ts           # Firebase authentication
    │       ├── firebase.ts       # Firebase configuration
    │       └── types.ts          # TypeScript interfaces
    ├── public/                   # Static assets
    ├── .env.local               # Environment variables
    ├── package.json             # Dependencies and scripts
    ├── tailwind.config.js       # Tailwind CSS configuration
    └── tsconfig.json            # TypeScript configuration
```

## 💻 Usage

### **Accessing the Dashboard**
1. Navigate to `http://localhost:3000/admin`
2. Click "Sign in with Google"
3. Authenticate with your Google account
4. Start managing visitor records!

### **Adding a New Visit**
1. Fill out the form at the top of the dashboard
2. Mobile numbers automatically format to +91 XXXXXXXXXX
3. Click "Add Visit Entry"
4. The new record appears instantly in the table

### **Editing a Visit**
1. Click the "Edit" button on any table row
2. Modify the fields inline
3. Click "Save" to confirm or "Cancel" to discard changes

### **Managing Visit Status**
- Click "Check Out" to mark a visitor as departed
- Click "Check In" to mark a visitor as present
- Status changes are reflected immediately

### **Deleting a Visit**
1. Click the "Delete" button on any table row
2. Confirm the action in the popup
3. The record is permanently removed

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### **Fork & Pull Request Workflow**
1. **Fork** this repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### **Development Guidelines**
- Follow TypeScript best practices
- Use Tailwind CSS for styling
- Ensure mobile responsiveness
- Add proper error handling
- Write descriptive commit messages

### **Reporting Issues**
Found a bug? Have a feature request? Please [open an issue](https://github.com/YOUR_USERNAME/visitor-management-admin/issues).

<!-- ## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. -->

---

## 🙏 Acknowledgments

- **Firebase** for providing excellent backend services
- **Next.js** team for the amazing React framework
- **Tailwind CSS** for the utility-first CSS framework
- **Google** for the authentication services

---

<!-- **Built with ❤️ for efficient visitor management** -->

> **Note**: This is an admin dashboard. Make sure to keep your Firebase credentials secure and never commit them to public repositories.
