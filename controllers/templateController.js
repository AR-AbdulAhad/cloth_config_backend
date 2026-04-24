import prisma from "../config/prisma.js";
import { sendEmail } from "../utils/emailService.js";

export const createTemplate = async (req, res) => {
    try {
        const { name, subject, html_body, category, is_default, 
                // NEW: Automation fields
                is_automated, automation_type, trigger_events, target_audience, delay_hours, design } = req.body;
        
        if (!name || !subject || !html_body || !category)
            return res.status(400).json({ success: false, message: "Missing required fields" });

        const template = await prisma.emailTemplate.create({
            data: { 
                name, subject, html_body, category, is_default: is_default || false,
                // NEW: Automation fields
                is_automated: is_automated || false,
                automation_type: automation_type || null,
                trigger_events: trigger_events || null,
                target_audience: target_audience || null,
                delay_hours: delay_hours || 0,
                design: design || null
            }
        });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listTemplates = async (req, res) => {
    try {
        const { category, automation_type, is_automated } = req.query;
        const where = { 
            status: { not: 2 }, 
            ...(category && { category }),
            ...(automation_type && { automation_type }),
            ...(is_automated !== undefined && { is_automated: is_automated === 'true' })
        };
        const templates = await prisma.emailTemplate.findMany({ 
            where, 
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                name: true,
                subject: true,
                html_body: true,
                design: true,
                category: true,
                automation_type: true,
                is_automated: true,
                trigger_events: true,
                target_audience: true,
                delay_hours: true,
                status: true,
                created_at: true,
                updated_at: true
            }
        });
        
        // Add mock stats for frontend (replace with real analytics later)
        const templatesWithStats = templates.map(template => ({
            ...template,
            lastModified: template.updated_at?.toISOString().split('T')[0] || template.created_at.toISOString().split('T')[0],
            automation: {
                enabled: template.is_automated,
                trigger: template.automation_type,
                conditions: template.trigger_events ? JSON.parse(template.trigger_events) : []
            },
            stats: {
                sent: Math.floor(Math.random() * 500),
                opened: Math.floor(Math.random() * 400),
                clicked: Math.floor(Math.random() * 200)
            }
        }));
        
        res.json({ success: true, data: { templates: templatesWithStats } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getTemplate = async (req, res) => {
    try {
        const template = await prisma.emailTemplate.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!template || template.status === 2)
            return res.status(404).json({ success: false, message: "Template not found" });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateTemplate = async (req, res) => {
    try {
        const { name, subject, html_body, category, is_default,
                // NEW: Automation fields  
                is_automated, automation_type, trigger_events, target_audience, delay_hours, design } = req.body;
        
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (subject !== undefined) updateData.subject = subject;
        if (html_body !== undefined) updateData.html_body = html_body;
        if (category !== undefined) updateData.category = category;
        if (is_default !== undefined) updateData.is_default = is_default;
        if (is_automated !== undefined) updateData.is_automated = is_automated;
        if (automation_type !== undefined) updateData.automation_type = automation_type;
        if (trigger_events !== undefined) updateData.trigger_events = trigger_events;
        if (target_audience !== undefined) updateData.target_audience = target_audience;
        if (delay_hours !== undefined) updateData.delay_hours = delay_hours;
        if (design !== undefined) updateData.design = design;
        
        const template = await prisma.emailTemplate.update({
            where: { id: parseInt(req.params.id) },
            data: updateData
        });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteTemplate = async (req, res) => {
    try {
        await prisma.emailTemplate.update({
            where: { id: parseInt(req.params.id) },
            data: { status: 2 }
        });
        res.json({ success: true, message: "Template deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// NEW: Get automation-enabled templates
export const getAutomationTemplates = async (req, res) => {
    try {
        const { category, automation_type } = req.query;
        const where = { 
            status: { not: 2 }, 
            is_automated: true,
            ...(category && { category }),
            ...(automation_type && { automation_type })
        };
        const templates = await prisma.emailTemplate.findMany({ 
            where, 
            orderBy: { created_at: 'desc' } 
        });
        res.json({ success: true, data: templates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// NEW: Update automation settings for template
export const updateAutomationSettings = async (req, res) => {
    try {
        const { 
            enabled, trigger, delay_amount, delay_unit, send_time, 
            frequency_limit, frequency_amount, frequency_period,
            target_roles, respect_unsubscribe, respect_consent, conditions 
        } = req.body;

        const automationConfig = {
            enabled,
            trigger,
            delay: { amount: delay_amount, unit: delay_unit },
            send_time,
            frequency_limit,
            frequency_amount,
            frequency_period,
            target_roles,
            respect_unsubscribe,
            respect_consent,
            conditions
        };

        const template = await prisma.emailTemplate.update({
            where: { id: parseInt(req.params.id) },
            data: { 
                is_automated: enabled,
                automation_type: trigger,
                trigger_events: JSON.stringify(conditions || []),
                target_audience: JSON.stringify(target_roles || []),
                delay_hours: delay_unit === 'hours' ? delay_amount : 
                           delay_unit === 'days' ? delay_amount * 24 :
                           delay_unit === 'weeks' ? delay_amount * 24 * 7 : delay_amount / 60
            }
        });

        res.json({ success: true, message: "Automation settings updated", data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// NEW: Toggle template status (active/inactive)
export const toggleTemplateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const template = await prisma.emailTemplate.update({
            where: { id: parseInt(req.params.id) },
            data: { status: status === 'active' ? 0 : 1 }
        });
        res.json({ success: true, message: `Template ${status}`, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// NEW: Send test email
export const sendTestEmail = async (req, res) => {
    try {
        const { email, sample_data } = req.body;
        const template = await prisma.emailTemplate.findUnique({ 
            where: { id: parseInt(req.params.id) } 
        });

        if (!template) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }

        // Replace variables with sample data
        let personalizedHtml = template.html_body;
        let personalizedSubject = template.subject;

        const sampleData = sample_data || {
            name: 'John Doe',
            email: 'john.doe@example.com',
            school: 'Test School',
            class: '12A',
            order_id: 'TEST-001',
            current_date: new Date().toLocaleDateString()
        };

        Object.entries(sampleData).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            personalizedHtml = personalizedHtml.replace(regex, value);
            personalizedSubject = personalizedSubject.replace(regex, value);
        });

        await sendEmail(email, `[TEST] ${personalizedSubject}`, personalizedHtml);

        res.json({ success: true, message: `Test email sent to ${email}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// NEW: Get template categories with counts
export const getTemplateCategories = async (req, res) => {
    try {
        const categories = await prisma.emailTemplate.groupBy({
            by: ['category'],
            where: { status: { not: 2 } },
            _count: { category: true }
        });

        const categoryData = {
            welcome: { count: 0, templates: [] },
            guidance: { count: 0, templates: [] },
            transactional: { count: 0, templates: [] },
            reminder: { count: 0, templates: [] },
            notification: { count: 0, templates: [] }
        };

        categories.forEach(cat => {
            if (categoryData[cat.category]) {
                categoryData[cat.category].count = cat._count.category;
            }
        });

        res.json({ success: true, data: categoryData });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
