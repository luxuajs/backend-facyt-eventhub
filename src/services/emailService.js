import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 465,
  secure: process.env.EMAIL_PORT === '465' || (!process.env.EMAIL_PORT && true), // true si es 465 o si no se define
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Función auxiliar para enviar correos
async function sendMail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"FaCyT EventHub" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] Correo enviado a ${to}. ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Email] Error enviando correo SMTP:', error);
    // Lanzar error capturable por el controlador para retornar HTTP 503
    throw new Error('Error al enviar el correo transaccional');
  }
}

export async function sendVerificationCode(email, code) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb; text-align: center;">Verificación de Cuenta - FaCyT EventHub</h2>
      <p>Hola,</p>
      <p>Gracias por registrarte en FaCyT EventHub. Por favor, usa el siguiente código de confirmación de 6 dígitos para activar tu cuenta. Este código expira en 15 minutos:</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; background-color: #f1f5f9; padding: 10px 20px; border-radius: 6px; border: 1px solid #cbd5e1; color: #0f172a;">${code}</span>
      </div>
      <p>Si no has solicitado este registro, puedes ignorar este correo de forma segura.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; text-align: center;">FaCyT - Facultad Experimental de Ciencias y Tecnología</p>
    </div>
  `;
  return sendMail({
    to: email,
    subject: 'Código de Confirmación de Cuenta - FaCyT EventHub',
    html,
  });
}

export async function sendCoordinatorInvitation(email, token, frontendUrl = 'http://localhost:5173') {
  const inviteLink = `${frontendUrl}/confirm-invite?token=${token}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb; text-align: center;">Invitación de Coordinador - FaCyT EventHub</h2>
      <p>Hola,</p>
      <p>Has sido invitado a formar parte de FaCyT EventHub con el rol de **Coordinador**.</p>
      <p>Para activar tu cuenta y configurar tu contraseña de acceso, haz clic en el siguiente botón:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Configurar Contraseña</a>
      </div>
      <p>O copia y pega esta dirección en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${inviteLink}">${inviteLink}</a></p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; text-align: center;">FaCyT - Facultad Experimental de Ciencias y Tecnología</p>
    </div>
  `;
  return sendMail({
    to: email,
    subject: 'Invitación de Coordinador - FaCyT EventHub',
    html,
  });
}

export async function sendResetPasswordCode(email, token, frontendUrl = 'http://localhost:5173') {
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb; text-align: center;">Recuperación de Contraseña - FaCyT EventHub</h2>
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en FaCyT EventHub.</p>
      <p>Para definir una nueva contraseña, haz clic en el siguiente enlace (expira en 15 minutos):</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
      </div>
      <p>O copia y pega esta dirección en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${resetLink}">${resetLink}</a></p>
      <p>Si no realizaste esta solicitud, puedes ignorar este correo de forma segura.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; text-align: center;">FaCyT - Facultad Experimental de Ciencias y Tecnología</p>
    </div>
  `;
  return sendMail({
    to: email,
    subject: 'Recuperación de Contraseña - FaCyT EventHub',
    html,
  });
}

export async function sendSpaceMaintenanceNotification({ email, usuarioNombre, eventoTitulo, espacioNombre, fecha, horaInicio, horaFin, motivo }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #dc2626; text-align: center;">Notificación de Mantenimiento / Contingencia</h2>
      <p>Estimado(a) <strong>${usuarioNombre}</strong>,</p>
      <p>Le informamos que la reserva de su evento <strong>"${eventoTitulo}"</strong> programada en el espacio <strong>"${espacioNombre}"</strong> para la fecha <strong>${fecha}</strong> (${horaInicio} - ${horaFin}) ha tenido que ser <strong style="color: #dc2626;">CANCELADA POR CONTINGENCIA</strong>.</p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-weight: bold; color: #991b1b;">Motivo del Mantenimiento / Inhabilitación:</p>
        <p style="margin: 4px 0 0 0; color: #7f1d1d;">${motivo || 'Mantenimiento preventivo / correctivo de infraestructura'}</p>
      </div>
      <p>Lamentamos las molestias ocasionadas. Le sugerimos ingresar al sistema para solicitar un espacio o bloque de tiempo alternativo.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; text-align: center;">FaCyT EventHub - Coordinación de Espacios Físicos</p>
    </div>
  `;
  try {
    await sendMail({
      to: email,
      subject: `[IMPORTANTE] Cancelación por Mantenimiento - Evento "${eventoTitulo}"`,
      html,
    });
  } catch (error) {
    console.error(`[Email] No se pudo enviar notificación de mantenimiento a ${email}:`, error.message);
  }
}

export async function sendDeleteCoordinatorCode(email, coordinatorName, code) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #dc2626; text-align: center;">Confirmación de Eliminación de Coordinador</h2>
      <p>Hola,</p>
      <p>Se ha solicitado la eliminación del perfil del coordinador <strong>${coordinatorName}</strong> en FaCyT EventHub.</p>
      <p>Para confirmar esta acción, ingresa el siguiente código de confirmación de 6 dígitos en el sistema. Este código expira en 15 minutos:</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; background-color: #fef2f2; padding: 10px 20px; border-radius: 6px; border: 1px solid #fca5a5; color: #991b1b;">${code}</span>
      </div>
      <p>Si no realizaste esta solicitud, ignora este mensaje y verifica la seguridad de tu cuenta ROOT.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; text-align: center;">FaCyT EventHub - Seguridad y Administración</p>
    </div>
  `;
  return sendMail({
    to: email,
    subject: `Código de Confirmación: Eliminación de Coordinador (${coordinatorName}) - FaCyT EventHub`,
    html,
  });
}

export async function sendReassignmentProposalNotification({ email, usuarioNombre, eventoTitulo, espacioOriginalNombre, espacioPropuestoNombre, sugerenciaIA, linkRespuesta }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #ea580c; text-align: center;">Propuesta de Reasignación de Espacio</h2>
      <p>Estimado(a) <strong>${usuarioNombre}</strong>,</p>
      <p>Le informamos que el espacio <strong>"${espacioOriginalNombre}"</strong> ha sido inhabilitado, por lo cual su evento <strong>"${eventoTitulo}"</strong> se ha visto afectado.</p>
      <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-weight: bold; color: #9a3412;">Mensaje del Sistema:</p>
        <p style="margin: 4px 0 0 0; color: #9a3412;">${sugerenciaIA}</p>
      </div>
      ${espacioPropuestoNombre ? `<p>Para aceptar o rechazar esta propuesta, por favor acceda al siguiente enlace:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${linkRespuesta}" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Revisar Propuesta</a>
      </div>` : `<p>Lamentablemente no se encontró una alternativa disponible. Ingrese al sistema para reprogramar su evento.</p>`}
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; text-align: center;">FaCyT EventHub - Coordinación de Espacios Físicos</p>
    </div>
  `;
  try {
    await sendMail({
      to: email,
      subject: `Propuesta de Reasignación - Evento "${eventoTitulo}"`,
      html,
    });
  } catch (error) {
    console.error(`[Email] No se pudo enviar notificación de propuesta a ${email}:`, error.message);
  }
}

