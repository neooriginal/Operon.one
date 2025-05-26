/**
 * AI Avatar Controller Class
 * A minimalistic avatar with idle and talking animations
 * Easy to integrate into any project
 */
class AIAvatar {
    constructor(elementId) {
        this.element = document.getElementById(elementId);
        this.currentState = 'idle';
        this.talkingInterval = null;
        this.eyeTrackingEnabled = true;
        this.leftEye = null;
        this.rightEye = null;
        
        if (!this.element) {
            console.error('Avatar element not found with ID:', elementId);
            return;
        }
        
        // Get eye elements
        this.leftEye = this.element.querySelector('.left-eye');
        this.rightEye = this.element.querySelector('.right-eye');
        
        // Initialize avatar in idle state
        this.setIdle();
        
        // Setup eye tracking
        this.setupEyeTracking();
    }
    
    /**
     * Set avatar to idle state with gentle floating animation
     */
    setIdle() {
        this.clearAnimations();
        this.currentState = 'idle';
        this.element.classList.add('idle');
        this.eyeTrackingEnabled = true;
    }
    
    /**
     * Start talking animation with mouth movement and blinking
     */
    startTalking() {
        this.clearAnimations();
        this.currentState = 'talking';
        this.element.classList.add('talking');
        this.eyeTrackingEnabled = false;
        this.resetEyePosition();
    }
    
    /**
     * Stop talking and return to idle state
     */
    stopTalking() {
        this.setIdle();
    }
    
    /**
     * Clear all animation classes
     */
    clearAnimations() {
        this.element.classList.remove('idle', 'talking');
        if (this.talkingInterval) {
            clearInterval(this.talkingInterval);
            this.talkingInterval = null;
        }
    }
    
    /**
     * Get current avatar state
     * @returns {string} Current state ('idle' or 'talking')
     */
    getState() {
        return this.currentState;
    }
    
    /**
     * Check if avatar is talking
     * @returns {boolean} True if avatar is in talking state
     */
    isTalking() {
        return this.currentState === 'talking';
    }
    
    /**
     * Check if avatar is idle
     * @returns {boolean} True if avatar is in idle state
     */
    isIdle() {
        return this.currentState === 'idle';
    }
    
    /**
     * Setup eye tracking to follow mouse cursor
     */
    setupEyeTracking() {
        document.addEventListener('mousemove', (e) => {
            if (!this.eyeTrackingEnabled || !this.leftEye || !this.rightEye) return;
            
            const avatarRect = this.element.getBoundingClientRect();
            const avatarCenterX = avatarRect.left + avatarRect.width / 2;
            const avatarCenterY = avatarRect.top + avatarRect.height / 2;
            
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            // Calculate angle from avatar center to mouse
            const deltaX = mouseX - avatarCenterX;
            const deltaY = mouseY - avatarCenterY;
            
            // Limit eye movement range
            const maxMovement = 4;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const limitedX = distance > 0 ? (deltaX / distance) * Math.min(distance / 100, maxMovement) : 0;
            const limitedY = distance > 0 ? (deltaY / distance) * Math.min(distance / 100, maxMovement) : 0;
            
            // Apply eye movement
            this.moveEyes(limitedX, limitedY);
        });
    }
    
    /**
     * Move eye pupils to follow cursor
     */
    moveEyes(x, y) {
        if (this.leftEye && this.rightEye) {
            const leftPupil = this.leftEye.querySelector('::after') || this.leftEye;
            const rightPupil = this.rightEye.querySelector('::after') || this.rightEye;
            
            // Move pupils using CSS custom properties
            this.leftEye.style.setProperty('--pupil-x', `${x}px`);
            this.leftEye.style.setProperty('--pupil-y', `${y}px`);
            this.rightEye.style.setProperty('--pupil-x', `${x}px`);
            this.rightEye.style.setProperty('--pupil-y', `${y}px`);
            
            // Apply transform to the pseudo-elements
            this.leftEye.style.setProperty('transform', `translateY(-50%)`);
            this.rightEye.style.setProperty('transform', `translateY(-50%)`);
        }
    }
    
    /**
     * Reset eye position to center
     */
    resetEyePosition() {
        if (this.leftEye && this.rightEye) {
            this.leftEye.style.removeProperty('--pupil-x');
            this.leftEye.style.removeProperty('--pupil-y');
            this.rightEye.style.removeProperty('--pupil-x');
            this.rightEye.style.removeProperty('--pupil-y');
        }
    }
    
    /**
     * Destroy the avatar instance and clean up
     */
    destroy() {
        this.clearAnimations();
        this.element = null;
    }
    
    /**
     * Static method to create avatar HTML structure
     * Useful for dynamic creation
     * @param {string} containerId - ID of the container element
     * @param {string} avatarId - ID to assign to the avatar
     * @returns {string} HTML string for the avatar
     */
    static createAvatarHTML(avatarId = 'aiAvatar') {
        return `
            <div id="${avatarId}" class="ai-avatar">
                <!-- Head -->
                <div class="avatar-head">
                    <!-- Eyes -->
                    <div class="eye left-eye"></div>
                    <div class="eye right-eye"></div>
                    <!-- Mouth -->
                    <div class="mouth"></div>
                    <!-- Side connector -->
                    <div class="connector"></div>
                </div>
                <!-- Body -->
                <div class="avatar-body">
                </div>
            </div>
        `;
    }
    
    /**
     * Static method to inject avatar into a container
     * @param {string} containerId - ID of the container element
     * @param {string} avatarId - ID to assign to the avatar
     * @returns {AIAvatar} New avatar instance
     */
    static injectAvatar(containerId, avatarId = 'aiAvatar') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container element not found with ID:', containerId);
            return null;
        }
        
        container.innerHTML = AIAvatar.createAvatarHTML(avatarId);
        return new AIAvatar(avatarId);
    }
}

// Export for use in Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIAvatar;
} 