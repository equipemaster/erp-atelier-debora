import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase-config.js';

// --- Global State ---
let allClients = [];
let currentClientId = null;
let unsubscribeInteractions = null;

// Funil real do relacionamento com a cliente, do primeiro contato à entrega.
const STAGES = [
    { key: 'novo_lead', label: 'Novo Lead' },
    { key: 'em_conversa', label: 'Em Conversa' },
    { key: 'prova_agendada', label: 'Prova Agendada' },
    { key: 'cliente_ativo', label: 'Cliente Ativo' },
    { key: 'finalizado', label: 'Finalizado' },
];

function stageIndex(status) {
    const i = STAGES.findIndex(s => s.key === status);
    return i === -1 ? 0 : i;
}

function renderStageTrack(status, { withLabel = false } = {}) {
    const idx = stageIndex(status);
    const dots = STAGES.map((s, i) =>
        `<span class="stage-dot ${i <= idx ? 'filled' : ''}" title="${s.label}"></span>`
    ).join('');
    const label = withLabel ? `<span class="stage-label">${STAGES[idx].label}</span>` : '';
    return `${dots}${label}`;
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
}

// --- DOM Elements ---
const clientListEl = document.getElementById('client-list');
const detailSectionEl = document.getElementById('client-detail-section');
const emptyStateEl = document.getElementById('empty-state');
const detailContentEl = document.getElementById('detail-content');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');

// Modals
const modalClient = document.getElementById('modal-client');
const formClient = document.getElementById('form-client');
const modalInteraction = document.getElementById('modal-interaction');
const formInteraction = document.getElementById('form-interaction');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Auth Check (copied from other files)
    onAuthStateChanged(auth, user => {
        if (!user) window.location = 'index.html';
        else loadClients();
    });

    // Event Listeners
    searchInput.addEventListener('input', renderClientList);
    statusFilter.addEventListener('change', renderClientList);
});

// --- CLIENT CRUD ---

// 1. Load Clients (Real-time)
function loadClients() {
    clientListEl.innerHTML = '<div style="padding:20px; text-align:center;">Carregando...</div>';

    onSnapshot(query(collection(db, 'clientes'), orderBy('nome')), snapshot => {
        allClients = [];
        snapshot.forEach(docSnap => {
            allClients.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderClientList();

        // If a client is currently selected, refresh their details
        if (currentClientId) {
            const refreshedClient = allClients.find(c => c.id === currentClientId);
            if (refreshedClient) renderClientDetails(refreshedClient);
        }
    }, err => {
        console.error("Error loading clients:", err);
        clientListEl.innerHTML = '<div style="padding:20px; color:red;">Erro ao carregar clientes.</div>';
    });
}

// 2. Render List
function renderClientList() {
    const term = searchInput.value.toLowerCase();
    const status = statusFilter.value;

    const filtered = allClients.filter(c => {
        const matchesName = c.nome.toLowerCase().includes(term) || (c.telefone && c.telefone.includes(term));
        const matchesStatus = status ? c.status === status : true;
        return matchesName && matchesStatus;
    });

    clientListEl.innerHTML = '';

    if (filtered.length === 0) {
        clientListEl.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">Nenhum cliente encontrado.</div>';
        return;
    }

    filtered.forEach(client => {
        const card = document.createElement('div');
        card.className = `client-card ${currentClientId === client.id ? 'active' : ''}`;
        card.onclick = () => selectClient(client.id);

        card.innerHTML = `
            <div class="client-card-avatar">${initials(client.nome)}</div>
            <div class="client-card-body">
                <h3>${client.nome}</h3>
                <div class="client-info-preview">${client.telefone || 'Sem telefone'}</div>
                <div class="stage-track">${renderStageTrack(client.status)}</div>
            </div>
        `;
        clientListEl.appendChild(card);
    });
}

// 3. Save Client (Create/Update)
async function saveClient(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Salvando...';

    const id = document.getElementById('client-id').value;
    const data = {
        nome: document.getElementById('client-nome').value,
        email: document.getElementById('client-email').value,
        telefone: document.getElementById('client-telefone').value,
        cpf: document.getElementById('client-cpf').value,
        status: document.getElementById('client-status').value,
        observacoes: document.getElementById('client-obs').value,
        medidas: {
            busto: document.getElementById('medida-busto').value,
            cintura: document.getElementById('medida-cintura').value,
            quadril: document.getElementById('medida-quadril').value,
            altura: document.getElementById('medida-altura').value,
            ombro: document.getElementById('medida-ombro').value
        },
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, 'clientes', id), data);
            alert('Cliente atualizado!');
        } else {
            data.dataCadastro = serverTimestamp();
            const ref = await addDoc(collection(db, 'clientes'), data);
            selectClient(ref.id); // Auto select new client
            alert('Cliente cadastrado!');
        }
        closeModal('modal-client');
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// 4. Delete Client
async function deleteClient() {
    if (!currentClientId || !confirm('Tem certeza? Isso apagará o cliente e seu histórico de interações, mas NÃO apagará vendas antigas.')) return;

    try {
        await deleteDoc(doc(db, 'clientes', currentClientId));
        currentClientId = null;
        showEmptyState();
        alert('Cliente removido.');
    } catch (err) {
        alert('Erro ao remover: ' + err.message);
    }
}

// --- DETAILS VIEW ---

function selectClient(id) {
    currentClientId = id;
    renderClientList(); // Re-render to update active class
    const client = allClients.find(c => c.id === id);
    if (client) renderClientDetails(client);
}

function showEmptyState() {
    emptyStateEl.style.display = 'flex';
    detailContentEl.style.display = 'none';
}

function renderClientDetails(client) {
    emptyStateEl.style.display = 'none';
    detailContentEl.style.display = 'flex';

    // Populate Info
    document.getElementById('view-avatar').textContent = initials(client.nome);
    document.getElementById('view-nome').textContent = client.nome;
    document.getElementById('view-phone').textContent = client.telefone || '-';
    document.getElementById('view-email').textContent = client.email || '-';
    document.getElementById('view-cpf').textContent = client.cpf || '-';
    document.getElementById('view-obs').textContent = client.observacoes || 'Nenhuma observação.';

    document.getElementById('view-stage-track').innerHTML = renderStageTrack(client.status, { withLabel: true });

    // Measurements
    const m = client.medidas || {};
    document.getElementById('view-busto').textContent = m.busto || '-';
    document.getElementById('view-cintura').textContent = m.cintura || '-';
    document.getElementById('view-quadril').textContent = m.quadril || '-';
    document.getElementById('view-altura').textContent = m.altura || '-';
    document.getElementById('view-ombro').textContent = m.ombro || '-';

    // Load Interactions & History
    loadInteractions(client.id);
    loadPurchaseHistory(client.nome); // Searching by name as per legacy system
}

function openEditClient() {
    const client = allClients.find(c => c.id === currentClientId);
    if (!client) return;

    document.getElementById('client-id').value = client.id;
    document.getElementById('client-nome').value = client.nome;
    document.getElementById('client-email').value = client.email;
    document.getElementById('client-telefone').value = client.telefone;
    document.getElementById('client-cpf').value = client.cpf;
    document.getElementById('client-status').value = client.status;
    document.getElementById('client-obs').value = client.observacoes;

    const m = client.medidas || {};
    document.getElementById('medida-busto').value = m.busto || '';
    document.getElementById('medida-cintura').value = m.cintura || '';
    document.getElementById('medida-quadril').value = m.quadril || '';
    document.getElementById('medida-altura').value = m.altura || '';
    document.getElementById('medida-ombro').value = m.ombro || '';

    document.getElementById('modal-title-client').innerText = 'Editar Cliente';
    openModal('modal-client');
}

function openNewClient() {
    formClient.reset();
    document.getElementById('client-id').value = '';
    document.getElementById('modal-title-client').innerText = 'Novo Cliente';
    openModal('modal-client');
}

// --- INTERACTIONS ---

function loadInteractions(clientId) {
    const container = document.getElementById('timeline-container');
    container.innerHTML = 'Carregando...';

    if (unsubscribeInteractions) unsubscribeInteractions();

    unsubscribeInteractions = onSnapshot(
        query(collection(db, 'clientes', clientId, 'interacoes'), orderBy('data', 'desc')),
        snap => {
            container.innerHTML = '';
            if (snap.empty) {
                container.innerHTML = '<p style="color:#aaa; font-style:italic;">Nenhuma interação registrada.</p>';
                return;
            }

            snap.forEach(docSnap => {
                const i = docSnap.data();
                const date = i.data ? i.data.toDate().toLocaleString('pt-BR') : '?';

                const div = document.createElement('div');
                div.className = 'timeline-item';
                div.innerHTML = `
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <span class="timeline-type">${i.tipo}</span>
                            <span class="timeline-date">${date}</span>
                        </div>
                        <div class="timeline-body">${i.resumo}</div>
                    </div>
                `;
                container.appendChild(div);
            });
        });
}

function openNewInteraction() {
    if (!currentClientId) return;
    formInteraction.reset();
    openModal('modal-interaction');
}

async function saveInteraction(e) {
    e.preventDefault();
    if (!currentClientId) return;

    const summary = document.getElementById('interaction-resumo').value;
    const type = document.getElementById('interaction-tipo').value;

    try {
        await addDoc(collection(db, 'clientes', currentClientId, 'interacoes'), {
            tipo: type,
            resumo: summary,
            data: serverTimestamp()
        });
        closeModal('modal-interaction');
    } catch (err) {
        alert('Erro ao registrar: ' + err.message);
    }
}

// --- PURCHASE HISTORY (Legacy Integration) ---
async function loadPurchaseHistory(clientName) {
    const container = document.getElementById('history-container');
    container.innerHTML = 'Buscando histórico...';

    try {
        // Simple name matching (case-insensitive search is hard in Firestore without backend, so we do exact or simple prefix if possible. 
        // Here we'll query by exact match for now, or fetch all and filter client side if volume is low. 
        // Given previous code, let's try to match exact name string first).

        // Strategy: Get transactions where 'cliente' field is close to clientName. 
        // NOTE: This relies on exact string match. A better way in future is linking IDs.

        const snap = await getDocs(query(collection(db, 'transacoes'), where('cliente', '==', clientName)));

        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<p style="color:#aaa; font-style:italic;">Nenhuma compra encontrada com este nome exato.</p>';
            return;
        }

        snap.forEach(docSnap => {
            const t = docSnap.data();
            const div = document.createElement('div');
            div.style.borderBottom = '1px solid #eee';
            div.style.padding = '10px 0';
            div.innerHTML = `
                <div style="font-weight:bold;">${t.item} <span style="font-weight:normal; color:#666;">(${t.tipo})</span></div>
                <div style="font-size:0.9rem;">${t.data} - R$ ${t.valor}</div>
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = 'Erro ao buscar histórico.';
    }
}

// --- MODAL UTILS ---
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}
window.onclick = function (event) {
    if (event.target.className === 'modal-overlay') {
        event.target.style.display = 'none';
    }
}

// Script de módulo: funções chamadas via onclick/onsubmit inline no HTML
// precisam ser expostas explicitamente no escopo global.
window.openNewClient = openNewClient;
window.openEditClient = openEditClient;
window.deleteClient = deleteClient;
window.closeModal = closeModal;
window.openNewInteraction = openNewInteraction;
window.saveClient = saveClient;
window.saveInteraction = saveInteraction;
