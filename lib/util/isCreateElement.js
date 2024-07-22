'use strict';

const { getFromContext } = require('./pragma');
const isDestructuredFromPragmaImport = require('./isDestructuredFromPragmaImport');
const { isMemberExpression } = require('./ast');

/**
 * Checks if the node is a createElement call
 * @param {Context} context - The AST node being checked.
 * @param {ASTNode} node - The AST node being checked.
 * @returns {boolean} - True if node is a createElement call object literal, False if not.
*/
module.exports = function isCreateElement(context, node) {
  if (
    !node
    || !('callee' in node)
    || !node.callee
  ) {
    return false;
  }

  const { callee } = node;

  if (
    isMemberExpression(callee)
    && 'name' in callee.property
    && callee.property.name === 'createElement'
    && callee.object
    && 'name' in callee.object
    && callee.object.name === getFromContext(context)
  ) {
    return true;
  }

  if (
    'name' in callee
    && callee.name === 'createElement'
    && isDestructuredFromPragmaImport(context, node, 'createElement')
  ) {
    return true;
  }

  return false;
};
