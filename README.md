# ⛪ Tmpl.js (Temple) 

*Comment-Based Template Language*

A powerful, language-agnostic code template system that operates entirely within comments. Generate and maintain synchronized code blocks across multiple files while preserving your original source structure.

## Overview

Tmpl.js enables you to define reusable code templates using only comment syntax (`//`), making it completely non-intrusive to your source code. The parser processes files to find template directives and generates code based on default templates, replacements, and appends - allowing for sophisticated code generation and synchronization workflows.

**Key Benefits:**
- 🔧 **Language Agnostic** - Works with any language that supports `//` comments
- 🚫 **Non-Intrusive** - Templates live in comments, never affecting compilation
- 🔄 **Multi-File Sync** - Share template content across multiple files
- 📐 **Smart Indentation** - Automatically preserves and applies proper indentation
- 🎯 **Selective Updates** - Replace or append to existing content precisely

## Template Syntax

### Core Directives

- `@block_default IDENTIFIER` - Defines a default template block with fallback content
- `@block IDENTIFIER` - Defines an empty template block (no default content)
- `@block_replace IDENTIFIER` - Replaces the content of a block
- `@block_append IDENTIFIER` - Appends content to a block
- `@endblock` - Marks the end of a block definition

### Syntax Rules

1. **All directives must be in comments**: `// @directive_name IDENTIFIER`
2. **Template content must be in comments**: `//   content_here`
3. **Indentation is preserved**: The parser maintains relative indentation relationships
4. **Block scope**: Content between block directives and `@endblock` is managed
5. **Identifiers**: Block identifiers must be unique and can contain letters, numbers, and underscores

## Examples

### Basic Template Usage

**main.c** (before processing):
```c
int main() {
  u32 test_array[] = {
      // @block_default ARRAY_DEF
      //   0,
      0,
      // @endblock
  };
  return 0;
}
```

**lib1.c**:
```c
// @block_replace ARRAY_DEF
//   1,
```

**lib2.c**:
```c
// @block_append ARRAY_DEF
//   2,
```

**main.c** (after processing):
```c
int main() {
  u32 test_array[] = {
      // @block_default ARRAY_DEF
      //   0,
      1,
      2,
      // @endblock
  };
  return 0;
}
```

### Empty Block Template

Use `@block` for templates that don't need default content:

**license.c**:
```c
// @block_replace LICENSE
//   // WTFPL License
//   // Do whatever you want
```

**main.c**:
```c
// @block LICENSE
// @endblock

int main() {
    return 0;
}
```

**main.c** (after processing):
```c
// @block LICENSE
// WTFPL License
// Do whatever you want
// @endblock

int main() {
    return 0;
}
```

### Complex Multi-File Templates

**shared-types.c**:
```c
// @block_replace COMMON_STRUCTS
//   typedef struct Point {
//     float x, y;
//   } Point;
//   
//   typedef struct Color {
//     u8 r, g, b, a;
//   } Color;
```

**graphics.h**:
```c
#ifndef GRAPHICS_H
#define GRAPHICS_H

// @block_default COMMON_STRUCTS
//   // Default types
//   typedef struct Point { int x, y; } Point;
// Default types
typedef struct Point { int x, y; } Point;
// @endblock

void draw_point(Point p);

#endif
```

**game.h**:
```c
#include "common.h"

// @block COMMON_STRUCTS
// @endblock

void update_game();
```

**After processing**, both files get the enhanced struct definitions from `shared-types.c`.

### Multiple Append Operations

```c
// @block_default INIT_SEQUENCE
//   setup_core();
setup_core();
// @endblock

// @block_append INIT_SEQUENCE  
//   setup_graphics();

// @block_append INIT_SEQUENCE
//   setup_audio();

// @block_append INIT_SEQUENCE
//   setup_input();
```

**Result**: All append operations are combined in order.

## Usage

### Command Line Interface

Glob patterns are supported.

```bash
# Process all files recursively
node tmpl.js "**/*"

# Process C files only
node tmpl.js "**/*.{c,h}"

# Process specific directory
node tmpl.js "src/**/*.c"

# Process single file
node tmpl.js "main.c"
```

### VS Code Integration

It's recommended to run tmpl.js from within a VSCode task or launch configuration.

The project includes comprehensive example VS Code tasks for seamless workflow integration.

### Installation

There's just one non-essential Node.js dependency on `glob`.

```
npm install
```

### Test Suite

```bash
# Run the comprehensive test suite
npm test
```

## How It Works

### Two-Pass Processing Algorithm

**First Pass - Template Discovery:**
1. Scan all matching files for template directives
2. Parse `@block_default` and `@block` definitions with their content
3. Collect all `@block_replace` and `@block_append` directives
4. Build a comprehensive map of block identifiers to their associated content
5. Analyze indentation patterns for each template block

**Second Pass - Content Generation:**
1. For each block identifier, determine the final content:
   - **Default only**: Use content from `@block_default`
   - **With replacement**: `@block_replace` completely overrides default content
   - **With appends**: Add all `@block_append` content to existing content
   - **Empty blocks**: `@block` directives get populated from replacements/appends
2. Apply smart indentation based on the target location
3. Replace only the generated content between block markers
4. Preserve all template directive comments and original file structure

### Content Resolution Priority

1. **Multiple Replacements**: Last `@block_replace` wins (allows override chains)
2. **Multiple Appends**: All `@block_append` blocks concatenated in file discovery order
3. **Mixed Operations**: Replacement content + all appends (in order)
4. **Cross-File**: Templates can be defined in any file and applied to any other file

### Advanced Indentation System

The parser uses sophisticated indentation analysis:

```c
    // Base indentation: 4 spaces
    // @block_default EXAMPLE
    //     template_content();  // Template indentation: 4 additional spaces
    //     more_content();      // Results in 8 total spaces when applied
```

**Indentation Rules:**
- Template content indentation is relative to the comment block
- Target location indentation is preserved and added to template indentation
- Empty comment lines (`//`) become blank lines in output
- Mixed indentation styles (tabs/spaces) are handled gracefully

### File Type Support

The parser works with any text file that supports `//` comments:

**Explicitly Tested:**
- **C/C++**: `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hh`
- **JavaScript/TypeScript**: `.js`, `.ts`, `.jsx`, `.tsx`
- **Text Files**: `.txt`

**Should Work With:**
- **Java**: `.java`
- **Rust**: `.rs`
- **Go**: `.go`
- **Swift**: `.swift`
- **Scala**: `.scala`
- **And many more...**

### Template Directive Parsing

**Valid Directive Formats:**
```c
// @block_default IDENTIFIER
// @block IDENTIFIER  
// @block_replace IDENTIFIER
// @block_append IDENTIFIER
// @endblock
```

**Invalid Formats:**
```c
//@block_default IDENTIFIER     // No space after //
// @block_default               // Missing identifier
// @block_default ID1 ID2       // Multiple identifiers
/* @block_default IDENTIFIER */ // Wrong comment style
```

### Indentation Rules

**Clear Block Boundaries:**
```c
// ✅ Good: Clear start and end
// @block_default INIT_SEQUENCE
//   setup_core();
setup_core();
// @endblock

// ❌ Bad: Unclear boundaries  
// @block_default INIT_SEQUENCE
setup_core(); // Missing comment prefix
// @endblock
```

**Consistent Indentation:**
```c
// ✅ Good: Consistent 2-space template indentation
// @block_default LOGIC
//   if (condition) {
//     do_something();
//   }

// ❌ Bad: Mixed indentation
// @block_default LOGIC  
//   if (condition) {
//      do_something();  // 3 spaces
//   }
```

### Development Setup

**Prerequisites:**
```bash
# Node.js 16+ required
node --version

# Install dependencies
npm install
```

**Project Structure:**
```
tmpl/
├── tmpl.js           # Main parser implementation
├── test.js           # Comprehensive test suite  
├── package.json      # NPM configuration & scripts
├── .vscode/          
│   └── tasks.json    # VS Code integration tasks
└── test/
    └── fixtures/     # Test case files
```

## Quick Reference

### Directives

| Directive | Purpose | Usage | Notes |
|-----------|---------|-------|-------|
| `@block_default ID` | Define template with fallback | `// @block_default INCLUDES` | Provides content when no replacement exists |
| `@block ID` | Define empty template | `// @block LICENSE` | No default content, expects replacement |
| `@block_replace ID` | Replace block content | `// @block_replace INCLUDES` | Overrides default completely |
| `@block_append ID` | Append to block | `// @block_append INCLUDES` | Adds to existing content |
| `@endblock` | Close block definition | `// @endblock` | Required for `@block_default` and `@block` |

### Processing Behavior Matrix

| Template State | Has Default | Has Replace | Has Append | Result |
|----------------|-------------|-------------|------------|---------|
| Basic | ✅ | ❌ | ❌ | Default content |
| Replaced | ✅ | ✅ | ❌ | Replacement content |
| Enhanced | ✅ | ❌ | ✅ | Default + append content |
| Full Override | ✅ | ✅ | ✅ | Replacement + append content |
| Empty Default | ❌ | ✅ | ❌ | Replacement content |
| Empty Enhanced | ❌ | ❌ | ✅ | Append content only |

### Technical Specifications

**Supported Comment Formats:**
```c
// @directive IDENTIFIER     ✅ Standard format
//    @directive IDENTIFIER  ✅ Extra spaces allowed
//@directive IDENTIFIER     ❌ No space after //
/* @directive IDENTIFIER */ ❌ Block comments not supported
# @directive IDENTIFIER     ❌ Hash comments not supported
```

**File Processing Order:**
1. Files are processed in glob pattern discovery order
2. Within files, directives are processed top-to-bottom
3. Multiple `@block_replace` directives: last one wins
4. Multiple `@block_append` directives: all are applied in order

**Memory & Performance:**
- Files are processed in-memory with full content loaded
- Two-pass algorithm ensures consistent results
- Glob patterns are resolved once at startup
- Template content is cached between passes

## Contributing

PRs welcome.

**Architecture Overview:**
- `TemplateParser` class with two-pass processing
- Pluggable directive parsing (`parseTemplateLine` method)
- Flexible content generation (`generateBlockContent` method)
- Glob-based file discovery with absolute path handling

**Extension Points:**
- **New Directive Types**: Add cases to `parseTemplateLine`
- **Custom Content Processors**: Modify `generateBlockContent`  
- **Alternative Comment Styles**: Extend comment detection regex
- **Build System Integration**: Wrap `process()` method

**Testing New Features:**
```javascript
// Add test cases to test.js
await this.runTest('New feature test', () => this.testNewFeature());

// Test method example
async testNewFeature() {
  const input = `/* test case input */`;
  const expected = `/* expected output */`;
  this.createTestFile('test.c', input);
  
  const parser = new TemplateParser(true);
  await parser.process(this.tempDir + '/*.c');
  
  const result = this.readTestFile('test.c');
  this.assertEqual(expected, result, 'Feature description');
}
```

## Credit

Made with Github Copilot for VSCode and Claude Sonnet 4 🤖