import { Router } from 'express';
import { getEspacios, actualizarEstadoEspacio, preInhabilitarEspacio } from '../controllers/espacioController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Catálogo público de espacios
router.get('/', getEspacios);

// Pre-visualizar eventos afectados y opciones al inhabilitar (Coordinadores y ROOT)
router.get('/:id/pre-inhabilitar', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), preInhabilitarEspacio);

// Cambiar estado de espacio (Coordinadores y ROOT)
router.patch('/:id/estado', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), actualizarEstadoEspacio);

export default router;
