const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

let transporter = null;

// Initialize email transporter if SMTP settings are provided
function initializeEmailService() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  
  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    try {
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: parseInt(SMTP_PORT) === 465, // true for 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });
      
      console.log('Email service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      return false;
    }
  } else {
    console.log('SMTP configuration not found - email verification disabled');
    return false;
  }
}

/**
 * Check if email service is available
 * @returns {boolean} Whether email service is configured and available
 */
function isEmailServiceAvailable() {
  return transporter !== null;
}

/**
 * Send email verification code
 * @param {string} email - Recipient email address
 * @param {string} code - Verification code
 * @returns {Promise<boolean>} Whether email was sent successfully
 */
async function sendVerificationEmail(email, code) {
  if (!transporter) {
    console.log('Email service not available - skipping email send');
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Verify your email address - Operon.one',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Verify your email address</h2>
          <p>Thank you for registering with Operon.one! To complete your registration, please use the verification code below:</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="color: #007bff; margin: 0; font-size: 32px; letter-spacing: 5px;">${code}</h1>
          </div>
          
          <p>This code will expire in 15 minutes. If you didn't request this verification, please ignore this email.</p>
          
          <p style="color: #666; font-size: 14px;">
            Best regards,<br>
            The Operon.one Team
          </p>
        </div>
      `,
      text: `
        Verify your email address

        Thank you for registering with Operon.one! To complete your registration, please use the verification code below:

        ${code}

        This code will expire in 15 minutes. If you didn't request this verification, please ignore this email.

        Best regards,
        The Operon.one Team
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Verification email sent to:', email);
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}

/**
 * Send welcome email
 * @param {string} email - Recipient email address
 * @returns {Promise<boolean>} Whether email was sent successfully
 */
async function sendWelcomeEmail(email) {
  if (!transporter) {
    console.log('Email service not available - skipping welcome email send');
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Welcome to Operon.one!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Operon.one!</h2>
          
          <p>Thank you for joining Operon.one, the AI agent that doesn't just think—it acts, adapts, and accelerates across every platform you use! We're excited to have you on board.</p>
          
          <p>With Operon.one, you can:</p>
          <ul>
            <li>Research & Analyze</li>
            <li>Streamline your workflow</li>
            <li>Connect with advanced capabilities (such as MCP servers)</li>
            <li>Automate your tasks</li>
            <li>And more!</li>
          </ul>
          
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; text-align: center;">
            </p>
          </div>
          

          <p style="color: #666; font-size: 14px;">
            Best regards,<br>
            The Operon.one Team
          </p>
        </div>
      `,
      text: `
        Welcome to Operon.one!

        Thank you for joining Operon.one! We're excited to have you on board.

        With Operon.one, you can:
        - Research & Analyze
        - Streamline your workflow
        - Connect with advanced capabilities (such as MCP servers)
        - Automate your tasks
        - And more!

        Best regards,
        The Operon.one Team
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent to:', email);
    return true;
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return false;
  }
}

/**
 * Send password reset email
 * @param {string} email - Recipient email address
 * @param {string} code - Reset code
 * @returns {Promise<boolean>} Whether email was sent successfully
 */
async function sendPasswordResetEmail(email, code) {
  if (!transporter) {
    console.log('Email service not available - skipping password reset email send');
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Password Reset Request - Operon.one',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You recently requested to reset your password for your Operon.one account. Please use the code below to complete the process:</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="color: #007bff; margin: 0; font-size: 32px; letter-spacing: 5px;">${code}</h1>
          </div>
          
          <p>This code will expire in 15 minutes. If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          
          <p style="color: #666; font-size: 14px;">
            Best regards,<br>
            The Operon.one Team
          </p>
        </div>
      `,
      text: `
        Password Reset Request

        You recently requested to reset your password for your Operon.one account. Please use the code below to complete the process:

        ${code}

        This code will expire in 15 minutes. If you didn't request a password reset, please ignore this email or contact support if you have concerns.

        Best regards,
        The Operon.one Team
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

/**
 * Generate a verification code
 * @param {boolean} useAlphanumeric - Whether to use alphanumeric characters (default: false, only numbers)
 * @returns {string} Verification code
 */
function generateVerificationCode(useAlphanumeric = false) {
  if (useAlphanumeric) {
    // Generate a 6-character alphanumeric code (excluding similar-looking characters)
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    
    // Generate secure random bytes
    const randomBytes = crypto.randomBytes(6);
    
    // Convert each byte to a character in our set
    for (let i = 0; i < 6; i++) {
      // Use modulo to map the random byte (0-255) to an index in our character set
      const index = randomBytes[i] % characters.length;
      code += characters.charAt(index);
    }
    
    return code;
  } else {
    // Generate a 6-digit numeric code with secure randomness
    const min = 100000; // Smallest 6-digit number
    const max = 999999; // Largest 6-digit number
    
    // Generate a secure random number between min and max (inclusive)
    // Generate 4 random bytes (enough for a number up to 4,294,967,295)
    const randomBytes = crypto.randomBytes(4);
    // Convert to a 32-bit unsigned integer
    const randomValue = randomBytes.readUInt32BE(0);
    // Map to our desired range
    const range = max - min + 1;
    // randomValue % range will give a number between 0 and range-1
    const randomNumber = min + (randomValue % range);
    
    return randomNumber.toString();
  }
}

// Initialize the service on module load
const isInitialized = initializeEmailService();

module.exports = {
  isEmailServiceAvailable,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  generateVerificationCode,
  isInitialized
}; 