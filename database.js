/**
 * Database module for Operon.one
 * @module database
 */
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

/**
 * Directory for storing data files
 * @type {string}
 */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Path to the SQLite database file
 * @type {string}
 */
const DB_PATH = path.join(DATA_DIR, 'operonone.db');

/**
 * SQLite database instance
 * @type {sqlite3.Database}
 */
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database');
    initDatabase();
  }
});

/**
 * Initialize database tables if they don't exist
 */
function initDatabase() {
  
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
  
  
  db.run(`CREATE TABLE IF NOT EXISTS task_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    chatId INTEGER NOT NULL,
    messageId INTEGER,
    stepIndex INTEGER NOT NULL,
    stepData TEXT NOT NULL,
    stepStatus TEXT DEFAULT 'pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    completedAt DATETIME,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (chatId) REFERENCES chats(id),
    FOREIGN KEY (messageId) REFERENCES chat_history(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating task_steps table:', err.message);
    } else {
      console.log('Task steps table ready');
    }
  });
}

/**
 * User-related database functions
 * @namespace userFunctions
 */
const userFunctions = {
  /**
   * Register a new user
   * @async
   * @param {string} email - User's email address
   * @param {string} password - User's password (will be hashed)
   * @returns {Promise<Object>} User object with id and email
   */
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

  /**
   * Authenticate a user
   * @async
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<Object>} User data (excluding password)
   */
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
              
              db.run(
                'UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
              );
              
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

  /**
   * Get user by ID
   * @param {number|string} id - User ID
   * @returns {Promise<Object>} User data (excluding password)
   */
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

  /**
   * Update user's credits
   * @param {number|string} userId - User ID
   * @param {number} credits - Number of credits to add (can be negative)
   * @returns {Promise<Object>} Result with changes count
   */
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

/**
 * Memory-related database functions
 * @namespace memoryFunctions
 */
const memoryFunctions = {
  /**
   * Store a memory for a user
   * @param {number|string} userId - User ID
   * @param {Object} memoryData - Memory data to store
   * @param {string} memoryData.type - Type of memory
   * @param {string} memoryData.content - Content of memory
   * @param {string|Array} memoryData.keywords - Keywords associated with memory
   * @param {string|Object} memoryData.metadata - Additional metadata
   * @param {number} memoryData.importance - Importance level
   * @param {string} memoryData.storageDuration - How long to store the memory
   * @returns {Promise<Object>} Result with ID of new memory
   */
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

  /**
   * Get memories for a user
   * @param {number|string} userId - User ID
   * @param {number} [limit=100] - Maximum number of memories to retrieve
   * @returns {Promise<Array>} Array of memory objects
   */
  getMemories(userId, limit = 100) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM memories WHERE userId = ? ORDER BY storedAt DESC LIMIT ?',
        [userId, limit],
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
  },

  /**
   * Search memories for a user
   * @param {number|string} userId - User ID
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching memory objects
   */
  searchMemories(userId, query) {
    return new Promise((resolve, reject) => {
      
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

/**
 * Chat-related database functions
 * @namespace chatFunctions
 */
const chatFunctions = {
  /**
   * Add a message to chat history
   * @param {number|string} userId - User ID
   * @param {string} role - Message role (user, assistant, etc.)
   * @param {string|Object} content - Message content
   * @param {number} [chatId=1] - Chat ID
   * @returns {Promise<Object>} Result with ID of new message
   */
  addChatMessage(userId, role, content, chatId = 1) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO chat_history (userId, chatId, role, content) VALUES (?, ?, ?, ?)',
        [userId, chatId, role, typeof content === 'object' ? JSON.stringify(content) : content],
        function(err) {
          if (err) {
            reject(err);
          } else {
            
            db.run('UPDATE chats SET updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?', 
              [chatId, userId]);
            resolve({ id: this.lastID });
          }
        }
      );
    });
  },

  /**
   * Get chat history for a user
   * @param {number|string} userId - User ID
   * @param {number} [chatId=1] - Chat ID
   * @param {number} [limit=50] - Maximum number of messages to retrieve
   * @returns {Promise<Array>} Array of chat message objects
   */
  getChatHistory(userId, chatId = 1, limit = 50) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM chat_history WHERE userId = ? AND chatId = ? ORDER BY timestamp ASC LIMIT ?',
        [userId, chatId, limit],
        (err, messages) => {
          if (err) {
            reject(err);
          } else {
            
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

  /**
   * Clear chat history for a user
   * @param {number|string} userId - User ID
   * @param {number} [chatId=1] - Chat ID
   * @returns {Promise<Object>} Result with count of deleted messages
   */
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

  /**
   * Create a new chat
   * @param {number|string} userId - User ID
   * @param {string} [title='New Chat'] - Chat title
   * @returns {Promise<Object>} New chat object with id and title
   */
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

  /**
   * Get all chats for a user
   * @param {number|string} userId - User ID
   * @returns {Promise<Array>} Array of chat objects
   */
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

  /**
   * Update a chat's title
   * @param {number|string} userId - User ID
   * @param {number} chatId - Chat ID
   * @param {string} title - New title
   * @returns {Promise<Object>} Result with count of changes
   */
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

  /**
   * Delete a chat and its history
   * @param {number|string} userId - User ID
   * @param {number} chatId - Chat ID
   * @returns {Promise<Object>} Result with count of deleted records
   */
  deleteChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      
      db.run('DELETE FROM chat_history WHERE userId = ? AND chatId = ?', 
        [userId, chatId], 
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          
          db.run('DELETE FROM task_steps WHERE userId = ? AND chatId = ?', 
            [userId, chatId], 
            (err) => {
              if (err) {
                reject(err);
                return;
              }

              
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
        }
      );
    });
  }
};

/**
 * File-related database functions
 * @namespace fileFunctions
 */
const fileFunctions = {
  /**
   * Track a container file
   * @param {number|string} userId - User ID
   * @param {string} containerPath - Path to file in container
   * @param {string} [originalName=null] - Original file name
   * @param {string} [description=null] - File description
   * @param {number} [chatId=1] - Chat ID
   * @param {string} [fileContent=null] - File content
   * @param {string} [fileExtension=null] - File extension
   * @returns {Promise<Object>} Result with ID of tracked file
   */
  trackContainerFile(userId, containerPath, originalName = null, description = null, chatId = 1, fileContent = null, fileExtension = null) {
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO container_files (userId, containerPath, originalName, description, chatId, fileContent, fileExtension) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, containerPath, originalName, description, chatId, fileContent, fileExtension],
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
  
  /**
   * Track a host file
   * @param {number|string} userId - User ID
   * @param {string} filePath - Path to file on host
   * @param {string} [originalName=null] - Original file name
   * @param {string} [description=null] - File description
   * @param {number} [chatId=1] - Chat ID
   * @param {string} [fileContent=null] - File content
   * @param {string} [fileExtension=null] - File extension
   * @returns {Promise<Object>} Result with ID of tracked file
   */
  trackHostFile(userId, filePath, originalName = null, description = null, chatId = 1, fileContent = null, fileExtension = null) {
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO host_files (userId, filePath, originalName, description, chatId, fileContent, fileExtension) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, filePath, originalName, description, chatId, fileContent, fileExtension],
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
  
  /**
   * Get tracked files for a user
   * @param {number|string} userId - User ID
   * @param {number} [chatId=1] - Chat ID
   * @returns {Promise<Object>} Object with containerFiles and hostFiles arrays
   */
  getTrackedFiles(userId, chatId = 1) {
    
    return new Promise((resolve, reject) => {
      const result = {
        containerFiles: [],
        hostFiles: []
      };
      
      
      db.all(
        'SELECT id, userId, containerPath, originalName, description, fileExtension, createdAt, chatId, fileContent FROM container_files WHERE userId = ? AND chatId = ? ORDER BY createdAt DESC',
        [userId, chatId],
        (err, containerFiles) => {
          if (err) {
            
            return reject(err);
          }
          
          
          result.containerFiles = containerFiles;
          
          
          db.all(
            'SELECT id, userId, filePath, originalName, description, fileExtension, createdAt, chatId, fileContent FROM host_files WHERE userId = ? AND chatId = ? ORDER BY createdAt DESC',
            [userId, chatId],
            (err, hostFiles) => {
              if (err) {
                
                return reject(err);
              }
              
              
              result.hostFiles = hostFiles;
              resolve(result);
            }
          );
        }
      );
    });
  },
  
  /**
   * Delete tracked files
   * @param {number|string} userId - User ID
   * @param {Array<number>} fileIds - Array of file IDs to delete
   * @param {string} [fileType='all'] - Type of files to delete ('all', 'container', or 'host')
   * @returns {Promise<Object>} Result with count of deleted files
   */
  deleteTrackedFiles(userId, fileIds, fileType = 'all') {
    return new Promise((resolve, reject) => {
      let deletedCount = 0;
      
      
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

  /**
   * Get a tracked file by ID
   * @param {number|string} userId - User ID
   * @param {number} fileId - File ID
   * @returns {Promise<Object|null>} File object or null if not found
   */
  getTrackedFileById(userId, fileId) {
    return new Promise((resolve, reject) => {
      
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

          
          db.get(
            'SELECT id, userId, filePath AS path, originalName AS fileName, description, fileExtension, createdAt, fileContent, \'host\' AS type FROM host_files WHERE userId = ? AND id = ?',
            [userId, fileId],
            (err, hostFile) => {
              if (err) {
                return reject(err);
              }
              resolve(hostFile); 
            }
          );
        }
      );
    });
  }
};

/**
 * Settings-related database functions
 * @namespace settingsFunctions
 */
const settingsFunctions = {
  /**
   * Save or update a user setting
   * @param {number|string} userId - User ID
   * @param {string} key - Setting key
   * @param {string} value - Setting value
   * @returns {Promise<Object>} Result with ID, key, and value
   */
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

  /**
   * Get a user setting by key
   * @param {number|string} userId - User ID
   * @param {string} key - Setting key
   * @returns {Promise<string|null>} Setting value or null if not found
   */
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

  /**
   * Get all settings for a user
   * @param {number|string} userId - User ID
   * @returns {Promise<Object>} Object with settings as key-value pairs
   */
  getAllSettings(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT settingKey, settingValue FROM settings WHERE userId = ?',
        [userId],
        (err, settings) => {
          if (err) {
            reject(err);
          } else {
            
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

  /**
   * Delete a user setting
   * @param {number|string} userId - User ID
   * @param {string} key - Setting key
   * @returns {Promise<Object>} Result indicating if setting was deleted
   */
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

/**
 * Try to parse a JSON string with fallback mechanisms
 * @param {string|Object} str - String to parse or object to return as-is
 * @param {*} defaultValue - Default value to return if parsing fails
 * @returns {*} Parsed object or default value
 */
function tryParseJSON(str, defaultValue) {
  if (!str) return defaultValue;
  
  
  if (typeof str === 'object') return str;
  
  
  if (typeof str === 'string') {
    try {
      
      return JSON.parse(str);
    } catch (e) {
      
      try {
        
        const cleaned = str.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(cleaned);
      } catch (e2) {
        
        try {
          
          let fixedStr = str;
          const openBraces = (fixedStr.match(/\{/g) || []).length;
          const closeBraces = (fixedStr.match(/\}/g) || []).length;
          const openBrackets = (fixedStr.match(/\[/g) || []).length;
          const closeBrackets = (fixedStr.match(/\]/g) || []).length;
          
          
          for (let i = 0; i < (openBraces - closeBraces); i++) {
            fixedStr += '}';
          }
          
          
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
          
          return defaultValue !== undefined ? defaultValue : str;
        }
      }
    }
  }
  
  
  return defaultValue !== undefined ? defaultValue : str;
}


process.on('exit', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
  });
});

/**
 * Task step-related database functions
 * @namespace taskStepFunctions
 */
const taskStepFunctions = {
  /**
   * Store task steps for a chat
   * @param {string} userId - User ID
   * @param {number} chatId - Chat ID
   * @param {Array} steps - Array of step objects
   * @param {number} messageId - Associated message ID (optional)
   * @returns {Promise<Array>} Array of created step IDs
   */
  async storeTaskSteps(userId, chatId, steps, messageId = null) {
    const stepIds = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepData = JSON.stringify({
        step: step.step,
        action: step.action,
        expectedOutput: step.expectedOutput,
        originalIndex: i
      });
      
      const stepId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO task_steps (userId, chatId, messageId, stepIndex, stepData, stepStatus) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, chatId, messageId, i, stepData, 'pending'],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });
      
      stepIds.push(stepId);
    }
    
    return stepIds;
  },

  /**
   * Update step status
   * @param {string} userId - User ID
   * @param {number} chatId - Chat ID
   * @param {number} stepIndex - Step index
   * @param {string} status - New status ('pending', 'completed', 'error')
   * @returns {Promise<Object>} Result with changes count
   */
  async updateStepStatus(userId, chatId, stepIndex, status) {
    return new Promise((resolve, reject) => {
      const completedAt = status === 'completed' ? new Date().toISOString() : null;
      
      db.run(
        'UPDATE task_steps SET stepStatus = ?, completedAt = ? WHERE userId = ? AND chatId = ? AND stepIndex = ?',
        [status, completedAt, userId, chatId, stepIndex],
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

  /**
   * Get task steps for a chat
   * @param {string} userId - User ID
   * @param {number} chatId - Chat ID
   * @returns {Promise<Array>} Array of task steps
   */
  async getTaskSteps(userId, chatId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM task_steps WHERE userId = ? AND chatId = ? ORDER BY stepIndex ASC',
        [userId, chatId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const steps = rows.map(row => ({
              id: row.id,
              stepIndex: row.stepIndex,
              stepData: tryParseJSON(row.stepData, {}),
              stepStatus: row.stepStatus,
              createdAt: row.createdAt,
              completedAt: row.completedAt
            }));
            resolve(steps);
          }
        }
      );
    });
  },

  /**
   * Clear task steps for a chat
   * @param {string} userId - User ID
   * @param {number} chatId - Chat ID
   * @returns {Promise<Object>} Result with changes count
   */
  async clearTaskSteps(userId, chatId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM task_steps WHERE userId = ? AND chatId = ?',
        [userId, chatId],
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

/**
 * Get the database instance
 * @returns {sqlite3.Database} Database instance
 */
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
  taskStepFunctions,
  getDb  
}; 