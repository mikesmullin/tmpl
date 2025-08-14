#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

class TemplateParser {
  constructor(silent = false) {
    this.silent = silent;
    this.reset();
  }

  reset() {
    this.blocks = new Map(); // blockId -> { default: content, replaces: [content], appends: [content] }
    this.files = new Map(); // filePath -> { lines, blocks: [{ type, blockId, startLine, endLine, indent, content }] }
  }

  /**
   * Parse a single line to extract template directive
   */
  parseTemplateLine(line) {
    const trimmed = line.trim();

    // Match comment start: // followed by optional spaces
    const commentMatch = trimmed.match(/^\/\/\s*(@\w+(?:\s+.+)?)\s*$/);
    if (!commentMatch) {
      return null;
    }

    const directive = commentMatch[1].trim();
    const parts = directive.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
      case '@block_default':
      case '@block_replace':
      case '@block_append':
        if (args.length !== 1) {
          throw new Error(`Invalid ${command}: expected exactly one identifier`);
        }
        return {
          type: command.substring(1), // Remove @
          blockId: args[0],
          isBlock: true
        };

      case '@endblock':
        return {
          type: 'endblock',
          isBlock: false
        };

      default:
        // Other commands - for future extensibility
        return {
          type: command.substring(1),
          args: args,
          isBlock: false
        };
    }
  }

  /**
   * Extract the indentation from a comment line
   */
  getCommentIndent(line) {
    const match = line.match(/^(\s*)\/\/(\s*)/);
    if (!match) {
      return null;
    }
    return match[1] + '//' + match[2];
  }

  /**
   * Parse template blocks from comment content
   */
  parseTemplateContent(lines, startIdx, baseIndent) {
    const content = [];
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for end of block or any other directive
      if (trimmed.startsWith('//')) {
        const directive = this.parseTemplateLine(line);
        if (directive) {
          // Stop at any directive (endblock, or other block directives)
          break;
        }

        const commentIndent = this.getCommentIndent(line);
        if (commentIndent && commentIndent.length >= baseIndent.length) {
          // Extract content after the comment prefix
          const contentMatch = line.match(/^(\s*)\/\/(\s*)(.*)/);
          if (contentMatch) {
            const [, lineIndent, commentSpaces, contentText] = contentMatch;
            // Only include non-empty content lines
            if (contentText.trim() !== '') {
              content.push({
                indent: lineIndent,
                content: contentText
              });
            }
          }
        } else {
          // Different indentation level - could be end of block
          break;
        }
      } else if (trimmed === '') {
        // Skip empty lines in template content
      } else {
        // Non-comment line - end of template block
        break;
      }

      i++;
    }

    return { content, nextLine: i };
  }

  /**
   * First pass: parse all files and collect template directives
   */
  async parseFiles(filePaths) {
    for (const filePath of filePaths) {
      await this.parseFile(filePath);
    }
  }

  async parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    const fileData = {
      lines: lines,
      blocks: []
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const directive = this.parseTemplateLine(line);

      if (directive && directive.isBlock) {
        const baseIndent = this.getCommentIndent(line);

        // For block_default, we need to find the @endblock
        if (directive.type === 'block_default') {
          const { content, nextLine } = this.parseTemplateContent(lines, i + 1, baseIndent);

          // Find the corresponding @endblock
          let endLine = nextLine;
          while (endLine < lines.length) {
            const endDirective = this.parseTemplateLine(lines[endLine]);
            if (endDirective && endDirective.type === 'endblock') {
              break;
            }
            endLine++;
          }

          const blockData = {
            type: directive.type,
            blockId: directive.blockId,
            startLine: i,
            endLine: endLine,
            indent: baseIndent,
            content: content
          };

          fileData.blocks.push(blockData);

          // Store in global blocks map
          if (!this.blocks.has(directive.blockId)) {
            this.blocks.set(directive.blockId, {
              default: null,
              replaces: [],
              appends: []
            });
          }

          const blockInfo = this.blocks.get(directive.blockId);
          blockInfo.default = { content, filePath, indent: baseIndent };

          i = endLine + 1;
        } else {
          // For block_replace and block_append, parse content until next directive or end of file
          const { content, nextLine } = this.parseTemplateContent(lines, i + 1, baseIndent);

          // Store in global blocks map
          if (!this.blocks.has(directive.blockId)) {
            this.blocks.set(directive.blockId, {
              default: null,
              replaces: [],
              appends: []
            });
          }

          const blockInfo = this.blocks.get(directive.blockId);
          if (directive.type === 'block_replace') {
            blockInfo.replaces.push({ content, filePath, indent: baseIndent });
          } else if (directive.type === 'block_append') {
            blockInfo.appends.push({ content, filePath, indent: baseIndent });
          }

          i = nextLine;
        }
      } else {
        i++;
      }
    }

    this.files.set(filePath, fileData);
  }

  /**
   * Generate the final content for a block
   */
  generateBlockContent(blockId, targetIndent) {
    const blockInfo = this.blocks.get(blockId);
    if (!blockInfo) {
      return [];
    }

    let result = [];

    // Start with replacement content or default content
    if (blockInfo.replaces.length > 0) {
      // Use the last replacement (in case multiple files replace the same block)
      const replacement = blockInfo.replaces[blockInfo.replaces.length - 1];
      result = [...replacement.content];
    } else if (blockInfo.default) {
      result = [...blockInfo.default.content];
    }

    // Add all appends
    for (const append of blockInfo.appends) {
      result = result.concat(append.content);
    }

    // Extract base indentation from target
    const baseIndentMatch = targetIndent.match(/^(\s*)/);
    const baseIndent = baseIndentMatch ? baseIndentMatch[1] : '';

    return result.map(item => {
      if (typeof item === 'string') {
        return baseIndent + item;
      } else {
        // Handle structured content
        return baseIndent + item.content;
      }
    });
  }

  /**
   * Second pass: generate output files
   */
  generateOutput() {
    for (const [filePath, fileData] of this.files.entries()) {
      let modified = false;
      const newLines = [...fileData.lines];

      // Process blocks in reverse order to maintain line indices
      for (let i = fileData.blocks.length - 1; i >= 0; i--) {
        const block = fileData.blocks[i];

        if (block.type === 'block_default') {
          // Replace content between @block_default and @endblock
          const generatedContent = this.generateBlockContent(block.blockId, block.indent);

          // Find where the generated content should be inserted
          // We need to preserve comment lines that are part of the template
          let contentStart = block.startLine + 1;
          let contentEnd = block.endLine;

          // Scan from contentStart to contentEnd to separate template comments from generated content
          const preservedLines = [];
          const generatedStart = contentStart;

          for (let j = contentStart; j < contentEnd; j++) {
            const line = newLines[j];
            const trimmed = line.trim();

            // If it's a comment line with the same or deeper indentation as the block,
            // it might be template content that should be preserved
            if (trimmed.startsWith('//')) {
              const lineIndent = this.getCommentIndent(line);
              if (lineIndent && lineIndent.length >= block.indent.length) {
                // Check if this comment contains template content (not a directive)
                const contentMatch = line.match(/^(\s*)\/\/(\s*)(.*)/);
                if (contentMatch) {
                  const [, , , contentText] = contentMatch;
                  if (contentText.trim() !== '' && !contentText.trim().startsWith('@')) {
                    preservedLines.push(line);
                    continue;
                  }
                }
              }
            }

            // This is either generated content or other code - mark the start of replacement
            break;
          }

          // Insert preserved template comments, then generated content
          const replacementLines = [...preservedLines, ...generatedContent];
          newLines.splice(contentStart, contentEnd - contentStart, ...replacementLines);
          modified = true;
        }
      }

      if (modified) {
        const newContent = newLines.join('\n');
        fs.writeFileSync(filePath, newContent, 'utf8');
        if (!this.silent) {
          console.log(`Updated: ${filePath}`);
        }
      }
    }
  }

  /**
   * Main processing function
   */
  async process(globPattern) {
    try {
      // Reset state for each processing run
      this.reset();

      // Find all matching files
      const filePaths = await glob(globPattern, { absolute: true });

      if (filePaths.length === 0) {
        if (!this.silent) {
          console.log(`No files found matching pattern: ${globPattern}`);
        }
        return;
      }

      if (!this.silent) {
        console.log(`Processing ${filePaths.length} files...`);
      }

      // First pass: parse all files
      await this.parseFiles(filePaths);

      // Debug output
      if (!this.silent) {
        console.log('\nFound blocks:');
        for (const [blockId, blockInfo] of this.blocks.entries()) {
          console.log(`  ${blockId}:`);
          if (blockInfo.default) {
            console.log(`    default: ${blockInfo.default.content.length} lines`);
          }
          console.log(`    replaces: ${blockInfo.replaces.length}`);
          console.log(`    appends: ${blockInfo.appends.length}`);
        }
      }

      // Second pass: generate output
      this.generateOutput();

      if (!this.silent) {
        console.log('\nProcessing complete!');
      }

    } catch (error) {
      console.error('Error processing files:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.log('Usage: node tmpl.js <glob-pattern>');
    console.log('Example: node tmpl.js "test/fixtures/*.c"');
    process.exit(1);
  }

  const parser = new TemplateParser();
  parser.process(args[0]);
}

module.exports = TemplateParser;
