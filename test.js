#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const TemplateParser = require('./tmpl.js');

class TestRunner {
  constructor() {
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.tempDir = null;
  }

  async setup() {
    // Create a temporary directory for test files
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-test-'));
    console.log(`Test directory: ${this.tempDir}`);
  }

  async cleanup() {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      // Remove all files in temp directory
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
      fs.rmdirSync(this.tempDir);
    }
  }

  createTestFile(filename, content) {
    const filePath = path.join(this.tempDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  readTestFile(filename) {
    const filePath = path.join(this.tempDir, filename);
    return fs.readFileSync(filePath, 'utf8');
  }

  normalizeLineEndings(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  async runTest(testName, testFn) {
    this.testCount++;
    try {
      console.log(`\n--- Test ${this.testCount}: ${testName} ---`);

      // Clean up temp directory before each test
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }

      await testFn();
      this.passCount++;
      console.log(`✅ PASS: ${testName}`);
    } catch (error) {
      this.failCount++;
      console.log(`❌ FAIL: ${testName}`);
      console.log(`Error: ${error.message}`);
      if (error.expected && error.actual) {
        console.log('Expected:');
        console.log(error.expected);
        console.log('Actual:');
        console.log(error.actual);
      }
    }
  }

  assertEqual(expected, actual, message = '') {
    const normalizedExpected = this.normalizeLineEndings(expected);
    const normalizedActual = this.normalizeLineEndings(actual);

    if (normalizedExpected !== normalizedActual) {
      const error = new Error(`Assertion failed: ${message}`);
      error.expected = normalizedExpected;
      error.actual = normalizedActual;
      throw error;
    }
  }

  async testSingleFileWithReplaceAndAppend() {
    const input = `int main() {
  u32 test_array[] = {
      // @block_default ARRAY_DEF
      //   0,
      0,
      // @endblock
  };
  return 0;
}

// @block_replace ARRAY_DEF
//   1,

// @block_append ARRAY_DEF
//   2,`;

    const expected = `int main() {
  u32 test_array[] = {
      // @block_default ARRAY_DEF
      //   0,
      1,
      2,
      // @endblock
  };
  return 0;
}

// @block_replace ARRAY_DEF
//   1,

// @block_append ARRAY_DEF
//   2,`;

    this.createTestFile('test1.c', input);

    const parser = new TemplateParser(true); // Silent mode for tests
    // Use forward slashes for glob pattern
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('test1.c');
    this.assertEqual(expected, result, 'Single file with replace and append');
  }

  async testDefaultContentOnly() {
    const input = `int main() {
  u32 test_array[] = {
      // @block_default ARRAY_DEF
      //   0,
      0,
      // @endblock
  };
  return 0;
}`;

    const expected = `int main() {
  u32 test_array[] = {
      // @block_default ARRAY_DEF
      //   0,
      0,
      // @endblock
  };
  return 0;
}`;

    this.createTestFile('test2.c', input);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('test2.c');
    this.assertEqual(expected, result, 'Default content only should use default');
  }

  async testDifferentIndentationAndContent() {
    const input = `guess what?
  // @block_default burrito
  i like them
  // @endblock

// @block_replace burrito
//   actually i prefer tacos`;

    const expected = `guess what?
  // @block_default burrito
  actually i prefer tacos
  // @endblock

// @block_replace burrito
//   actually i prefer tacos`;

    this.createTestFile('test3.txt', input);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.txt';
    await parser.process(globPattern);

    const result = this.readTestFile('test3.txt');
    this.assertEqual(expected, result, 'Different indentation and content');
  }

  async testMultipleFiles() {
    const mainFile = `int main() {
  // @block_default ITEMS
  // default item
  printf("default");
  // @endblock
  return 0;
}`;

    const replaceFile = `// @block_replace ITEMS
//   printf("replaced");`;

    const appendFile = `// @block_append ITEMS
//   printf("appended");`;

    const expectedMain = `int main() {
  // @block_default ITEMS
  // default item
  printf("replaced");
  printf("appended");
  // @endblock
  return 0;
}`;

    this.createTestFile('main.c', mainFile);
    this.createTestFile('replace.c', replaceFile);
    this.createTestFile('append.c', appendFile);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('main.c');
    this.assertEqual(expectedMain, result, 'Multiple files contributing to same block');
  }

  async testMultipleBlocks() {
    const input = `void function1() {
  // @block_default BLOCK1
  //   code1();
  old_code1();
  // @endblock
}

void function2() {
  // @block_default BLOCK2
  //   code2();
  old_code2();
  // @endblock
}

// @block_replace BLOCK1
//   new_code1();

// @block_append BLOCK2
//   extra_code2();`;

    const expected = `void function1() {
  // @block_default BLOCK1
  //   code1();
  new_code1();
  // @endblock
}

void function2() {
  // @block_default BLOCK2
  //   code2();
  code2();
  extra_code2();
  // @endblock
}

// @block_replace BLOCK1
//   new_code1();

// @block_append BLOCK2
//   extra_code2();`;

    this.createTestFile('test5.c', input);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('test5.c');
    this.assertEqual(expected, result, 'Multiple blocks in same file');
  }

  async testNestedIndentation() {
    const input = `if (condition) {
    // @block_default NESTED
    //     deeply_nested();
    old_nested();
    // @endblock
}

// @block_replace NESTED
//     new_deeply_nested();
//     another_line();`;

    const expected = `if (condition) {
    // @block_default NESTED
    //     deeply_nested();
    new_deeply_nested();
    another_line();
    // @endblock
}

// @block_replace NESTED
//     new_deeply_nested();
//     another_line();`;

    this.createTestFile('test6.c', input);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('test6.c');
    this.assertEqual(expected, result, 'Nested indentation preserved');
  }

  async testEmptyBlocks() {
    const input = `void func() {
  // @block_default EMPTY
  old_code();
  // @endblock
}

// @block_replace EMPTY`;

    const expected = `void func() {
  // @block_default EMPTY
  // @endblock
}

// @block_replace EMPTY`;

    this.createTestFile('test7.c', input);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('test7.c');
    this.assertEqual(expected, result, 'Empty replacement block');
  }

  async testMultipleAppends() {
    const input = `int main() {
  // @block_default LIST
  //   item1
  item1
  // @endblock
}

// @block_append LIST
//   item2

// @block_append LIST
//   item3`;

    const expected = `int main() {
  // @block_default LIST
  //   item1
  item1
  item2
  item3
  // @endblock
}

// @block_append LIST
//   item2

// @block_append LIST
//   item3`;

    this.createTestFile('test8.c', input);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('test8.c');
    this.assertEqual(expected, result, 'Multiple append blocks');
  }

  async testReplaceWithTemplateComments() {
    const input = `// @block_default ASEPRITE
// @endblock

// ...

// @block_replace ASEPRITE
//   typedef struct Exposure {
//     Rect rect;
//     u16 duration;
//     struct Exposure* next;
//   } Exposure;  // Frame-by-Frame Animation
//
//   typedef struct AsepriteTag {
//     const char* name;
//     // Exposure* exposures;
//     u16 from, to;
//     Exposure* ex;
//     struct AsepriteTag* next;
//   } AsepriteTag;
//
//   typedef struct {
//     Exposure* exposures;
//     AsepriteTag* tags;
//     u8 fsm;
//     Json json;
//   } Aseprite;

// Aseprite .json spritesheet format
`;

    const expected = `// @block_default ASEPRITE
typedef struct Exposure {
  Rect rect;
  u16 duration;
  struct Exposure* next;
} Exposure;  // Frame-by-Frame Animation

typedef struct AsepriteTag {
  const char* name;
  // Exposure* exposures;
  u16 from, to;
  Exposure* ex;
  struct AsepriteTag* next;
} AsepriteTag;

typedef struct {
  Exposure* exposures;
  AsepriteTag* tags;
  u8 fsm;
  Json json;
} Aseprite;
// @endblock

// ...

// @block_replace ASEPRITE
//   typedef struct Exposure {
//     Rect rect;
//     u16 duration;
//     struct Exposure* next;
//   } Exposure;  // Frame-by-Frame Animation
//
//   typedef struct AsepriteTag {
//     const char* name;
//     // Exposure* exposures;
//     u16 from, to;
//     Exposure* ex;
//     struct AsepriteTag* next;
//   } AsepriteTag;
//
//   typedef struct {
//     Exposure* exposures;
//     AsepriteTag* tags;
//     u8 fsm;
//     Json json;
//   } Aseprite;

// Aseprite .json spritesheet format
`;

    this.createTestFile('test9.c', input);

    const parser = new TemplateParser(true);
    const globPattern = this.tempDir.replace(/\\/g, '/') + '/*.c';
    await parser.process(globPattern);

    const result = this.readTestFile('test9.c');
    this.assertEqual(expected, result, 'Replace block with template comments preserved');
  }

  async runAllTests() {
    console.log('🧪 Starting Template Parser Tests...\n');

    await this.setup();

    try {
      await this.runTest('Single file with replace and append', () => this.testSingleFileWithReplaceAndAppend());
      await this.runTest('Default content only', () => this.testDefaultContentOnly());
      await this.runTest('Different indentation and content', () => this.testDifferentIndentationAndContent());
      await this.runTest('Multiple files', () => this.testMultipleFiles());
      await this.runTest('Multiple blocks', () => this.testMultipleBlocks());
      await this.runTest('Nested indentation', () => this.testNestedIndentation());
      await this.runTest('Empty blocks', () => this.testEmptyBlocks());
      await this.runTest('Multiple appends', () => this.testMultipleAppends());
      await this.runTest('Replace with template comments', () => this.testReplaceWithTemplateComments());
    } finally {
      await this.cleanup();
    }

    console.log('\n📊 Test Results:');
    console.log(`Total tests: ${this.testCount}`);
    console.log(`Passed: ${this.passCount}`);
    console.log(`Failed: ${this.failCount}`);

    if (this.failCount === 0) {
      console.log('🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some tests failed!');
      process.exit(1);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.runAllTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;
