/**
 * Admin Script for Setting Custom Claims
 * 
 * This script helps you set up user roles and branch assignments.
 * Run this with Node.js after installing firebase-admin.
 * 
 * Setup:
 * 1. npm install firebase-admin
 * 2. Download service account key from Firebase Console
 * 3. Update the path to your service account key below
 * 4. Update the user UIDs and roles as needed
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Download your service account key from Firebase Console > Project Settings > Service Accounts
const serviceAccount = require('./path-to-your-service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Function to set custom claims for a user
async function setUserClaims(uid, role, branchId = null) {
  try {
    const customClaims = { role };
    
    if (branchId && role !== 'super_admin') {
      customClaims.branchId = branchId;
    }
    
    await admin.auth().setCustomUserClaims(uid, customClaims);
    console.log(`✅ Successfully set claims for user ${uid}:`, customClaims);
    
    // Verify the claims were set
    const userRecord = await admin.auth().getUser(uid);
    console.log(`   Current claims:`, userRecord.customClaims);
    
  } catch (error) {
    console.error(`❌ Error setting claims for user ${uid}:`, error.message);
  }
}

// Function to get user info by email
async function getUserByEmail(email) {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`User found: ${userRecord.email} (UID: ${userRecord.uid})`);
    return userRecord;
  } catch (error) {
    console.error(`User not found: ${email}`, error.message);
    return null;
  }
}

// Function to create sample branch data
async function createSampleBranches() {
  const db = admin.firestore();
  
  const branches = [
    {
      id: 'branch-main',
      name: 'Main Branch',
      address: '123 Main Street, City',
      phone: '+1234567890',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: 'branch-north',
      name: 'North Branch',
      address: '456 North Avenue, City',
      phone: '+1234567891',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ];
  
  try {
    for (const branch of branches) {
      await db.collection('branches').doc(branch.id).set(branch);
      console.log(`✅ Created branch: ${branch.name}`);
    }
  } catch (error) {
    console.error('❌ Error creating branches:', error.message);
  }
}

// Main setup function
async function setupUsersAndRoles() {
  console.log('🚀 Starting user role setup...\n');
  
  // Create sample branches first
  console.log('📍 Creating sample branches...');
  await createSampleBranches();
  console.log('');
  
  // TODO: Replace these with actual user emails from your project
  const userSetup = [
    {
      email: 'admin@example.com',  // Replace with your admin email
      role: 'super_admin',
      branchId: null
    },
    {
      email: 'branch1@example.com',  // Replace with branch admin email
      role: 'branch_admin',
      branchId: 'branch-main'
    },
    {
      email: 'staff1@example.com',   // Replace with staff email
      role: 'staff',
      branchId: 'branch-main'
    }
  ];
  
  console.log('👥 Setting up user roles...');
  
  for (const setup of userSetup) {
    console.log(`\nProcessing: ${setup.email}`);
    
    const user = await getUserByEmail(setup.email);
    if (user) {
      await setUserClaims(user.uid, setup.role, setup.branchId);
    }
  }
  
  console.log('\n✨ Setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Users need to sign out and sign back in to refresh their tokens');
  console.log('2. Test the application with different user roles');
  console.log('3. Check that role and branch info appears in the UI');
  
  process.exit(0);
}

// Quick function to set claims for a specific user (for testing)
async function quickSetup(email, role, branchId = null) {
  const user = await getUserByEmail(email);
  if (user) {
    await setUserClaims(user.uid, role, branchId);
  }
  process.exit(0);
}

// Run the setup
if (require.main === module) {
  // Uncomment ONE of these lines:
  
  // Full setup (creates branches and sets up multiple users)
  setupUsersAndRoles();
  
  // Quick setup for single user (replace with your email and desired role)
  // quickSetup('your-email@gmail.com', 'super_admin');
  // quickSetup('user@example.com', 'branch_admin', 'branch-main');
  // quickSetup('staff@example.com', 'staff', 'branch-main');
}

module.exports = {
  setUserClaims,
  getUserByEmail,
  createSampleBranches
};