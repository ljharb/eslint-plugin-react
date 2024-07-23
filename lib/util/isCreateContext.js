'use strict';

const { isCallExpression } = require('./ast');

/**
 * Checks if the node is a React.createContext call
 * @param {ASTNode} node - The AST node being checked.
 * @returns {boolean} - True if node is a React.createContext call, false if not.
 */
module.exports = function isCreateContext(node) {
  if (
    'init' in node
    && node.init
    && 'callee' in node.init
    && node.init.callee
  ) {
    if (
      isCallExpression(node.init)
      && node.init.callee.name === 'createContext'
    ) {
      return true;
    }

    if (
      astUtil.isMemberExpression(node.init.callee)
      && node.init.callee.property
      && node.init.callee.property.name === 'createContext'
    ) {
      return true;
    }
  }

  if (
    'expression' in node
    && node.expression
    && typeof node.expression === 'object'
    && 'type' in node.expression
    && node.expression.type === 'AssignmentExpression'
    && node.expression.operator === '='
    && isCallExpression(node.expression.right)
    && node.expression.right.callee
  ) {
    const { right } = node.expression;

    if (
      'name' in right.callee
      && right.callee.name === 'createContext'
    ) {
      return true;
    }

    if (
      astUtil.isMemberExpression(right.callee)
      && right.callee.property
      && 'name' in right.callee.property
      && right.callee.property.name === 'createContext'
    ) {
      return true;
    }
  }

  return false;
};
