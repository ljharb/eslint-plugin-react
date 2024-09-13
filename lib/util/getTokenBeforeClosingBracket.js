'use strict';

/**
 * Find the token before the closing bracket.
 * @param {ASTNode} node - The JSX element node.
 * @returns The token before the closing bracket.
 */
module.exports = function getTokenBeforeClosingBracket(node) {
  if (!('attributes' in node)) {
    return false;
  }
  const { attributes } = node;
  if (!attributes || !('length' in attributes) || attributes.length === 0) {
    return 'name' in node && node.name;
  }
  return attributes[attributes.length - 1];
};
