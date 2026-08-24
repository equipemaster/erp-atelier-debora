import { ref, push, set, get, remove } from 'firebase/database';
import { database, auth } from './firebase-config.js';
import { checkAuth, logout } from './auth.js';
import Swal from 'sweetalert2';
import html2pdf from 'html2pdf.js';

checkAuth();
window.logout = logout;

// ---------------------------------------------------------------------------
// Toast / Loader (mesmo padrão visual usado em js/dashboard.js)
// ---------------------------------------------------------------------------
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const icon = type === 'error' ? '❌' : '✅';
  toast.textContent = `${icon} ${message}`;
  Object.assign(toast.style, {
    position: 'fixed', top: '20px', right: '20px', padding: '12px 20px',
    borderRadius: '8px', background: type === 'error' ? '#d9534f' : '#5cb85c',
    color: '#fff', fontWeight: 'bold', zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', opacity: '1', transition: 'opacity 0.5s ease',
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

function showLoader() {
  if (document.getElementById('loader')) return;
  const loader = document.createElement('div');
  loader.id = 'loader';
  Object.assign(loader.style, {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 10000,
  });
  loader.innerHTML = '<div style="border: 8px solid #f3f3f3; border-top: 8px solid #b38757; border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite;"></div>';
  document.body.appendChild(loader);
}

function hideLoader() {
  document.getElementById('loader')?.remove();
}

const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
document.head.appendChild(spinStyle);

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------------------------------------------------------------------------
// Schemas — descrevem cada tipo de dossiê de forma declarativa, para que um
// único motor de formulário/impressão sirva os três modelos.
// ---------------------------------------------------------------------------
const SCHEMAS = {
  colecao: {
    label: 'Coleção',
    icon: '👗',
    descricao: 'Peça autoral de coleção (editorial, acervo, aluguel)',
    subtitle: 'Dossiê Técnico — Coleção',
    tituloCampos: ['projeto', 'nomeVestido'],
    sections: [
      {
        title: 'Identificação', fields: [
          { key: 'projeto', label: 'Projeto (Coleção — Modelo)', type: 'text' },
          { key: 'codigo', label: 'Código', type: 'text' },
          { key: 'evento', label: 'Evento', type: 'text' },
          { key: 'dataLancamento', label: 'Data de Lançamento', type: 'date' },
          { key: 'destino', label: 'Destino', type: 'text' },
          { key: 'nomeVestido', label: 'Nome do Vestido', type: 'text' },
          { key: 'noiva', label: 'Noiva', type: 'checkbox' },
        ]
      },
      {
        title: 'Peças do Projeto', fields: [
          { key: 'pecas', label: 'Peças', type: 'checkboxGroup', options: ['Vestido', 'Véu', 'Corset', 'Capa', 'Sobressaia', 'Luvas', 'Anágua'] },
        ]
      },
      {
        title: 'Observação e Descrição Técnica', fields: [
          { key: 'observacao', label: 'Observação', type: 'textarea' },
          { key: 'descricaoTecnica', label: 'Descrição Técnica do Projeto', type: 'textarea', rows: 6 },
        ]
      },
      {
        title: 'Inspiração', fields: [
          { key: 'inspiracao', label: 'Imagens de Inspiração', type: 'images', max: 4 },
        ]
      },
      {
        title: 'Ficha Conceitual da Coleção', fields: [
          { key: 'conceitoModelo', label: 'Conceito do Modelo', type: 'textarea' },
          { key: 'dnaModelo', label: 'DNA do Modelo (separado por vírgula)', type: 'text' },
          { key: 'editorialModelo', label: 'Editorial — Modelo (corpo/silhueta)', type: 'text' },
          { key: 'editorialCenario', label: 'Editorial — Cenário', type: 'text' },
          { key: 'editorialLuz', label: 'Editorial — Luz', type: 'text' },
          { key: 'editorialComposicoes', label: 'Editorial — Composições', type: 'textarea' },
          { key: 'stylingCabelo', label: 'Styling — Cabelo', type: 'text' },
          { key: 'stylingMaquiagem', label: 'Styling — Maquiagem', type: 'text' },
          { key: 'stylingJoias', label: 'Styling — Jóias', type: 'text' },
          { key: 'stylingSapato', label: 'Styling — Sapato', type: 'text' },
          { key: 'stylingVeu', label: 'Styling — Véu', type: 'text' },
        ]
      },
      {
        title: 'Tecido Principal', fields: [
          { key: 'tpNome', label: 'Nome', type: 'text' },
          { key: 'tpCor', label: 'Cor', type: 'text' },
          { key: 'tpComposicao', label: 'Composição/Referência', type: 'text' },
          { key: 'tpLargura', label: 'Largura', type: 'text' },
          { key: 'tpQtdComprada', label: 'Quantidade comprada', type: 'text' },
          { key: 'tpQtdUtilizada', label: 'Quantidade utilizada', type: 'text' },
          { key: 'tpFornecedor', label: 'Fornecedor', type: 'text' },
          { key: 'tpData', label: 'Data', type: 'date' },
        ]
      },
      {
        title: 'Tecidos Complementares / Forro', fields: [
          { key: 'tecidosComplementares', label: 'Tecidos complementares', type: 'rows', maxRows: 4, columns: [{ key: 'tipo', label: 'Tipo' }, { key: 'cor', label: 'Cor' }, { key: 'qtd', label: 'Qtd.' }] },
          { key: 'vies', label: 'Viés', type: 'text' },
        ]
      },
      {
        title: 'Aviamentos, Rendas e Aplicações', fields: [
          { key: 'aviamentos', label: 'Aviamentos', type: 'checkboxGroup', options: ['Zíper invisível', 'Zíper destacável', 'Colchete', 'Botões de pérola', 'Cordão de espartilho', 'Viés', 'Crinol fino', 'Renda floral extra grande', 'Pérolas', 'Pedrarias', 'Flores 3D', 'Fita de cetim'] },
          { key: 'aviamentosOutros', label: 'Outros', type: 'textarea' },
        ]
      },
      {
        title: 'Estrutura Interna', fields: [
          { key: 'estruturaInterna', label: 'Estrutura interna', type: 'checkboxGroup', options: ['Entretela', 'Tela de alfaiataria', 'Barbatanas', 'Corset de tule', 'Bojo cuia', 'Casquinha', 'Enchimento', 'Crinol fino', 'Reforço', 'Anágua'] },
          { key: 'estruturaDetalhamento', label: 'Detalhamento', type: 'textarea' },
        ]
      },
      {
        title: 'Saia', fields: [
          { key: 'saia', label: 'Saia', type: 'checkboxGroup', options: ['Saia semi-sereia', 'Forro novo', 'Barra embutida com pesponto', 'Crinol fino na barra', 'Saia já cortada', 'Fitas internas'] },
          { key: 'aplicacaoRenda', label: 'Observações sobre a aplicação da renda', type: 'textarea' },
        ]
      },
      {
        title: 'Preparação e Controle dos Materiais', fields: [
          { key: 'preparacaoControle', label: 'Preparação e controle', type: 'checkboxGroup', options: ['Conferir cuia/bojo e materiais', 'Testar encolhimento', 'Corset já lavado', 'Descansar tecido', 'Passar antes do corte quando necessário', 'Entretelar', 'Engomar tule da parte superior', 'Saia já cortada'] },
          { key: 'materiaisFaltantes', label: 'Materiais faltantes', type: 'text' },
          { key: 'responsavelConferencia', label: 'Responsável pela conferência', type: 'text' },
          { key: 'dataConferencia', label: 'Data', type: 'date' },
          { key: 'observacoesTecnicas', label: 'Observações técnicas', type: 'textarea' },
        ]
      },
      {
        title: 'Modelagem e Corte', fields: [
          { key: 'modelagem', label: 'Modelagem', type: 'checkboxGroup', options: ['Corpo / corset', 'Saia', 'Manga', 'Cauda', 'Sobressaia', 'Peça inteira'] },
          { key: 'fechamento', label: 'Fechamento', type: 'checkboxGroup', options: ['Zíper', 'Espartilho', 'Botões', 'Colchete na saia', 'Outro'] },
          { key: 'alteracoesObs', label: 'Alterações / observações importantes', type: 'textarea' },
          { key: 'posicaoMoldes', label: 'Posição dos moldes / sequência / encaixe', type: 'textarea' },
          { key: 'sentidoTecido', label: 'Observação sobre o sentido do tecido', type: 'textarea' },
        ]
      },
      {
        title: 'Conferência Final do Corte', fields: [
          { key: 'conferenciaCorte', label: 'Conferência', type: 'checkboxGroup', options: ['Todas as partes cortadas', 'Peças identificadas', 'Fio e sentido conferidos', 'Entretela / estrutura cortada', 'Rendas / aplicações separadas', 'Sobras guardadas'] },
          { key: 'pendenciasCorte', label: 'Pendências', type: 'checkboxGroup', options: ['Nada', 'Faltou material', 'Mancha', 'Rasgo / defeito', 'Outro'] },
        ]
      },
      {
        title: 'Identificação e Arquivamento do Molde', fields: [
          { key: 'nomeMolde', label: 'Nome de identificação do molde', type: 'text' },
          { key: 'tipoMolde', label: 'Molde', type: 'radioGroup', options: ['Criado do zero', 'Adaptado', 'Base do ateliê', 'Moulage'] },
          { key: 'referenciaVersao', label: 'Referência / versão', type: 'text' },
          { key: 'criadoAdaptadoPor', label: 'Criado ou adaptado por', type: 'text' },
          { key: 'dataMolde', label: 'Data', type: 'date' },
          { key: 'guardadoEm', label: 'Guardado em', type: 'text' },
          { key: 'letraArquivo', label: 'Letra', type: 'text' },
          { key: 'tamanhoBase', label: 'Tamanho base da coleção', type: 'text' },
        ]
      },
      {
        title: 'Consumo Real de Materiais (m)', fields: [
          { key: 'consumo', label: 'Consumo', type: 'measurements', items: ['Corpo/corset — principal', 'Corpo/corset — forro', 'Saia — principal', 'Saia — forro', 'Cauda/sobressaia', 'Tule/renda', 'Mangas', 'Entretela/estrutura', 'Total utilizado', 'Sobra aproveitável'] },
        ]
      },
      {
        title: 'Status e Responsabilidade', fields: [
          { key: 'dobraTecido', label: 'Tecido', type: 'radioGroup', options: ['Aberto em uma camada', 'Dobra longitudinal', 'Dobra transversal'] },
          { key: 'sentidoCorte', label: 'Sentido', type: 'radioGroup', options: ['Fio reto', 'Fio atravessado', 'Viés', 'Com direção/brilho/pelo/desenho'] },
          { key: 'pendenciaProvidencia', label: 'Descrição da pendência / providência', type: 'textarea' },
          { key: 'dataCorte', label: 'Data do corte', type: 'date' },
          { key: 'responsavelCorte', label: 'Responsável', type: 'text' },
          { key: 'statusCorte', label: 'Status', type: 'radioGroup', options: ['Aprovado', 'Corrigir', 'Em espera'] },
        ]
      },
      {
        title: 'Acabamento', fields: [
          { key: 'acabamento', label: 'Acabamento', type: 'checkboxGroup', options: ['Colchetes conferidos', 'Zíper testado', 'Barra final revisada', 'Aplicação da renda concluída', 'Aplicações firmes', 'Limpeza de linhas', 'Revisão geral'] },
          { key: 'acabamentoObs', label: 'Observações', type: 'textarea' },
        ]
      },
      {
        title: 'Passadoria e Apresentação', fields: [
          { key: 'passadoria', label: 'Passadoria', type: 'checkboxGroup', options: ['Vestido vaporizado', 'Sem marcas de ferro', 'Volume conferido', 'Caimento aprovado', 'Fotografado', 'Pronto para editorial'] },
          { key: 'responsavelPassadoria', label: 'Responsável', type: 'text' },
          { key: 'dataPassadoria', label: 'Data', type: 'date' },
        ]
      },
      {
        title: 'Validação Final do Modelo', fields: [
          { key: 'controleQualidade', label: 'Controle de Qualidade', type: 'checkboxGroup', options: ['Direito e avesso revisados', 'Estrutura interna conferida', 'Corset aprovado', 'Saia aprovada', 'Três fitas internas da saia conferidas', 'Colchetes de segurança conferidos', 'Zíper funcionando perfeitamente', 'Simetria conferida', 'Acabamento interno aprovado', 'Acabamento externo aprovado'] },
          { key: 'validacaoPrototipo', label: 'Validação do Protótipo', type: 'checkboxGroup', options: ['Prova realizada no manequim', 'Prova realizada em modelo', 'Mobilidade aprovada', 'Caimento aprovado', 'Estrutura aprovada', 'Fotos do editorial realizadas', 'Modelo aprovado para coleção'] },
        ]
      },
      {
        title: 'Registro da Peça', fields: [
          { key: 'versaoPeca', label: 'Versão', type: 'radioGroup', options: ['Protótipo 01', 'Protótipo 02', 'Versão Final'] },
          { key: 'codigoInterno', label: 'Código interno', type: 'text' },
          { key: 'dataAprovacao', label: 'Data da aprovação', type: 'date' },
          { key: 'responsavelAprovacao', label: 'Responsável', type: 'text' },
          { key: 'observacoesFinais', label: 'Observações finais', type: 'textarea' },
        ]
      },
    ],
  },

  sobMedida: {
    label: 'Sob Medida',
    icon: '📏',
    descricao: 'Peça sob medida para cliente (debutante, noiva, festa)',
    subtitle: 'Dossiê Técnico — Sob Medida',
    tituloCampos: ['cliente', 'nomePeca'],
    sections: [
      {
        title: 'Identificação', fields: [
          { key: 'cliente', label: 'Cliente', type: 'text' },
          { key: 'evento', label: 'Evento', type: 'text' },
          { key: 'nomePeca', label: 'Nome da Peça (ex: Vestido Valsa)', type: 'text' },
          { key: 'dataEvento', label: 'Data do Evento', type: 'date' },
          { key: 'nomeVestido', label: 'Nome do Vestido', type: 'text' },
          { key: 'categoria', label: 'Categoria', type: 'text' },
          { key: 'modalidade', label: 'Modalidade', type: 'text' },
        ]
      },
      {
        title: 'Peças do Projeto', fields: [
          { key: 'pecas', label: 'Peças', type: 'checkboxGroup', options: ['Vestido', 'Corset', 'Saia', 'Anágua', 'Laço', 'Mangas', 'Ponteiras', 'Saia cascata assimétrica'] },
        ]
      },
      {
        title: 'Descrição Técnica', fields: [
          { key: 'descricaoTecnica', label: 'Descrição Técnica do Projeto', type: 'textarea', rows: 6 },
        ]
      },
      {
        title: 'Inspirações', fields: [
          { key: 'inspiracao', label: 'Imagens de Inspiração', type: 'images', max: 4 },
        ]
      },
      {
        title: 'Ficha de Medidas', fields: [
          { key: 'nomeMedidas', label: 'Nome', type: 'text' },
          { key: 'responsavelMedidas', label: 'Responsável', type: 'text' },
          { key: 'dataMedidas', label: 'Data das medidas', type: 'date' },
          {
            key: 'medidas', label: 'Medidas (cm)', type: 'measurements', items: [
              'Corpo frente', 'Altura do busto', 'Decote frente', 'Corpo costas', 'Decote costas', 'SS',
              'Altura do Corpinho', 'Ombro curto', 'Ombro Total', 'Altura da manga', 'Contorno do braço',
              'Cotovelo', 'Punho', 'Busto', 'Busto Frente', 'Acima do busto', 'Abaixo do busto', 'Altura abaixo',
              'Cava a cava frente', 'Cava a cava costas', 'Cava lateral', 'T', 'Cintura', 'Baixa', 'Quadril',
              'Quadril F', 'Quadril C', 'Saída sereia', 'Altura do quadril', 'Altura do joelho',
              'Altura da saia longa Frente', 'Lateral', 'Altura Saia curta', 'Cauda', 'Bojo',
            ]
          },
          { key: 'tipoBojo', label: 'Tipo de Bojo', type: 'radioGroup', options: ['Enchimento', 'Casca'] },
          { key: 'medidasCorset', label: 'Medidas do Corset (cm)', type: 'measurements', items: ['Meio Frente', 'Abaixo do Busto', 'Lateral Total', 'Costas Total'] },
          { key: 'fechamentoCorset', label: 'Fechamento do Corset', type: 'radioGroup', options: ['Zíper', 'Espartilho'] },
          { key: 'obsMedidas', label: 'Observações', type: 'textarea' },
          { key: 'concordoMedidas', label: 'Concordo com as minhas medidas (nome)', type: 'text' },
        ]
      },
      {
        title: 'Tecido Principal', fields: [
          { key: 'tpNome', label: 'Nome', type: 'text' },
          { key: 'tpCor', label: 'Cor', type: 'text' },
          { key: 'tpLarguraTotal', label: 'Largura total', type: 'text' },
          { key: 'tpLarguraUtil', label: 'Largura útil', type: 'text' },
          { key: 'tpQtdComprada', label: 'Quantidade comprada', type: 'text' },
          { key: 'tpQtdUtilizada', label: 'Quantidade utilizada', type: 'text' },
          { key: 'tpFornecedor', label: 'Fornecedor', type: 'text' },
          { key: 'tpData', label: 'Data', type: 'date' },
          { key: 'tpComposicao', label: 'Composição/Referência', type: 'text' },
        ]
      },
      {
        title: 'Tecidos Complementares / Forro', fields: [
          { key: 'tecidosComplementares', label: 'Tecidos complementares', type: 'rows', maxRows: 4, columns: [{ key: 'descricao', label: 'Descrição (tipo — cor)' }, { key: 'qtd', label: 'Qtd.' }] },
        ]
      },
      {
        title: 'Aviamentos, Rendas e Aplicações', fields: [
          { key: 'aviamentos', label: 'Aviamentos', type: 'checkboxGroup', options: ['Zíper invisível', 'Zíper destacável', 'Colchetes', 'Botões', 'Cordão de espartilho', 'Viés', 'Crinol', 'Fita estabilizadora', 'Renda/aplicação', 'Pérolas', 'Pedrarias', 'Flores 3D', 'Fitas internas'] },
          { key: 'aviamentosOutros', label: 'Outros / cor / tamanho / quantidade', type: 'textarea' },
        ]
      },
      {
        title: 'Estrutura Interna', fields: [
          { key: 'estruturaInterna', label: 'Estrutura interna', type: 'checkboxGroup', options: ['Entretela', 'Tela de alfaiataria', 'Barbatanas', 'Corset de crinol', 'Bojo', 'Enchimento', 'Crinol', 'Reforço', 'Anágua'] },
          { key: 'estruturaDetalhamento', label: 'Detalhamento', type: 'textarea' },
        ]
      },
      {
        title: 'Preparação e Controle dos Materiais', fields: [
          { key: 'preparacaoControle', label: 'Preparação e controle', type: 'checkboxGroup', options: ['Conferir cor e metragem', 'Testar encolhimento', 'Lavar / molhar', 'Descansar tecido', 'Passar antes do corte', 'Entretelar antes', 'Cortar duplo', 'Respeitar sentido, brilho, bordado ou estampa'] },
          { key: 'orientacaoPreparacao', label: 'Orientação', type: 'textarea' },
          { key: 'materiaisFaltantes', label: 'Materiais faltantes', type: 'text' },
          { key: 'responsavelConferencia', label: 'Responsável pela conferência', type: 'text' },
          { key: 'dataConferencia', label: 'Data', type: 'date' },
          { key: 'observacoesTecnicas', label: 'Observações técnicas', type: 'textarea' },
        ]
      },
      {
        title: 'Modelagem e Corte', fields: [
          { key: 'modelagem', label: 'Modelagem', type: 'checkboxGroup', options: ['Corpo / corset', 'Saia', 'Manga', 'Cauda', 'Sobressaia / saia cascata assimétrica', 'Peça inteira'] },
          { key: 'fechamento', label: 'Fechamento', type: 'checkboxGroup', options: ['Zíper destacável — corset', 'Zíper invisível — saia', 'Espartilho', 'Botões', 'Colchetes', 'Outro'] },
          { key: 'alteracoesObs', label: 'Alterações / observações importantes', type: 'textarea' },
          { key: 'posicaoMoldes', label: 'Posição dos moldes / sequência / encaixe', type: 'textarea' },
          { key: 'obsCorte', label: 'Observações do corte', type: 'textarea' },
          { key: 'preparacaoObrigatoria', label: 'Preparação obrigatória antes da montagem', type: 'textarea' },
        ]
      },
      {
        title: 'Conferência Final do Corte', fields: [
          { key: 'conferenciaCorte', label: 'Conferência', type: 'checkboxGroup', options: ['Todas as partes cortadas', 'Peças identificadas', 'Fio e sentido conferidos', 'Entretela / estrutura cortada', 'Rendas / aplicações separadas', 'Sobras guardadas'] },
          { key: 'pendenciasCorte', label: 'Pendências', type: 'checkboxGroup', options: ['Nada', 'Faltou material', 'Mancha', 'Rasgo / defeito', 'Outro'] },
        ]
      },
      {
        title: 'Identificação e Arquivamento do Molde', fields: [
          { key: 'nomeMolde', label: 'Nome de identificação do molde', type: 'text' },
          { key: 'tipoMolde', label: 'Molde', type: 'radioGroup', options: ['Criado do zero', 'Adaptado', 'Base do ateliê', 'Moulage', 'Outro projeto'] },
          { key: 'referenciaVersao', label: 'Referência / versão', type: 'text' },
          { key: 'modelistaResponsavel', label: 'Modelista responsável', type: 'text' },
          { key: 'dataMolde', label: 'Data', type: 'date' },
          { key: 'guardadoEm', label: 'Guardado em', type: 'text' },
          { key: 'letraArquivo', label: 'Letra', type: 'text' },
          { key: 'pendenciaProvidencia', label: 'Descrição da pendência / providência', type: 'textarea' },
        ]
      },
      {
        title: 'Consumo Real de Materiais (m)', fields: [
          { key: 'consumo', label: 'Consumo', type: 'measurements', items: ['Corpo/corset — principal', 'Corpo/corset — forro', 'Mangas', 'Saia — principal', 'Saia — forro', 'Sobra aproveitável', 'Cauda/sobressaia', 'Tule/renda', 'Entretela/estrutura', 'Total utilizado'] },
        ]
      },
      {
        title: 'Status e Responsabilidade', fields: [
          { key: 'dobraTecido', label: 'Tecido', type: 'radioGroup', options: ['Aberto em uma camada', 'Dobra longitudinal', 'Dobra transversal'] },
          { key: 'sentidoCorte', label: 'Sentido', type: 'radioGroup', options: ['Fio reto', 'Fio atravessado', 'Viés', 'Com direção/brilho/pelo/desenho'] },
          { key: 'dataCorte', label: 'Data do corte', type: 'date' },
          { key: 'responsavelCorte', label: 'Responsável', type: 'text' },
          { key: 'statusCorte', label: 'Status', type: 'radioGroup', options: ['Aprovado', 'Corrigir', 'Em espera'] },
        ]
      },
      {
        title: 'Costura e Provas', fields: [
          { key: 'responsavelCostura', label: 'Responsável pela costura', type: 'text' },
          { key: 'inicioCostura', label: 'Início', type: 'date' },
          {
            key: 'etapasCostura', label: 'Etapas concluídas', type: 'checkboxGroup', options: [
              '1. Preparação obrigatória', '2. Montagem do corset', '3. Estrutura e barbatanas', '4. Acabamento do corset',
              '5. Bojo', '6. Preparação da saia principal', '7. Franzido e montagem na cintura', '8. Saia cascata assimétrica',
              '9. Crescimento e estabilização da saia', '10. Primeira prova / conferência', '11. Barra e crinol',
              '12. Maxi laço', '13. Pedrarias e acabamento final', '14. Conferência final',
            ]
          },
          { key: 'dataManequim', label: 'Data de colocação no manequim', type: 'date' },
          { key: 'dataRetiradaManequim', label: 'Data de retirada do manequim', type: 'date' },
          { key: 'obsCostura', label: 'Observações da costura / provas', type: 'textarea' },
          { key: 'cuidadosObrigatorios', label: 'Cuidados obrigatórios', type: 'textarea' },
        ]
      },
      {
        title: 'Acabamento, Lavanderia e Passadoria', fields: [
          { key: 'acabamento', label: 'Acabamento', type: 'checkboxGroup', options: ['Colchetes', 'Zíper invisível', 'Zíper destacável', 'Flores 3D', 'Barra embutida'] },
          { key: 'detalheBarra', label: 'Detalhe da barra (ex: crinol, cm)', type: 'text' },
          { key: 'detalhesPendenciasAcabamento', label: 'Detalhes / pendências', type: 'textarea' },
          { key: 'cuidadosEspeciais', label: 'Cuidados especiais da peça', type: 'textarea' },
          { key: 'lavanderia', label: 'Lavanderia', type: 'checkboxGroup', options: ['Sem manchas', 'Com manchas', 'Lavagem manual', 'Limpeza localizada', 'Não lavar totalmente'] },
          { key: 'localMancha', label: 'Local da mancha', type: 'text' },
          { key: 'produtoUtilizado', label: 'Produto utilizado', type: 'text' },
          { key: 'obsLavanderia', label: 'Observações de lavanderia', type: 'textarea' },
          { key: 'passadoriaConferencia', label: 'Passadoria e conferência', type: 'checkboxGroup', options: ['Limpo', 'Seco', 'Passado', 'Sem linhas soltas', 'Aplicações firmes', 'Fechamentos testados'] },
          { key: 'dataPassadoria', label: 'Data', type: 'date' },
          { key: 'responsavelPassadoria', label: 'Responsável', type: 'text' },
          { key: 'obsPassadoria', label: 'Orientações de passadoria', type: 'textarea' },
        ]
      },
      {
        title: 'Checklist Final — Entrega e Devolução', fields: [
          { key: 'conferenciaEntrega', label: 'Conferência', type: 'checkboxGroup', options: ['Vestido aprovado', 'Direito e avesso revisados', 'Barra conferida', 'Sem manchas ou defeitos', 'Zíper / espartilho / botões / colchetes testados'] },
          { key: 'itensEntrega', label: 'Itens', type: 'checkboxGroup', options: ['Vestido', 'Corset', 'Saia', 'Sobressaia', 'Mangas', 'Anágua', 'Véu', 'Capa', 'Cabide'] },
          { key: 'outrosItens', label: 'Outros itens', type: 'text' },
          { key: 'retiradaData', label: 'Retirada — Data', type: 'date' },
          { key: 'retiradaHorario', label: 'Retirada — Horário', type: 'text' },
          { key: 'retiradoPor', label: 'Retirado por', type: 'text' },
          { key: 'retiradaTelefone', label: 'Telefone', type: 'text' },
          { key: 'clienteConferiu', label: 'Cliente conferiu e aprovou todos os itens', type: 'checkbox' },
          { key: 'devolucaoDataPrevista', label: 'Devolução — Data prevista', type: 'date' },
          { key: 'devolucaoHorario', label: 'Horário previsto', type: 'text' },
          { key: 'quemDevolvera', label: 'Quem devolverá', type: 'text' },
          { key: 'devolucaoTelefone', label: 'Telefone', type: 'text' },
          { key: 'devolucaoDataRecebida', label: 'Data recebida', type: 'date' },
          { key: 'devolucaoHorarioRecebido', label: 'Horário recebido', type: 'text' },
          { key: 'itensDevolucaoConferidos', label: 'Itens conferidos na devolução', type: 'checkboxGroup', options: ['Vestido', 'Acessórios', 'Capa', 'Cabide'] },
          { key: 'pendenciasAvarias', label: 'Pendências / avarias / danos', type: 'textarea' },
          { key: 'assinaturaDevolveu', label: 'Assinatura de quem devolveu (nome)', type: 'text' },
          { key: 'responsavelConferenciaDevolucao', label: 'Responsável pela conferência', type: 'text' },
        ]
      },
    ],
  },

  locacao: {
    label: 'Locação / Ajuste',
    icon: '📋',
    descricao: 'Ficha de prova, entrega e devolução de peça alugada',
    subtitle: 'Ficha de Prova, Entrega e Devolução — Locação',
    tituloCampos: ['cliente', 'vestido'],
    sections: [
      {
        title: 'Identificação', fields: [
          { key: 'cliente', label: 'Cliente', type: 'text' },
          { key: 'evento', label: 'Evento', type: 'text' },
          { key: 'dataEvento', label: 'Data do evento', type: 'date' },
          { key: 'horaEvento', label: 'Hora do evento', type: 'text' },
          { key: 'vestido', label: 'Vestido', type: 'text' },
          { key: 'sobressaia', label: 'Sobressaia', type: 'text' },
          { key: 'veu', label: 'Véu', type: 'text' },
          { key: 'anagua', label: 'Anágua', type: 'text' },
          { key: 'entregaData', label: 'Entrega — Data', type: 'date' },
          { key: 'entregaHora', label: 'Entrega — Hora', type: 'text' },
          { key: 'devolucaoData', label: 'Devolução — Data', type: 'date' },
          { key: 'devolucaoHora', label: 'Devolução — Hora', type: 'text' },
          { key: 'primeiraProvaData', label: 'Primeira prova — Data', type: 'date' },
          { key: 'primeiraProvaHora', label: 'Primeira prova — Hora', type: 'text' },
        ]
      },
      {
        title: 'Medidas', fields: [
          { key: 'medidas', label: 'Medidas (cm)', type: 'measurements', items: ['Busto', 'Cintura', 'Quadril', 'Corpo Frente', 'Altura do Busto', 'Altura Saia com salto'] },
        ]
      },
      {
        title: 'Calçado de Referência', fields: [
          { key: 'fotoRealizada', label: 'Foto realizada', type: 'checkbox' },
          { key: 'alturaSalto', label: 'Altura do salto (cm)', type: 'text' },
          { key: 'autorizaFoto', label: 'Cliente autoriza o registro fotográfico do calçado', type: 'checkbox' },
        ]
      },
      {
        title: 'Ajustes da 1ª Prova', fields: [
          { key: 'ajustes1Prova', label: 'Ajustes solicitados', type: 'textarea', rows: 5 },
        ]
      },
      {
        title: 'Primeiro Destino e Observações', fields: [
          { key: 'primeiroDestino', label: 'Destino', type: 'checkboxGroup', options: ['Modelagem', 'Corte', 'Costura', 'Acabamento', 'Lavanderia', 'Conferência final'] },
          { key: 'observacoesGerais', label: 'Observações', type: 'textarea', rows: 5 },
        ]
      },
      {
        title: '1ª Prova', fields: [
          { key: 'prova1Data', label: 'Data', type: 'date' },
          { key: 'prova1Hora', label: 'Hora', type: 'text' },
          { key: 'prova1Responsavel', label: 'Responsável', type: 'text' },
          { key: 'prova1Obs', label: 'Observações', type: 'textarea' },
          { key: 'prova1AjustesSolicitados', label: 'Ajustes solicitados', type: 'textarea' },
          { key: 'prova1Aprovacao', label: 'Aprovação', type: 'radioGroup', options: ['Aprovado', 'Ajustar', 'Nova prova'] },
          { key: 'prova1Destino', label: 'Destino', type: 'radioGroup', options: ['Modelagem', 'Costura', 'Acabamento', 'Lavanderia', 'ENTREGA'] },
        ]
      },
      {
        title: '2ª Prova ou Entrega', fields: [
          { key: 'prova2Data', label: 'Data', type: 'date' },
          { key: 'prova2Hora', label: 'Hora', type: 'text' },
          { key: 'prova2Responsavel', label: 'Responsável', type: 'text' },
          { key: 'prova2Obs', label: 'Observações', type: 'textarea' },
        ]
      },
      {
        title: 'Itens', fields: [
          { key: 'itens', label: 'Itens', type: 'checkboxGroup', options: ['Vestido', 'Cabide', 'Véu', 'Anágua', 'Capa', 'Luvas', 'Mangas', 'Cinto', 'Removíveis', 'Laço'] },
          { key: 'outrosItens', label: 'Outros', type: 'text' },
        ]
      },
      {
        title: 'Checklist Final — Vestido Conferido pela Equipe', fields: [
          { key: 'checklistCostura', label: 'Costura — responsável', type: 'text' },
          { key: 'checklistAcabamento', label: 'Acabamento — responsável', type: 'text' },
          { key: 'checklistLavanderia', label: 'Lavanderia — responsável', type: 'text' },
          { key: 'checklistModelagemCorte', label: 'Modelagem/Corte — responsável', type: 'text' },
          { key: 'fotosEntrega', label: 'Fotos da entrega realizadas', type: 'radioGroup', options: ['Sim', 'Não'] },
        ]
      },
      {
        title: 'Retirada', fields: [
          { key: 'retiradaData', label: 'Data', type: 'date' },
          { key: 'retiradaHorario', label: 'Horário', type: 'text' },
          { key: 'retiradoPor', label: 'Retirado por', type: 'text' },
          { key: 'retiradaTelefone', label: 'Telefone', type: 'text' },
          { key: 'clienteConferiu', label: 'Cliente conferiu e aprovou todos os itens', type: 'checkbox' },
        ]
      },
      {
        title: 'Devolução — Aluguel', fields: [
          { key: 'devolucaoDataPrevista', label: 'Data prevista', type: 'date' },
          { key: 'devolucaoHorarioPrevisto', label: 'Horário previsto', type: 'text' },
          { key: 'quemDevolvera', label: 'Quem devolverá', type: 'text' },
          { key: 'devolucaoTelefone', label: 'Telefone', type: 'text' },
          { key: 'devolucaoDataRecebida', label: 'Data recebida', type: 'date' },
          { key: 'devolucaoHorarioRecebido', label: 'Horário recebido', type: 'text' },
          { key: 'itensConferidos', label: 'Itens conferidos', type: 'checkboxGroup', options: ['Vestido', 'Acessórios', 'Capa', 'Cabide'] },
          { key: 'pendenciasAvarias', label: 'Pendências / avarias / danos', type: 'textarea' },
          { key: 'assinaturaDevolveu', label: 'Assinatura de quem devolveu (nome)', type: 'text' },
          { key: 'responsavelConferencia', label: 'Responsável pela conferência', type: 'text' },
        ]
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let currentType = null;
let currentId = null;
let currentCreatedAt = null;
let currentData = {};

const tipoGrid = document.getElementById('tipoGrid');
const listaDossies = document.getElementById('listaDossies');
const filtroDossies = document.getElementById('filtroDossies');
const viewSelector = document.getElementById('viewSelector');
const viewForm = document.getElementById('viewForm');
const formTitulo = document.getElementById('formTitulo');
const formContainer = document.getElementById('formContainer');
const btnExcluir = document.getElementById('btnExcluir');

// ---------------------------------------------------------------------------
// Tela de seleção de tipo + listagem
// ---------------------------------------------------------------------------
function renderTipoGrid() {
  tipoGrid.innerHTML = Object.entries(SCHEMAS).map(([key, schema]) => `
    <div class="tipo-card" data-tipo="${key}">
      <div class="tipo-icon">${schema.icon}</div>
      <h3>${escapeHtml(schema.label)}</h3>
      <p>${escapeHtml(schema.descricao)}</p>
    </div>
  `).join('');
  tipoGrid.querySelectorAll('.tipo-card').forEach((card) => {
    card.addEventListener('click', () => novoDossie(card.dataset.tipo));
  });
}

function tituloDoRegistro(tipo, campos) {
  const schema = SCHEMAS[tipo];
  if (!schema) return 'Sem nome';
  for (const key of schema.tituloCampos) {
    if (campos?.[key]) return campos[key];
  }
  return 'Sem nome';
}

async function renderLista(filtro = '') {
  listaDossies.innerHTML = '<p class="vazio">Carregando...</p>';
  try {
    const snap = await get(ref(database, 'dossies'));
    const registros = [];
    snap.forEach((child) => {
      registros.push({ id: child.key, ...child.val() });
    });
    registros.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));

    const termo = filtro.trim().toLowerCase();
    const filtrados = termo
      ? registros.filter((r) => tituloDoRegistro(r.tipo, r.campos).toLowerCase().includes(termo))
      : registros;

    if (!filtrados.length) {
      listaDossies.innerHTML = '<p class="vazio">Nenhum dossiê salvo ainda.</p>';
      return;
    }

    listaDossies.innerHTML = filtrados.map((r) => {
      const schema = SCHEMAS[r.tipo];
      const titulo = tituloDoRegistro(r.tipo, r.campos);
      const data = r.atualizadoEm ? new Date(r.atualizadoEm).toLocaleString('pt-BR') : '';
      return `
        <div class="dossie-item">
          <div class="info">
            <span class="titulo"><span class="badge-tipo">${escapeHtml(schema?.label || r.tipo)}</span>${escapeHtml(titulo)}</span>
            <span class="meta">Atualizado em ${data}</span>
          </div>
          <div class="acoes">
            <button type="button" class="btn-secundario" data-abrir="${r.id}">Abrir</button>
            <button type="button" data-pdf="${r.id}">🧾 PDF</button>
            <button type="button" class="btn-perigo" data-excluir="${r.id}">Excluir</button>
          </div>
        </div>
      `;
    }).join('');

    listaDossies.querySelectorAll('[data-abrir]').forEach((btn) => {
      btn.addEventListener('click', () => abrirDossie(btn.dataset.abrir));
    });
    listaDossies.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', () => excluirDossie(btn.dataset.excluir));
    });
    listaDossies.querySelectorAll('[data-pdf]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await abrirDossie(btn.dataset.pdf, { permanecerNaLista: true });
        await gerarPDF();
      });
    });
  } catch (err) {
    listaDossies.innerHTML = '<p class="vazio">Erro ao carregar dossiês.</p>';
    showToast('Erro ao carregar dossiês: ' + err.message, 'error');
  }
}

filtroDossies.addEventListener('input', () => renderLista(filtroDossies.value));

// ---------------------------------------------------------------------------
// Motor de formulário (data-driven)
// ---------------------------------------------------------------------------
function renderField(field) {
  const value = currentData[field.key];

  if (field.type === 'text' || field.type === 'date') {
    return `
      <div class="field">
        <label>${escapeHtml(field.label)}</label>
        <input type="${field.type}" data-key="${field.key}" value="${escapeHtml(value || '')}">
      </div>
    `;
  }

  if (field.type === 'textarea') {
    return `
      <div class="field field-full">
        <label>${escapeHtml(field.label)}</label>
        <textarea data-key="${field.key}" rows="${field.rows || 3}">${escapeHtml(value || '')}</textarea>
      </div>
    `;
  }

  if (field.type === 'checkbox') {
    return `
      <div class="field">
        <label class="checkbox-pill" style="width:fit-content;">
          <input type="checkbox" data-key="${field.key}" ${value ? 'checked' : ''}>
          ${escapeHtml(field.label)}
        </label>
      </div>
    `;
  }

  if (field.type === 'checkboxGroup') {
    const groupValue = value || {};
    return `
      <div class="field field-full">
        <label>${escapeHtml(field.label)}</label>
        <div class="checkbox-group">
          ${field.options.map((opt) => `
            <label class="checkbox-pill">
              <input type="checkbox" data-group="${field.key}" data-option="${escapeHtml(opt)}" ${groupValue[opt] ? 'checked' : ''}>
              ${escapeHtml(opt)}
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (field.type === 'radioGroup') {
    return `
      <div class="field field-full">
        <label>${escapeHtml(field.label)}</label>
        <div class="checkbox-group">
          ${field.options.map((opt) => `
            <label class="checkbox-pill">
              <input type="radio" name="${field.key}" data-key="${field.key}" value="${escapeHtml(opt)}" ${value === opt ? 'checked' : ''}>
              ${escapeHtml(opt)}
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (field.type === 'measurements') {
    const items = value || {};
    return `
      <div class="field field-full">
        <label>${escapeHtml(field.label)}</label>
        <div class="measure-grid">
          ${field.items.map((item) => `
            <div class="mitem">
              <label>${escapeHtml(item)}</label>
              <input type="text" data-group="${field.key}" data-item="${escapeHtml(item)}" value="${escapeHtml(items[item] || '')}">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (field.type === 'rows') {
    const rows = value || [];
    return `
      <div class="field field-full">
        <label>${escapeHtml(field.label)}</label>
        <table class="rows-table">
          <thead><tr>${field.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${Array.from({ length: field.maxRows }).map((_, i) => `
              <tr>
                ${field.columns.map((c) => `
                  <td><input type="text" data-group="${field.key}" data-row="${i}" data-col="${c.key}" value="${escapeHtml(rows[i]?.[c.key] || '')}"></td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (field.type === 'images') {
    return `
      <div class="field field-full">
        <label>${escapeHtml(field.label)}</label>
        <div class="img-upload-grid" id="imgThumbs_${field.key}"></div>
        <input type="file" accept="image/*" multiple data-images-key="${field.key}">
      </div>
    `;
  }

  return '';
}

function renderImageThumbs(fieldKey) {
  const el = document.getElementById(`imgThumbs_${fieldKey}`);
  if (!el) return;
  const imgs = currentData[fieldKey] || [];
  el.innerHTML = imgs.map((img, i) => `
    <div class="img-thumb">
      ${img.url ? `<img src="${img.url}" alt="Inspiração">` : ''}
      <button type="button" class="remover" data-remove-img="${fieldKey}:${i}">✕</button>
      ${img.status === 'processando' ? '<div class="status">Processando...</div>' : ''}
    </div>
  `).join('');
  el.querySelectorAll('[data-remove-img]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [key, idx] = btn.dataset.removeImg.split(':');
      currentData[key].splice(Number(idx), 1);
      renderImageThumbs(key);
    });
  });
}

function renderForm() {
  const schema = SCHEMAS[currentType];
  formTitulo.textContent = `${schema.icon} ${schema.label}`;
  formContainer.innerHTML = schema.sections.map((section) => `
    <div class="dossie-section">
      <h3>${escapeHtml(section.title)}</h3>
      <div class="field-grid">
        ${section.fields.map(renderField).join('')}
      </div>
    </div>
  `).join('');

  schema.sections.forEach((section) => {
    section.fields.forEach((field) => {
      if (field.type === 'images') renderImageThumbs(field.key);
    });
  });
}

// Delegação de eventos: evita re-renderizar o form inteiro a cada tecla
formContainer.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.key && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio'))) {
    currentData[t.dataset.key] = t.value;
  } else if (t.dataset.group && t.dataset.item !== undefined) {
    currentData[t.dataset.group] = currentData[t.dataset.group] || {};
    currentData[t.dataset.group][t.dataset.item] = t.value;
  } else if (t.dataset.group && t.dataset.row !== undefined && t.dataset.col) {
    currentData[t.dataset.group] = currentData[t.dataset.group] || [];
    currentData[t.dataset.group][Number(t.dataset.row)] = currentData[t.dataset.group][Number(t.dataset.row)] || {};
    currentData[t.dataset.group][Number(t.dataset.row)][t.dataset.col] = t.value;
  }
});

formContainer.addEventListener('change', (e) => {
  const t = e.target;
  if (t.type === 'checkbox' && t.dataset.key) {
    currentData[t.dataset.key] = t.checked;
  } else if (t.type === 'checkbox' && t.dataset.group && t.dataset.option) {
    currentData[t.dataset.group] = currentData[t.dataset.group] || {};
    currentData[t.dataset.group][t.dataset.option] = t.checked;
  } else if (t.type === 'radio' && t.dataset.key) {
    currentData[t.dataset.key] = t.value;
  } else if (t.type === 'file' && t.dataset.imagesKey) {
    handleImageFiles(t);
  }
});

// Imagens são convertidas para base64 embutido (em vez de URL do Firebase
// Storage) para que a geração de PDF via html2canvas não dependa de CORS
// configurado no bucket. Redimensiona antes para manter o registro leve.
function resizeImageToDataUrl(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageFiles(inputEl) {
  const fieldKey = inputEl.dataset.imagesKey;
  const files = Array.from(inputEl.files || []);
  inputEl.value = '';
  if (!files.length) return;
  currentData[fieldKey] = currentData[fieldKey] || [];

  for (const file of files) {
    const entry = { url: '', status: 'processando' };
    currentData[fieldKey].push(entry);
    renderImageThumbs(fieldKey);

    try {
      entry.url = await resizeImageToDataUrl(file);
      delete entry.status;
    } catch (err) {
      showToast('Erro ao processar imagem: ' + err.message, 'error');
      const idx = currentData[fieldKey].indexOf(entry);
      if (idx !== -1) currentData[fieldKey].splice(idx, 1);
    }
    renderImageThumbs(fieldKey);
  }
}

// ---------------------------------------------------------------------------
// Navegação entre telas
// ---------------------------------------------------------------------------
function mostrarLista() {
  viewSelector.style.display = 'block';
  viewForm.style.display = 'none';
  renderLista(filtroDossies.value);
}

function mostrarForm() {
  viewSelector.style.display = 'none';
  viewForm.style.display = 'block';
  window.scrollTo({ top: 0 });
}

function novoDossie(tipo) {
  currentType = tipo;
  currentId = push(ref(database, 'dossies')).key;
  currentCreatedAt = null;
  currentData = {};
  btnExcluir.style.display = 'none';
  renderForm();
  mostrarForm();
}

async function abrirDossie(id, { permanecerNaLista = false } = {}) {
  showLoader();
  try {
    const snap = await get(ref(database, 'dossies/' + id));
    if (!snap.exists()) {
      showToast('Dossiê não encontrado.', 'error');
      return;
    }
    const registro = snap.val();
    currentType = registro.tipo;
    currentId = id;
    currentCreatedAt = registro.criadoEm || null;
    currentData = registro.campos || {};
    btnExcluir.style.display = 'inline-block';
    renderForm();
    if (!permanecerNaLista) mostrarForm();
  } catch (err) {
    showToast('Erro ao abrir dossiê: ' + err.message, 'error');
  } finally {
    hideLoader();
  }
}

window.voltarParaLista = mostrarLista;

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------
async function salvarDossie() {
  if (!currentId || !currentType) return;
  showLoader();
  try {
    const agora = Date.now();
    await set(ref(database, 'dossies/' + currentId), {
      tipo: currentType,
      criadoEm: currentCreatedAt || agora,
      atualizadoEm: agora,
      criadoPor: auth.currentUser?.email || null,
      campos: currentData,
    });
    currentCreatedAt = currentCreatedAt || agora;
    btnExcluir.style.display = 'inline-block';
    showToast('Dossiê salvo com sucesso!');
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    hideLoader();
  }
}

async function excluirDossie(id) {
  const result = await Swal.fire({
    title: 'Excluir dossiê?',
    text: 'Essa ação não pode ser desfeita.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Excluir',
    cancelButtonText: 'Cancelar',
  });
  if (!result.isConfirmed) return;
  showLoader();
  try {
    await remove(ref(database, 'dossies/' + id));
    showToast('Dossiê excluído.');
    renderLista(filtroDossies.value);
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  } finally {
    hideLoader();
  }
}

async function excluirDossieAtual() {
  if (!currentId) return;
  await excluirDossie(currentId);
  mostrarLista();
}

window.salvarDossie = salvarDossie;
window.excluirDossieAtual = excluirDossieAtual;

// ---------------------------------------------------------------------------
// Geração de PDF (html2pdf.js)
// ---------------------------------------------------------------------------
function printFieldHtml(field) {
  const value = currentData[field.key];

  if (field.type === 'text' || field.type === 'date') {
    return `<div><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(value || '—')}</div>`;
  }
  if (field.type === 'checkbox') {
    return `<div>${value ? '☑' : '☐'} ${escapeHtml(field.label)}</div>`;
  }
  return '';
}

function printSectionHtml(section) {
  const simpleFields = section.fields.filter((f) => f.type === 'text' || f.type === 'date' || f.type === 'checkbox');
  const otherFields = section.fields.filter((f) => !['text', 'date', 'checkbox'].includes(f.type));

  let html = `<div class="print-section"><h3>${escapeHtml(section.title)}</h3>`;

  if (simpleFields.length) {
    html += `<div class="print-field-grid">${simpleFields.map(printFieldHtml).join('')}</div>`;
  }

  otherFields.forEach((field) => {
    const value = currentData[field.key];
    if (field.type === 'textarea') {
      html += `<div class="print-field-grid full" style="margin-top:4px;"><div><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(value || '—').replace(/\n/g, '<br>')}</div></div>`;
    } else if (field.type === 'checkboxGroup') {
      const groupValue = value || {};
      html += `<div style="margin-top:4px;"><strong>${escapeHtml(field.label)}:</strong></div>`;
      html += `<div class="print-checklist">${field.options.map((opt) => `<div>${groupValue[opt] ? '☑' : '☐'} ${escapeHtml(opt)}</div>`).join('')}</div>`;
    } else if (field.type === 'radioGroup') {
      html += `<div style="margin-top:4px;"><strong>${escapeHtml(field.label)}:</strong></div>`;
      html += `<div class="print-checklist">${field.options.map((opt) => `<div>${value === opt ? '(X)' : '( )'} ${escapeHtml(opt)}</div>`).join('')}</div>`;
    } else if (field.type === 'measurements') {
      const items = value || {};
      html += `<div style="margin-top:4px;"><strong>${escapeHtml(field.label)}:</strong></div>`;
      html += `<div class="print-measure">${field.items.map((item) => `<div>${escapeHtml(item)}: <strong>${escapeHtml(items[item] || '—')}</strong></div>`).join('')}</div>`;
    } else if (field.type === 'rows') {
      const rows = (value || []).filter((r) => r && Object.values(r).some((v) => v));
      if (rows.length) {
        html += `<div style="margin-top:4px;"><strong>${escapeHtml(field.label)}:</strong></div>`;
        html += `<table style="width:100%; font-size:0.72rem; border-collapse:collapse;">`;
        html += `<tr>${field.columns.map((c) => `<th style="text-align:left; border-bottom:1px solid #ccc;">${escapeHtml(c.label)}</th>`).join('')}</tr>`;
        rows.forEach((row) => {
          html += `<tr>${field.columns.map((c) => `<td style="border-bottom:1px solid #eee;">${escapeHtml(row[c.key] || '')}</td>`).join('')}</tr>`;
        });
        html += `</table>`;
      }
    } else if (field.type === 'images') {
      const imgs = (value || []).filter((img) => img.url && !img.status);
      if (imgs.length) {
        html += `<div style="margin-top:4px;"><strong>${escapeHtml(field.label)}:</strong></div>`;
        html += `<div class="print-images">${imgs.map((img) => `<img src="${img.url}">`).join('')}</div>`;
      }
    }
  });

  html += '</div>';
  return html;
}

async function gerarPDF() {
  if (!currentType) return;
  const schema = SCHEMAS[currentType];
  const printArea = document.getElementById('printArea');

  showLoader();
  try {
    printArea.innerHTML = `
      <div class="print-page">
        <div class="print-header">
          <h1>${escapeHtml(schema.subtitle)}</h1>
          <div class="print-brand">DÉBORA FREITAS<small>ATELIÊ</small></div>
        </div>
        ${schema.sections.map(printSectionHtml).join('')}
        <div class="print-footer">Gerado em ${new Date().toLocaleString('pt-BR')} — Ateliê Débora Freitas</div>
      </div>
    `;

    const titulo = tituloDoRegistro(currentType, currentData) || 'dossie';
    const nomeArquivo = `${schema.label} - ${titulo}`.replace(/[^\w\s-]/g, '').trim() + '.pdf';

    await html2pdf().set({
      margin: 0,
      filename: nomeArquivo,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: '.print-section' },
    }).from(printArea.firstElementChild).save();
  } catch (err) {
    showToast('Erro ao gerar PDF: ' + err.message, 'error');
  } finally {
    printArea.innerHTML = '';
    hideLoader();
  }
}

window.gerarPDF = gerarPDF;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
renderTipoGrid();
mostrarLista();
