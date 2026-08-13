import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/db.js';
import {
  sendVerificationCode,
  sendCoordinatorInvitation,
  sendResetPasswordCode,
  sendDeleteCoordinatorCode
} from '../services/emailService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_facyt_2026';

// Registro de Solicitante
export async function register(req, res) {
  const { nombre, email, password, escuelaId, tipoUsuario: rawTipoUsuario } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son campos obligatorios.' });
  }

  try {
    // Verificar si el email ya existe
    const existingUser = await prisma.usuario.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    const tipoUsuario = rawTipoUsuario || 'ESTUDIANTE';
    const rol = tipoUsuario === 'COORDINADOR' ? 'COORDINADOR' : 'SOLICITANTE';

    // Crear el usuario inactivo (esperando confirmación)
    const user = await prisma.usuario.create({
      data: {
        nombre,
        email,
        password: hashedPassword,
        rol,
        tipoUsuario,
        activo: false,
        escuelaId: escuelaId || null
      }
    });

    // Generar código de 6 dígitos
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Guardar el código en ResetCode
    await prisma.resetCode.create({
      data: {
        email,
        code: verificationCode,
        tipo: 'VERIFICACION',
        expiresAt
      }
    });

    // Enviar código por correo
    try {
      await sendVerificationCode(email, verificationCode);
    } catch (mailError) {
      console.error('[AuthCtrl] Error al enviar correo de verificación:', mailError.message);
      // Eliminar el usuario y el código creados para poder reintentar
      await prisma.resetCode.deleteMany({ where: { email } });
      await prisma.usuario.delete({ where: { id: user.id } });
      return res.status(503).json({ error: 'Error al enviar el correo transaccional' });
    }

    return res.status(201).json({
      message: 'Usuario registrado con éxito. Se ha enviado un código de verificación a tu correo.'
    });
  } catch (error) {
    console.error('[AuthCtrl] Error en el registro:', error);
    return res.status(500).json({ error: 'Error interno del servidor en el registro.' });
  }
}

// Verificar código de activación
export async function verifyCode(req, res) {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'El email y el código son obligatorios.' });
  }

  try {
    const resetCode = await prisma.resetCode.findFirst({
      where: {
        email,
        code,
        tipo: 'VERIFICACION',
        expiresAt: { gt: new Date() }
      }
    });

    if (!resetCode) {
      return res.status(400).json({ error: 'Código de verificación inválido o expirado.' });
    }

    // Activar el usuario
    await prisma.usuario.update({
      where: { email },
      data: { activo: true }
    });

    // Limpiar el código usado
    await prisma.resetCode.delete({ where: { id: resetCode.id } });

    return res.status(200).json({ message: 'Cuenta activada con éxito. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('[AuthCtrl] Error verificando código:', error);
    return res.status(500).json({ error: 'Error interno del servidor al verificar código.' });
  }
}

// Reenviar código de verificación de registro
export async function resendVerificationCode(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
  }

  try {
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'No existe una cuenta registrada con este correo.' });
    }

    if (user.activo) {
      return res.status(400).json({ error: 'Esta cuenta ya ha sido activada previa e íntegramente. Puedes iniciar sesión.' });
    }

    // Limpiar códigos anteriores de verificación
    await prisma.resetCode.deleteMany({
      where: { email, tipo: 'VERIFICACION' }
    });

    // Generar nuevo código de 6 dígitos
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await prisma.resetCode.create({
      data: {
        email,
        code: verificationCode,
        tipo: 'VERIFICACION',
        expiresAt
      }
    });

    try {
      await sendVerificationCode(email, verificationCode);
    } catch (mailError) {
      console.error('[AuthCtrl] Error al reenviar correo de verificación:', mailError.message);
      return res.status(503).json({ error: 'Error al enviar el correo transaccional.' });
    }

    return res.status(200).json({ message: 'Nuevo código de verificación enviado a tu correo.' });
  } catch (error) {
    console.error('[AuthCtrl] Error en resendVerificationCode:', error);
    return res.status(500).json({ error: 'Error interno al reenviar el código.' });
  }
}

// Iniciar sesión
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { email },
      include: { escuela: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // Validar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // Validar si está activo
    if (!user.activo) {
      return res.status(403).json({ error: 'La cuenta no ha sido activada. Por favor, verifica tu correo.' });
    }

    // Generar JWT
    const token = jwt.sign({ id: user.id, email: user.email, rol: user.rol }, JWT_SECRET, {
      expiresIn: '24h'
    });

    return res.status(200).json({
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        tipoUsuario: user.tipoUsuario,
        escuela: user.escuela ? { id: user.escuela.id, nombre: user.escuela.nombre } : null
      }
    });
  } catch (error) {
    console.error('[AuthCtrl] Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor en login.' });
  }
}

// Invitar Coordinador (ROOT only)
export async function inviteCoordinator(req, res) {
  const { nombre, email, escuelaId } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ error: 'El nombre y el email son obligatorios.' });
  }

  try {
    // Verificar si el email ya existe
    const existingUser = await prisma.usuario.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Transacción para crear usuario inactivo e insertar invitación
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.usuario.create({
        data: {
          nombre,
          email,
          password: tempPassword,
          rol: 'COORDINADOR',
          activo: false,
          escuelaId: escuelaId || null
        }
      });

      const reset = await tx.resetCode.create({
        data: {
          email,
          code: token,
          tipo: 'INVITACION',
          expiresAt
        }
      });

      return { user, reset };
    });

    // Enviar correo de invitación
    try {
      // Intentar obtener el host del header o por defecto localhost
      const host = req.get('origin') || 'http://localhost:5173';
      await sendCoordinatorInvitation(email, token, host);
    } catch (mailError) {
      console.error('[AuthCtrl] Error al enviar invitación por correo:', mailError.message);
      // Revertir creación de usuario y código en caso de falla SMTP
      await prisma.resetCode.deleteMany({ where: { email } });
      await prisma.usuario.delete({ where: { email } });
      return res.status(503).json({ error: 'Error al enviar el correo transaccional' });
    }

    // Registrar acción en auditoría
    await prisma.auditoria.create({
      data: {
        usuarioId: req.user.id,
        accion: 'INVITO_COORDINADOR',
        detalles: `Invitó al coordinador ${nombre} (${email})`
      }
    });

    return res.status(201).json({ message: 'Invitación enviada con éxito al coordinador.' });
  } catch (error) {
    console.error('[AuthCtrl] Error invitando coordinador:', error);
    return res.status(500).json({ error: 'Error interno del servidor al invitar coordinador.' });
  }
}

// Confirmar Invitación de Coordinador (Establecer contraseña)
export async function confirmInvite(req, res) {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'El token y la contraseña son obligatorios.' });
  }

  try {
    const invite = await prisma.resetCode.findFirst({
      where: {
        code: token,
        tipo: 'INVITACION',
        expiresAt: { gt: new Date() }
      }
    });

    if (!invite) {
      return res.status(400).json({ error: 'Token de invitación inválido o expirado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Activar coordinador y asignarle su contraseña
    await prisma.usuario.update({
      where: { email: invite.email },
      data: {
        password: hashedPassword,
        activo: true
      }
    });

    // Eliminar token de invitación
    await prisma.resetCode.delete({ where: { id: invite.id } });

    return res.status(200).json({ message: 'Contraseña establecida con éxito. Cuenta de coordinador activada.' });
  } catch (error) {
    console.error('[AuthCtrl] Error al confirmar invitación:', error);
    return res.status(500).json({ error: 'Error interno del servidor al activar coordinador.' });
  }
}

// Recuperar contraseña (Forgot Password)
export async function forgotPassword(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'El email es obligatorio.' });
  }

  try {
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) {
      // Retornar 404 para feedback directo
      return res.status(404).json({ error: 'El correo electrónico no está registrado.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    await prisma.resetCode.create({
      data: {
        email,
        code: token,
        tipo: 'RECUPERACION',
        expiresAt
      }
    });

    try {
      const host = req.get('origin') || 'http://localhost:5173';
      await sendResetPasswordCode(email, token, host);
    } catch (mailError) {
      console.error('[AuthCtrl] Error al enviar correo de recuperación:', mailError.message);
      await prisma.resetCode.deleteMany({ where: { email, code: token } });
      return res.status(503).json({ error: 'Error al enviar el correo transaccional' });
    }

    return res.status(200).json({ message: 'Se ha enviado un enlace de recuperación a tu correo.' });
  } catch (error) {
    console.error('[AuthCtrl] Error en forgot-password:', error);
    return res.status(500).json({ error: 'Error interno del servidor en recuperación.' });
  }
}

// Restablecer contraseña (Reset Password)
export async function resetPassword(req, res) {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'El token y la nueva contraseña son obligatorios.' });
  }

  try {
    const recovery = await prisma.resetCode.findFirst({
      where: {
        code: token,
        tipo: 'RECUPERACION',
        expiresAt: { gt: new Date() }
      }
    });

    if (!recovery) {
      return res.status(400).json({ error: 'Token de recuperación inválido o expirado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Actualizar clave del usuario
    await prisma.usuario.update({
      where: { email: recovery.email },
      data: { password: hashedPassword }
    });

    // Borrar token utilizado
    await prisma.resetCode.delete({ where: { id: recovery.id } });

    return res.status(200).json({ message: 'Contraseña restablecida con éxito.' });
  } catch (error) {
    console.error('[AuthCtrl] Error al restablecer contraseña:', error);
    return res.status(500).json({ error: 'Error interno del servidor al restablecer contraseña.' });
  }
}

// Obtener todos los coordinadores (ROOT only)
export async function getCoordinators(req, res) {
  try {
    const coordinadores = await prisma.usuario.findMany({
      where: { rol: 'COORDINADOR' },
      select: {
        id: true,
        nombre: true,
        email: true,
        activo: true,
        createdAt: true,
        escuela: {
          select: {
            id: true,
            nombre: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json(coordinadores);
  } catch (error) {
    console.error('[AuthCtrl] Error al obtener coordinadores:', error);
    return res.status(500).json({ error: 'Error al obtener la lista de coordinadores.' });
  }
}

// Solicitar código de confirmación para eliminar un coordinador (ROOT only)
export async function requestDeleteCoordinator(req, res) {
  const { coordinadorId } = req.body;

  if (!coordinadorId) {
    return res.status(400).json({ error: 'El ID del coordinador es requerido.' });
  }

  try {
    const coordinador = await prisma.usuario.findFirst({
      where: { id: coordinadorId, rol: 'COORDINADOR' }
    });

    if (!coordinador) {
      return res.status(404).json({ error: 'El coordinador no existe o no tiene rol de coordinador.' });
    }

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    const tipo = `ELIMINAR_COORDINADOR_${coordinadorId}`;

    // Limpiar códigos anteriores de eliminación para este coordinador y ROOT
    await prisma.resetCode.deleteMany({
      where: {
        email: req.user.email,
        tipo
      }
    });

    await prisma.resetCode.create({
      data: {
        email: req.user.email,
        code,
        tipo,
        expiresAt
      }
    });

    // Enviar código por correo al usuario ROOT
    await sendDeleteCoordinatorCode(req.user.email, coordinador.nombre, code);

    return res.status(200).json({
      message: `Código de confirmación enviado al correo del ROOT (${req.user.email}).`
    });
  } catch (error) {
    console.error('[AuthCtrl] Error al solicitar eliminación de coordinador:', error);
    return res.status(500).json({ error: 'Error al procesar la solicitud de eliminación.' });
  }
}

// Confirmar eliminación de coordinador con el código enviado por email (ROOT only)
export async function confirmDeleteCoordinator(req, res) {
  const { coordinadorId, code } = req.body;

  if (!coordinadorId || !code) {
    return res.status(400).json({ error: 'El ID del coordinador y el código son requeridos.' });
  }

  try {
    const coordinador = await prisma.usuario.findFirst({
      where: { id: coordinadorId, rol: 'COORDINADOR' }
    });

    if (!coordinador) {
      return res.status(404).json({ error: 'El coordinador no existe.' });
    }

    const tipo = `ELIMINAR_COORDINADOR_${coordinadorId}`;

    const validCode = await prisma.resetCode.findFirst({
      where: {
        email: req.user.email,
        code,
        tipo,
        expiresAt: { gt: new Date() }
      }
    });

    if (!validCode) {
      return res.status(400).json({ error: 'Código de confirmación inválido o expirado.' });
    }

    // Transacción para eliminar registros dependientes y el usuario
    await prisma.$transaction(async (tx) => {
      await tx.resetCode.deleteMany({ where: { email: coordinador.email } });
      await tx.resetCode.delete({ where: { id: validCode.id } });
      
      await tx.auditoria.deleteMany({ where: { usuarioId: coordinador.id } });
      await tx.evento.deleteMany({ where: { usuarioId: coordinador.id } });

      await tx.usuario.delete({ where: { id: coordinador.id } });

      await tx.auditoria.create({
        data: {
          usuarioId: req.user.id,
          accion: 'ELIMINO_COORDINADOR',
          detalles: `Eliminó la cuenta del coordinador ${coordinador.nombre} (${coordinador.email}) mediante código de confirmación enviado por correo.`
        }
      });
    });

    return res.status(200).json({ message: 'Coordinador eliminado con éxito.' });
  } catch (error) {
    console.error('[AuthCtrl] Error al confirmar eliminación de coordinador:', error);
    return res.status(500).json({ error: 'Error interno del servidor al eliminar coordinador.' });
  }
}

// Reseteo total de la BD a estado inicial desde cero (ROOT only)
export async function resetDatabase(req, res) {
  try {
    const rootEmail = 'juansanabriaalfa08@gmail.com';

    await prisma.$transaction(async (tx) => {
      await tx.asistencia.deleteMany({});
      await tx.auditoria.deleteMany({});
      await tx.evento.deleteMany({});
      await tx.resetCode.deleteMany({});
      await tx.usuario.deleteMany({
        where: {
          email: { not: rootEmail }
        }
      });

      // Crear auditoría del reseteo
      const rootUser = await tx.usuario.findUnique({ where: { email: rootEmail } });
      if (rootUser) {
        await tx.auditoria.create({
          data: {
            usuarioId: rootUser.id,
            accion: 'RESETEO_BASE_DE_DATOS',
            detalles: `El usuario ROOT ${rootUser.nombre} reinició la base de datos a cero.`
          }
        });
      }
    });

    return res.status(200).json({ message: 'Base de datos reiniciada a cero con éxito. Solo se ha mantenido la cuenta ROOT.' });
  } catch (error) {
    console.error('[AuthCtrl] Error al reiniciar base de datos:', error);
    return res.status(500).json({ error: 'Error al reiniciar la base de datos.' });
  }
}

