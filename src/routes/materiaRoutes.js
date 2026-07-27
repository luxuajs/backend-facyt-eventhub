import { Router } from 'express';
import {
  getMaterias,
  crearMateria,
  actualizarMateria,
  toggleEstadoMateria,
  asignarMateriasAEspacio,
  getMateriasPorEspacio
} from '../controllers/materiaController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Obtener catálogo de materias
router.get('/', authenticateToken, getMaterias);
router.get('/espacio/:espacioId', authenticateToken, getMateriasPorEspacio);

// Operaciones de administración (Coordinador / ROOT)
router.post('/', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), crearMateria);
router.put('/:id', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), actualizarMateria);
router.patch('/:id/estado', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), toggleEstadoMateria);

// Asignar materias a un laboratorio o espacio físico
router.post('/espacio/:espacioId/asignar', authenticateToken, requireRole(['COORDINADOR', 'ROOT']), asignarMateriasAEspacio);

export default router;
