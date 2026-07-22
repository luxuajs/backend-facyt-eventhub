import { Router } from 'express';
import {
  register,
  verifyCode,
  login,
  inviteCoordinator,
  confirmInvite,
  forgotPassword,
  resetPassword
} from '../controllers/authController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Rutas Públicas
router.post('/register', register);
router.post('/verify-code', verifyCode);
router.post('/login', login);
router.post('/confirm-invite', confirmInvite);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Rutas Protegidas (Solo ROOT)
router.post('/invite-coordinator', authenticateToken, requireRole(['ROOT']), inviteCoordinator);

export default router;
