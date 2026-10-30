#!/usr/bin/env node
// Auditoria conservadora: reporta candidatos; nunca altera CSS.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const walk = (dir, extensions) => {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path, extensions));
    else if (extensions.some(ext => entry.name.endsWith(ext))) found.push(path);
  }
  return found;
};
const sourceFiles = walk(join(root, 'src'), ['.tsx', '.ts', '.jsx', '.js', '.html']);
const sources = sourceFiles.map(path => ({ path, content: readFileSync(path, 'utf8') }));
const cssFiles = walk(join(root, 'src'), ['.css']);
const css = cssFiles.map(path => ({ path, content: readFileSync(path, 'utf8') }));
const names = new Map();
for (const file of css) {
  for (const match of file.content.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
    const name = match[1];
    if (!names.has(name)) names.set(name, new Set());
    names.get(name).add(file.path.replace(root + '/', ''));
  }
}
const uncertain = [];
for (const [name, files] of names) {
  const present = sources.some(file => file.content.includes(name));
  if (!present) uncertain.push({ name, files: [...files] });
}
console.log('Ficheiros de código analisados:', sourceFiles.length);
console.log('Ficheiros CSS analisados:', cssFiles.length);
console.log('Classes CSS sem correspondência textual direta:', uncertain.length);
for (const item of uncertain.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log('REVER', item.name, item.files.join(', '));
}
console.log('\nATENÇÃO: falsos positivos possíveis (classes dinâmicas, bibliotecas, HTML externo, pseudoestados). Não apagar automaticamente.');
