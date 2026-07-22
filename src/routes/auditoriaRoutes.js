import { Router } from 'express';
import { getAuditoriaLogs } from '../controllers/auditoriaController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Consultar logs de auditoría (Exclusivo ROOT)
router.get('/', authenticateToken, requireRole(['ROOT']), getAuditoriaLogs);

export default router;
