/**
 * @fileoverview Prevent usage of isMounted
 * @author Joe Lencioni
 */

'use strict';

const docsUrl = require('../util/docsUrl');
const { getAncestors } = require('../util/eslint');
const report = require('../util/report');
const {
  isMemberExpression,
  isThisExpression,
} = require('../util/ast');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  noIsMounted: 'Do not use isMounted',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow usage of isMounted',
      category: 'Best Practices',
      recommended: true,
      url: docsUrl('no-is-mounted'),
    },

    messages,

    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (!isMemberExpression(callee)) {
          return;
        }
        if (
          !isThisExpression(callee.object)
          || !('name' in callee.property)
          || callee.property.name !== 'isMounted'
        ) {
          return;
        }
        const ancestors = getAncestors(context, node);
        for (let i = 0, j = ancestors.length; i < j; i++) {
          if (ancestors[i].type === 'Property' || ancestors[i].type === 'MethodDefinition') {
            report(context, messages.noIsMounted, 'noIsMounted', {
              node: callee,
            });
            break;
          }
        }
      },
    };
  },
};
