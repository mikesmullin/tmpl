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
      case '@block':
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
    let templateIndent = null; // The indentation to remove from template content

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
        if (commentIndent) {
          // For empty comment lines, we need to be more flexible
          const isEmptyComment = trimmed === '//';
          const hasValidIndent = commentIndent.length >= baseIndent.length || isEmptyComment;

          if (hasValidIndent) {
            // Extract content after the comment prefix
            const contentMatch = line.match(/^(\s*)\/\/(\s*)(.*)/);
            if (contentMatch) {
              const [, lineIndent, commentSpaces, contentText] = contentMatch;

              // Establish template indentation from first non-empty content line
              if (templateIndent === null && contentText.trim() !== '') {
                templateIndent = commentSpaces;
              }

              // Store the parsed content
              content.push({
                indent: lineIndent,
                commentSpaces: commentSpaces,
                contentText: contentText,
                originalLine: line,
                isEmpty: contentText.trim() === ''
              });
            }
          } else {
            // Different indentation level - could be end of block
            break;
          }
        } else {
          // Not a valid comment format
          break;
        }
      } else if (trimmed === '') {
        // Empty line - end of template block
        break;
      } else {
        // Non-comment line - end of template block
        break;
      }

      i++;
    }

    // Apply template indentation rules to content
    const processedContent = content.map(item => {
      if (item.isEmpty) {
        return { ...item, finalContent: '' }; // Empty comment becomes blank line
      }

      // If this line has the expected template indentation, remove it
      if (templateIndent !== null && item.commentSpaces.startsWith(templateIndent)) {
        const remainingSpaces = item.commentSpaces.substring(templateIndent.length);
        return { ...item, finalContent: remainingSpaces + item.contentText };
      }

      // If line has less indentation than the template, treat it as base level (no indentation)
      if (templateIndent !== null && item.commentSpaces.length < templateIndent.length && item.contentText.trim() !== '') {
        return { ...item, finalContent: item.contentText };
      }

      // If line was potentially trimmed (has no spaces but content), use default
      if (item.commentSpaces === '' && item.contentText.trim() !== '') {
        return { ...item, finalContent: item.contentText };
      }

      // Otherwise use as-is
      return { ...item, finalContent: item.commentSpaces + item.contentText };
    });

    return { content: processedContent, nextLine: i, templateIndent };
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

        // For block_default and block, we need to find the @endblock
        if (directive.type === 'block_default' || directive.type === 'block') {
          // Find the corresponding @endblock
          let endLine = i + 1;
          while (endLine < lines.length) {
            const endDirective = this.parseTemplateLine(lines[endLine]);
            if (endDirective && endDirective.type === 'endblock') {
              break;
            }
            endLine++;
          }

          let content = [];
          
          // For block_default, parse the template content
          if (directive.type === 'block_default') {
            const { content: parsedContent } = this.parseTemplateContent(lines, i + 1, baseIndent);
            content = parsedContent;
          }
          // For @block, there's no default content to parse

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
          if (directive.type === 'block_default') {
            blockInfo.default = { content, filePath, indent: baseIndent };
          }
          // For @block, we don't set a default

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
  generateBlockContent(blockId, existingIndent) {
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

    // Use the existing content indentation as the base
    const baseIndent = existingIndent || '';

    if (!this.silent) {
      console.log(`Generating content for block ${blockId}:`);
      console.log(`  Base indent: "${baseIndent}" (length: ${baseIndent.length})`);
      console.log(`  Content items:`, result.length);
    }

    // Process template content to extract actual code
    const processedContent = [];

    for (const item of result) {
      if (typeof item === 'string') {
        // Legacy string format
        processedContent.push(baseIndent + item);
      } else if (item.finalContent !== undefined) {
        // New processed format
        if (item.isEmpty) {
          processedContent.push(''); // Empty comment becomes blank line
        } else {
          processedContent.push(baseIndent + item.finalContent);
        }
      } else {
        // Fallback for old format
        const content = item.content || '';
        if (item.isEmpty || content.trim() === '') {
          processedContent.push('');
        } else if (content.startsWith('  ')) {
          const unescapedContent = content.substring(2);
          processedContent.push(baseIndent + unescapedContent);
        } else {
          processedContent.push(baseIndent + content.trim());
        }
      }
    }

    return processedContent;
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

        if (block.type === 'block_default' || block.type === 'block') {
          // Get the indentation from the existing content between start and end
          let contentStart = block.startLine + 1;
          let contentEnd = block.endLine;

          // Find existing content indentation
          let existingIndent = '';
          for (let j = contentStart; j < contentEnd; j++) {
            const line = newLines[j];
            if (line.trim() !== '' && !line.trim().startsWith('//')) {
              // This is the existing content line - extract its indentation
              const indentMatch = line.match(/^(\s*)/);
              if (indentMatch) {
                existingIndent = indentMatch[1];
                break;
              }
            }
          }

          // Replace content between @block_default/@block and @endblock
          const generatedContent = this.generateBlockContent(block.blockId, existingIndent);

          // Find where the generated content should be inserted
          // We need to preserve comment lines that are part of the template
          const preservedLines = [];

          // For @block_default, preserve template comments; for @block, don't preserve them
          if (block.type === 'block_default') {
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
