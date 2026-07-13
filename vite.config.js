import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
        vendas: resolve(__dirname, 'vendas.html')
      }
    }
  }
});
