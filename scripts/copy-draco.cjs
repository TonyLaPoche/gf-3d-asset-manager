const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const source = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco')
const target = path.join(root, 'public', 'draco')

if (!fs.existsSync(source)) {
  console.error('Décodeur Draco introuvable dans three. Relancez npm install.')
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })
console.log('Décodeur Draco copié.')
