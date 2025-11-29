const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'package.json');
let content = fs.readFileSync(filePath, 'utf8');
// BOM varsa kaldır
content = content.replace(/^\uFEFF/, '');
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ package.json BOM temizlendi');
