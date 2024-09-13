/**
 * @fileoverview Require all forwardRef components include a ref parameter
 */

'use strict';

const {
  isMemberExpression,
  isParenthesized,
} = require('../util/ast');
const docsUrl = require('../util/docsUrl');
const report = require('../util/report');
const { getText } = require('../util/eslint');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param {ASTNode} node
 * @returns {boolean} If the node represents the identifier `forwardRef`.
 */
function isForwardRefIdentifier(node) {
  return node.type === 'Identifier' && 'name' in node && node.name === 'forwardRef';
}

/**
 * @param {ASTNode} node
 * @returns {boolean} If the node represents a function call `forwardRef()` or `React.forwardRef()`.
 */
function isForwardRefCall(node) {
  return (
    node.type === 'CallExpression'
    && 'callee' in node
    && (
      isForwardRefIdentifier(node.callee)
      || (isMemberExpression(node.callee) && isForwardRefIdentifier(node.callee.property))
    )
  );
}

const messages = {
  missingRefParameter: 'forwardRef is used with this component but no ref parameter is set',
  addRefParameter: 'Add a ref parameter',
  removeForwardRef: 'Remove forwardRef wrapper',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Require all forwardRef components include a ref parameter',
      category: 'Possible Errors',
      recommended: false,
      url: docsUrl('forward-ref-uses-ref'),
    },
    messages,
    schema: [],
    type: 'suggestion',
    hasSuggestions: true,
  },

  create(context) {
    return {
      /** @param {FunctionExpression | ArrowFunctionExpression} node */
      'FunctionExpression, ArrowFunctionExpression'(node) {
        if (!isForwardRefCall(node.parent)) {
          return;
        }

        if (node.params.length === 1) {
          report(context, messages.missingRefParameter, 'missingRefParameter', {
            node,
            suggest: [
              {
                messageId: messages.addRefParameter,
                fix(fixer) {
                  const param = node.params[0];
                  // If using shorthand arrow function syntax, add parentheses around the new parameter pair
                  const shouldAddParentheses = node.type === 'ArrowFunctionExpression' && !isParenthesized(context, param);
                  return [].concat(
                    shouldAddParentheses ? fixer.insertTextBefore(param, '(') : [],
                    fixer.insertTextAfter(param, `, ref${shouldAddParentheses ? ')' : ''}`),
                  );
                },
              },
              {
                messageId: messages.removeForwardRef,
                fix(fixer) {
                  return fixer.replaceText(node.parent, getText(context, node));
                },
              },
            ],
          });
        }
      },
    };
  },
};
