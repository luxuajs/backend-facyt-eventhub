import prisma from '../config/db.js';

// Consultar historial de auditoría del sistema (Solo ROOT)
export async function getAuditoriaLogs(req, res) {
  try {
    // Doble verificación de seguridad por rol ROOT
    if (req.user.rol !== 'ROOT') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere privilegios de superusuario ROOT.' });
    }

    const logs = await prisma.auditoria.findMany({
      include: {
        usuario: {
          select: {
            nombre: true,
            email: true,
            rol: true
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    return res.status(200).json(logs);
  } catch (error) {
    console.error('[AuditoriaCtrl] Error al obtener auditorías:', error);
    return res.status(500).json({ error: 'Error al obtener el historial de auditoría.' });
  }
}
