function showLogoutModal() {
  document.getElementById('logoutModal').classList.remove('hidden');
}

function hideLogoutModal() {
  document.getElementById('logoutModal').classList.add('hidden');
}

function confirmLogout() {
  clearSession();
  window.location.href = 'login.html';
}
