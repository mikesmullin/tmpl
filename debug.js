const TemplateParser = require('./tmpl.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Simple debug test
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-test-'));

const input = `int main() {
  u32 test_array[] = {
      // @block_default ARRAY_DEF
      // 0
      0,
      // @endblock
  };
  return 0;
}

// @block_replace ARRAY_DEF
//   1,

// @block_append ARRAY_DEF
//   2,`;

fs.writeFileSync(path.join(tempDir, 'test.c'), input);

const parser = new TemplateParser(false); // Debug mode
const globPattern = tempDir.replace(/\\/g, '/') + '/*.c';

console.log('Glob pattern:', globPattern);
console.log('Input file:', path.join(tempDir, 'test.c'));

parser.process(globPattern).then(() => {
  console.log('\nBlocks found:');
  for (const [blockId, blockInfo] of parser.blocks.entries()) {
    console.log(`${blockId}:`);
    console.log('  default:', blockInfo.default ? blockInfo.default.content : 'none');
    console.log('  replaces:', blockInfo.replaces.map(r => r.content));
    console.log('  appends:', blockInfo.appends.map(a => a.content));
  }

  const result = fs.readFileSync(path.join(tempDir, 'test.c'), 'utf8');
  console.log('\nResult:');
  console.log(result);

  // Clean up
  fs.unlinkSync(path.join(tempDir, 'test.c'));
  fs.rmdirSync(tempDir);
});
