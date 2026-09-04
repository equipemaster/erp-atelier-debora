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
// 'perdida' também é um status possível, mas não faz parte da progressão linear
// (ver renderStageTrack), então fica de fora deste array.
const STAGES = [
    { key: 'novo_lead', label: 'Novo Lead' },
    { key: 'em_conversa', label: 'Em Conversa' },
    { key: 'prova_agendada', label: 'Prova Agendada' },
    { key: 'cliente_ativo', label: 'Cliente Ativo' },
    { key: 'finalizado', label: 'Finalizado' },
];

// --- Ficha de Atendimento: labels para exibição no resumo ---
const INDICACAO_LABELS = {
    casarei_natalia: 'Casarei by Natália', rbc: 'RBC', cerimonial: 'Cerimonial',
    instagram: 'Instagram', tiktok: 'TikTok', pinterest: 'Pinterest', google: 'Google',
    indicacao_cliente: 'Indicação de cliente/amiga', outro: 'Outro'
};
const PROCURA_LABELS = {
    locacao: 'Locação de vestido pronto', primeiro_aluguel: 'Primeiro aluguel / projeto exclusivo',
    sob_medida: 'Sob medida', nao_sabe: 'Ainda não sabe'
};
const FAIXA_LABELS = {
    ate_4000: 'Até R$4.000', '4000_6000': 'R$4.000–R$6.000', '6000_8000': 'R$6.000–R$8.000',
    '8000_10000': 'R$8.000–R$10.000', '10000_15000': 'R$10.000–R$15.000',
    acima_15000: 'Acima de R$15.000', prefere_nao_informar: 'Prefere não informar'
};
const QUEM_DECIDE_LABELS = { noiva: 'Somente a noiva', mae: 'Mãe', pai: 'Pai', noivo: 'Noivo(a)', avo: 'Avó/avô', outra: 'Outra pessoa' };
const STATUS_ATENDIMENTO_LABELS = {
    fechou: 'Fechou', em_decisao: 'Em decisão', retorno_agendado: 'Retorno agendado',
    follow_up: 'Follow-up', perdida: 'Perdida'
};

// Radios com um campo de texto condicional (mostra só quando aquele valor é escolhido)
const RADIO_CONDITIONALS = [
    { name: 'fa-indicacao', value: 'cerimonial', target: 'fa-indicacao-cerimonial-qual' },
    { name: 'fa-indicacao', value: 'indicacao_cliente', target: 'fa-indicacao-cliente-quem' },
    { name: 'fa-indicacao', value: 'outro', target: 'fa-indicacao-outro-texto' },
    { name: 'fa-motivo-impedimento', value: 'outro', target: 'fa-motivo-impedimento-outro-texto' },
    { name: 'fa-motivo-perdida', value: 'outro', target: 'fa-motivo-perdida-outro-texto' },
];

// Etapa 6: qual bloco de campos aparece de acordo com o status do atendimento
const STATUS_BLOCKS = {
    fechou: 'fa-bloco-fechou',
    em_decisao: 'fa-bloco-nao-fechou',
    retorno_agendado: 'fa-bloco-nao-fechou',
    follow_up: 'fa-bloco-nao-fechou',
    perdida: 'fa-bloco-perdida'
};

function stageIndex(status) {
    const i = STAGES.findIndex(s => s.key === status);
    return i === -1 ? 0 : i;
}

function renderStageTrack(status, { withLabel = false } = {}) {
    if (status === 'perdida') {
        return `<span class="stage-lost-badge">Perdida</span>`;
    }
    const idx = stageIndex(status);
    const dots = STAGES.map((s, i) =>
        `<span class="stage-dot ${i <= idx ? 'filled' : ''}" title="${s.label}"></span>`
    ).join('');
    const label = withLabel ? `<span class="stage-label">${STAGES[idx].label}</span>` : '';
    return `${dots}${label}`;
}

// A partir do que já foi preenchido na ficha, avança o status da cliente no funil
// automaticamente. O resultado da Etapa 6, quando existir, sempre manda.
function computeFunilStatus(ficha, fallback) {
    const resultado = (ficha.resultado && ficha.resultado.status) || '';
    if (resultado === 'fechou') return 'cliente_ativo';
    if (resultado === 'em_decisao' || resultado === 'retorno_agendado') return 'prova_agendada';
    if (resultado === 'follow_up') return 'em_conversa';
    if (resultado === 'perdida') return 'perdida';

    const prova = ficha.prova || {};
    const teveProva = prova.modeloFavorito || (prova.modelosExperimentados || []).length > 0;
    if (teveProva) return 'prova_agendada';

    const diagnostico = ficha.diagnostico || {};
    const teveDiagnostico = diagnostico.jaExperimentou || diagnostico.faseDecisao || diagnostico.oQueProcura;
    if (teveDiagnostico) return 'em_conversa';

    return fallback || 'novo_lead';
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
}

function formatDateBR(value) {
    if (!value) return '-';
    const [y, m, d] = value.split('-');
    return (d && m && y) ? `${d}/${m}/${y}` : value;
}

// --- Form helpers (ficha) ---
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}
function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}
function getRadioValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
}
function setRadioValue(name, value) {
    if (!value) return;
    const el = document.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
    if (el) el.checked = true;
}
function getCheckedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
}
function setCheckedValues(name, values = []) {
    values.forEach(v => {
        const el = document.querySelector(`input[name="${name}"][value="${CSS.escape(v)}"]`);
        if (el) el.checked = true;
    });
}

function refreshRadioConditionals() {
    const names = [...new Set(RADIO_CONDITIONALS.map(c => c.name))];
    names.forEach(name => {
        const checked = getRadioValue(name);
        RADIO_CONDITIONALS.filter(c => c.name === name).forEach(c => {
            const el = document.getElementById(c.target);
            if (el) el.style.display = (c.value === checked) ? 'block' : 'none';
        });
    });
}

function refreshStatusBlocks() {
    const checked = getRadioValue('fa-status-atendimento');
    const target = STATUS_BLOCKS[checked];
    ['fa-bloco-fechou', 'fa-bloco-nao-fechou', 'fa-bloco-perdida'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === target) ? 'block' : 'none';
    });
}

function refreshQuemDecideOutra() {
    const checked = getCheckedValues('fa-quem-decide').includes('outra');
    const el = document.getElementById('fa-quem-decide-outra-texto');
    if (el) el.style.display = checked ? 'block' : 'none';
}

function refreshFichaConditionals() {
    refreshRadioConditionals();
    refreshStatusBlocks();
    refreshQuemDecideOutra();
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

    // Ficha de atendimento: mostra/esconde campos condicionais conforme as escolhas
    formClient.addEventListener('change', refreshFichaConditionals);
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

// Monta o objeto `ficha` (etapas 1 a 6) a partir dos campos do formulário
function buildFichaFromForm() {
    const indicacaoTipo = getRadioValue('fa-indicacao');
    let indicacaoDetalhe = '';
    if (indicacaoTipo === 'cerimonial') indicacaoDetalhe = val('fa-indicacao-cerimonial-qual');
    else if (indicacaoTipo === 'indicacao_cliente') indicacaoDetalhe = val('fa-indicacao-cliente-quem');
    else if (indicacaoTipo === 'outro') indicacaoDetalhe = val('fa-indicacao-outro-texto');

    return {
        instagram: val('fa-instagram'),
        dataAtendimento: val('fa-data-atendimento'),
        dataCasamento: val('fa-data-casamento'),
        cidadeCasamento: val('fa-cidade-casamento'),
        numeracao: val('fa-numeracao'),
        comoConheceu: val('fa-como-conheceu'),
        indicacao: {
            tipo: indicacaoTipo,
            detalhe: indicacaoDetalhe
        },
        diagnostico: {
            jaExperimentou: getRadioValue('fa-ja-experimentou'),
            vestidoQuaseFechou: val('fa-vestido-quase-fechou'),
            faseDecisao: getRadioValue('fa-fase-decisao'),
            oQueProcura: getRadioValue('fa-o-que-procura'),
            faixaInvestimento: getRadioValue('fa-faixa-investimento'),
            quemDecide: getCheckedValues('fa-quem-decide'),
            quemDecideOutra: val('fa-quem-decide-outra-texto')
        },
        prova: {
            modelosExperimentados: ['fa-modelo-1', 'fa-modelo-2', 'fa-modelo-3', 'fa-modelo-4'].map(val).filter(Boolean),
            modeloFavorito: val('fa-modelo-favorito'),
            perguntaMexeu: val('fa-pergunta-mexeu'),
            perguntaGostou: val('fa-pergunta-gostou'),
            segurancaEscolha: getRadioValue('fa-seguranca-escolha')
        },
        proposta: {
            modelo: val('fa-proposta-modelo'),
            valorOficial: val('fa-proposta-valor-oficial'),
            condicaoApresentada: val('fa-proposta-condicao'),
            formaPagamento: val('fa-proposta-pagamento'),
            incluso: val('fa-proposta-incluso'),
            validade: val('fa-proposta-validade')
        },
        naoFechou: {
            motivoImpedimento: getRadioValue('fa-motivo-impedimento'),
            motivoImpedimentoOutro: val('fa-motivo-impedimento-outro-texto'),
            observacaoEstilista: val('fa-obs-estilista'),
            condicaoIdeal: val('fa-condicao-ideal')
        },
        resultado: {
            status: getRadioValue('fa-status-atendimento'),
            valorContrato: val('fa-valor-contrato'),
            categoria: getRadioValue('fa-categoria-fechou'),
            motivoPrincipal: val('fa-motivo-principal'),
            proximaAcao: val('fa-proxima-acao'),
            dataProximoContato: val('fa-data-proximo-contato'),
            motivoPerdida: getRadioValue('fa-motivo-perdida'),
            motivoPerdidaOutro: val('fa-motivo-perdida-outro-texto')
        }
    };
}

// Preenche o formulário da ficha com os dados de uma cliente já cadastrada
function populateFichaForm(client) {
    formClient.reset();
    document.getElementById('fa-id').value = client.id;
    setVal('fa-nome', client.nome);
    setVal('fa-whatsapp', client.telefone);
    setVal('fa-email', client.email);
    setVal('fa-cpf', client.cpf);
    setVal('fa-observacoes', client.observacoes);

    const m = client.medidas || {};
    setVal('fa-medida-busto', m.busto);
    setVal('fa-medida-cintura', m.cintura);
    setVal('fa-medida-quadril', m.quadril);
    setVal('fa-medida-altura', m.altura);
    setVal('fa-medida-ombro', m.ombro);

    const f = client.ficha || {};
    setVal('fa-instagram', f.instagram);
    setVal('fa-data-atendimento', f.dataAtendimento);
    setVal('fa-data-casamento', f.dataCasamento);
    setVal('fa-cidade-casamento', f.cidadeCasamento);
    setVal('fa-numeracao', f.numeracao);
    setVal('fa-como-conheceu', f.comoConheceu);

    const indicacao = f.indicacao || {};
    setRadioValue('fa-indicacao', indicacao.tipo);
    if (indicacao.tipo === 'cerimonial') setVal('fa-indicacao-cerimonial-qual', indicacao.detalhe);
    if (indicacao.tipo === 'indicacao_cliente') setVal('fa-indicacao-cliente-quem', indicacao.detalhe);
    if (indicacao.tipo === 'outro') setVal('fa-indicacao-outro-texto', indicacao.detalhe);

    const d = f.diagnostico || {};
    setRadioValue('fa-ja-experimentou', d.jaExperimentou);
    setVal('fa-vestido-quase-fechou', d.vestidoQuaseFechou);
    setRadioValue('fa-fase-decisao', d.faseDecisao);
    setRadioValue('fa-o-que-procura', d.oQueProcura);
    setRadioValue('fa-faixa-investimento', d.faixaInvestimento);
    setCheckedValues('fa-quem-decide', d.quemDecide || []);
    setVal('fa-quem-decide-outra-texto', d.quemDecideOutra);

    const p = f.prova || {};
    const modelos = p.modelosExperimentados || [];
    setVal('fa-modelo-1', modelos[0]);
    setVal('fa-modelo-2', modelos[1]);
    setVal('fa-modelo-3', modelos[2]);
    setVal('fa-modelo-4', modelos[3]);
    setVal('fa-modelo-favorito', p.modeloFavorito);
    setVal('fa-pergunta-mexeu', p.perguntaMexeu);
    setVal('fa-pergunta-gostou', p.perguntaGostou);
    setRadioValue('fa-seguranca-escolha', p.segurancaEscolha);

    const pr = f.proposta || {};
    setVal('fa-proposta-modelo', pr.modelo);
    setVal('fa-proposta-valor-oficial', pr.valorOficial);
    setVal('fa-proposta-condicao', pr.condicaoApresentada);
    setVal('fa-proposta-pagamento', pr.formaPagamento);
    setVal('fa-proposta-incluso', pr.incluso);
    setVal('fa-proposta-validade', pr.validade);

    const nf = f.naoFechou || {};
    setRadioValue('fa-motivo-impedimento', nf.motivoImpedimento);
    setVal('fa-motivo-impedimento-outro-texto', nf.motivoImpedimentoOutro);
    setVal('fa-obs-estilista', nf.observacaoEstilista);
    setVal('fa-condicao-ideal', nf.condicaoIdeal);

    const r = f.resultado || {};
    setRadioValue('fa-status-atendimento', r.status);
    setVal('fa-valor-contrato', r.valorContrato);
    setRadioValue('fa-categoria-fechou', r.categoria);
    setVal('fa-motivo-principal', r.motivoPrincipal);
    setVal('fa-proxima-acao', r.proximaAcao);
    setVal('fa-data-proximo-contato', r.dataProximoContato);
    setRadioValue('fa-motivo-perdida', r.motivoPerdida);
    setVal('fa-motivo-perdida-outro-texto', r.motivoPerdidaOutro);

    refreshFichaConditionals();
}

// 3. Save Client (Create/Update)
async function saveClient(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Salvando...';

    const id = document.getElementById('fa-id').value;
    const existing = id ? allClients.find(c => c.id === id) : null;
    const ficha = buildFichaFromForm();

    const data = {
        nome: val('fa-nome'),
        email: val('fa-email'),
        telefone: val('fa-whatsapp'),
        cpf: val('fa-cpf'),
        observacoes: val('fa-observacoes'),
        medidas: {
            busto: val('fa-medida-busto'),
            cintura: val('fa-medida-cintura'),
            quadril: val('fa-medida-quadril'),
            altura: val('fa-medida-altura'),
            ombro: val('fa-medida-ombro')
        },
        ficha,
        status: computeFunilStatus(ficha, existing ? existing.status : null),
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, 'clientes', id), data);
            alert('Ficha atualizada!');
        } else {
            data.dataCadastro = serverTimestamp();
            const ref = await addDoc(collection(db, 'clientes'), data);
            selectClient(ref.id); // Auto select new client
            alert('Cliente cadastrada!');
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

    // Resumo da Ficha de Atendimento
    const f = client.ficha || {};
    document.getElementById('view-data-casamento').textContent = formatDateBR(f.dataCasamento);
    document.getElementById('view-cidade-casamento').textContent = f.cidadeCasamento || '-';
    document.getElementById('view-instagram').textContent = f.instagram || '-';
    document.getElementById('view-numeracao').textContent = f.numeracao || '-';

    const indicacao = f.indicacao || {};
    document.getElementById('view-indicacao').textContent = indicacao.tipo
        ? (INDICACAO_LABELS[indicacao.tipo] || indicacao.tipo) + (indicacao.detalhe ? ` — ${indicacao.detalhe}` : '')
        : '-';

    const diagnostico = f.diagnostico || {};
    document.getElementById('view-procura').textContent = PROCURA_LABELS[diagnostico.oQueProcura] || '-';
    document.getElementById('view-faixa').textContent = FAIXA_LABELS[diagnostico.faixaInvestimento] || '-';
    const quemDecide = (diagnostico.quemDecide || []).map(v => QUEM_DECIDE_LABELS[v] || v);
    document.getElementById('view-quem-decide').textContent = quemDecide.length ? quemDecide.join(', ') : '-';

    const proposta = f.proposta || {};
    document.getElementById('view-modelo-escolhido').textContent = proposta.modelo || '-';
    document.getElementById('view-valor-proposta').textContent = proposta.valorOficial
        ? `R$ ${proposta.valorOficial}` + (proposta.condicaoApresentada ? ` (condição: R$ ${proposta.condicaoApresentada})` : '')
        : '-';

    const resultado = f.resultado || {};
    document.getElementById('view-proxima-acao').textContent = resultado.proximaAcao || '-';

    const badge = document.getElementById('view-resultado-badge');
    badge.textContent = resultado.status ? (STATUS_ATENDIMENTO_LABELS[resultado.status] || resultado.status) : 'Em andamento';
    badge.className = 'resultado-badge' + (resultado.status === 'fechou' ? ' is-won' : resultado.status === 'perdida' ? ' is-lost' : '');

    // Load Interactions & History
    loadInteractions(client.id);
    loadPurchaseHistory(client.nome); // Searching by name as per legacy system
}

function openEditClient() {
    const client = allClients.find(c => c.id === currentClientId);
    if (!client) return;

    populateFichaForm(client);
    document.getElementById('modal-title-client').innerText = 'Ficha de Atendimento — Continuar';
    openModal('modal-client');
}

function openNewClient() {
    formClient.reset();
    document.getElementById('fa-id').value = '';
    document.getElementById('modal-title-client').innerText = 'Ficha de Atendimento — Nova Cliente';
    refreshFichaConditionals();
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
