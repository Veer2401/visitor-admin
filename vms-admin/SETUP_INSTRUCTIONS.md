# Instructions to Fix "Access Denied" Error

## Current Issue
The "access denied" error is happening because Firebase is not properly configured with environment variables.

## Solution Steps

### Option 1: Set up Firebase (Recommended)

1. **Create Firebase Project**:
   - Go to https://console.firebase.google.com
   - Click "Create a project" or select existing project
   - Enable Firestore Database and Authentication

2. **Get Firebase Configuration**:
   - Go to Project Settings → General
   - Scroll to "Your apps" → Web app configuration
   - Copy the config values

3. **Update .env.local file**:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

4. **Enable Google Authentication**:
   - Firebase Console → Authentication → Sign-in method
   - Enable Google provider

5. **Deploy Firestore Rules**:
   ```bash
   firebase login
   firebase use your_project_id
   firebase deploy --only firestore:rules
   ```

6. **Restart Development Server**:
   ```bash
   npm run dev
   ```

### Option 2: Local Development Mode (Temporary)

If you want to test without Firebase setup, I can create a local storage version.

## Files Created
- .env.local (template with placeholders)
- firestore.rules (security rules)
- firebase.json (Firebase configuration)
- .firebaserc (project configuration)
- firestore.indexes.json (database indexes)

## Next Steps
1. Replace placeholder values in .env.local with actual Firebase credentials
2. Follow the setup steps above
3. The app should work after proper Firebase configuration

## Authorized Emails
Only these emails can access the admin dashboard:
- veerharischandrakar@gmail.com
- ganesh.khandekar@kalpavrukshacare.com
- punesatararoad@kalpavrukshacare.com
- info.kalpavruksha.care@gmail.com
 - sahkarnagar.kalpavrushka@gmail.com
 - baner.kalpavrushka@gmail.com
 - imganesha.gk@gmail.com