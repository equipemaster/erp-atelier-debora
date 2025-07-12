// Toast com ícone
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const icon = type === 'error' ? '❌' : '✅';
  toast.textContent = `${icon} ${message}`;
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.right = '20px';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.background = type === 'error' ? '#d9534f' : '#5cb85c';
  toast.style.color = '#fff';
  toast.style.fontWeight = 'bold';
  toast.style.zIndex = 9999;
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  toast.style.opacity = '1';
  toast.style.transition = 'opacity 0.5s ease';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 500);
  }, 2500);
}

// Loader
function showLoader() {
  const loader = document.createElement('div');
  loader.id = 'loader';
  loader.style.position = 'fixed';
  loader.style.top = '0';
  loader.style.left = '0';
  loader.style.width = '100%';
  loader.style.height = '100%';
  loader.style.background = 'rgba(0,0,0,0.5)';
  loader.style.display = 'flex';
  loader.style.alignItems = 'center';
  loader.style.justifyContent = 'center';
  loader.innerHTML = '<div style="border: 8px solid #f3f3f3; border-top: 8px solid #b38757; border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite;"></div>';
  document.body.appendChild(loader);
}

function hideLoader() {
  const loader = document.getElementById('loader');
  if (loader) document.body.removeChild(loader);
}

const style = document.createElement('style');
style.textContent = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;
document.head.appendChild(style);

function cadastrarProduto() {
  const nome = document.getElementById('nomeProduto').value;
  const estoque = parseInt(document.getElementById('estoqueProduto').value);
  if (!nome || isNaN(estoque)) return showToast('Preencha corretamente!', 'error');
  const id = db.ref('produtos').push().key;
  showLoader();
  db.ref('produtos/' + id).set({ nome, estoque })
    .then(() => {
      showToast('Produto cadastrado com sucesso!');
      document.getElementById('nomeProduto').value = '';
      document.getElementById('estoqueProduto').value = '';
      carregarProdutos();
    })
    .catch(err => showToast('Erro ao cadastrar produto: ' + err.message, 'error'))
    .finally(() => hideLoader());
}

function registrarConta() {
  const descricao = document.getElementById('descricaoConta').value;
  const valor = parseFloat(document.getElementById('valorConta').value);
  const tipo = document.getElementById('tipoConta').value;
  if (!descricao || isNaN(valor)) return showToast('Preencha corretamente!', 'error');
  const id = db.ref(`contas/${tipo}`).push().key;
  showLoader();
  db.ref(`contas/${tipo}/${id}`).set({ descricao, valor, tipo })
    .then(() => {
      showToast('Conta registrada com sucesso!');
      document.getElementById('descricaoConta').value = '';
      document.getElementById('valorConta').value = '';
      document.getElementById('tipoConta').value = 'pagar';
      carregarContas();
    })
    .catch(err => showToast('Erro ao registrar conta: ' + err.message, 'error'))
    .finally(() => hideLoader());
}

function cadastrarProjeto() {
  const nome = document.getElementById('nomeProjeto').value;
  const status = document.getElementById('statusProjeto').value;
  if (!nome || !status) return showToast('Preencha corretamente!', 'error');
  const id = db.ref('projetos').push().key;
  showLoader();
  db.ref('projetos/' + id).set({ nome, status })
    .then(() => {
      showToast('Projeto cadastrado com sucesso!');
      document.getElementById('nomeProjeto').value = '';
      document.getElementById('statusProjeto').value = '';
      carregarProjetos();
    })
    .catch(err => showToast('Erro ao cadastrar projeto: ' + err.message, 'error'))
    .finally(() => hideLoader());
}
