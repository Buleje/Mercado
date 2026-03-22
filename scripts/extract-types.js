/* eslint-disable @typescript-eslint/no-require-imports -- Node.js CJS script */
const fs = require('fs');
const path = require('path');

const dir = 'components/admin';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

const typesToRemove = ['Product', 'Sale', 'SaleItem', 'Purchase', 'PurchaseItem', 'Supplier', 'Customer'];

function removeTypes(code) {
  let result = code;
  for (const t of typesToRemove) {
    const regex = new RegExp(`(?:type\\s+${t}\\s*=\\s*\\{|interface\\s+${t}\\s*\\{)`);
    
    while(true) {
      const match = result.match(regex);
      if (!match) break;
      
      const startIdx = match.index;
      let braceCount = 0;
      let inBlock = false;
      let endIdx = -1;
      
      for (let i = startIdx; i < result.length; i++) {
        if (result[i] === '{') {
          braceCount++;
          inBlock = true;
        } else if (result[i] === '}') {
          braceCount--;
        }
        
        if (inBlock && braceCount === 0) {
          endIdx = i;
          break;
        }
      }
      
      if (endIdx !== -1) {
        let actualEnd = endIdx + 1;
        if (result[actualEnd] === ';') actualEnd++;
        if (result[actualEnd] === '\n') actualEnd++;
        else if (result[actualEnd] === '\r' && result[actualEnd+1] === '\n') actualEnd += 2;
        
        result = result.substring(0, startIdx) + result.substring(actualEnd);
      } else {
        break; // prevents infinite loops on malformed syntax
      }
    }
    
    // Also remove any single-line type alias that doesn't use { } (e.g. type Product = any;)
    const singleLineRegex = new RegExp(`type\\s+${t}\\s*=\\s*[^;{]+;\\r?\\n?`, 'g');
    result = result.replace(singleLineRegex, '');
  }
  return result;
}

let modifiedCount = 0;

files.forEach(f => {
  const filePath = path.join(dir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  const newContent = removeTypes(content);
  
  if (content !== newContent) {
    const usedTypes = typesToRemove.filter(t => new RegExp(`\\b${t}\\b`).test(newContent));
    
    if (usedTypes.length > 0) {
      const importStr = `import type { ${usedTypes.join(', ')} } from "@/types/erp";\n`;
      // find last import
      const lastImportIdx = newContent.lastIndexOf('import ');
      if (lastImportIdx !== -1) {
        const endOfLastImport = newContent.indexOf('\n', lastImportIdx) + 1;
        content = newContent.substring(0, endOfLastImport) + importStr + newContent.substring(endOfLastImport);
      } else {
        const useClientMatch = newContent.match(/["']use client["'];?\s*/);
        if (useClientMatch) {
          content = newContent.substring(0, useClientMatch[0].length) + importStr + newContent.substring(useClientMatch[0].length);
        } else {
          content = importStr + newContent;
        }
      }
    } else {
      content = newContent;
    }
    
    fs.writeFileSync(filePath, content);
    modifiedCount++;
    console.log(`Cleaned types in: ${f}`);
  }
});

console.log(`\nSuccessfully cleaned duplicate types in ${modifiedCount} files.`);
