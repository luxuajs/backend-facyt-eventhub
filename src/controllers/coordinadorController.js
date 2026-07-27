import prisma from '../config/db.js';
import { generateCoordinatorAdvice } from '../services/geminiService.js';

// Obtener cola priorizada del coordinador (Coordinador y ROOT)
export async function getColaPriorizada(req, res) {
  try {
    const cola = await prisma.evento.findMany({
      where: { estado: 'PENDIENTE' },
      include: {
        espacio: {
          include: { escuela: true }
        },
        usuario: {
          select: {
            nombre: true,
            email: true,
            rol: true,
            escuela: true
          }
        }
      },
      // Ordenamiento FIFO Priorizado (AC 01): prioridad asc (1 máxima, 5 mínima), luego creación asc
      orderBy: [
        { prioridad: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    return res.status(200).json(cola);
  } catch (error) {
    console.error('[CoordinadorCtrl] Error al obtener cola priorizada:', error);
    return res.status(500).json({ error: 'Error al obtener la cola de solicitudes.' });
  }
}

// Obtener sugerencias y análisis de IA para reasignación de espacios en un evento
export async function obtenerAnalisisIA(req, res) {
  const { id } = req.params;

  try {
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: {
        espacio: { include: { escuela: true } },
        usuario: true
      }
    });

    if (!evento) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    // Buscar espacios activos compatibles en capacidad
    const espaciosCompatibles = await prisma.espacio.findMany({
      where: {
        estado: 'ACTIVO',
        capacidad: { gte: evento.asistentesEstimados }
      },
      include: { escuela: true },
      orderBy: { capacidad: 'asc' }
    });

    // Generar recomendación de IA con Gemini
    const consejoIA = await generateCoordinatorAdvice(evento, espaciosCompatibles);

    return res.status(200).json({
      eventoId: evento.id,
      analisisIA: consejoIA,
      espaciosCompatibles
    });
  } catch (error) {
    console.error('[CoordinadorCtrl] Error al obtener análisis de IA:', error);
    return res.status(500).json({ error: 'Error interno al generar el análisis de IA.' });
  }
}
