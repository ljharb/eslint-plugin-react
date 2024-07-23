/**
 * @fileoverview Enforce ES5 or ES6 class for returning value in render function.
 * @author Mark Orel
 */

'use strict';

const Components = require('../util/Components');
const {
  getComponentProperties,
  getPropertyName,
  isFunctionLikeExpression,
} = require('../util/ast');
const {
  isES5Component,
  isES6Component,
} = require('../util/componentUtil');
const docsUrl = require('../util/docsUrl');
const report = require('../util/report');
const { getAncestors } = require('../util/eslint');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  noRenderReturn: 'Your render method should have a return statement',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Enforce ES5 or ES6 class for returning value in render function',
      category: 'Possible Errors',
      recommended: true,
      url: docsUrl('require-render-return'),
    },

    messages,

    schema: [],
  },

  create: Components.detect((context, components) => {
    /**
     * Mark a return statement as present
     * @param {ASTNode} node The AST node being checked.
     */
    function markReturnStatementPresent(node) {
      components.set(node, {
        hasReturnStatement: true,
      });
    }

    /**
     * Find render method in a given AST node
     * @param {ASTNode} node The component to find render method.
     * @returns {ASTNode} Method node if found, undefined if not.
     */
    function findRenderMethod(node) {
      const properties = getComponentProperties(node);
      return properties
        .filter((property) => getPropertyName(property) === 'render' && property.value)
        .find((property) => isFunctionLikeExpression(property.value));
    }

    return {
      ReturnStatement(node) {
        const ancestors = getAncestors(context, node).reverse();
        let depth = 0;
        ancestors.forEach((ancestor) => {
          if (/Function(Expression|Declaration)$/.test(ancestor.type)) {
            depth += 1;
          }
          if (
            /(MethodDefinition|Property|ClassProperty|PropertyDefinition)$/.test(ancestor.type)
            && getPropertyName(ancestor) === 'render'
            && depth <= 1
          ) {
            markReturnStatementPresent(node);
          }
        });
      },

      ArrowFunctionExpression(node) {
        if (node.expression === false || getPropertyName(node.parent) !== 'render') {
          return;
        }
        markReturnStatementPresent(node);
      },

      'Program:exit'() {
        Object.values(components.list())
          .filter(({ node, hasReturnStatement }) => (
            findRenderMethod(node)
            && !hasReturnStatement
            && (isES5Component(node, context) || isES6Component(node, context))
          ))
          .forEach(({ node }) => {
            report(context, messages.noRenderReturn, 'noRenderReturn', {
              node: findRenderMethod(node),
            });
          });
      },
    };
  }),
};
