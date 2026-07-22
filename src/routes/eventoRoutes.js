import { Router } from 'express';
import {
  crearEvento,
  actualizarEstadoEvento,
  getMisEventos,
  getCalendario,
  getEspacios,
  getEscuelas
} from '../controllers/eventoController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Rutas Públicas (Catálogo de espacios, escuelas y calendario de reservas aprobadas)
router.get('/calendario', getCalendario);
router.get('/espacios', getEspacios);
router.get('/escuelas', getEscuelas);

// Rutas Protegidas (Solicitantes y superiores)
router.post('/', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), crearEvento);
router.get('/mis-eventos', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), getMisEventos);

// Rutas de Aprobación (Solo Coordinadores y ROOT)
router.patch('/:id/estado', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), actualizarEstadoEvento);

export default router;
