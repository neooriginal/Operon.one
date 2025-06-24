const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const os = require('os');
const execAsync = util.promisify(exec);
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../utils/config');


const isWindows = process.platform === 'win32';
const dockerCMD = isWindows ? "wsl docker" : "docker";


function normalizePathForDocker(filePath) {
    
    let normalizedPath = filePath.replace(/\\/g, '/');
    
    
    normalizedPath = normalizedPath.replace(/"/g, '');
    
    return normalizedPath;
}

class DockerManager {
    constructor() {
        this.baseImage = config.docker.baseImage;
        this.containerPrefix = config.docker.containerPrefix;
        this.activeContainers = new Map(); 
        this.maxRetries = config.docker.maxRetries; 
        this.initialized = false;
    }

    
    _generateContainerName(taskId) {
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(4).toString('hex');
        return `${this.containerPrefix}${taskId}-${timestamp}-${randomString}`;
    }

    
    _getTempFilePath() {
        const tempDir = isWindows ? process.env.TEMP || 'C:\\Windows\\Temp' : os.tmpdir();
        const fileName = `temp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        return path.join(tempDir, fileName);
    }

    
    async _retry(operation, maxRetries = this.maxRetries) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                logger.warn('Docker operation failed', { attempt, maxRetries, error: error.message });
                
                
                if (error.message.includes('Conflict') && error.message.includes('already in use')) {
                    logger.debug('Container name conflict detected, retrying with different name');
                    continue;
                }
                
                
                if (attempt < maxRetries) {
                    const delay = Math.min(100 * Math.pow(2, attempt), 2000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError || new Error('Operation failed after multiple retries');
    }

    
    async checkDockerAvailability() {
        try {
            
            if (isWindows) {
                try {
                    await execAsync('wsl --status');
                } catch (error) {
                    logger.error('WSL is not available', { error: error.message });
                    return false;
                }
            }
            
            await execAsync(`${dockerCMD} ps`);
            return true;
        } catch (error) {
            logger.error('Docker is not available', { error: error.message });
            return false;
        }
    }

    
    async initialize() {
        if (this.initialized) {
            return true;
        }
        
        try {
            const isDockerAvailable = await this.checkDockerAvailability();
            if (!isDockerAvailable) {
                throw new Error('Docker is not available or not running');
            }
            
            
            const { stdout } = await execAsync(`${dockerCMD} images -q ${this.baseImage}`);
            if (!stdout.trim()) {
                logger.info('Pulling Docker image', { image: this.baseImage });
                await execAsync(`${dockerCMD} pull ${this.baseImage}`);
            }
            
            this.initialized = true;
            return true;
        } catch (error) {
            logger.error('Failed to initialize Docker', { error: error.message });
            throw error;
        }
    }

    async createContainer(taskId) {
        
        if (!this.initialized) {
            await this.initialize();
        }
        
        
        if (this.activeContainers.has(taskId)) {
            try {
                
                const containerName = this.activeContainers.get(taskId);
                await execAsync(`${dockerCMD} inspect ${containerName} --format='{{.State.Running}}'`);
                return containerName;
            } catch (error) {
                
                this.activeContainers.delete(taskId);
            }
        }
        
        return await this._retry(async () => {
            
            const containerName = this._generateContainerName(taskId);
            
            
            await execAsync(`${dockerCMD} run -d --name ${containerName} ${this.baseImage} sleep infinity`);
            
            
            this.activeContainers.set(taskId, containerName);
            
            return containerName;
        });
    }

    async removeContainer(containerName) {
        try {
            await execAsync(`${dockerCMD} rm -f ${containerName}`);
            
            
            for (const [taskId, name] of this.activeContainers.entries()) {
                if (name === containerName) {
                    this.activeContainers.delete(taskId);
                    break;
                }
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to remove container', { error: error.message, containerName });
            return false;
        }
    }

    async executeCommand(containerName, command) {
        return await this._retry(async () => {
            
            const encodedCommand = Buffer.from(command).toString('base64');
            
            
            
            const commandToExecuteInsideShell = `echo '${encodedCommand}' | base64 -d | sh`;

            
            
            const escapedInnerCommand = commandToExecuteInsideShell.replace(/\"/g, '\\\\"');

            
            const fullCommand = `${dockerCMD} exec ${containerName} sh -c "${escapedInnerCommand}"`;
            logger.debug('Executing Docker command', { containerName, command: command.substring(0, 100) + '...' }); 
            
            
            const { stdout, stderr } = await execAsync(fullCommand);
            return { stdout, stderr };
        });
    }

    async writeFile(containerName, filePath, content) {
        return await this._retry(async () => {
            
            const normalizedPath = normalizePathForDocker(filePath);
            
            
            const dirPath = path.dirname(normalizedPath);
            await execAsync(`${dockerCMD} exec ${containerName} mkdir -p ${dirPath}`);
            
            
            const tempFile = this._getTempFilePath();
            fs.writeFileSync(tempFile, content);
            
            try {
                
                const sourcePath = isWindows ? 
                    tempFile.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/mnt/$1').toLowerCase() : 
                    tempFile;
                
                
                const copyCmd = isWindows ? 
                    `wsl docker cp "${sourcePath}" ${containerName}:${normalizedPath}` : 
                    `${dockerCMD} cp "${tempFile}" ${containerName}:${normalizedPath}`;
                
                await execAsync(copyCmd);
                return true;
            } finally {
                
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    logger.warn('Failed to clean up temp file', { error: e.message, tempFile });
                }
            }
        });
    }

    async readFile(containerName, filePath) {
        return await this._retry(async () => {
            
            const normalizedPath = normalizePathForDocker(filePath);
            
            
            const tempFile = this._getTempFilePath();
            
            try {
                
                const destPath = isWindows ? 
                    tempFile.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/mnt/$1').toLowerCase() : 
                    tempFile;
                
                
                const copyCmd = isWindows ? 
                    `wsl docker cp ${containerName}:${normalizedPath} "${destPath}"` : 
                    `${dockerCMD} cp ${containerName}:${normalizedPath} "${tempFile}"`;
                
                await execAsync(copyCmd);
                
                
                return fs.readFileSync(tempFile, 'utf8');
            } finally {
                
                try {
                    fs.existsSync(tempFile) && fs.unlinkSync(tempFile);
                } catch (e) {
                    logger.warn('Failed to clean up temp file', { error: e.message, tempFile });
                }
            }
        });
    }

    async executePython(containerName, scriptPath, args = []) {
        return await this._retry(async () => {
            
            const normalizedPath = normalizePathForDocker(scriptPath);
            
            
            const argStr = args.map(arg => arg.toString()).join(' ');
            
            
            const command = `python ${normalizedPath} ${argStr}`;
            
            return await this.executeCommand(containerName, command);
        });
    }

    async downloadFile(containerName, containerPath, localPath) {
        return await this._retry(async () => {
            
            const normalizedContainerPath = normalizePathForDocker(containerPath);
            
            
            const targetDir = path.dirname(localPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            
            const destPath = isWindows ? 
                localPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/mnt/$1').toLowerCase() : 
                localPath;
            
            
            const copyCmd = isWindows ? 
                `wsl docker cp ${containerName}:${normalizedContainerPath} "${destPath}"` : 
                `${dockerCMD} cp ${containerName}:${normalizedContainerPath} "${localPath}"`;
            
            await execAsync(copyCmd);
            return { success: true, path: localPath };
        });
    }

    
    async cleanupAllContainers() {
        const errors = [];
        
        for (const [taskId, containerName] of this.activeContainers.entries()) {
            try {
                await this.removeContainer(containerName);
                logger.debug('Cleaned up container for task', { taskId, containerName });
            } catch (error) {
                errors.push(`Failed to clean up container ${containerName}: ${error.message}`);
            }
        }
        
        this.activeContainers.clear();
        
        if (errors.length > 0) {
            logger.error('Errors during cleanup', { errors });
            return false;
        }
        
        return true;
    }
}

const dockerManager = new DockerManager();


(async () => {
    try {
        await dockerManager.initialize();
        logger.info('Docker initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize Docker', { error: error.message });
    }
})();

module.exports = dockerManager; 