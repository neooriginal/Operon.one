const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// Ensure the data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Database file path
const DB_PATH = path.join(DATA_DIR, 'operonone.db');

// Create a new database instance
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database');
    initDatabase();
  }
});

// Initialize database tables if they don't exist
function initDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    creditsUsed INTEGER DEFAULT 0,
    paymentPlan TEXT DEFAULT 'free',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastLogin DATETIME
  )`, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table ready');
    }
  });

  // Memories table
  db.run(`CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    keywords TEXT,
    metadata TEXT,
    importance INTEGER,
    storageDuration TEXT,
    storedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating memories table:', err.message);
    } else {
      console.log('Memories table ready');
    }
  });

  // Chat history table
  db.run(`CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    chatId INTEGER DEFAULT 1,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (chatId) REFERENCES chats(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating chat_history table:', err.message);
    } else {
      console.log('Chat history table ready');
    }
  });
  
  // Chats table (for multiple conversations)
  db.run(`CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    title TEXT DEFAULT 'New Chat',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating chats table:', err.message);
    } else {
      console.log('Chats table ready');
    }
  });
  
  // Container files table (for tracking files created by container-based tools)
  db.run(`CREATE TABLE IF NOT EXISTS container_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    containerPath TEXT NOT NULL,
    originalName TEXT,
    description TEXT,
    fileContent TEXT,
    fileExtension TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    chatId INTEGER DEFAULT 1,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (chatId) REFERENCES chats(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating container_files table:', err.message);
    } else {
      console.log('Container files table ready');
    }
  });
  
  // Host files table (for tracking files created on the host system)
  db.run(`CREATE TABLE IF NOT EXISTS host_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    filePath TEXT NOT NULL,
    originalName TEXT,
    description TEXT,
    fileContent TEXT,
    fileExtension TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    chatId INTEGER DEFAULT 1,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (chatId) REFERENCES chats(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating host_files table:', err.message);
    } else {
      console.log('Host files table ready');
    }
  });
  
  // Settings table (for user preferences and settings)
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    settingKey TEXT NOT NULL,
    settingValue TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id),
    UNIQUE(userId, settingKey)
  )`, (err) => {
    if (err) {
      console.error('Error creating settings table:', err.message);
    } else {
      console.log('Settings table ready');
    }
  });
}

// User functions
const userFunctions = {
  // Register a new user
  async registerUser(email, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [email, hashedPassword],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, email });
          }
        }
      );
    });
  },

  // Authenticate a user
  async loginUser(email, password) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE email = ?',
        [email],
        async (err, user) => {
          if (err) {
            reject(err);
          } else if (!user) {
            reject(new Error('User not found'));
          } else {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
              // Update last login time
              db.run(
                'UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
              );
              // Return user data without password
              const { password, ...userData } = user;
              resolve(userData);
            } else {
              reject(new Error('Invalid password'));
            }
          }
        }
      );
    });
  },

  // Get user by ID
  getUserById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT id, email, creditsUsed, paymentPlan, createdAt, lastLogin FROM users WHERE id = ?',
        [id],
        (err, user) => {
          if (err) {
            reject(err);
          } else {
            resolve(user);
          }
        }
      );
    });
  },

  // Update user credits
  updateCredits(userId, credits) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET creditsUsed = creditsUsed + ? WHERE id = ?',
        [credits, userId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }
};

// Memory functions
const memoryFunctions = {
  // Store a memory
  storeMemory(userId, memoryData) {
    const { type, content, keywords, metadata, importance, storageDuration } = memoryData;
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO memories (userId, type, content, keywords, metadata, importance, storageDuration) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          userId, 
          type, 
          content, 
          Array.isArray(keywords) ? JSON.stringify(keywords) : keywords,
          typeof metadata === 'object' ? JSON.stringify(metadata) : metadata,
          importance, 
          storageDuration
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  },

  // Get memories for a user
  getMemories(userId, limit = 100) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM memories WHERE userId = ? ORDER BY storedAt DESC LIMIT ?',
        [userId, limit],
        (err, memories) => {
          if (err) {
            reject(err);
          } else {
            // Parse JSON strings back to objects
            const parsedMemories = memories.map(memory => ({
              ...memory,
              keywords: tryParseJSON(memory.keywords, []),
              metadata: tryParseJSON(memory.metadata, {})
            }));
            resolve(parsedMemories);
          }
        }
      );
    });
  },

  // Search memories
  searchMemories(userId, query) {
    return new Promise((resolve, reject) => {
      // Basic search implementation - can be improved with full-text search
      db.all(
        `SELECT * FROM memories 
         WHERE userId = ? AND (
           content LIKE ? OR 
           keywords LIKE ? OR 
           metadata LIKE ?
         )
         ORDER BY importance DESC, storedAt DESC`,
        [userId, `%${query}%`, `%${query}%`, `%${query}%`],
        (err, memories) => {
          if (err) {
            reject(err);
          } else {
            const parsedMemories = memories.map(memory => ({
              ...memory,
              keywords: tryParseJSON(memory.keywords, []),
              metadata: tryParseJSON(memory.metadata, {})
            }));
            resolve(parsedMemories);
          }
        }
      );
    });
  }
};

// Chat history functions
const chatFunctions = {
  // Add a chat message
  addChatMessage(userId, role, content, chatId = 1) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO chat_history (userId, chatId, role, content) VALUES (?, ?, ?, ?)',
        [userId, chatId, role, typeof content === 'object' ? JSON.stringify(content) : content],
        function(err) {
          if (err) {
            reject(err);
          } else {
            // Update the chat's updatedAt timestamp
            db.run('UPDATE chats SET updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?', 
              [chatId, userId]);
            resolve({ id: this.lastID });
          }
        }
      );
    });
  },

  // Get chat history for a user and specific chat
  getChatHistory(userId, chatId = 1, limit = 50) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM chat_history WHERE userId = ? AND chatId = ? ORDER BY timestamp ASC LIMIT ?',
        [userId, chatId, limit],
        (err, messages) => {
          if (err) {
            reject(err);
          } else {
            // Parse JSON content if needed
            const parsedMessages = messages.map(msg => ({
              ...msg,
              content: tryParseJSON(msg.content, msg.content)
            }));
            resolve(parsedMessages);
          }
        }
      );
    });
  },

  // Clear chat history for a specific chat
  clearChatHistory(userId, chatId = 1) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM chat_history WHERE userId = ? AND chatId = ?',
        [userId, chatId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ deleted: this.changes });
          }
        }
      );
    });
  },

  // Create a new chat
  createChat(userId, title = 'New Chat') {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO chats (userId, title) VALUES (?, ?)',
        [userId, title],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, title });
          }
        }
      );
    });
  },

  // Get all chats for a user
  getUserChats(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, title, createdAt, updatedAt FROM chats WHERE userId = ? ORDER BY updatedAt DESC',
        [userId],
        (err, chats) => {
          if (err) {
            reject(err);
          } else {
            resolve(chats);
          }
        }
      );
    });
  },

  // Update chat title
  updateChatTitle(userId, chatId, title) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE chats SET title = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?',
        [title, chatId, userId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        }
      );
    });
  },

  // Delete a chat and its history
  deleteChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      // First delete chat history
      db.run('DELETE FROM chat_history WHERE userId = ? AND chatId = ?', 
        [userId, chatId], 
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Then delete the chat
          db.run('DELETE FROM chats WHERE id = ? AND userId = ?', 
            [chatId, userId], 
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({ deleted: this.changes });
              }
            }
          );
        }
      );
    });
  }
};

// File tracking functions
const fileFunctions = {
  // Track a container file
  trackContainerFile(userId, containerPath, originalName = null, description = null, chatId = 1, fileContent = null, fileExtension = null) {
    // console.log('Tracking container file with data:', { userId, containerPath, originalName, description, chatId, fileContentLength: fileContent ? fileContent.length : 0, fileExtension });
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO container_files (userId, containerPath, originalName, description, chatId, fileContent, fileExtension) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, containerPath, originalName, description, chatId, fileContent, fileExtension],
        function(err) {
          if (err) {
            // console.error('Error tracking container file:', err);
            reject(err);
          } else {
            // console.log(`Successfully tracked container file with ID: ${this.lastID}`);
            resolve({ id: this.lastID });
          }
        }
      );
    });
  },
  
  // Track a host file
  trackHostFile(userId, filePath, originalName = null, description = null, chatId = 1, fileContent = null, fileExtension = null) {
    // console.log('Tracking host file with data:', { userId, filePath, originalName, description, chatId, fileContentLength: fileContent ? fileContent.length : 0, fileExtension });
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO host_files (userId, filePath, originalName, description, chatId, fileContent, fileExtension) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, filePath, originalName, description, chatId, fileContent, fileExtension],
        function(err) {
          if (err) {
            // console.error('Error tracking host file:', err);
            reject(err);
          } else {
            // console.log(`Successfully tracked host file with ID: ${this.lastID}`);
            resolve({ id: this.lastID });
          }
        }
      );
    });
  },
  
  // Get tracked files for a user
  getTrackedFiles(userId, chatId = 1) {
    // console.log(`Getting tracked files for user: ${userId}, chat: ${chatId}`);
    return new Promise((resolve, reject) => {
      const result = {
        containerFiles: [],
        hostFiles: []
      };
      
      // Get container files - add fileContent to the SELECT
      db.all(
        'SELECT id, userId, containerPath, originalName, description, fileExtension, createdAt, chatId, fileContent FROM container_files WHERE userId = ? AND chatId = ? ORDER BY createdAt DESC',
        [userId, chatId],
        (err, containerFiles) => {
          if (err) {
            // console.error('Error retrieving container files:', err);
            return reject(err);
          }
          
          // console.log('Retrieved container files:', JSON.stringify(containerFiles, null, 2));
          result.containerFiles = containerFiles;
          
          // Get host files - add fileContent to the SELECT
          db.all(
            'SELECT id, userId, filePath, originalName, description, fileExtension, createdAt, chatId, fileContent FROM host_files WHERE userId = ? AND chatId = ? ORDER BY createdAt DESC',
            [userId, chatId],
            (err, hostFiles) => {
              if (err) {
                // console.error('Error retrieving host files:', err);
                return reject(err);
              }
              
              // console.log('Retrieved host files:', JSON.stringify(hostFiles, null, 2));
              result.hostFiles = hostFiles;
              resolve(result);
            }
          );
        }
      );
    });
  },
  
  // Delete tracked files for a user
  deleteTrackedFiles(userId, fileIds, fileType = 'all') {
    return new Promise((resolve, reject) => {
      let deletedCount = 0;
      
      // Function to handle the deletion for a specific table
      const deleteFromTable = (table, idsParam) => {
        return new Promise((resolveDelete, rejectDelete) => {
          if (!idsParam || idsParam.length === 0) {
            return resolveDelete(0);
          }
          
          const placeholders = idsParam.map(() => '?').join(',');
          const params = [...idsParam, userId];
          
          db.run(
            `DELETE FROM ${table} WHERE id IN (${placeholders}) AND userId = ?`,
            params,
            function(err) {
              if (err) {
                rejectDelete(err);
              } else {
                resolveDelete(this.changes);
              }
            }
          );
        });
      };
      
      // Process deletions based on fileType
      const operations = [];
      
      if (fileType === 'all' || fileType === 'container') {
        operations.push(deleteFromTable('container_files', fileIds));
      }
      
      if (fileType === 'all' || fileType === 'host') {
        operations.push(deleteFromTable('host_files', fileIds));
      }
      
      Promise.all(operations)
        .then(results => {
          deletedCount = results.reduce((sum, count) => sum + count, 0);
          resolve({ deleted: deletedCount });
        })
        .catch(err => reject(err));
    });
  },

  // Get a specific tracked file by ID for a user
  getTrackedFileById(userId, fileId) {
    return new Promise((resolve, reject) => {
      // Try finding in container_files first
      db.get(
        'SELECT id, userId, containerPath AS path, originalName AS fileName, description, fileExtension, createdAt, fileContent, \'container\' AS type FROM container_files WHERE userId = ? AND id = ?',
        [userId, fileId],
        (err, containerFile) => {
          if (err) {
            return reject(err);
          }
          if (containerFile) {
            return resolve(containerFile);
          }

          // If not found, try finding in host_files
          db.get(
            'SELECT id, userId, filePath AS path, originalName AS fileName, description, fileExtension, createdAt, fileContent, \'host\' AS type FROM host_files WHERE userId = ? AND id = ?',
            [userId, fileId],
            (err, hostFile) => {
              if (err) {
                return reject(err);
              }
              resolve(hostFile); // Resolve with hostFile (or null if not found)
            }
          );
        }
      );
    });
  }
};

// Settings functions
const settingsFunctions = {
  // Save a setting for a user
  saveSetting(userId, key, value) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO settings (userId, settingKey, settingValue, updatedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(userId, settingKey) 
         DO UPDATE SET settingValue = ?, updatedAt = CURRENT_TIMESTAMP`,
        [userId, key, value, value],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, key, value });
          }
        }
      );
    });
  },

  // Get a specific setting for a user
  getSetting(userId, key) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT settingValue FROM settings WHERE userId = ? AND settingKey = ?',
        [userId, key],
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result ? result.settingValue : null);
          }
        }
      );
    });
  },

  // Get all settings for a user
  getAllSettings(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT settingKey, settingValue FROM settings WHERE userId = ?',
        [userId],
        (err, settings) => {
          if (err) {
            reject(err);
          } else {
            // Convert array of {settingKey, settingValue} to object
            const settingsObject = settings.reduce((obj, setting) => {
              obj[setting.settingKey] = setting.settingValue;
              return obj;
            }, {});
            resolve(settingsObject);
          }
        }
      );
    });
  },

  // Delete a setting
  deleteSetting(userId, key) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM settings WHERE userId = ? AND settingKey = ?',
        [userId, key],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ deleted: this.changes > 0 });
          }
        }
      );
    });
  }
};

// Helper function to safely parse JSON
function tryParseJSON(str, defaultValue) {
  if (!str) return defaultValue;
  
  // If it's already an object, just return it
  if (typeof str === 'object') return str;
  
  // Handle string JSON
  if (typeof str === 'string') {
    try {
      // First attempt - standard JSON parse
      return JSON.parse(str);
    } catch (e) {
      // Second attempt - try to fix common JSON issues
      try {
        // Clean up trailing commas that cause parse errors
        const cleaned = str.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(cleaned);
      } catch (e2) {
        // Third attempt - if it's a partial/truncated JSON, try to recover it
        try {
          // Add missing closing brackets/braces if needed
          let fixedStr = str;
          const openBraces = (fixedStr.match(/\{/g) || []).length;
          const closeBraces = (fixedStr.match(/\}/g) || []).length;
          const openBrackets = (fixedStr.match(/\[/g) || []).length;
          const closeBrackets = (fixedStr.match(/\]/g) || []).length;
          
          // Add missing closing braces
          for (let i = 0; i < (openBraces - closeBraces); i++) {
            fixedStr += '}';
          }
          
          // Add missing closing brackets
          for (let i = 0; i < (openBrackets - closeBrackets); i++) {
            fixedStr += ']';
          }
          
          return JSON.parse(fixedStr);
        } catch (e3) {
          console.error('Failed to parse JSON after multiple attempts', {
            error: true,
            message: 'Failed to parse JSON after multiple attempts',
            original: str.substring(0, 100) + '...',
            fallback: true
          });
          // Return the original string if defaultValue is not specified
          return defaultValue !== undefined ? defaultValue : str;
        }
      }
    }
  }
  
  // If all else fails, return the default value or the original string
  return defaultValue !== undefined ? defaultValue : str;
}

// Close the database connection when the process exits
process.on('exit', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
  });
});

// Add getDb function to export the database connection
function getDb() {
  return db;
}

module.exports = {
  db,
  userFunctions,
  memoryFunctions,
  chatFunctions,
  fileFunctions,
  settingsFunctions,
  getDb  // Export the database connection
}; 