/**
 * @fileoverview Enforce default props alphabetical sorting
 * @author Vladimir Kattsov
 * @deprecated
 */

'use strict';

const { isTypeAlias } = require('../util/ast');
const { getVariableFromContext } = require('../util/variable');
const docsUrl = require('../util/docsUrl');
const report = require('../util/report');
const {
  getFirstTokens,
  getText,
} = require('../util/eslint');
const {
  isMemberExpression,
} = require('../util/ast');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  propsNotSorted: 'Default prop types declarations should be sorted alphabetically',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Enforce defaultProps declarations alphabetical sorting',
      category: 'Stylistic Issues',
      recommended: false,
      url: docsUrl('sort-default-props'),
    },
    // fixable: 'code',

    messages,

    schema: [{
      type: 'object',
      properties: {
        ignoreCase: {
          type: 'boolean',
        },
      },
      additionalProperties: false,
    }],
  },

  create(context) {
    const configuration = context.options[0] || {};
    const ignoreCase = configuration.ignoreCase || false;

    /**
     * Get properties name
     * @param {ASTNode} node - Property.
     * @returns {string | undefined} Property name.
     */
    function getPropertyName(node) {
      if (
        ('key' in node && node.key)
        || node.type === 'MethodDefinition'
        || node.type === 'Property'
      ) {
        return 'name' in node.key ? node.key.name : undefined;
      }

      if (isMemberExpression(node)) {
        return 'name' in node.property ? node.property.name : undefined;
      // Special case for class properties
      // (babel-eslint@5 does not expose property name so we have to rely on tokens)
      }
      if (node.type === 'ClassProperty') {
        const tokens = getFirstTokens(context, node, 2);
        return tokens[1] && tokens[1].type === 'Identifier' ? tokens[1].value : tokens[0].value;
      }
      return '';
    }

    /**
     * Checks if the Identifier node passed in looks like a defaultProps declaration.
     * @param {MemberExpression | PropertyDefinition} node The node to check. Must be an Identifier node.
     * @returns {boolean} `true` if the node is a defaultProps declaration, `false` if not
     */
    function isDefaultPropsDeclaration(node) {
      const propName = getPropertyName(node);
      return propName === 'defaultProps' || propName === 'getDefaultProps';
    }

    /** @type {(node: ASTNode) => string} */
    function getKey(node) {
      return getText(context, node.key || node.argument);
    }

    /**
     * Find a variable by name in the current scope.
     * @param {ASTNode} node The node to look for.
     * @param {string} name Name of the variable to look for.
     * @returns {ASTNode | null} Return null if the variable could not be found, ASTNode otherwise.
     */
    function findVariableByName(node, name) {
      const variable = getVariableFromContext(context, node, name);

      if (!variable || !variable.defs[0] || !variable.defs[0].node) {
        return null;
      }

      if (isTypeAlias(variable.defs[0].node)) {
        return variable.defs[0].node.right;
      }

      return variable.defs[0].node.init;
    }

    /**
     * Checks if defaultProps declarations are sorted
     * @param {ASTNode[]} declarations The array of AST nodes being checked.
     * @returns {void}
     */
    function checkSorted(declarations) {
      // function fix(fixer) {
      //   return propTypesSortUtil.fixPropTypesSort(context, fixer, declarations, ignoreCase);
      // }

      declarations.reduce((prev, curr, idx, decls) => {
        if (/Spread(?:Property|Element)$/.test(curr.type)) {
          return decls[idx + 1];
        }

        let prevPropName = getKey(prev);
        let currentPropName = getKey(curr);

        if (ignoreCase) {
          prevPropName = prevPropName.toLowerCase();
          currentPropName = currentPropName.toLowerCase();
        }

        if (currentPropName < prevPropName) {
          report(context, messages.propsNotSorted, 'propsNotSorted', {
            node: curr,
            // fix
          });

          return prev;
        }

        return curr;
      }, declarations[0]);
    }

    /** @param {ASTNode} node */
    function checkNode(node) {
      if (!node) {
        return;
      }
      if (node.type === 'ObjectExpression') {
        checkSorted(node.properties);
      } else if (node.type === 'Identifier') {
        const propTypesObject = findVariableByName(node, node.name);
        if (
          propTypesObject
          && 'properties' in propTypesObject
          && propTypesObject.properties
        ) {
          checkSorted(propTypesObject.properties);
        }
      }
    }

    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------

    return {
      /** @param {ClassProperty | PropertyDefinition} node */
      'ClassProperty, PropertyDefinition'(node) {
        if (!isDefaultPropsDeclaration(node)) {
          return;
        }

        checkNode(node.value);
      },

      MemberExpression(node) {
        if (!isDefaultPropsDeclaration(node)) {
          return;
        }

        checkNode('right' in node.parent && node.parent.right);
      },
    };
  },
};
