import path from 'path';

// Public host that serves /uploads — relative file paths stored in the DB
// (e.g. "uploads/school_logo/xyz.png") get this prepended so reports contain
// a URL the printer can open directly instead of a bare path.
export const ASSET_BASE_URL = 'https://clothapi.studentlife.dk/';

export const toFullUrl = (relativePath) => {
    if (!relativePath) return null;
    if (/^https?:\/\//i.test(relativePath)) return relativePath;
    return ASSET_BASE_URL + relativePath.replace(/^\/+/, '');
};

export const buildDesignText = (config = {}) => {
    const designLines = [];
    const labelMap = {
        rightChestText: 'Right Chest Text', leftChestText: 'Left Chest Text',
        rightSleeveText: 'Right Sleeve Text', leftSleeveText: 'Left Sleeve Text',
        rightChestFlag: 'Right Chest Flag', leftChestFlag: 'Left Chest Flag',
    };
    Object.entries(labelMap).forEach(([key, label]) => {
        if (config[key]) designLines.push(`${label}: ${config[key]}`);
    });
    if (config.backDesign?.src) {
        designLines.push(`Back Design: ${toFullUrl(config.backDesign.src)}`);
    }
    return designLines.length > 0 ? designLines.join('  |  ') : 'No custom design config';
};

export const formatAddress = (delivery) => {
    if (!delivery) return null;
    const name = [delivery.firstName, delivery.lastName].filter(Boolean).join(' ');
    const line2 = delivery.address || '';
    const line3 = [delivery.postalCode, delivery.city].filter(Boolean).join(' ');
    const line4 = delivery.country || '';
    return [name, line2, line3, line4].filter(Boolean).join(', ');
};
