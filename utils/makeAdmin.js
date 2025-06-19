#!/usr/bin/env node

const { userFunctions } = require('../database');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function makeAdmin() {
  console.log('\n🔧 Operon.one Admin Setup Utility\n');

  try {
    const email = process.argv[2];
    
    let targetEmail;
    if (email && email !== 'list' && email !== 'remove' && email !== 'help') {
      targetEmail = email;
      console.log(`Target user: ${targetEmail}`);
    } else {
      targetEmail = await question('Enter the email address of the user to make admin: ');
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      console.log('❌ Please provide a valid email address.');
      process.exit(1);
    }

    console.log('\n🔍 Looking up user...');
    
    const user = await new Promise((resolve, reject) => {
      const db = require('../database').getDb();
      db.get('SELECT id, email, isAdmin FROM users WHERE email = ?', [targetEmail], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      console.log(`❌ User with email "${targetEmail}" not found.`);
      console.log('\n💡 Make sure the user has registered an account first.');
      process.exit(1);
    }

    if (user.isAdmin) {
      console.log(`✅ User "${targetEmail}" is already an admin.`);
      process.exit(0);
    }

    const confirm = await question(`\n❓ Make "${targetEmail}" an admin? (y/N): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    console.log('\n⚡ Granting admin privileges...');
    
    await new Promise((resolve, reject) => {
      const db = require('../database').getDb();
      db.run('UPDATE users SET isAdmin = 1 WHERE id = ?', [user.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`✅ Successfully granted admin privileges to "${targetEmail}"`);
    console.log('\n📋 Admin Panel Access:');
    console.log(`   🌐 URL: http://localhost:3001/admin`);
    console.log(`   📧 Login with: ${targetEmail}`);
    console.log('\n🔐 Admin Capabilities:');
    console.log('   • Create and manage redemption codes');
    console.log('   • View usage statistics');
    console.log('   • Delete unused codes');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function listAdmins() {
  console.log('\n👑 Current Admin Users:\n');
  
  try {
    const admins = await new Promise((resolve, reject) => {
      const db = require('../database').getDb();
      db.all('SELECT id, email, createdAt FROM users WHERE isAdmin = 1 ORDER BY id ASC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (admins.length === 0) {
      console.log('❌ No admin users found.');
    } else {
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. ${admin.email} (ID: ${admin.id})`);
        console.log(`   Created: ${new Date(admin.createdAt).toLocaleDateString()}\n`);
      });
    }
  } catch (error) {
    console.error('❌ Error fetching admin users:', error.message);
  }
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log('\n🔧 Operon.one Admin Management Utility\n');
    console.log('Usage:');
    console.log('  node utils/makeAdmin.js <email>    # Make user admin');
    console.log('  node utils/makeAdmin.js list       # List all admins');
    console.log('  node utils/makeAdmin.js help       # Show help\n');
    console.log('Examples:');
    console.log('  node utils/makeAdmin.js john@example.com');
    console.log('  node utils/makeAdmin.js list\n');
    process.exit(0);
  }

  switch (command.toLowerCase()) {
    case 'list':
      await listAdmins();
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log('\n🔧 Operon.one Admin Management Utility\n');
      console.log('Commands:');
      console.log('  <email>     Make the specified user an admin');
      console.log('  list        Show all current admin users');
      console.log('  help        Show this help message\n');
      break;
    default:
      await makeAdmin();
      break;
  }

  process.exit(0);
}

process.on('SIGINT', () => {
  console.log('\n\n❌ Operation cancelled by user.');
  rl.close();
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
} 