'use strict';

/** @param {Context} context */
function getSourceCode(context) {
  return context.getSourceCode ? context.getSourceCode() : context.sourceCode;
}

/** @param {Context} context @param {ASTNode} node */
function getAncestors(context, node) {
  const sourceCode = getSourceCode(context);
  return sourceCode.getAncestors ? sourceCode.getAncestors(node) : context.getAncestors();
}

/** @type {(context: Context, node: ASTNode) => Scope} */
function getScope(context, node) {
  const sourceCode = getSourceCode(context);
  if (sourceCode.getScope) {
    return sourceCode.getScope(node);
  }

  return context.getScope();
}

/** @type {(name: string, node: ASTNode, context: Context) => boolean} */
function markVariableAsUsed(name, node, context) {
  const sourceCode = getSourceCode(context);
  return sourceCode.markVariableAsUsed
    ? sourceCode.markVariableAsUsed(name, node)
    : context.markVariableAsUsed(name);
}

/** @type {(context: Context, node: ASTNode, count: number) => ReturnType<typeof sourceCode.getFirstTokens>} */
function getFirstTokens(context, node, count) {
  const sourceCode = getSourceCode(context);
  return sourceCode.getFirstTokens ? sourceCode.getFirstTokens(node, count) : context.getFirstTokens(node, count);
}

/** @type {(context: Context, ...args: [ASTNode?, number?, number?]) => string} */
function getText(context, ...args) {
  const sourceCode = getSourceCode(context);
  return sourceCode.getText ? sourceCode.getText(...args) : context.getSource(...args);
}

module.exports = {
  getAncestors,
  getFirstTokens,
  getScope,
  getSourceCode,
  getText,
  markVariableAsUsed,
};
