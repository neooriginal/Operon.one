const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class TelegramBotTool {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
    this.activeUsers = new Map(); // Map telegramUserId -> { userId, chatId, lastActivity }
  }

  /**
   * Initialize the Telegram bot
   */
  async initialize() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      
      if (!token) {
        logger.warn('Telegram bot token not found. Set TELEGRAM_BOT_TOKEN in environment variables.');
        return false;
      }

      this.bot = new TelegramBot(token, { polling: true });
      
      this.setupEventHandlers();
      this.isInitialized = true;
      
      logger.info('Telegram bot initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', { error: error.message });
      return false;
    }
  }

  /**
   * Setup event handlers for the Telegram bot
   */
  setupEventHandlers() {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('Error handling Telegram message', { error: error.message, chatId: msg.chat.id });
        await this.sendMessage(msg.chat.id, '❌ Sorry, an error occurred while processing your message.');
      }
    });

    // Handle document uploads
    this.bot.on('document', async (msg) => {
      try {
        await this.handleFileUpload(msg);
      } catch (error) {
        logger.error('Error handling file upload', { error: error.message, chatId: msg.chat.id });
        await this.sendMessage(msg.chat.id, '❌ Sorry, an error occurred while processing your file.');
      }
    });

    // Handle photos
    this.bot.on('photo', async (msg) => {
      try {
        await this.handlePhotoUpload(msg);
      } catch (error) {
        logger.error('Error handling photo upload', { error: error.message, chatId: msg.chat.id });
        await this.sendMessage(msg.chat.id, '❌ Sorry, an error occurred while processing your photo.');
      }
    });

    // Handle bot errors
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram bot polling error', { error: error.message });
    });

    logger.info('Telegram bot event handlers set up');
  }

  /**
   * Handle incoming text messages
   */
  async handleMessage(msg) {
    const telegramChatId = msg.chat.id;
    const telegramUserId = msg.from.id;
    const messageText = msg.text;

    // Skip if message doesn't contain text
    if (!messageText) return;

    // Handle bot commands
    if (messageText.startsWith('/')) {
      await this.handleCommand(msg);
      return;
    }

    // Get or create user session
    const { userId, chatId } = await this.getUserSession(telegramUserId, msg.from);
    
    // Send typing indicator
    await this.bot.sendChatAction(telegramChatId, 'typing');
    
    // Send initial response
    await this.sendMessage(telegramChatId, '🤖 Processing your request...');

    try {
      // Import centralOrchestrator dynamically to avoid circular dependencies
      const { centralOrchestrator } = require('../../index.js');
      
      logger.info('Calling centralOrchestrator', { userId, chatId, messageText: messageText.substring(0, 100) + '...' });
      
      // Call the central orchestrator
      const response = await centralOrchestrator(messageText, userId, chatId, false);
      
      logger.info('Telegram bot received response', {
        userId,
        chatId,
        responseType: typeof response,
        responseLength: response?.length || 0,
        responsePreview: typeof response === 'string' ? response.substring(0, 200) + '...' : JSON.stringify(response).substring(0, 200) + '...'
      });
      
      // Handle different response types
      let finalResponse = null;
      
      if (typeof response === 'string' && response.trim().length > 0) {
        finalResponse = response.trim();
      } else if (response && typeof response === 'object') {
        // Try different object properties that might contain the answer
        if (response.answer) {
          finalResponse = response.answer;
        } else if (response.result) {
          finalResponse = response.result;
        } else if (response.output) {
          finalResponse = response.output;
        } else if (response.message) {
          finalResponse = response.message;
        } else if (response.text) {
          finalResponse = response.text;
        } else {
          // If it's an object but no recognized property, stringify it
          finalResponse = JSON.stringify(response, null, 2);
        }
      }
      
      // Send the response
      if (finalResponse && finalResponse.trim().length > 0) {
        await this.sendLongMessage(telegramChatId, finalResponse.trim());
        logger.info('Successfully sent response to Telegram user', { userId, chatId, responseLength: finalResponse.length });
      } else {
        // Log the full response for debugging
        logger.warn('No valid response content found', {
          userId,
          chatId,
          fullResponse: JSON.stringify(response, null, 2)
        });
        
        // Send a helpful fallback message
        await this.sendMessage(telegramChatId,
          `👋 Hello! I received your message "${messageText}" but couldn't generate a proper response. ` +
          'This might be because the AI system is still processing or there was an issue. Please try asking a specific question!'
        );
      }

      // Check for generated files and send them
      await this.sendGeneratedFiles(telegramChatId, userId, chatId);
      
    } catch (error) {
      logger.error('Error processing Telegram message', { error: error.message, stack: error.stack, userId, chatId });
      await this.sendMessage(telegramChatId, `❌ Error processing your request: ${error.message}`);
    }
  }

  /**
   * Handle bot commands
   */
  async handleCommand(msg) {
    const telegramChatId = msg.chat.id;
    const telegramUserId = msg.from.id;
    const command = msg.text.toLowerCase();

    switch (command.split(' ')[0]) {
      case '/start':
        // Create or get Telegram user
        await this.ensureTelegramUser(telegramUserId, msg.from);
        await this.sendMessage(telegramChatId,
          '👋 Welcome to Operon.one AI Assistant!\n\n' +
          'I can help you with various tasks:\n' +
          '• Answer questions\n' +
          '• Process documents\n' +
          '• Generate content\n' +
          '• Analyze files\n' +
          '• And much more!\n\n' +
          'Just send me a message or upload a file to get started.\n\n' +
          'Commands:\n' +
          '/help - Show this help message\n' +
          '/status - Check bot status\n' +
          '/credits - Check your credit balance\n' +
          '/redeem <code> - Redeem a credit code'
        );
        break;
        
      case '/help':
        await this.sendMessage(telegramChatId,
          '🔧 Available Commands:\n\n' +
          '/start - Welcome message\n' +
          '/help - Show this help\n' +
          '/status - Bot status\n' +
          '/credits - Check your credit balance\n' +
          '/redeem <code> - Redeem a credit code\n\n' +
          '📝 Usage:\n' +
          '• Send any text message to get AI assistance\n' +
          '• Upload documents, images, or files for analysis\n' +
          '• Ask questions about uploaded files\n' +
          '• Request file generation or modification\n\n' +
          '💰 Credits:\n' +
          '• Each AI request uses credits\n' +
          '• Get more credits with redemption codes\n' +
          '• Check your balance with /credits'
        );
        break;
        
      case '/status':
        const status = this.isInitialized ? '✅ Online' : '❌ Offline';
        await this.sendMessage(telegramChatId, `🤖 Bot Status: ${status}`);
        break;
        
      case '/credits':
        await this.handleCreditsCommand(telegramChatId, telegramUserId);
        break;
        
      case '/redeem':
        const parts = command.split(' ');
        if (parts.length < 2) {
          await this.sendMessage(telegramChatId,
            '❌ Please provide a redemption code.\n\n' +
            'Usage: /redeem <code>\n' +
            'Example: /redeem WELCOME2024'
          );
        } else {
          const code = parts.slice(1).join(' ').trim().toUpperCase();
          await this.handleRedeemCommand(telegramChatId, telegramUserId, code);
        }
        break;
        
      default:
        await this.sendMessage(telegramChatId, '❓ Unknown command. Type /help for available commands.');
    }
  }

  /**
   * Handle file uploads
   */
  async handleFileUpload(msg) {
    const telegramChatId = msg.chat.id;
    const telegramUserId = msg.from.id;
    const document = msg.document;

    if (!document) return;

    const { userId, chatId } = await this.getUserSession(telegramUserId, msg.from);

    await this.bot.sendChatAction(telegramChatId, 'upload_document');
    await this.sendMessage(telegramChatId, '📄 Processing your file...');

    try {
      // Download the file
      const fileLink = await this.bot.getFileLink(document.file_id);
      const fileName = document.file_name || `file_${Date.now()}`;
      
      // Save file to user's directory
      const userDir = path.join('output', userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      
      const filePath = path.join(userDir, fileName);
      
      // Download and save file
      const response = await fetch(fileLink);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));

      await this.sendMessage(telegramChatId, 
        `✅ File "${fileName}" uploaded successfully!\n\n` +
        'You can now ask questions about this file or request analysis.'
      );

      // If there's a caption, process it as a command about the file
      if (msg.caption) {
        const question = `${msg.caption} (File: ${fileName})`;
        const { centralOrchestrator } = require('../../index.js');
        const response = await centralOrchestrator(question, userId, chatId, false);
        
        if (response && response.length > 0) {
          await this.sendLongMessage(telegramChatId, response);
        }
      }

    } catch (error) {
      logger.error('Error handling file upload', { error: error.message });
      await this.sendMessage(telegramChatId, '❌ Failed to process the uploaded file.');
    }
  }

  /**
   * Handle photo uploads
   */
  async handlePhotoUpload(msg) {
    const telegramChatId = msg.chat.id;
    const telegramUserId = msg.from.id;
    const photos = msg.photo;

    if (!photos || photos.length === 0) return;

    const { userId, chatId } = await this.getUserSession(telegramUserId, msg.from);

    await this.bot.sendChatAction(telegramChatId, 'upload_photo');
    await this.sendMessage(telegramChatId, '🖼️ Processing your image...');

    try {
      // Get the highest resolution photo
      const photo = photos[photos.length - 1];
      const fileLink = await this.bot.getFileLink(photo.file_id);
      const fileName = `image_${Date.now()}.jpg`;
      
      // Save file to user's directory
      const userDir = path.join('output', userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      
      const filePath = path.join(userDir, fileName);
      
      // Download and save file
      const response = await fetch(fileLink);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));

      await this.sendMessage(telegramChatId, 
        `✅ Image "${fileName}" uploaded successfully!\n\n` +
        'You can now ask questions about this image or request analysis.'
      );

      // If there's a caption, process it as a command about the image
      if (msg.caption) {
        const question = `${msg.caption} (Image: ${fileName})`;
        const { centralOrchestrator } = require('../../index.js');
        const response = await centralOrchestrator(question, userId, chatId, false);
        
        if (response && response.length > 0) {
          await this.sendLongMessage(telegramChatId, response);
        }
      }

    } catch (error) {
      logger.error('Error handling photo upload', { error: error.message });
      await this.sendMessage(telegramChatId, '❌ Failed to process the uploaded image.');
    }
  }

  /**
   * Get or create user session
   */
  async getUserSession(telegramUserId, telegramUser = null) {
    let session = this.activeUsers.get(telegramUserId);
    
    if (!session) {
      // Get the actual database user ID
      const databaseUserId = await this.ensureTelegramUser(telegramUserId, telegramUser || { id: telegramUserId });
      
      session = {
        userId: databaseUserId, // Use actual database integer ID
        chatId: 1,
        lastActivity: Date.now()
      };
      this.activeUsers.set(telegramUserId, session);
    } else {
      session.lastActivity = Date.now();
    }
    
    return session;
  }

  /**
   * Ensure Telegram user exists in database
   */
  async ensureTelegramUser(telegramUserId, telegramUser) {
    try {
      const { userFunctions } = require('../../database');
      const email = `telegram_${telegramUserId}@telegram.local`;
      
      // Try to get existing user by email (since we can't use string IDs)
      let existingUser = await userFunctions.getUserByEmail(email);
      
      if (!existingUser) {
        // Create new user with Telegram info
        const username = telegramUser.username || telegramUser.first_name || 'TelegramUser';
        
        try {
          const newUser = await userFunctions.registerUser(email, 'telegram_auth_only');
          logger.info('Created new Telegram user', {
            telegramUserId,
            username,
            databaseId: newUser.id,
            email: email
          });
          return newUser.id; // Return the actual database integer ID
        } catch (error) {
          // User might already exist, try to get them again
          if (error.message.includes('UNIQUE constraint failed')) {
            existingUser = await userFunctions.getUserByEmail(email);
            if (existingUser) {
              logger.info('Telegram user already exists', { telegramUserId, databaseId: existingUser.id });
              return existingUser.id;
            }
          }
          logger.error('Error creating Telegram user', { error: error.message, telegramUserId });
          throw error;
        }
      } else {
        logger.debug('Found existing Telegram user', { telegramUserId, databaseId: existingUser.id });
        return existingUser.id; // Return the actual database integer ID
      }
    } catch (error) {
      logger.error('Error ensuring Telegram user', { error: error.message, telegramUserId });
      throw error; // Don't return a fake ID, let the caller handle the error
    }
  }

  /**
   * Handle /credits command
   */
  async handleCreditsCommand(telegramChatId, telegramUserId) {
    try {
      const { userFunctions } = require('../../database');
      
      // Ensure user exists and get database ID
      const userId = await this.ensureTelegramUser(telegramUserId, { id: telegramUserId });
      
      // Get remaining credits
      const remainingCredits = await userFunctions.getRemainingCredits(userId);
      
      await this.sendMessage(telegramChatId,
        `💰 **Your Credits**\n\n` +
        `💎 Remaining: **${remainingCredits.toLocaleString()}** credits\n\n` +
        `💡 Need more credits? Use redemption codes with:\n` +
        `/redeem <code>`
      );
      
    } catch (error) {
      logger.error('Error handling credits command', { error: error.message, telegramUserId });
      await this.sendMessage(telegramChatId, '❌ Error checking credits. Please try again.');
    }
  }

  /**
   * Handle /redeem command
   */
  async handleRedeemCommand(telegramChatId, telegramUserId, code) {
    try {
      const { userFunctions } = require('../../database');
      
      // Ensure user exists and get database ID
      const userId = await this.ensureTelegramUser(telegramUserId, { id: telegramUserId });
      
      // Validate code format
      if (!code || code.length < 3) {
        await this.sendMessage(telegramChatId,
          '❌ Invalid code format. Please provide a valid redemption code.\n\n' +
          'Example: /redeem WELCOME2024'
        );
        return;
      }
      
      // Show processing message
      await this.sendMessage(telegramChatId, '🔄 Processing redemption code...');
      
      // Try to redeem the code
      const result = await userFunctions.redeemCode(userId, code);
      
      // Get updated credit balance
      const remainingCredits = await userFunctions.getRemainingCredits(userId);
      
      await this.sendMessage(telegramChatId,
        `🎉 **Code Redeemed Successfully!**\n\n` +
        `✅ Code: \`${code}\`\n` +
        `💎 Credits Added: **${result.creditsAdded.toLocaleString()}**\n` +
        `💰 New Balance: **${remainingCredits.toLocaleString()}** credits\n\n` +
        `🚀 You can now use more AI features!`
      );
      
      logger.info('Telegram user redeemed code', {
        telegramUserId,
        databaseUserId: userId,
        code,
        creditsAdded: result.creditsAdded,
        newBalance: remainingCredits
      });
      
    } catch (error) {
      logger.error('Error handling redeem command', {
        error: error.message,
        telegramUserId,
        code
      });
      
      let errorMessage = '❌ Failed to redeem code.';
      
      if (error.message.includes('Invalid or already used code')) {
        errorMessage = '❌ **Invalid or Already Used Code**\n\n' +
          'Please check your code and try again.\n' +
          '• Codes are case-sensitive\n' +
          '• Each code can only be used once\n' +
          '• Make sure there are no extra spaces';
      } else if (error.message.includes('User not found')) {
        errorMessage = '❌ User account error. Please try /start first.';
      }
      
      await this.sendMessage(telegramChatId, errorMessage);
    }
  }

  /**
   * Send a message, handling Telegram's character limit
   */
  async sendLongMessage(chatId, text) {
    const maxLength = 4096;
    
    if (text.length <= maxLength) {
      await this.sendMessage(chatId, text);
      return;
    }
    
    // Split the message into chunks
    const chunks = [];
    let currentChunk = '';
    
    const lines = text.split('\n');
    
    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // Handle very long lines
        if (line.length > maxLength) {
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.substring(i, i + maxLength));
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    // Send chunks with a small delay
    for (let i = 0; i < chunks.length; i++) {
      await this.sendMessage(chatId, chunks[i]);
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }
  }

  /**
   * Send a simple message
   */
  async sendMessage(chatId, text) {
    try {
      await this.bot.sendMessage(chatId, text);
    } catch (error) {
      logger.error('Error sending Telegram message', { error: error.message, chatId });
    }
  }

  /**
   * Send generated files to user
   */
  async sendGeneratedFiles(telegramChatId, userId, chatId) {
    try {
      // Check if filesystem tool is available
      const tools = require('../../index.js').tools || {};
      const fileSystemTool = tools.fileSystem;
      
      if (!fileSystemTool) return;

      // Get written files
      const filesData = await fileSystemTool.getWrittenFiles(userId, chatId);
      
      if (!filesData || (!filesData.hostFiles?.length && !filesData.containerFiles?.length)) {
        return;
      }

      await this.sendMessage(telegramChatId, '📁 Sending generated files...');

      // Send host files
      for (const file of filesData.hostFiles || []) {
        try {
          if (fs.existsSync(file.path)) {
            await this.bot.sendDocument(telegramChatId, file.path, {
              caption: `📄 ${file.fileName}`
            });
          }
        } catch (error) {
          logger.error('Error sending host file', { error: error.message, filePath: file.path });
        }
      }

      // Send container files (create temporary files)
      for (const file of filesData.containerFiles || []) {
        try {
          const tempDir = path.join('output', 'temp');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          const tempFileName = file.originalName || `file_${file.id}`;
          const tempFilePath = path.join(tempDir, tempFileName);
          
          fs.writeFileSync(tempFilePath, file.fileContent);
          
          await this.bot.sendDocument(telegramChatId, tempFilePath, {
            caption: `📄 ${tempFileName}`
          });
          
          // Clean up temp file
          fs.unlinkSync(tempFilePath);
        } catch (error) {
          logger.error('Error sending container file', { error: error.message, fileId: file.id });
        }
      }

    } catch (error) {
      logger.error('Error sending generated files', { error: error.message });
    }
  }

  /**
   * Cleanup function
   */
  async cleanup() {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        logger.info('Telegram bot stopped');
      } catch (error) {
        logger.error('Error stopping Telegram bot', { error: error.message });
      }
    }
  }

  /**
   * Required runTask method for tool interface
   */
  async runTask(task, inputData, callback, userId, chatId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return {
      success: true,
      message: 'Telegram bot is running and listening for messages',
      status: this.isInitialized ? 'active' : 'inactive'
    };
  }
}

// Global instance
let telegramBotInstance = null;

// Initialize on module load
(async () => {
  if (!telegramBotInstance) {
    telegramBotInstance = new TelegramBotTool();
    await telegramBotInstance.initialize();
  }
})();

// Export for tool system
module.exports = telegramBotInstance || new TelegramBotTool();