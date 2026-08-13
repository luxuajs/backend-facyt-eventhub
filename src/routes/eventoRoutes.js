import { Router } from 'express';
import {
  crearEvento,
  obtenerSugerenciasEspacio,
  actualizarEstadoEvento,
  proponerCambioEspacio,
  responderPropuestaCambio,
  editarEvento,
  getMisEventos,
  getCalendario,
  getEspacios,
  getEscuelas,
  obtenerPromocionEvento,
  responderPropuesta
} from '../controllers/eventoController.js';
import {
  registrarAsistencia,
  obtenerAsistenciaEvento
} from '../controllers/asistenciaController.js';
import { authenticateToken, requireRole, optionalAuthenticateToken } from '../middlewares/auth.js';

const router = Router();

// Rutas Públicas (Catálogo de espacios, escuelas y calendario de reservas aprobadas)
router.get('/calendario', getCalendario);
router.get('/espacios', getEspacios);
router.get('/escuelas', getEscuelas);
router.get('/:id/asistencia', optionalAuthenticateToken, obtenerAsistenciaEvento);

// Rutas Protegidas (Solicitantes y superiores)
router.post('/sugerir-espacios', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), obtenerSugerenciasEspacio);
router.post('/', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), crearEvento);
router.get('/mis-eventos', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), getMisEventos);
router.get('/:id/promocion', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), obtenerPromocionEvento);
router.put('/:id', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), editarEvento);
router.patch('/:id/responder-propuesta', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), responderPropuestaCambio);
router.post('/:id/responder-propuesta', authenticateToken, requireRole(['SOLICITANTE', 'COORDINADOR', 'ROOT']), responderPropuesta);
router.post('/:id/asistir', authenticateToken, registrarAsistencia);

// Rutas de Aprobación y Propuesta (Solo Coordinadores y ROOT)
router.patch('/:id/estado', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), actualizarEstadoEvento);
router.patch('/:id/proponer-cambio', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), proponerCambioEspacio);

export default router;
