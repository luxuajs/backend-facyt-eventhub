import prisma from '../config/db.js';

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
