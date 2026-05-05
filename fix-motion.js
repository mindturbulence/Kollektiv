const fs = require('fs');
const path = require('path');

const dirs = ['./components', './contexts'];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const filePath = path.join(dir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes("from 'framer-motion'")) {
        content = content.replace(/from 'framer-motion'/g, "from 'motion/react'");
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', filePath);
      }
    }
  }
}
