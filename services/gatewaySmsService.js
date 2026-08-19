import dotenv from 'dotenv';
dotenv.config();

const GATEWAY_API_URL = process.env.GATEWAY_API_URL || 'https://messaging.gatewayapi.com/mobile/single';
const GATEWAY_API_TOKEN = process.env.GATEWAY_API_TOKEN || 'Token 3ueJ4o9hSgqEDcgLDWEW6p-yOUg6PVh6hplxS7BIVEdmggkPVwCD5Cl2xd5-wdo5';
const DEFAULT_SENDER = process.env.SMS_SENDER_NAME || 'StudentLife';

/**
 * Clean phone number to format expected by GatewayAPI (numeric E.164 without leading plus)
 * e.g., "+4561665751" -> 4561665751, "45 61 66 57 51" -> 4561665751
 */
export const sanitizePhoneNumber = (phone) => {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (!cleaned) return null;
    // Default to Denmark country code 45 if 8 digits
    if (cleaned.length === 8) {
        cleaned = '45' + cleaned;
    }
    return parseInt(cleaned, 10);
};

/**
 * Parse dynamic message content placeholders
 * Replaces {{name}}, {{discountCode}}, {{expiryDate}}, etc.
 */
export const parseMessageTemplate = (content, data = {}) => {
    if (!content) return '';
    let parsed = content;
    parsed = parsed.replace(/\{\{\s*name\s*\}\}/gi, data.name || '');
    parsed = parsed.replace(/\{\{\s*discountCode\s*\}\}/gi, data.discountCode || '');
    parsed = parsed.replace(/\{\{\s*expiryDate\s*\}\}/gi, data.expiryDate || '');
    return parsed;
};

/**
 * Calculate SMS segments length info
 */
export const getSmsLengthInfo = (text) => {
    const charCount = (text || '').length;
    // Standard GSM 7-bit single SMS is 160 chars, multi-part SMS is 153 chars per segment
    let smsCount = 1;
    if (charCount > 160) {
        smsCount = Math.ceil(charCount / 153);
    }
    return { charCount, smsCount };
};

/**
 * Send SMS using GatewayAPI
 * @param {Object} options
 * @param {string|number} options.recipient - Mobile phone number
 * @param {string} options.message - Text message
 * @param {string} [options.sender] - Optional custom sender ID
 */
export const sendGatewaySMS = async ({ recipient, message, sender = DEFAULT_SENDER }) => {
    const formattedRecipient = sanitizePhoneNumber(recipient);
    if (!formattedRecipient) {
        throw new Error(`Invalid recipient phone number: ${recipient}`);
    }

    const payload = {
        sender: sender || DEFAULT_SENDER,
        message: message,
        recipient: formattedRecipient
    };

    const headers = {
        'Authorization': GATEWAY_API_TOKEN,
        'Content-Type': 'application/json'
    };

    try {
        const response = await fetch(GATEWAY_API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data?.message || `GatewayAPI returned status ${response.status}`);
        }

        return {
            success: true,
            recipient: formattedRecipient,
            response: data
        };
    } catch (error) {
        console.error('[SMS GatewayAPI Error]:', error.message || error);
        return {
            success: false,
            recipient: formattedRecipient,
            error: error.message || 'Unknown SMS dispatch failure'
        };
    }
};
