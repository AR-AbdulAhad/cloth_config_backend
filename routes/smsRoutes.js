import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    getCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    publicOptIn,
    getPublicCampaignBySlug,
    getDispatchLogs,
    triggerScheduler
} from '../controllers/smsCampaignController.js';

const router = express.Router();
const adminMiddleware = authMiddleware('admin');

// Public Routes (Opt-In signup)
router.get('/public/campaign/:slug', getPublicCampaignBySlug);
router.post('/public/opt-in', publicOptIn);

// Admin Routes
router.get('/admin/campaigns', adminMiddleware, getCampaigns);
router.post('/admin/campaigns', adminMiddleware, createCampaign);
router.put('/admin/campaigns/:id', adminMiddleware, updateCampaign);
router.delete('/admin/campaigns/:id', adminMiddleware, deleteCampaign);

router.get('/admin/logs', adminMiddleware, getDispatchLogs);
router.post('/admin/trigger-scheduler', adminMiddleware, triggerScheduler);

export default router;
