import { Router } from 'express';
import { getEspacios, actualizarEstadoEspacio } from '../controllers/espacioController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Catálogo público de espacios
router.get('/', getEspacios);

// Cambiar estado de espacio (Coordinadores y ROOT)
router.patch('/:id/estado', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), actualizarEstadoEspacio);

export default router;
