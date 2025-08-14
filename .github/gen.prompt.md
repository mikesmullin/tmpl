you are a code writing agent.
i designed a template language.
i want you to implement its parser.

the template language exists purely inside code comments

so for example, in this .c file, 
we only pay attention to the comments.
the rest of the file remains in-tact,
but the template language is ignoring it (as though it were whitespace).

```
; Template Language ABNF Grammar

template-file = *( non-template-line / template-directive )

non-template-line = *CHAR CRLF

template-directive = comment-start template-command comment-end CRLF
                    [ template-block ]

comment-start = "//" *SP

comment-end = *SP

template-command = block-command / simple-command

; Block commands that support multi-line content
block-command = block-default / block-replace / block-append

block-default = "@block_default" 1*SP identifier
block-replace = "@block_replace" 1*SP identifier  
block-append = "@block_append" 1*SP identifier

; Simple commands (future extensibility)
simple-command = "@endblock" / other-command

other-command = "@" identifier *( 1*SP parameter )

; Template block with meaningful indentation
template-block = *( block-line / nested-block )

block-line = base-indent *CHAR CRLF

nested-block = greater-indent *CHAR CRLF
              *( same-or-greater-indent *CHAR CRLF )

; Indentation rules
base-indent = comment-start indent-level
greater-indent = comment-start greater-indent-level
same-or-greater-indent = comment-start same-or-greater-indent-level

indent-level = *SP
greater-indent-level = indent-level 1*SP
same-or-greater-indent-level = greater-indent-level *SP

; Basic tokens
identifier = ALPHA *( ALPHA / DIGIT / "_" )
parameter = identifier / quoted-string / number

quoted-string = DQUOTE *( %x20-21 / %x23-7E ) DQUOTE
number = 1*DIGIT

; Standard ABNF core rules
SP = %x20
CRLF = %x0D.0A / %x0A
CHAR = %x01-08 / %x0B-0C / %x0E-7F
ALPHA = %x41-5A / %x61-7A
DIGIT = %x30-39
DQUOTE = %x22
```

NOTICE that the @block_* syntax begins a multi-line block, the end of which is indicated by meaningful-indentation.

FOR example, imagine a set of files like:

```
// main.c
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

```
// lib1.c

// @block_replace ARRAY_DEF
//   1,
```

```
// lib2.c

// @block_append ARRAY_DEF
//   2,
```

This should generate a change to `main.c` like:

```
// main.c
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

NOTICE: indentation is maintained. `1,` and `2,` are not commented.

NOTICE that the uncommented code between a `@block_default` and `@endblock`
is considered machine-generated code,
and therefore it will be replaced by the template output.

NOTICE that a `@block_default`, if not followed by a corresponding `@block_replace` or `@block_append`, will cause the uncommented area to be replaced by the default content.

In the given example with input.c => output.c,
the `0,` is replaced by `1,` because of the `@block_replace`. Then the `2,` is appended because of the `@block_append`.

Now please implement this 2-pass parser (in node.js code, in a file called `tmpl.js`):

1. The first pass should identify all template directives and their associated content blocks.
2. The second pass should process the identified blocks and generate the final output.

it should work like a cli utility which takes a glob pattern,
reads all files matching that pattern as input,
and writes its changes directly back to those files
(NOTICE: Only the areas between `@block_default`...`@endblock` are where modified content is replaced)

then run the code and verify the output.