import path from 'path';
import prisma from '../config/prisma.js';
import { getFlagUrl } from './flags.js';

// Public host that serves /uploads — relative file paths stored in the DB
// (e.g. "uploads/school_logo/xyz.png") get this prepended so reports contain
// a URL the printer can open directly instead of a bare path.
export const ASSET_BASE_URL = 'https://clothapi.studentlife.dk/';

export const toFullUrl = (relativePath) => {
    if (!relativePath) return null;
    if (/^https?:\/\//i.test(relativePath)) return relativePath;
    return ASSET_BASE_URL + relativePath.replace(/^\/+/, '');
};

// Superset of every placement zone across all products — a given garment's
// design_config just won't have keys for zones it doesn't support.
export const PLACEMENT_ZONES = [
    'rightChest', 'leftChest', 'bottomChest',
    'rightSleeve', 'leftSleeve',
    'rightLeg', 'leftLeg',
];

const zoneLabel = (zone) => zone.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// Collects every {zone}LogoId referenced across a set of design_config blobs.
export const collectLogoIds = (designConfigs = []) => {
    const ids = new Set();
    designConfigs.forEach(config => {
        if (!config) return;
        PLACEMENT_ZONES.forEach(zone => {
            const id = config[`${zone}LogoId`];
            if (id !== null && id !== undefined && id !== '') ids.add(Number(id));
        });
    });
    return ids;
};

// Batch-resolves logo ids -> full URL, one query per report instead of one per placement.
export const buildLogoUrlMap = async (logoIds) => {
    const ids = [...logoIds].filter(id => Number.isFinite(id));
    if (ids.length === 0) return new Map();
    const logos = await prisma.logo.findMany({
        where: { id: { in: ids } },
        select: { id: true, file_path: true }
    });
    return new Map(logos.map(l => [l.id, toFullUrl(l.file_path)]));
};

// Structured, per-zone breakdown of a garment's design_config. Used by both
// the PDF (to render each zone as its own line with a clickable "View Logo" /
// "View Flag" link) and the Excel export (to render each zone as its own
// line within the cell, instead of one crammed pipe-separated string).
// Each entry is { label, value?, url?, linkLabel? } — `value` is shown as
// plain text (e.g. a flag's country name), `url` + `linkLabel` describe an
// openable asset (logo image, flag image, back design).
export const buildDesignEntries = (config = {}, logoUrlById = new Map()) => {
    const entries = [];

    PLACEMENT_ZONES.forEach(zone => {
        const label = zoneLabel(zone);
        if (config[`${zone}Text`]) {
            entries.push({ label: `${label} Text`, value: config[`${zone}Text`] });
        }
        // A zone can carry up to two flags side-by-side (rightSleeveFlag +
        // rightSleeveFlag2, split 50/50 on the garment) — list both if present.
        const flag1 = config[`${zone}Flag`];
        const flag2 = config[`${zone}Flag2`];
        // The editor already resolves and saves each flag's image URL
        // (e.g. rightChestFlagUrl) alongside the country name — prefer that
        // over re-deriving it from the name, and only fall back to our own
        // lookup for older orders saved before that field existed.
        if (flag1) {
            entries.push({
                label: flag2 ? `${label} Flag 1` : `${label} Flag`,
                value: flag1,
                url: config[`${zone}FlagUrl`] || getFlagUrl(flag1),
                linkLabel: 'View Flag'
            });
        }
        if (flag2) {
            entries.push({
                label: `${label} Flag 2`,
                value: flag2,
                url: config[`${zone}Flag2Url`] || getFlagUrl(flag2),
                linkLabel: 'View Flag'
            });
        }

        const logoId = config[`${zone}LogoId`];
        if (logoId !== null && logoId !== undefined && logoId !== '') {
            const url = logoUrlById.get(Number(logoId)) || config[`${zone}LogoPredefinedUrl`] || null;
            if (url) entries.push({ label: `${label} Logo`, url, linkLabel: 'View Logo' });
        }
    });

    if (config.backDesign?.src) {
        entries.push({ label: 'Back Design', url: toFullUrl(config.backDesign.src), linkLabel: 'View Design' });
    }

    return entries;
};

export const formatAddress = (delivery) => {
    if (!delivery) return null;
    const name = [delivery.firstName, delivery.lastName].filter(Boolean).join(' ');
    const line2 = delivery.address || '';
    const line3 = [delivery.postalCode, delivery.city].filter(Boolean).join(' ');
    const line4 = delivery.country || '';
    return [name, line2, line3, line4].filter(Boolean).join(', ');
};
