const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Remove scripts antigos do firebase
  content = content.replace(/\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/9\.22\.2\/[-a-z.]+\.js"><\/script>/g, '');
  
  // Adiciona o novo se não tiver
  if (!content.includes('/js/firebase-config.js')) {
      content = content.replace(/(<\/head>)/i, '  <script type="module" src="/js/firebase-config.js"></script>\n$1');
  }
  
  // Regex para remover bloco init do firebase, cuidando pra não ser ganancioso demais
  const initRegex = /const\s+firebaseConfig\s*=\s*\{[\s\S]*?\};\s*firebase\.initializeApp\(firebaseConfig\);\s*(?:const\s+auth\s*=\s*firebase\.auth\(\);?\s*)?(?:const\s+db\s*=\s*firebase\.database\(\);?\s*)?(?:const\s+firestore\s*=\s*firebase\.firestore\(\);?\s*)?/g;
  content = content.replace(initRegex, '');

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Migrado:', file);
});
