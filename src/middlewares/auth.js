import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_facyt_2026';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      include: { escuela: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'La cuenta no ha sido activada. Por favor, verifica tu correo.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error al verificar JWT:', error.message);
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
}

export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Rol insuficiente.' });
    }

    next();
  };
}
