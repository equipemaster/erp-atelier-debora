import { defineConfig } from 'vite';
import { resolve } from 'path';

// Publicado como GitHub Pages de projeto em equipemaster.github.io/erp-atelier-debora/,
// não na raiz do domínio — sem isso, caminhos absolutos (ex: /js/firebase-config.js)
// resolveriam para a raiz do domínio e dariam 404. Em dev (`npm run dev`) mantém base '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/erp-atelier-debora/' : '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        crm: resolve(__dirname, 'crm.html'),
        contas: resolve(__dirname, 'contas.html'),
        cronograma: resolve(__dirname, 'cronograma.html'),
        gestao: resolve(__dirname, 'gestao.html'),
        home: resolve(__dirname, 'home.html'),
        produtos: resolve(__dirname, 'produtos.html'),
        projetos: resolve(__dirname, 'projetos.html'),
        relatorios: resolve(__dirname, 'relatorios.html'),
        saida: resolve(__dirname, 'saida.html'),
        tarefas: resolve(__dirname, 'tarefas.html'),
        vendas: resolve(__dirname, 'vendas.html')
      }
    }
  }
}));
