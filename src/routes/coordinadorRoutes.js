import { Router } from 'express';
import { getColaPriorizada, obtenerAnalisisIA } from '../controllers/coordinadorController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Cola de coordinación (Coordinadores y ROOT)
router.get('/cola', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), getColaPriorizada);

// Análisis de IA para recomendación de espacio
router.get('/analisis-ia/:id', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), obtenerAnalisisIA);

export default router;
