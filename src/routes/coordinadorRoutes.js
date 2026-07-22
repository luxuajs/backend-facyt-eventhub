import { Router } from 'express';
import { getColaPriorizada } from '../controllers/coordinadorController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Cola de coordinación (Coordinadores y ROOT)
router.get('/cola', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), getColaPriorizada);

export default router;
