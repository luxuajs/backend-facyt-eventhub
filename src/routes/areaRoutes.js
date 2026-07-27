import { Router } from 'express';
import { getAreas, crearArea, actualizarArea, toggleEstadoArea } from '../controllers/areaController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Obtener catálogo de áreas (público o autenticado)
router.get('/', authenticateToken, getAreas);

// Operaciones de Coordinador / ROOT
router.post('/', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), crearArea);
router.put('/:id', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), actualizarArea);
router.patch('/:id/estado', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), toggleEstadoArea);

export default router;
