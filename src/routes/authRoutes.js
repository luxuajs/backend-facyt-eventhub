import { Router } from 'express';
import {
  register,
  verifyCode,
  resendVerificationCode,
  login,
  inviteCoordinator,
  confirmInvite,
  forgotPassword,
  resetPassword,
  getCoordinators,
  requestDeleteCoordinator,
  confirmDeleteCoordinator,
  resetDatabase
} from '../controllers/authController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Rutas Públicas
router.post('/register', register);
router.post('/verify-code', verifyCode);
router.post('/resend-verification-code', resendVerificationCode);
router.post('/login', login);
router.post('/confirm-invite', confirmInvite);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Rutas Protegidas (Solo ROOT)
router.post('/invite-coordinator', authenticateToken, requireRole(['ROOT']), inviteCoordinator);
router.get('/coordinators', authenticateToken, requireRole(['ROOT']), getCoordinators);
router.post('/request-delete-coordinator', authenticateToken, requireRole(['ROOT']), requestDeleteCoordinator);
router.post('/confirm-delete-coordinator', authenticateToken, requireRole(['ROOT']), confirmDeleteCoordinator);
router.post('/reset-database', authenticateToken, requireRole(['ROOT']), resetDatabase);

export default router;
