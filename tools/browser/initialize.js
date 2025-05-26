const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Checks if Playwright and its dependencies are installed,
 * and installs them if necessary.
 */
async function ensurePlaywrightInstalled() {
  try {
    // Check if playwright executable is present
    const playwrightExists = fs.existsSync(path.join(
      process.cwd(),
      'node_modules',
      '.bin', 
      process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
    ));
    
    if (!playwrightExists) {
      console.log('Playwright not found. Installing Playwright...');
      execSync('npm install playwright', { stdio: 'inherit' });
    }
    
    // Check if browsers are installed
    try {
      await chromium.launch({ headless: true }).then(browser => browser.close());
      console.log('Playwright browser is already installed');
      return true;
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('could not find')) {
        console.log('Playwright browser not installed. Installing browser...');
        execSync('npx playwright install chromium --with-deps', { stdio: 'inherit' });
        return true;
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error ensuring Playwright is installed:', error);
    return false;
  }
}

/**
 * Initialize the Playwright browser system
 */
async function initialize() {
  try {
    await ensurePlaywrightInstalled();
    console.log('Playwright browser tool is ready');
    return true;
  } catch (error) {
    console.error('Failed to initialize Playwright browser tool:', error);
    return false;
  }
}

module.exports = {
  initialize,
  ensurePlaywrightInstalled
}; 