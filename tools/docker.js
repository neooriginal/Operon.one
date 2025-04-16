const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const os = require('os');
const execAsync = util.promisify(exec);
const crypto = require('crypto');

// Use wsl docker command on Windows, regular docker command otherwise
const isWindows = process.platform === 'win32';
const dockerCMD = isWindows ? "wsl docker" : "docker";

// Convert Windows paths to WSL paths if needed
function normalizePathForDocker(filePath) {
    // Ensure forward slashes for Docker paths (important for Windows)
    let normalizedPath = filePath.replace(/\\/g, '/');
    
    // Remove any double quotes that might cause issues
    normalizedPath = normalizedPath.replace(/"/g, '');
    
    return normalizedPath;
}

class DockerManager {
    constructor() {
        this.baseImage = 'python:3.9-slim';
        this.containerPrefix = 'operon-task-';
        this.activeContainers = new Map(); // Track currently active containers
        this.maxRetries = 3; // Maximum number of retries for Docker operations
        this.initialized = false;
    }

    // Generate a unique container name to avoid conflicts
    _generateContainerName(taskId) {
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(4).toString('hex');
        return `${this.containerPrefix}${taskId}-${timestamp}-${randomString}`;
    }

    // Get temp directory that works across platforms
    _getTempFilePath() {
        const tempDir = isWindows ? process.env.TEMP || 'C:\\Windows\\Temp' : os.tmpdir();
        const fileName = `temp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        return path.join(tempDir, fileName);
    }

    // Retry mechanism for Docker operations
    async _retry(operation, maxRetries = this.maxRetries) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`Docker operation failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
                
                // If this is a container conflict, try with a different name
                if (error.message.includes('Conflict') && error.message.includes('already in use')) {
                    console.log('Container name conflict detected, retrying with different name');
                    continue;
                }
                
                // Wait before retrying (exponential backoff)
                if (attempt < maxRetries) {
                    const delay = Math.min(100 * Math.pow(2, attempt), 2000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError || new Error('Operation failed after multiple retries');
    }

    // Check if Docker is running and available
    async checkDockerAvailability() {
        try {
            // For Windows, check if WSL is available first
            if (isWindows) {
                try {
                    await execAsync('wsl --status');
                } catch (error) {
                    console.error('WSL is not available:', error.message);
                    return false;
                }
            }
            
            await execAsync(`${dockerCMD} ps`);
            return true;
        } catch (error) {
            console.error('Docker is not available:', error.message);
            return false;
        }
    }

    // Initialize Docker (pull image if needed)
    async initialize() {
        if (this.initialized) {
            return true;
        }
        
        try {
            const isDockerAvailable = await this.checkDockerAvailability();
            if (!isDockerAvailable) {
                throw new Error('Docker is not available or not running');
            }
            
            // Check if image exists locally, pull if not
            const { stdout } = await execAsync(`${dockerCMD} images -q ${this.baseImage}`);
            if (!stdout.trim()) {
                console.log(`Pulling Docker image: ${this.baseImage}`);
                await execAsync(`${dockerCMD} pull ${this.baseImage}`);
            }
            
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize Docker:', error.message);
            throw error;
        }
    }

    async createContainer(taskId) {
        // Make sure Docker is initialized
        if (!this.initialized) {
            await this.initialize();
        }
        
        // Check if we already have a container for this task
        if (this.activeContainers.has(taskId)) {
            try {
                // Verify the container is still running
                const containerName = this.activeContainers.get(taskId);
                await execAsync(`${dockerCMD} inspect ${containerName} --format='{{.State.Running}}'`);
                return containerName;
            } catch (error) {
                // Container not running or doesn't exist anymore, create a new one
                this.activeContainers.delete(taskId);
            }
        }
        
        return await this._retry(async () => {
            // Generate a unique container name
            const containerName = this._generateContainerName(taskId);
            
            // Create and start the container
            await execAsync(`${dockerCMD} run -d --name ${containerName} ${this.baseImage} sleep infinity`);
            
            // Store the container in our active containers map
            this.activeContainers.set(taskId, containerName);
            
            return containerName;
        });
    }

    async removeContainer(containerName) {
        try {
            await execAsync(`${dockerCMD} rm -f ${containerName}`);
            
            // Remove from active containers map
            for (const [taskId, name] of this.activeContainers.entries()) {
                if (name === containerName) {
                    this.activeContainers.delete(taskId);
                    break;
                }
            }
            
            return true;
        } catch (error) {
            console.error(`Failed to remove container: ${error.message}`);
            return false;
        }
    }

    async executeCommand(containerName, command) {
        return await this._retry(async () => {
            // Escape single quotes and backslashes in the command for 'sh -c'
            const escapedCommand = command.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "'\\\\''");
            const fullCommand = `${dockerCMD} exec ${containerName} sh -c '${escapedCommand}'`;
            console.log(`Executing Docker command: ${fullCommand}`); // Log the command for debugging
            const { stdout, stderr } = await execAsync(fullCommand);
            return { stdout, stderr };
        });
    }

    async writeFile(containerName, filePath, content) {
        return await this._retry(async () => {
            // Normalize the path for Docker (using forward slashes)
            const normalizedPath = normalizePathForDocker(filePath);
            
            // Ensure directory exists in container
            const dirPath = path.dirname(normalizedPath);
            await execAsync(`${dockerCMD} exec ${containerName} mkdir -p ${dirPath}`);
            
            // Create a temporary file
            const tempFile = this._getTempFilePath();
            fs.writeFileSync(tempFile, content);
            
            try {
                // For Windows using WSL, we need to convert the path
                const sourcePath = isWindows ? 
                    tempFile.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/mnt/$1').toLowerCase() : 
                    tempFile;
                
                // Copy the file into the container without quotes in the target path
                const copyCmd = isWindows ? 
                    `wsl docker cp "${sourcePath}" ${containerName}:${normalizedPath}` : 
                    `${dockerCMD} cp "${tempFile}" ${containerName}:${normalizedPath}`;
                
                await execAsync(copyCmd);
                return true;
            } finally {
                // Clean up the temporary file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.warn(`Failed to clean up temp file: ${e.message}`);
                }
            }
        });
    }

    async readFile(containerName, filePath) {
        return await this._retry(async () => {
            // Normalize the path for Docker (using forward slashes)
            const normalizedPath = normalizePathForDocker(filePath);
            
            // Create a temporary file for the output
            const tempFile = this._getTempFilePath();
            
            try {
                // For Windows using WSL, we need to convert the path for destination
                const destPath = isWindows ? 
                    tempFile.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/mnt/$1').toLowerCase() : 
                    tempFile;
                
                // Copy the file from the container without quotes in the source path
                const copyCmd = isWindows ? 
                    `wsl docker cp ${containerName}:${normalizedPath} "${destPath}"` : 
                    `${dockerCMD} cp ${containerName}:${normalizedPath} "${tempFile}"`;
                
                await execAsync(copyCmd);
                
                // Read the content
                return fs.readFileSync(tempFile, 'utf8');
            } finally {
                // Clean up the temporary file
                try {
                    fs.existsSync(tempFile) && fs.unlinkSync(tempFile);
                } catch (e) {
                    console.warn(`Failed to clean up temp file: ${e.message}`);
                }
            }
        });
    }

    async executePython(containerName, scriptPath, args = []) {
        return await this._retry(async () => {
            // Normalize the path for Docker and remove any quotes
            const normalizedPath = normalizePathForDocker(scriptPath);
            
            // Ensure all arguments are properly formatted
            const argStr = args.map(arg => arg.toString()).join(' ');
            
            // Simple command without extra quotes that can cause issues
            const command = `python ${normalizedPath} ${argStr}`;
            
            return await this.executeCommand(containerName, command);
        });
    }

    async downloadFile(containerName, containerPath, localPath) {
        return await this._retry(async () => {
            // Normalize the path for Docker
            const normalizedContainerPath = normalizePathForDocker(containerPath);
            
            // Ensure the target directory exists
            const targetDir = path.dirname(localPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // For Windows using WSL, we need special path handling
            const destPath = isWindows ? 
                localPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/mnt/$1').toLowerCase() : 
                localPath;
            
            // Copy the file from the container to the local system
            const copyCmd = isWindows ? 
                `wsl docker cp ${containerName}:${normalizedContainerPath} "${destPath}"` : 
                `${dockerCMD} cp ${containerName}:${normalizedContainerPath} "${localPath}"`;
            
            await execAsync(copyCmd);
            return { success: true, path: localPath };
        });
    }

    // Clean up all containers created by this manager
    async cleanupAllContainers() {
        const errors = [];
        
        for (const [taskId, containerName] of this.activeContainers.entries()) {
            try {
                await this.removeContainer(containerName);
                console.log(`Cleaned up container for task ${taskId}`);
            } catch (error) {
                errors.push(`Failed to clean up container ${containerName}: ${error.message}`);
            }
        }
        
        this.activeContainers.clear();
        
        if (errors.length > 0) {
            console.error(`Errors during cleanup: ${errors.join(', ')}`);
            return false;
        }
        
        return true;
    }
}

const dockerManager = new DockerManager();

// Initialize Docker when the module is loaded
(async () => {
    try {
        await dockerManager.initialize();
        console.log('Docker initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Docker:', error.message);
    }
})();

module.exports = dockerManager; 