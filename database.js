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
  
  // File contents table (for storing actual file contents)
  db.run(`CREATE TABLE IF NOT EXISTS file_contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    fileId INTEGER NOT NULL,
    fileType TEXT NOT NULL, 
    extension TEXT,
    content TEXT NOT NULL,
    fileSize INTEGER,
    mimeType TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    chatId INTEGER DEFAULT 1,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (chatId) REFERENCES chats(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating file_contents table:', err.message);
    } else {
      console.log('File contents table ready');
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

  // After creating all tables, migrate existing chat data if needed
  migrateExistingChatData();
}

// Migration function to handle chat migration
function migrateExistingChatData() {
  console.log('Checking for data migration needs...');
  
  // First, check if we need to migrate by looking for users with messages but no chats
  db.all(
    `SELECT DISTINCT ch.userId 
     FROM chat_history ch 
     LEFT JOIN chats c ON ch.userId = c.userId 
     WHERE c.id IS NULL`,
    [],
    async (err, rows) => {
      if (err) {
        console.error('Error checking for migration needs:', err.message);
        return;
      }
      
      if (rows.length === 0) {
        console.log('No chat data migration needed');
        return;
      }
      
      console.log(`Found ${rows.length} users needing chat migration`);
      
      // For each user that needs migration
      for (const row of rows) {
        const userId = row.userId;
        
        try {
          // Create a default chat for this user
          db.run(
            'INSERT INTO chats (userId, title, createdAt, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            [userId, 'Chat History'],
            function(err) {
              if (err) {
                console.error(`Error creating default chat for user ${userId}:`, err.message);
                return;
              }
              
              const chatId = this.lastID;
              console.log(`Created default chat (ID: ${chatId}) for user ${userId}`);
              
              // Update all existing messages to belong to this chat
              db.run(
                'UPDATE chat_history SET chatId = ? WHERE userId = ?',
                [chatId, userId],
                function(err) {
                  if (err) {
                    console.error(`Error updating chat history for user ${userId}:`, err.message);
                  } else {
                    console.log(`Updated ${this.changes} messages for user ${userId}`);
                  }
                }
              );
            }
          );
        } catch (error) {
          console.error(`Error migrating data for user ${userId}:`, error.message);
        }
      }
    }
  );
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
  trackContainerFile(userId, containerPath, originalName = null, description = null, chatId = 1) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO container_files (userId, containerPath, originalName, description, chatId) VALUES (?, ?, ?, ?, ?)',
        [userId, containerPath, originalName, description, chatId],
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
  
  // Track a host file
  trackHostFile(userId, filePath, originalName = null, description = null, chatId = 1) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO host_files (userId, filePath, originalName, description, chatId) VALUES (?, ?, ?, ?, ?)',
        [userId, filePath, originalName, description, chatId],
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
  
  // Get tracked files for a user
  getTrackedFiles(userId, chatId = 1) {
    return new Promise((resolve, reject) => {
      const result = {
        containerFiles: [],
        hostFiles: []
      };
      
      // Get container files
      db.all(
        'SELECT * FROM container_files WHERE userId = ? AND chatId = ? ORDER BY createdAt DESC',
        [userId, chatId],
        (err, containerFiles) => {
          if (err) {
            return reject(err);
          }
          
          result.containerFiles = containerFiles;
          
          // Get host files
          db.all(
            'SELECT * FROM host_files WHERE userId = ? AND chatId = ? ORDER BY createdAt DESC',
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
  
  // Save file content to database
  saveFileContent(userId, fileId, fileType, content, extension, mimeType = null, chatId = 1) {
    return new Promise((resolve, reject) => {
      const fileSize = Buffer.byteLength(content, 'utf8');
      
      db.run(
        `INSERT INTO file_contents 
         (userId, fileId, fileType, extension, content, fileSize, mimeType, chatId) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, fileId, fileType, extension, content, fileSize, mimeType, chatId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, fileSize });
          }
        }
      );
    });
  },
  
  // Get file content from database
  getFileContent(userId, fileId, fileType, chatId = 1) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM file_contents WHERE userId = ? AND fileId = ? AND fileType = ? AND chatId = ?',
        [userId, fileId, fileType, chatId],
        (err, fileContent) => {
          if (err) {
            reject(err);
          } else if (!fileContent) {
            reject(new Error('File content not found'));
          } else {
            resolve(fileContent);
          }
        }
      );
    });
  },
  
  // Save container file and its content in one operation
  saveContainerFileWithContent(userId, containerPath, content, originalName = null, extension = null, mimeType = null, chatId = 1) {
    return new Promise((resolve, reject) => {
      // First insert the container file record
      db.run(
        'INSERT INTO container_files (userId, containerPath, originalName, chatId) VALUES (?, ?, ?, ?)',
        [userId, containerPath, originalName || path.basename(containerPath), chatId],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          const fileId = this.lastID;
          
          // Then save the file content
          const fileSize = Buffer.byteLength(content, 'utf8');
          extension = extension || path.extname(containerPath).replace('.', '');
          
          db.run(
            `INSERT INTO file_contents 
             (userId, fileId, fileType, extension, content, fileSize, mimeType, chatId) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, fileId, 'container', extension, content, fileSize, mimeType, chatId],
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({ 
                  fileId, 
                  contentId: this.lastID, 
                  containerPath,
                  fileSize 
                });
              }
            }
          );
        }
      );
    });
  },
  
  // Get all container files with a specific path prefix (for simulating directories)
  listContainerFilesByPathPrefix(userId, pathPrefix, chatId = 1) {
    return new Promise((resolve, reject) => {
      // Ensure pathPrefix ends with a slash for proper matching
      if (pathPrefix !== '/' && !pathPrefix.endsWith('/')) {
        pathPrefix += '/';
      }
      
      db.all(
        'SELECT * FROM container_files WHERE userId = ? AND chatId = ? AND containerPath LIKE ?',
        [userId, chatId, pathPrefix + '%'],
        (err, files) => {
          if (err) {
            reject(err);
          } else {
            resolve(files);
          }
        }
      );
    });
  },
  
  // Simulate directory creation by tracking it in the database
  createDirectory(userId, dirPath, chatId = 1) {
    return new Promise((resolve, reject) => {
      // Store a special marker file to represent the directory
      const markerFileName = '.directory';
      const fullPath = dirPath.endsWith('/') ? dirPath + markerFileName : dirPath + '/' + markerFileName;
      
      db.run(
        'INSERT INTO container_files (userId, containerPath, originalName, description, chatId) VALUES (?, ?, ?, ?, ?)',
        [userId, fullPath, markerFileName, 'Directory marker', chatId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            // Create a special file content entry for this directory marker
            db.run(
              `INSERT INTO file_contents 
               (userId, fileId, fileType, extension, content, fileSize, mimeType, chatId) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [userId, this.lastID, 'container', 'dir', 'directory', 9, 'text/plain', chatId],
              function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve({ id: this.lastID, dirPath });
                }
              }
            );
          }
        }
      );
    });
  },
  
  // Simulate directory deletion by removing all files with a certain path prefix
  deleteDirectory(userId, dirPath, chatId = 1) {
    return new Promise((resolve, reject) => {
      // Ensure dirPath ends with a slash for proper matching
      if (dirPath !== '/' && !dirPath.endsWith('/')) {
        dirPath += '/';
      }
      
      // First get all files with this path prefix
      this.listContainerFilesByPathPrefix(userId, dirPath, chatId)
        .then(files => {
          // If no files, treat as success
          if (!files || files.length === 0) {
            return resolve({ deleted: 0 });
          }
          
          // Get all fileIds to delete file contents
          const fileIds = files.map(file => file.id);
          
          // Delete file contents first
          db.run(
            `DELETE FROM file_contents WHERE userId = ? AND fileType = 'container' AND fileId IN (${fileIds.map(() => '?').join(',')})`,
            [userId, ...fileIds],
            (err) => {
              if (err) {
                return reject(err);
              }
              
              // Then delete the file records
              db.run(
                `DELETE FROM container_files WHERE userId = ? AND chatId = ? AND containerPath LIKE ?`,
                [userId, chatId, dirPath + '%'],
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
        })
        .catch(err => reject(err));
    });
  },
  
  // List files in a directory by path prefix 
  listFilesInDirectory(userId, dirPath, chatId = 1) {
    return new Promise((resolve, reject) => {
      // Ensure dirPath ends with a slash for proper matching
      if (dirPath !== '/' && !dirPath.endsWith('/')) {
        dirPath += '/';
      }
      
      // Get files with immediate path prefix but not deeper subdirectories
      db.all(
        `SELECT containerPath FROM container_files 
         WHERE userId = ? AND chatId = ? AND containerPath LIKE ? 
         AND containerPath NOT LIKE ?`,
        [userId, chatId, dirPath + '%', dirPath + '%/%'],
        (err, files) => {
          if (err) {
            reject(err);
          } else {
            // Filter out directory markers and extract file names
            const fileNames = files
              .map(file => {
                // Extract the filename from the path
                const pathParts = file.containerPath.substring(dirPath.length).split('/');
                return pathParts[0];
              })
              .filter(name => name !== '.directory');
            
            // Return unique filenames
            resolve([...new Set(fileNames)]);
          }
        }
      );
    });
  },
  
  // List directories in a directory by path prefix
  listDirectoriesInDirectory(userId, dirPath, chatId = 1) {
    return new Promise((resolve, reject) => {
      // Ensure dirPath ends with a slash for proper matching
      if (dirPath !== '/' && !dirPath.endsWith('/')) {
        dirPath += '/';
      }
      
      // Find all files with path of at least one level deeper
      db.all(
        `SELECT DISTINCT SUBSTR(containerPath, ?, INSTR(SUBSTR(containerPath, ?), '/')) as dirName
         FROM container_files 
         WHERE userId = ? AND chatId = ? AND containerPath LIKE ? AND containerPath LIKE ?`,
        [dirPath.length, dirPath.length, userId, chatId, dirPath + '%', dirPath + '%/%'],
        (err, directories) => {
          if (err) {
            reject(err);
          } else {
            // Extract directory names
            const dirNames = directories
              .map(dir => dir.dirName.replace('/', ''))
              .filter(Boolean); // Remove empty strings
            
            // Return unique directory names
            resolve([...new Set(dirNames)]);
          }
        }
      );
    });
  },

  // Delete tracked files and their content
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
  
  try {
    return JSON.parse(str);
  } catch (e) {
    return str;
  }
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

module.exports = {
  db,
  userFunctions,
  memoryFunctions,
  chatFunctions,
  fileFunctions,
  settingsFunctions
}; 