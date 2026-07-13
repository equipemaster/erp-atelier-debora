
    import { ref, get, onValue, push, update, remove } from 'firebase/database';
    import { database as db } from '/js/firebase-config.js';

    // Configuração do Firebase
    // Etapas do Kanban em ordem lógica, por categoria, SEM "Finalizado" (ele é apenas para histórico).
    // Sob Medida passa pela produção completa. Locação já existe pronta, então pula
    // Modelagem/Corte/Costura e vai direto para acabamento/prova/ajuste/lavanderia.
    const etapasPorCategoria = {
      sob_medida: ["Modelagem", "Corte", "Costura", "Acabamento", "Prova", "Ajuste", "Lavanderia"],
      locacao: ["Acabamento", "Prova", "Ajuste", "Lavanderia"]
    };

    let categoriaAtiva = 'sob_medida';
    let projetosCacheKanban = {};

    function etapasDaCategoria(categoria) {
      return etapasPorCategoria[categoria] || etapasPorCategoria.sob_medida;
    }

    // Projetos antigos não têm o campo "categoria" salvo; inferimos pelo texto do tipo.
    function inferirCategoria(projeto) {
      if (projeto.categoria && etapasPorCategoria[projeto.categoria]) return projeto.categoria;
      const tipo = (projeto.tipoProjeto || '').toLowerCase();
      return tipo.includes('locação') || tipo.includes('locacao') ? 'locacao' : 'sob_medida';
    }

    function projetoAtrasado(projeto) {
      if (!projeto.dataLimiteInicio) return false;
      const limite = new Date(projeto.dataLimiteInicio + 'T00:00:00');
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const aindaNaoIniciou = !Array.isArray(projeto.etapas) || projeto.etapas.length <= 1;
      return aindaNaoIniciou && limite < hoje;
    }

    function mudarTab(categoria) {
      categoriaAtiva = categoria;
      document.getElementById('tabSobMedida').classList.toggle('active', categoria === 'sob_medida');
      document.getElementById('tabLocacao').classList.toggle('active', categoria === 'locacao');
      desenharKanban();
    }

    function popularSelectEtapas(selectEl, categoria, valorAtual) {
      selectEl.innerHTML = '';
      etapasDaCategoria(categoria).forEach(etapa => {
        const option = document.createElement('option');
        option.value = etapa;
        option.textContent = etapa;
        selectEl.appendChild(option);
      });
      if (valorAtual && etapasDaCategoria(categoria).includes(valorAtual)) {
        selectEl.value = valorAtual;
      }
    }

    function atualizarEtapasIniciais() {
      const categoria = document.getElementById('categoriaProjeto').value;
      const statusInicial = document.getElementById('statusInicial');
      if (!categoria) {
        statusInicial.disabled = true;
        statusInicial.innerHTML = '<option value="" disabled selected>Selecione a categoria primeiro</option>';
        return;
      }
      statusInicial.disabled = false;
      popularSelectEtapas(statusInicial, categoria);
    }

    function atualizarEtapasEdicao() {
      const categoria = document.getElementById('editCategoria').value;
      const statusAtualAnterior = document.getElementById('editStatusAtual').value;
      popularSelectEtapas(document.getElementById('editStatusAtual'), categoria, statusAtualAnterior);
    }

    // Fecha a etapa em aberto e abre a nova, mantendo o histórico de tempo por etapa
    function transicionarEtapas(etapas, statusAntigo, statusNovo) {
      etapas = Array.isArray(etapas) ? etapas.filter(e => e && e.nome) : [];
      const etapaAtiva = etapas.find(e => e.nome === statusAntigo && e.fim === null);
      if (etapaAtiva) {
        etapaAtiva.fim = Date.now();
      } else if (etapas.length > 0) {
        etapas[etapas.length - 1].fim = Date.now();
      }
      etapas.push({ nome: statusNovo, inicio: Date.now(), fim: null });
      return etapas;
    }

    // Função para formatar milissegundos em HH:MM:SS
    function formatarTempo(ms) {
      if (ms === null || isNaN(ms) || ms < 0) return "00h 00m 00s"; // Garante que não exiba N/A ou valores negativos
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const pad = (num) => num.toString().padStart(2, '0');
      return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    }

    // Função para cadastrar um novo projeto
    function cadastrarProjeto() {
      const nome = document.getElementById('nomeProjeto').value.trim();
      const categoria = document.getElementById('categoriaProjeto').value;
      const status = document.getElementById('statusInicial').value;
      const data = document.getElementById('dataEntrega').value;
      const hora = document.getElementById('horaEntrega').value;
      const dataLimiteInicio = document.getElementById('dataLimiteInicio').value;
      const tipo = document.getElementById('tipoProjeto').value;

      // Validação simples
      if (!nome || !categoria || !status || !data || !hora || tipo === 'Tipo') {
        alert('Por favor, preencha todos os campos para cadastrar o projeto.');
        return;
      }

      const projeto = {
        nome,
        categoria,
        statusAtual: status,
        dataEntrega: data,
        horaEntrega: hora,
        dataLimiteInicio: dataLimiteInicio || null,
        tipoProjeto: tipo,
        etapas: [{ nome: status, inicio: Date.now(), fim: null }] // Adicionado 'fim: null' para a etapa inicial
      };

      // Salva o projeto no Firebase
      push(ref(db, 'projetos'), projeto).then(() => {
        alert('Projeto cadastrado com sucesso! ✅');
        // Limpa o formulário após o cadastro
        document.getElementById('nomeProjeto').value = '';
        document.getElementById('categoriaProjeto').value = '';
        atualizarEtapasIniciais();
        document.getElementById('dataEntrega').value = '';
        document.getElementById('horaEntrega').value = '';
        document.getElementById('dataLimiteInicio').value = '';
        document.getElementById('tipoProjeto').value = 'Tipo';
        // As funções desenharKanban e desenharHistorico são chamadas automaticamente pelo 'on("value")'
      }).catch(error => {
        console.error("Erro ao cadastrar projeto:", error);
        alert("Ocorreu um erro ao cadastrar o projeto. Por favor, tente novamente.");
      });
    }
    // Função voltarEtapa
    async function voltarEtapa(id, statusAtual, categoria) {
      const etapasCategoria = etapasDaCategoria(categoria);
      const currentIndex = etapasCategoria.indexOf(statusAtual);

      if (currentIndex <= 0) {
        alert("Este projeto já está na primeira etapa.");
        return;
      }

      const projetoRef = ref(db, 'projetos/' + id);
      await get(projetoRef).then(async snapshot => {
        const projeto = snapshot.val();
        if (!projeto) return;

        const etapaAnterior = etapasCategoria[currentIndex - 1];
        const etapas = transicionarEtapas(projeto.etapas, statusAtual, etapaAnterior);

        await update(projetoRef, {
          statusAtual: etapaAnterior,
          etapas: etapas
        });

        alert(`Projeto retornado para: ${etapaAnterior} 👈`);
      }).catch(error => {
        console.error("Erro ao retornar etapa:", error);
        alert("Ocorreu um erro ao retornar a etapa do projeto.");
      });
    }

    function iniciarListenerKanban() {
      onValue(ref(db, 'projetos'), (snapshot) => {
        projetosCacheKanban = snapshot.val() || {};
        desenharKanban();
      });
    }

    function desenharKanban() {
      const kanbanContainer = document.getElementById('kanbanContainer');
      kanbanContainer.innerHTML = '';

      const etapasAtual = etapasDaCategoria(categoriaAtiva);

      // Create Columns structure
      etapasAtual.forEach(etapa => {
        const coluna = document.createElement('div');
        const colId = `coluna-${etapa.toLowerCase().replace(/\s/g, '')}`;
        coluna.id = colId;
        coluna.className = 'kanban-coluna';

        // Structure: Header + Cards Container
        coluna.innerHTML = `
            <h3>${etapa}</h3>
            <div class="cards-container" id="${colId}-cards"></div>
        `;
        kanbanContainer.appendChild(coluna);
      });

      const projetosRaw = projetosCacheKanban;

      if (projetosRaw) {
        // Sort projects by Date/Time
        const sortedEntries = Object.entries(projetosRaw).sort(([, a], [, b]) => {
          const dateA = new Date(`${a.dataEntrega} ${a.horaEntrega}`);
          const dateB = new Date(`${b.dataEntrega} ${b.horaEntrega}`);
          return dateA - dateB;
        });

        sortedEntries.forEach(([key, projeto]) => {
          if (inferirCategoria(projeto) !== categoriaAtiva) return;

          const termoBusca = document.getElementById('campoBusca')?.value.toLowerCase() || '';
          if (termoBusca && !projeto.nome.toLowerCase().includes(termoBusca)) return;

          if (etapasAtual.includes(projeto.statusAtual)) {
            const card = document.createElement('div');
            card.classList.add('kanban-card');
            const atrasado = projetoAtrasado(projeto);
            if (atrasado) card.classList.add('atrasado');
            card.setAttribute('data-id', key);
            const dt = new Date(projeto.dataEntrega);
            const formattedDate = new Intl.DateTimeFormat('pt-BR').format(dt);

            // Determine Back/Next buttons
            let navButtons = '';
            const currentIndex = etapasAtual.indexOf(projeto.statusAtual);

            if (currentIndex > 0) {
              navButtons += `<button class="btn-nav back" onclick="voltarEtapa('${key}', '${projeto.statusAtual}', '${categoriaAtiva}')">⬅ Voltar</button>`;
            }
            // Always show Next/Finish
            navButtons += `<button class="btn-nav next" onclick="avancarEtapa('${key}', '${projeto.statusAtual}', '${categoriaAtiva}')">Próximo ➡</button>`;

            card.innerHTML = `
                <div class="kanban-card-header">
                    <div class="kanban-card-title">${projeto.nome}</div>
                    <div class="kanban-card-options">
                        <button class="btn-icon" title="Editar" onclick="abrirModalEdicao('${key}', '${projeto.nome}', '${projeto.dataEntrega}', '${projeto.horaEntrega}', '${projeto.tipoProjeto}', '${categoriaAtiva}', '${projeto.dataLimiteInicio || ''}', '${projeto.statusAtual}')">✏️</button>
                        <button class="btn-icon" title="Excluir" onclick="deletarProjeto('${key}')">🗑️</button>
                    </div>
                </div>

                <div class="kanban-card-info">
                    ${projeto.tipoProjeto}<br>
                    📅 ${formattedDate} às ${projeto.horaEntrega}
                </div>
                ${atrasado ? '<div class="kanban-card-alerta">⚠️ Atrasado p/ iniciar</div>' : ''}

                <div class="kanban-card-nav">
                    ${navButtons}
                </div>
              `;

            const colId = `coluna-${projeto.statusAtual.toLowerCase().replace(/\s/g, '')}`;
            const cardsContainer = document.getElementById(`${colId}-cards`);
            if (cardsContainer) {
              cardsContainer.appendChild(card);
            }
          }
        });
      }
    }

    async function avancarEtapa(id, statusAtual, categoria) {
      const etapasCategoria = etapasDaCategoria(categoria);
      const currentIndex = etapasCategoria.indexOf(statusAtual);
      if (currentIndex === -1) {
        alert("Status atual inválido.");
        return;
      }

      // Check if it is the last stage
      const isLastStage = currentIndex === etapasCategoria.length - 1;
      const proximoStatus = isLastStage ? "Finalizado" : etapasCategoria[currentIndex + 1];

      if (isLastStage) {
        if (!confirm("Deseja finalizar este projeto? Ele sairá do Kanban e irá para o Histórico.")) {
          return;
        }
      }

      const projetoRef = ref(db, 'projetos/' + id);
      await get(projetoRef).then(async snapshot => {
        const projeto = snapshot.val();
        if (!projeto) return;

        const etapas = transicionarEtapas(projeto.etapas, statusAtual, proximoStatus);

        await update(projetoRef, {
          statusAtual: proximoStatus,
          etapas: etapas
        });

        if (isLastStage) {
          alert(`Projeto FINALIZADO com sucesso! 🎉 Veja no Histórico abaixo.`);
        } else {
          alert(`Projeto avançado para: ${proximoStatus} 👍`);
        }
      }).catch(error => {
        console.error("Erro ao avançar etapa:", error);
        alert("Ocorreu um erro ao avançar a etapa do projeto.");
      });
    }

    function deletarProjeto(id) {
      if (confirm('Tem certeza que deseja excluir este projeto permanentemente? Essa ação não pode ser desfeita.')) {
        remove(ref(db, 'projetos/' + id)).then(() => {
          alert('Projeto excluído com sucesso! 🗑️');
        }).catch(error => {
          console.error("Erro ao excluir projeto:", error);
          alert("Ocorreu um erro ao excluir o projeto.");
        });
      }
    }

    let projetosCache = {};

    function desenharHistorico() {
      const historicoContainer = document.getElementById('historicoContainer');
      // Initial Loading Indicator
      historicoContainer.innerHTML = '<p style="text-align:center; padding: 20px;">Carregando histórico...</p>';

      onValue(ref(db, 'projetos'), (snapshot) => {
        projetosCache = snapshot.val() || {};
        renderizarTabelaHistorico();
      });
    }

    function renderizarTabelaHistorico() {
      const historicoContainer = document.getElementById('historicoContainer');
      const filtroElement = document.getElementById('filtroHistorico');
      const filtro = filtroElement ? filtroElement.value.toLowerCase() : '';

      historicoContainer.innerHTML = '';
      let projetosFinalizados = [];

      Object.keys(projetosCache).forEach(key => {
        const projeto = projetosCache[key];
        if (projeto.statusAtual === 'Finalizado') {
          if (filtro === '' || (projeto.nome && projeto.nome.toLowerCase().includes(filtro))) {
            projetosFinalizados.push({ id: key, ...projeto });
          }
        }
      });

      if (projetosFinalizados.length === 0) {
        historicoContainer.innerHTML = '<p class="no-data" style="text-align:center; padding:20px;">Nenhum projeto finalizado encontrado.</p>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const tbody = document.createElement('tbody');
      const headerRow = document.createElement('tr');

      ['Nome do Projeto', 'Tipo', 'Data de Entrega', 'Hora de Entrega', 'Etapas (Tempo Gasto)', 'Tempo Total', 'Ações'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      projetosFinalizados.forEach(projeto => {
        const row = document.createElement('tr');

        const tdNome = document.createElement('td');
        tdNome.textContent = projeto.nome;
        row.appendChild(tdNome);

        const tdTipo = document.createElement('td');
        tdTipo.textContent = projeto.tipoProjeto;
        row.appendChild(tdTipo);

        const tdData = document.createElement('td');
        tdData.textContent = projeto.dataEntrega;
        row.appendChild(tdData);

        const tdHora = document.createElement('td');
        tdHora.textContent = projeto.horaEntrega;
        row.appendChild(tdHora);

        const tdEtapas = document.createElement('td');
        const ulEtapas = document.createElement('ul');
        let tempoTotalProjeto = 0;

        if (projeto.etapas) {
          projeto.etapas.forEach(etapa => {
            const inicio = etapa.inicio;
            const fim = etapa.fim;
            let tempoGasto = null;
            if (inicio && fim) {
              tempoGasto = fim - inicio;
              tempoTotalProjeto += tempoGasto;
            }
            if (tempoGasto !== null) { // Only show steps with time? Or all steps? Logic was implicit.
              const li = document.createElement('li');
              li.textContent = `${etapa.nome}: ${formatarTempo(tempoGasto)}`;
              ulEtapas.appendChild(li);
            }
          });
        }
        tdEtapas.appendChild(ulEtapas);
        row.appendChild(tdEtapas);

        const tdTempoTotal = document.createElement('td');
        tdTempoTotal.textContent = formatarTempo(tempoTotalProjeto);
        row.appendChild(tdTempoTotal);

        const tdAcoes = document.createElement('td');
        tdAcoes.classList.add('historico-actions');

        const btnRestaurar = document.createElement('button');
        btnRestaurar.textContent = 'Restaurar';
        btnRestaurar.style.backgroundColor = '#007bff';
        btnRestaurar.style.marginBottom = '5px';
        btnRestaurar.style.width = '100%';
        const categoriaRestauro = inferirCategoria(projeto);
        btnRestaurar.onclick = () => restaurarProjeto(projeto.id, etapasDaCategoria(categoriaRestauro)[0]);
        tdAcoes.appendChild(btnRestaurar);

        const btnExcluir = document.createElement('button');
        btnExcluir.textContent = 'Excluir';
        btnExcluir.style.backgroundColor = '#dc3545';
        btnExcluir.style.width = '100%';
        btnExcluir.onclick = () => deletarProjeto(projeto.id);
        tdAcoes.appendChild(btnExcluir);

        row.appendChild(tdAcoes);
        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      historicoContainer.appendChild(table);
    }

    let projetoIdEdicao = null;

    function abrirModalEdicao(id, nome, data, hora, tipo, categoria, dataLimiteInicio, statusAtual) {
      projetoIdEdicao = id;
      document.getElementById('editNome').value = nome;
      document.getElementById('editData').value = data;
      document.getElementById('editHora').value = hora;
      document.getElementById('editDataLimiteInicio').value = dataLimiteInicio || '';
      document.getElementById('editTipo').value = tipo;
      document.getElementById('editCategoria').value = categoria;
      popularSelectEtapas(document.getElementById('editStatusAtual'), categoria, statusAtual);
      document.getElementById('modalEdicao').style.display = 'block';
    }

    function salvarEdicao() {
      const id = projetoIdEdicao;
      const novoNome = document.getElementById('editNome').value.trim();
      const novaData = document.getElementById('editData').value;
      const novaHora = document.getElementById('editHora').value;
      const novaDataLimiteInicio = document.getElementById('editDataLimiteInicio').value;
      const novoTipo = document.getElementById('editTipo').value;
      const novaCategoria = document.getElementById('editCategoria').value;
      const novoStatusAtual = document.getElementById('editStatusAtual').value;

      if (!novoNome || !novaData || !novaHora || !novoTipo || !novaCategoria || !novoStatusAtual) {
        alert('Por favor, preencha todos os campos para editar o projeto.');
        return;
      }

      const projetoRef = ref(db, 'projetos/' + id);
      get(projetoRef).then(snapshot => {
        const projeto = snapshot.val();
        if (!projeto) return Promise.resolve();

        const statusMudou = projeto.statusAtual !== novoStatusAtual;
        const etapas = statusMudou
          ? transicionarEtapas(projeto.etapas, projeto.statusAtual, novoStatusAtual)
          : (projeto.etapas || []);

        return update(projetoRef, {
          nome: novoNome,
          dataEntrega: novaData,
          horaEntrega: novaHora,
          dataLimiteInicio: novaDataLimiteInicio || null,
          tipoProjeto: novoTipo,
          categoria: novaCategoria,
          statusAtual: novoStatusAtual,
          etapas: etapas
        });
      }).then(() => {
        alert('Projeto atualizado com sucesso! ✨');
        document.getElementById('modalEdicao').style.display = 'none';
      }).catch(error => {
        console.error("Erro ao salvar edição:", error);
        alert("Ocorreu um erro ao salvar as edições do projeto.");
      });
    }

    async function restaurarProjeto(id, primeiraEtapa) {
      if (confirm('Tem certeza que deseja restaurar este projeto para a primeira etapa do Kanban (\"' + primeiraEtapa + '\")?')) {
        const projetoRefRestaurar = ref(db, 'projetos/' + id);
        await get(projetoRefRestaurar).then(async snapshot => {
          const projeto = snapshot.val();
          let etapas = projeto.etapas || [];

          const ultimaEtapa = etapas[etapas.length - 1];
          if (ultimaEtapa && ultimaEtapa.nome === 'Finalizado' && ultimaEtapa.fim === null) {
            ultimaEtapa.fim = Date.now();
          }

          etapas.push({ nome: primeiraEtapa, inicio: Date.now(), fim: null });

          return update(projetoRefRestaurar, {
            statusAtual: primeiraEtapa,
            etapas: etapas
          });
        }).then(() => {
          alert('Projeto restaurado com sucesso! 🎉 Ele agora está de volta ao quadro Kanban.');
        }).catch(error => {
          console.error("Erro ao restaurar projeto:", error);
          alert("Ocorreu um erro ao restaurar o projeto.");
        });
      }
    }

    // Script de módulo: funções chamadas via onclick/onchange inline no HTML
    // precisam ser expostas explicitamente no escopo global.
    window.cadastrarProjeto = cadastrarProjeto;
    window.mudarTab = mudarTab;
    window.desenharKanban = desenharKanban;
    window.renderizarTabelaHistorico = renderizarTabelaHistorico;
    window.salvarEdicao = salvarEdicao;
    window.atualizarEtapasIniciais = atualizarEtapasIniciais;
    window.atualizarEtapasEdicao = atualizarEtapasEdicao;
    window.voltarEtapa = voltarEtapa;
    window.avancarEtapa = avancarEtapa;
    window.abrirModalEdicao = abrirModalEdicao;
    window.deletarProjeto = deletarProjeto;

    document.addEventListener('DOMContentLoaded', () => {
      iniciarListenerKanban();
      desenharHistorico();
    });
  