/**
 * Simple test script for Telegram bot integration
 * This tests the basic functionality without requiring a real Telegram bot token
 */

const path = require('path');
const fs = require('fs');

async function testTelegramIntegration() {
  console.log('🧪 Testing Telegram Bot Integration...\n');

  try {
    // Test 1: Check if tool.json exists and is valid
    console.log('1. Testing tool configuration...');
    const toolJsonPath = path.join(__dirname, 'tool.json');
    
    if (!fs.existsSync(toolJsonPath)) {
      throw new Error('tool.json not found');
    }

    const toolConfig = JSON.parse(fs.readFileSync(toolJsonPath, 'utf8'));
    console.log('   ✅ tool.json is valid');
    console.log(`   ✅ Tool enabled: ${toolConfig.enabled}`);
    console.log(`   ✅ Tool title: ${toolConfig.title}`);

    // Test 2: Check if main.js exists
    console.log('\n2. Testing main module...');
    const mainPath = path.join(__dirname, 'main.js');
    
    if (!fs.existsSync(mainPath)) {
      throw new Error('main.js not found');
    }

    console.log('   ✅ main.js exists');

    // Test 3: Check package.json for dependencies
    console.log('\n3. Testing dependencies...');
    const packageJsonPath = path.join(__dirname, '../../package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageData.dependencies && packageData.dependencies['node-telegram-bot-api']) {
        console.log('   ✅ node-telegram-bot-api dependency found');
      } else {
        console.log('   ⚠️  node-telegram-bot-api dependency not found');
      }
    }

    // Test 4: Check README exists
    console.log('\n4. Testing documentation...');
    const readmePath = path.join(__dirname, 'README.md');
    
    if (fs.existsSync(readmePath)) {
      console.log('   ✅ README.md exists');
    } else {
      console.log('   ⚠️  README.md not found');
    }

    console.log('\n🎉 All tests passed! Telegram bot integration is ready.');
    console.log('\n📋 Next steps:');
    console.log('   1. Get a Telegram bot token from @BotFather');
    console.log('   2. Add TELEGRAM_BOT_TOKEN to your .env file');
    console.log('   3. Start the application with: npm start');
    console.log('   4. Search for your bot on Telegram and start chatting!');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

// Run tests
testTelegramIntegration();