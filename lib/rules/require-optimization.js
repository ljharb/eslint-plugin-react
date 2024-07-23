/**
 * @fileoverview Enforce React components to have a shouldComponentUpdate method
 * @author Evgueni Naverniouk
 */

'use strict';

const Components = require('../util/Components');
const { isPureComponent } = require('../util/componentUtil');
const docsUrl = require('../util/docsUrl');
const report = require('../util/report');
const { getScope } = require('../util/eslint');

const messages = {
  noShouldComponentUpdate: 'Component is not optimized. Please add a shouldComponentUpdate method.',
};

/**
 * Checks to see if our component is decorated by PureRenderMixin via reactMixin
 * @param {ClassDeclaration} node The AST node being checked.
 * @returns {boolean} True if node is decorated with a PureRenderMixin, false if not.
 */
function hasPureRenderDecorator({ decorators }) {
  if (decorators && decorators.length) {
    for (let i = 0, l = decorators.length; i < l; i++) {
      const { expression } = decorators[i];
      if (
        expression
        && 'callee' in expression
        && expression.callee
        && 'object' in expression.callee
        && expression.callee.object
        && 'name' in expression.callee.object
        && expression.callee.object.name === 'reactMixin'
        && expression.callee.property
        && 'name' in expression.callee.property
        && expression.callee.property.name === 'decorate'
        && expression.arguments
        && expression.arguments.length > 0
        && 'name' in expression.arguments[0]
        && expression.arguments[0].name === 'PureRenderMixin'
      ) {
        return true;
      }
    }
  }

  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Enforce React components to have a shouldComponentUpdate method',
      category: 'Best Practices',
      recommended: false,
      url: docsUrl('require-optimization'),
    },

    messages,

    schema: [{
      type: 'object',
      properties: {
        allowDecorators: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      additionalProperties: false,
    }],
  },

  create: Components.detect((context, components) => {
    const configuration = context.options[0] || {};
    const allowDecorators = configuration.allowDecorators || [];

    /**
     * Checks to see if our component is custom decorated
     * @param {ASTNode} node The AST node being checked.
     * @returns {boolean} True if node is decorated name with a custom decorated, false if not.
     */
    function hasCustomDecorator(node) {
      const allowLength = allowDecorators.length;

      if (allowLength && 'decorators' in node && node.decorators && node.decorators.length) {
        const { decorators } = node;
        for (let i = 0; i < allowLength; i++) {
          for (let j = 0, l = decorators.length; j < l; j++) {
            const { expression } = decorators[j];
            if (expression && 'name' in expression && expression.name === allowDecorators[i]) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Checks if we are declaring a shouldComponentUpdate method
     * @param {ASTNode} node The AST node being checked.
     * @returns {boolean} True if we are declaring a shouldComponentUpdate method, false if not.
     */
    function isSCUDeclared(node) {
      return !!node && 'name' in node && node.name === 'shouldComponentUpdate';
    }

    /**
     * Checks if we are declaring a PureRenderMixin mixin
     * @param {Property} node The AST node being checked.
     * @returns {boolean} True if we are declaring a PureRenderMixin method, false if not.
     */
    function isPureRenderDeclared(node) {
      let hasPR = false;
      const { key, value } = node;

      if (value && 'elements' in value && value.elements) {
        for (let i = 0, l = value.elements.length; i < l; i++) {
          const element = value.elements[i];
          if (element && 'name' in element && element.name === 'PureRenderMixin') {
            hasPR = true;
            break;
          }
        }
      }

      return hasPR && 'name' in key && key.name === 'mixins';
    }

    /**
     * Mark shouldComponentUpdate as declared
     * @param {ASTNode} node The AST node being checked.
     */
    function markSCUAsDeclared(node) {
      components.set(node, {
        hasSCU: true,
      });
    }

    /**
     * Reports missing optimization for a given component
     * @param {Components.Component} component The component to process
     */
    function reportMissingOptimization(component) {
      report(context, messages.noShouldComponentUpdate, 'noShouldComponentUpdate', {
        node: component.node,
      });
    }

    /**
     * Checks if we are declaring function in class
     * @param {ASTNode} node
     * @returns {boolean} True if we are declaring function in class, false if not.
     */
    function isFunctionInClass(node) {
      let blockNode;
      let scope = getScope(context, node);
      while (scope) {
        blockNode = scope.block;
        if (blockNode && blockNode.type === 'ClassDeclaration') {
          return true;
        }
        scope = scope.upper;
      }

      return false;
    }

    return {
      /** @type {(node: ArrowFunctionExpression) => void} */
      ArrowFunctionExpression(node) {
        // Skip if the function is declared in the class
        if (isFunctionInClass(node)) {
          return;
        }
        // Stateless Functional Components cannot be optimized (yet)
        markSCUAsDeclared(node);
      },

      /** @type {(node: ClassDeclaration) => void} */
      ClassDeclaration(node) {
        if (!(
          hasPureRenderDecorator(node)
          || hasCustomDecorator(node)
          || isPureComponent(node, context)
        )) {
          return;
        }
        markSCUAsDeclared(node);
      },

      /** @type {(node: FunctionDeclaration) => void} */
      FunctionDeclaration(node) {
        // Skip if the function is declared in the class
        if (isFunctionInClass(node)) {
          return;
        }
        // Stateless Functional Components cannot be optimized (yet)
        markSCUAsDeclared(node);
      },

      /** @type {(node: FunctionExpression) => void} */
      FunctionExpression(node) {
        // Skip if the function is declared in the class
        if (isFunctionInClass(node)) {
          return;
        }
        // Stateless Functional Components cannot be optimized (yet)
        markSCUAsDeclared(node);
      },

      /** @type {(node: MethodDefinition) => void} */
      MethodDefinition(node) {
        if (!isSCUDeclared(node.key)) {
          return;
        }
        markSCUAsDeclared(node);
      },

      /** @type {(node: ObjectExpression) => void} */
      ObjectExpression(node) {
        // Search for the shouldComponentUpdate declaration
        const found = node.properties.some((property) => (
          'key' in property
          && property.key
          && (isSCUDeclared(property.key) || isPureRenderDeclared(property))
        ));
        if (found) {
          markSCUAsDeclared(node);
        }
      },

      'Program:exit'() {
        // Report missing shouldComponentUpdate for all components
        Object.values(components.list())
          .filter((component) => !component.hasSCU)
          .forEach((component) => {
            reportMissingOptimization(component);
          });
      },
    };
  }),
};
