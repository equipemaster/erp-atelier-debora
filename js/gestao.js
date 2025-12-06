const firebaseConfig = {
    apiKey: "AIzaSyDHWdwZ-SyOZjvUv9blUv1m70m5CvaOs8o",
    authDomain: "erp-ateliedebora-275e7.firebaseapp.com",
    projectId: "erp-ateliedebora-275e7",
    storageBucket: "erp-ateliedebora-275e7.firebasestorage.app",
    messagingSenderId: "375960061963",
    appId: "1:375960061963:web:ca29e2881ad03c3a2b1f0e",
    measurementId: "G-ZTCE581F5W"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

const etapasKanban = [
    "Modelagem",
    "Corte",
    "Costura",
    "Acabamento",
    "Prova",
    "Ajuste",
    "Lavanderia",
    "Finalizado"
];

// Check Authentication
auth.onAuthStateChanged(user => {
    if (!user) {
        alert('Você precisa estar logado.');
        window.location.href = 'index.html';
        return;
    }

    // Real-time updates
    db.ref('projetos').on('value', (snapshot) => {
        const data = snapshot.val();
        if (document.getElementById('kanbanContainer')) {
            atualizarKanban(data);
        }
        if (document.getElementById('tabelaCronograma')) {
            gerarCronogramaSemanal(data);
        }
    });
});

/**
 * Updates the Kanban Board
 */
function atualizarKanban(projetos) {
    const kanbanContainer = document.getElementById('kanbanContainer');
    if (!kanbanContainer) return;

    kanbanContainer.innerHTML = '';

    // Create Columns
    etapasKanban.forEach(etapa => {
        const colId = `coluna-${etapa.toLowerCase().replace(/\s+/g, '')}`;
        const coluna = document.createElement('div');
        coluna.className = 'kanban-coluna';
        coluna.id = colId;
        coluna.innerHTML = `<h3>${etapa}</h3><div class="cards-container"></div>`;
        kanbanContainer.appendChild(coluna);
    });

    if (!projetos) return;

    // Add Projects to Columns
    Object.keys(projetos).forEach(key => {
        const projeto = projetos[key];
        if (!projeto.statusAtual) return;

        // Normalize status to find column
        const statusKey = projeto.statusAtual.toLowerCase().replace(/\s+/g, '');
        const colunaDestino = document.getElementById(`coluna-${statusKey}`);

        if (colunaDestino) {
            const container = colunaDestino.querySelector('.cards-container');
            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.setAttribute('data-id', key);

            const dataFormatada = formatarData(projeto.dataEntrega);

            card.innerHTML = `
        <strong>${projeto.nome}</strong>
        <div style="font-size:0.85em; color:#555;">${projeto.tipoProjeto || 'Costura'}</div>
        <div style="margin-top:5px; font-size:0.8em;">
          📅 ${dataFormatada} ${projeto.horaEntrega ? 'às ' + projeto.horaEntrega : ''}
        </div>
      `;
            container.appendChild(card);
        }
    });
}

/**
 * Generates Weekly Schedule (Monday to Friday of current week)
 */
function gerarCronogramaSemanal(projetos) {
    const tabela = document.getElementById('tabelaCronograma');
    if (!tabela) return;

    const diasUteis = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    tabela.innerHTML = '';

    // Create columns for days
    diasUteis.forEach((dia, index) => {
        const coluna = document.createElement('div');
        coluna.className = 'dia-coluna';
        coluna.innerHTML = `
      <h4>${dia}</h4>
      <div id="dia-${index}" class="dia-conteudo"></div>
    `;
        tabela.appendChild(coluna);
    });

    if (!projetos) return;

    const hoje = new Date();
    // Calculate Monday of current week
    const dayOfWeek = hoje.getDay(); // 0 (Sun) - 6 (Sat)
    const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sun, go back 6 days. Else go back to Mon.
    const mondayDate = new Date(hoje);
    mondayDate.setDate(hoje.getDate() + distToMonday);
    mondayDate.setHours(0, 0, 0, 0);

    // Friday is Monday + 4 days
    const fridayDate = new Date(mondayDate);
    fridayDate.setDate(mondayDate.getDate() + 4);
    fridayDate.setHours(23, 59, 59, 999);

    Object.values(projetos).forEach(projeto => {
        if (!projeto.dataEntrega) return;
        const status = (projeto.statusAtual || '').toLowerCase().trim();
        if (status === 'finalizado') return;

        // Handle date format potentially being YYYY-MM-DD
        const entrega = new Date(projeto.dataEntrega + 'T12:00:00'); // Add time to avoid timezone offsets shifting day

        // Check if within current week ranges
        if (entrega >= mondayDate && entrega <= fridayDate) {
            let dayIndex = entrega.getDay();

            if (dayIndex >= 1 && dayIndex <= 5) {
                const targetIndex = dayIndex - 1;
                const targetContainer = document.getElementById(`dia-${targetIndex}`);

                if (targetContainer) {
                    const card = document.createElement('div');
                    card.className = 'cronograma-card';
                    card.innerHTML = `
            <strong>${projeto.nome}</strong><br>
            ${projeto.tipoProjeto || '-'}<br>
            📅 ${projeto.dataEntrega.split('-').reverse().join('/')}
          `;
                    targetContainer.appendChild(card);
                }
            }
        }
    });
}

function formatarData(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}`;
}
