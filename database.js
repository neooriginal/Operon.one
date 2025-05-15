const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');


const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}


const DB_PATH = path.join(DATA_DIR, 'operonone.db');


const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database');
    initDatabase();
  }
});


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
}


const userFunctions = {
  
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


const memoryFunctions = {
  
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


const chatFunctions = {
  
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

  
  deleteChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      
      db.run('DELETE FROM chat_history WHERE userId = ? AND chatId = ?', 
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
    });
  }
};


const fileFunctions = {
  
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


const settingsFunctions = {
  
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
  getDb  
}; 