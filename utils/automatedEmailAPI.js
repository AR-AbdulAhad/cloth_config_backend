// Automated Email API Service
// This file provides API functions for the automated email system

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// Helper function for API calls
const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'API call failed');
    }

    return data;
};

// Email Template APIs
export const getEmailTemplates = async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiCall(`/templates/list?${queryString}`);
};

export const createEmailTemplate = async (templateData) => {
    return apiCall('/templates/create', {
        method: 'POST',
        body: templateData
    });
};

export const updateEmailTemplate = async (id, templateData) => {
    return apiCall(`/templates/${id}/update`, {
        method: 'PUT',
        body: templateData
    });
};

export const deleteEmailTemplate = async (id) => {
    return apiCall(`/templates/${id}/delete`, {
        method: 'DELETE'
    });
};

export const getEmailTemplate = async (id) => {
    return apiCall(`/templates/${id}`);
};

// Automation APIs
export const getAutomationTemplates = async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiCall(`/templates/automation/list?${queryString}`);
};

export const updateEmailAutomation = async (id, automationData) => {
    return apiCall(`/templates/${id}/automation`, {
        method: 'PUT',
        body: automationData
    });
};

export const toggleEmailTemplateStatus = async (id, statusData) => {
    return apiCall(`/templates/${id}/toggle-status`, {
        method: 'PATCH',
        body: statusData
    });
};

export const sendTestEmail = async (id, testData) => {
    return apiCall(`/templates/${id}/test-send`, {
        method: 'POST',
        body: testData
    });
};

export const getTemplateCategories = async () => {
    return apiCall('/templates/categories/stats');
};

// Campaign APIs (extend existing)
export const sendCampaignToUser = async (campaignId, userData) => {
    return apiCall(`/campaigns/${campaignId}/send-to-user`, {
        method: 'POST',
        body: userData
    });
};

// Mock data for development (remove in production)
export const getMockTemplateLibrary = () => {
    return {
        success: true,
        data: {
            templates: [
                {
                    id: 'modern_clean',
                    name: 'Modern Clean',
                    description: 'Clean, minimalist design with modern typography',
                    category: 'all',
                    preview: '/api/templates/previews/modern_clean.png',
                    colors: ['#2563eb', '#1f2937', '#f8fafc'],
                    features: ['Mobile Responsive', 'Dark Mode Support', 'Clean Typography'],
                    design: {
                        body: {
                            backgroundColor: '#f8fafc',
                            fontFamily: 'Arial, sans-serif'
                        }
                    }
                },
                {
                    id: 'studentlife_branded',
                    name: 'StudentLife Branded',
                    description: 'Official StudentLife brand colors and styling',
                    category: 'all',
                    preview: '/api/templates/previews/studentlife_branded.png',
                    colors: ['#1890ff', '#52c41a', '#ffffff'],
                    features: ['Brand Colors', 'Logo Integration', 'Professional'],
                    design: {
                        body: {
                            backgroundColor: '#ffffff',
                            fontFamily: 'Arial, sans-serif'
                        }
                    }
                }
            ]
        }
    };
};

// Email variables for different contexts
export const getEmailVariables = () => {
    return {
        user: [
            { key: '{{name}}', label: 'User Name', description: 'Full name of the user' },
            { key: '{{first_name}}', label: 'First Name', description: 'User\'s first name' },
            { key: '{{email}}', label: 'Email Address', description: 'User\'s email address' },
            { key: '{{school}}', label: 'School Name', description: 'Name of the school' },
            { key: '{{class}}', label: 'Class Name', description: 'Name of the class' },
            { key: '{{role}}', label: 'User Role', description: 'User\'s role (student, class_rep, admin)' }
        ],
        order: [
            { key: '{{order_id}}', label: 'Order ID', description: 'Unique order identifier' },
            { key: '{{order_date}}', label: 'Order Date', description: 'Date when order was placed' },
            { key: '{{deadline}}', label: 'Change Deadline', description: 'Last date for changes' },
            { key: '{{status}}', label: 'Order Status', description: 'Current order status' },
            { key: '{{tracking}}', label: 'Tracking Code', description: 'Shipment tracking number' },
            { key: '{{total_amount}}', label: 'Total Amount', description: 'Order total amount' },
            { key: '{{items_count}}', label: 'Items Count', description: 'Number of items in order' }
        ],
        system: [
            { key: '{{current_date}}', label: 'Current Date', description: 'Today\'s date' },
            { key: '{{company_name}}', label: 'Company Name', description: 'StudentLife' },
            { key: '{{website}}', label: 'Website URL', description: 'studentlife.dk' },
            { key: '{{support_email}}', label: 'Support Email', description: 'Support contact email' },
            { key: '{{login_url}}', label: 'Login URL', description: 'Link to login page' },
            { key: '{{unsubscribe_url}}', label: 'Unsubscribe URL', description: 'Unsubscribe link' }
        ]
    };
};

// Trigger events configuration
export const getTriggerEvents = () => {
    return {
        user_registration: {
            label: 'User Registration',
            description: 'When a new user registers on the platform',
            variables: ['{{name}}', '{{email}}', '{{role}}', '{{school}}']
        },
        order_placed: {
            label: 'Order Placed',
            description: 'When a user places a new order',
            variables: ['{{name}}', '{{order_id}}', '{{order_date}}', '{{total_amount}}']
        },
        payment_received: {
            label: 'Payment Received',
            description: 'When payment is confirmed for an order',
            variables: ['{{name}}', '{{order_id}}', '{{payment_amount}}', '{{payment_date}}']
        },
        order_status_changed: {
            label: 'Order Status Changed',
            description: 'When order status is updated',
            variables: ['{{name}}', '{{order_id}}', '{{old_status}}', '{{new_status}}']
        },
        deadline_approaching: {
            label: 'Deadline Approaching',
            description: 'When change deadline is near (configurable days)',
            variables: ['{{name}}', '{{order_id}}', '{{deadline}}', '{{days_remaining}}']
        },
        file_uploaded: {
            label: 'File Uploaded',
            description: 'When user uploads a file',
            variables: ['{{name}}', '{{file_name}}', '{{upload_date}}', '{{file_type}}']
        },
        admin_action_required: {
            label: 'Admin Action Required',
            description: 'When admin intervention is needed',
            variables: ['{{admin_name}}', '{{action_type}}', '{{description}}', '{{priority}}']
        },
        scheduled_send: {
            label: 'Scheduled Send',
            description: 'Send at specific date/time intervals',
            variables: ['{{current_date}}', '{{recipient_name}}']
        }
    };
};