/**
 * Full-Screen Login Page View Component
 */

import { loginUser } from '../services/auth-service.js';
import { showToast } from '../utils/notifications.js';

export function setupLoginView(onSuccessLogin) {
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const togglePassBtn = document.getElementById('togglePasswordBtn');
  const errorAlert = document.getElementById('loginErrorAlert');
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (togglePassBtn && passwordInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePassBtn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorAlert) errorAlert.style.display = 'none';

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value.trim() : '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
      }

      try {
        const user = await loginUser(email, password);
        if (errorAlert) errorAlert.style.display = 'none';

        const authOverlay = document.getElementById('authOverlay');
        const mainApp = document.querySelector('.app-container');

        if (authOverlay) authOverlay.style.display = 'none';
        if (mainApp) mainApp.style.display = 'flex';

        showToast(`Welcome back, ${user.name}!`, 'info');

        if (onSuccessLogin) onSuccessLogin(user);
      } catch (err) {
        if (errorAlert) {
          errorAlert.textContent = err.message || 'Login failed';
          errorAlert.style.display = 'block';
        }
        showToast(err.message || 'Login failed', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Sign In to CRM <i class="fa-solid fa-arrow-right"></i>';
        }
      }
    });
  }
}
