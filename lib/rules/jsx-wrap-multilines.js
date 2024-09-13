/**
 * @fileoverview Prevent missing parentheses around multilines JSX
 * @author Yannick Croissant
 */

'use strict';

const docsUrl = require('../util/docsUrl');
const {
  getSourceCode,
  getText,
} = require('../util/eslint');
const { isJSX } = require('../util/jsx');
const reportC = require('../util/report');
const { isParenthesized } = require('../util/ast');

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DEFAULTS = /** @type {const} */ ({
  declaration: 'parens',
  assignment: 'parens',
  return: 'parens',
  arrow: 'parens',
  condition: 'ignore',
  logical: 'ignore',
  prop: 'ignore',
});

/** @typedef {keyof typeof DEFAULTS} Type */

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  missingParens: 'Missing parentheses around multilines JSX',
  extraParens: 'Expected no parentheses around multilines JSX',
  parensOnNewLines: 'Parentheses around JSX should be on separate lines',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow missing parentheses around multiline JSX',
      category: 'Stylistic Issues',
      recommended: false,
      url: docsUrl('jsx-wrap-multilines'),
    },
    fixable: 'code',

    messages,

    schema: [{
      type: 'object',
      // true/false are for backwards compatibility
      properties: {
        declaration: {
          enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
        },
        assignment: {
          enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
        },
        return: {
          enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
        },
        arrow: {
          enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
        },
        condition: {
          enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
        },
        logical: {
          enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
        },
        prop: {
          enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
        },
      },
      additionalProperties: false,
    }],
  },

  create(context) {
    /** @param {Type} type */
    function getOption(type) {
      const userOptions = context.options[0] || {};
      if (Object.hasOwn(userOptions, type)) {
        return userOptions[type];
      }
      return DEFAULTS[type];
    }

    /** @param {Type} type */
    function isEnabled(type) {
      const option = getOption(type);
      return option && option !== 'ignore';
    }

    /** @param {JSXElement | JSXFragment} node */
    function needsOpeningNewLine(node) {
      const previousToken = getSourceCode(context).getTokenBefore(node);

      if (!isParenthesized(context, node)) {
        return false;
      }

      if (previousToken.loc.end.line === node.loc.start.line) {
        return true;
      }

      return false;
    }

    /** @param {JSXElement | JSXFragment} node */
    function needsClosingNewLine(node) {
      const nextToken = getSourceCode(context).getTokenAfter(node);

      if (!isParenthesized(context, node)) {
        return false;
      }

      if (node.loc.end.line === nextToken.loc.end.line) {
        return true;
      }

      return false;
    }

    /** @param {JSXElement | JSXFragment} node */
    function isMultilines(node) {
      return node.loc.start.line !== node.loc.end.line;
    }

    function report(node, messageId, fix) {
      reportC(context, messages[messageId], messageId, {
        node,
        fix,
      });
    }

    /** @param {AST.Token | null} tokenBefore */
    function trimTokenBeforeNewline(_node_, tokenBefore) {
      // if the token before the jsx is a bracket or curly brace
      // we don't want a space between the opening parentheses and the multiline jsx
      const isBracket = tokenBefore.value === '{' || tokenBefore.value === '[';
      return `${tokenBefore.value.trim()}${isBracket ? '' : ' '}`;
    }

    /**
     * @param {Expression | JSXEmptyExpression | null | undefined} node
     * @param {Type} type
     */
    function check(node, type) {
      if (!node || !isJSX(node)) {
        return;
      }

      const sourceCode = getSourceCode(context);
      const option = getOption(type);

      if ((option === true || option === 'parens') && !isParenthesized(context, node) && isMultilines(node)) {
        report(node, 'missingParens', (fixer) => fixer.replaceText(node, `(${getText(context, node)})`));
      }

      if (option === 'parens-new-line' && isMultilines(node)) {
        if (!isParenthesized(context, node)) {
          const tokenBefore = sourceCode.getTokenBefore(node, { includeComments: true });
          const tokenAfter = sourceCode.getTokenAfter(node, { includeComments: true });
          const { start } = node.loc;
          if (tokenBefore.loc.end.line < start.line) {
            // Strip newline after operator if parens newline is specified
            report(
              node,
              'missingParens',
              (fixer) => fixer.replaceTextRange(
                [tokenBefore.range[0], tokenAfter && (tokenAfter.value === ';' || tokenAfter.value === '}') ? tokenAfter.range[0] : node.range[1]],
                `${trimTokenBeforeNewline(node, tokenBefore)}(\n${start.column > 0 ? ' '.repeat(start.column) : ''}${getText(context, node)}\n${start.column > 0 ? ' '.repeat(start.column - 2) : ''})`,
              ),
            );
          } else {
            report(node, 'missingParens', (fixer) => fixer.replaceText(node, `(\n${getText(context, node)}\n)`));
          }
        } else {
          const needsOpening = needsOpeningNewLine(node);
          const needsClosing = needsClosingNewLine(node);
          if (needsOpening || needsClosing) {
            report(node, 'parensOnNewLines', (fixer) => {
              const text = getText(context, node);
              let fixed = text;
              if (needsOpening) {
                fixed = `\n${fixed}`;
              }
              if (needsClosing) {
                fixed = `${fixed}\n`;
              }
              return fixer.replaceText(node, fixed);
            });
          }
        }
      }

      if (option === 'never' && isParenthesized(context, node)) {
        const tokenBefore = sourceCode.getTokenBefore(node);
        const tokenAfter = sourceCode.getTokenAfter(node);
        report(node, 'extraParens', (fixer) => fixer.replaceTextRange(
          [tokenBefore.range[0], tokenAfter.range[1]],
          getText(context, node),
        ));
      }
    }

    // --------------------------------------------------------------------------
    // Public
    // --------------------------------------------------------------------------

    return {
      VariableDeclarator(node) {
        const type = /** @type {const} */ ('declaration');
        if (!isEnabled(type)) {
          return;
        }
        if (!isEnabled('condition') && node.init && node.init.type === 'ConditionalExpression') {
          check(node.init.consequent, type);
          check(node.init.alternate, type);
          return;
        }
        check(node.init, type);
      },

      AssignmentExpression(node) {
        const type = /** @type {const} */ ('assignment');
        if (!isEnabled(type)) {
          return;
        }
        if (!isEnabled('condition') && node.right.type === 'ConditionalExpression') {
          check(node.right.consequent, type);
          check(node.right.alternate, type);
          return;
        }
        check(node.right, type);
      },

      ReturnStatement(node) {
        const type = /** @type {const} */ ('return');
        if (isEnabled(type)) {
          check(node.argument, type);
        }
      },

      'ArrowFunctionExpression:exit': (node) => {
        const arrowBody = node.body;
        const type = /** @type {const} */ ('arrow');

        if (isEnabled(type) && arrowBody.type !== 'BlockStatement') {
          check(arrowBody, type);
        }
      },

      ConditionalExpression(node) {
        const type = /** @type {const} */ ('condition');
        if (isEnabled(type)) {
          check(node.consequent, type);
          check(node.alternate, type);
        }
      },

      LogicalExpression(node) {
        const type =/** @type {const} */ ('logical');
        if (isEnabled(type)) {
          check(node.right, type);
        }
      },

      /** @param {JSXAttribute} node */
      JSXAttribute(node) {
        const type = /** @type {const} */ ('prop');
        if (isEnabled(type) && node.value && node.value.type === 'JSXExpressionContainer') {
          check(node.value.expression, type);
        }
      },
    };
  },
};
