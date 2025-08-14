# Template Language Parser

A code template system that lives entirely within comments, allowing you to generate and maintain code blocks across multiple files while preserving the original source code structure.

## Overview

This template language operates exclusively within code comments (`//`), making it language-agnostic and non-intrusive. The parser processes files to find template directives and generates code based on default, replacement, and append patterns.

## Template Syntax

### Basic Directives

- `@block_default IDENTIFIER` - Defines a default template block
- `@block_replace IDENTIFIER` - Replaces the content of a block
- `@block_append IDENTIFIER` - Appends content to a block
- `@endblock` - Marks the end of a default block

### Syntax Rules

1. **All directives must be in comments**: `// @directive_name IDENTIFIER`
2. **Template content must be in comments**: `//   content_here`
3. **Indentation is preserved**: The parser maintains relative indentation
4. **Block scope**: Only content between `@block_default` and `@endblock` is replaced

## Examples

### Basic Example

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

### Multiple Blocks

```c
void setup() {
  // @block_default INCLUDES
  //   #include "default.h"
  #include "default.h"
  // @endblock
  
  // @block_default INIT_CODE
  //   init_default();
  init_default();
  // @endblock
}

// @block_replace INCLUDES
//   #include "custom.h"
//   #include "extra.h"

// @block_append INIT_CODE
//   init_extra();
```

### Nested Indentation

```c
if (condition) {
    // @block_default NESTED_LOGIC
    //     default_action();
    default_action();
    // @endblock
}

// @block_replace NESTED_LOGIC
//     custom_action();
//     another_action();
```

## Usage

### Command Line

```bash
# Process all C/C++ files
node tmpl.js "**/*.{c,h,cpp,hpp}"

# Process specific directory
node tmpl.js "src/**/*.c"

# Process single file
node tmpl.js "main.c"
```

### VS Code Integration

The project includes VS Code tasks and launch configurations:

1. **Ctrl+Shift+P** → "Tasks: Run Task"
2. Choose from predefined tasks:
   - **Template Parser: Process All Files** - Process all supported file types
   - **Template Parser: Process C/C++ Files** - Process only C/C++ files
   - **Template Parser: Process Test Fixtures** - Process test files
   - **Template Parser: Custom Pattern** - Enter custom glob pattern

### NPM Scripts

```bash
# Run the test suite
npm test

# Manual execution
npm start -- "**/*.c"
```

## How It Works

### Processing Logic

1. **First Pass**: Scan all files to collect template directives
   - Find `@block_default` blocks and their content
   - Collect `@block_replace` and `@block_append` directives
   - Build a map of block identifiers to their content

2. **Second Pass**: Generate output
   - For each `@block_default`, determine final content:
     - If `@block_replace` exists: use replacement content
     - Otherwise: use default content
     - Add any `@block_append` content
   - Replace only the generated content between markers
   - Preserve template comments and original structure

### Content Generation Rules

- **Default only**: Uses content from `@block_default`
- **With replacement**: `@block_replace` overrides default content
- **With appends**: `@block_append` adds to existing content (default or replaced)
- **Multiple appends**: All append blocks are concatenated in order
- **Multiple replacements**: Last replacement wins

## Indentation Handling

The parser preserves indentation relationships:

```c
// @block_default EXAMPLE
//     deeply_nested_call();
//     another_call();
```

Results in properly indented output:
```c
    deeply_nested_call();
    another_call();
```

## File Types

The parser works with any text file but is designed for source code:
- C/C++ files (`.c`, `.h`, `.cpp`, `.hpp`)
- JavaScript/TypeScript (`.js`, `.ts`)
- Any file with `//` style comments

## Best Practices

1. **Descriptive identifiers**: Use clear names like `INCLUDES`, `INIT_CODE`, `EXPORTS`
2. **Consistent indentation**: Match your project's indentation style in template content
3. **Logical grouping**: Group related template files in the same directory
4. **Documentation**: Add comments explaining complex template logic

## Error Handling

The parser provides clear error messages for:
- Invalid directive syntax
- Missing block identifiers
- File access issues
- Malformed glob patterns

## Testing

Run the comprehensive test suite:
```bash
npm test
```

The test suite covers:
- Single and multi-file scenarios
- Complex indentation patterns
- Empty blocks and edge cases
- Multiple append operations

## Contributing

The parser is designed to be extensible. Key areas for enhancement:
- Additional directive types
- Custom content processors
- Integration with build systems
- IDE-specific features


## Credit

Made with Github Copilot for VSCode and Claude Sonnet 4 🤖