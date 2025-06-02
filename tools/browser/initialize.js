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
    // First try using browser with system-installed Chromium if available
    const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';
    
    if (fs.existsSync(chromiumExecutablePath)) {
      console.log(`Using system Chromium at ${chromiumExecutablePath}`);
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chromiumExecutablePath;
      return true;
    }
    
    // Fall back to Playwright's browser
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      console.log('Playwright browser is already installed');
      return true;
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('could not find') || 
          error.message.includes('Executable doesn\'t exist')) {
        console.log('Playwright browser not installed. Installing browser...');
        try {
          execSync('npx playwright install chromium', { stdio: 'inherit', shell: true });
          return true;
        } catch (installError) {
          console.error('Failed to install Playwright browser:', installError);
          // If installation fails, try to use system chromium again as last resort
          if (fs.existsSync('/usr/bin/chromium')) {
            console.log('Falling back to system Chromium browser');
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/usr/bin/chromium';
            return true;
          }
          throw installError;
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error ensuring Playwright is installed:', error);
    throw error;
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