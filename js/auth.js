async function login(email, senha) {
  try {
    await auth.signInWithEmailAndPassword(email, senha);
    window.location = 'dashboard.html';
  } catch (e) {
    alert('Erro no login: ' + e.message);
  }
}

auth.onAuthStateChanged(user => {
  if (user) {
    console.log('Usuário logado:', user.email);
  }
});
