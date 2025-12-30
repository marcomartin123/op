import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const advfnCookie = env.ADVFN_COOKIE || process.env.ADVFN_COOKIE || '';
  const advfnBaseUrl = env.ADVFN_BASE_URL || process.env.ADVFN_BASE_URL || '/api-advfn';
  const yahooBaseUrl = env.YAHOO_BASE_URL || process.env.YAHOO_BASE_URL || '/api-yahoo';
  const apiKey = env.API_KEY || process.env.API_KEY;

  return {
    plugins: [react()],
    define: {
      // Permite que o codigo use process.env.API_KEY conforme exigido pelas diretrizes
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.ADVFN_BASE_URL': JSON.stringify(advfnBaseUrl),
      'process.env.YAHOO_BASE_URL': JSON.stringify(yahooBaseUrl),
    },
    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api-oplab': {
          target: 'https://opcoes.oplab.com.br',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-oplab/, ''),
          headers: {
            'Origin': 'https://opcoes.oplab.com.br',
            'Referer': 'https://opcoes.oplab.com.br/pt-br/acoes/opcoes/PETR4/janeiro/2027',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        },
        '/api-statusinvest': {
          target: 'https://statusinvest.com.br',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-statusinvest/, ''),
          headers: {
            'Origin': 'https://statusinvest.com.br',
            'Referer': 'https://statusinvest.com.br/acoes/proventos/ibovespa',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        },
        '/api-advfn': {
          target: 'https://br.advfn.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-advfn/, ''),
          headers: {
            'Origin': 'https://br.advfn.com',
            'Referer': 'https://br.advfn.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'pt-BR,pt;q=0.9,es;q=0.8',
            'Cache-Control': 'max-age=0',
            'Upgrade-Insecure-Requests': '1',
            'Cookie': advfnCookie
          }
        },
        '/api-yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-yahoo/, ''),
          headers: {
            'Origin': 'https://finance.yahoo.com',
            'Referer': 'https://finance.yahoo.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        }
      }
    }
  };
});
