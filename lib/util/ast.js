/**
 * @fileoverview Utility functions for AST
 */

'use strict';

const estraverse = require('estraverse');
const {
  getFirstTokens,
  getScope,
  getSourceCode,
} = require('./eslint');

// const { getFromContext } = require('./pragma');

/**
 * Wrapper for estraverse.traverse
 *
 * @param {ASTNode} ASTnode The AST node being checked
 * @param {estraverse.Visitor} visitor Visitor Object for estraverse
 */
function traverse(ASTnode, visitor) {
  const opts = {
    /** @type {Exclude<NonNullable<estraverse.Visitor['fallback']>, 'string'>} */
    fallback(node) {
      return Object.keys(node).filter((key) => key === 'children' || key === 'argument');
    },
    ...visitor,
    keys: {
      ...visitor.keys,
      JSXElement: ['children'],
      JSXFragment: ['children'],
    },
  };

  estraverse.traverse(ASTnode, opts);
}

function loopNodes(nodes) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].type === 'ReturnStatement') {
      return nodes[i];
    }
    if (nodes[i].type === 'SwitchStatement') {
      const j = nodes[i].cases.length - 1;
      if (j >= 0) {
        return loopNodes(nodes[i].cases[j].consequent);
      }
    }
  }
  return false;
}

/**
 * Find a return statement in the current node
 *
 * @param {ASTNode} node The AST node being checked
 * @returns {ASTNode | false}
 */
function findReturnStatement(node) {
  if (
    (
      !('value' in node)
      || !node.value
      || !('body' in node.value)
      || !node.value.body
      || !('body' in node.value.body)
      || !node.value.body.body
    ) && (
      !('body' in node)
      || !node.body
      || !('body' in node.body)
      || !node.body.body
    )
  ) {
    return false;
  }

  const bodyNodes = 'value' in node && node.value ? node.value.body.body : node.body.body;

  return loopNodes(bodyNodes);
}

// eslint-disable-next-line valid-jsdoc -- valid-jsdoc cannot parse function types.
/**
 * Helper function for traversing "returns" (return statements or the
 * returned expression in the case of an arrow function) of a function
 *
 * @param {ASTNode} ASTNode The AST node being checked
 * @param {Context} context The context of `ASTNode`.
 * @param {(returnValue: ASTNode, breakTraverse: () => void) => void} onReturn
 *   Function to execute for each returnStatement found
 * @returns {undefined}
 */
function traverseReturns(ASTNode, context, onReturn) {
  const { type } = ASTNode;

  if (type === 'ReturnStatement') {
    onReturn(ASTNode.argument, () => {});
    return;
  }

  if (type === 'ArrowFunctionExpression' && ASTNode.expression) {
    onReturn(ASTNode.body, () => {});
    return;
  }

  /* TODO: properly warn on React.forwardRefs having typo properties
  if (isCallExpression(ASTNode)) {
    const callee = ASTNode.callee;
    const pragma = getFromContext(context);
    if (
      isMemberExpression(callee)
      && callee.object.type === 'Identifier'
      && callee.object.name === pragma
      && callee.property.type === 'Identifier'
      && callee.property.name === 'forwardRef'
      && ASTNode.arguments.length > 0
    ) {
      return enterFunc(ASTNode.arguments[0]);
    }
    return;
  }
  */

  if (
    type !== 'FunctionExpression'
    && type !== 'FunctionDeclaration'
    && type !== 'ArrowFunctionExpression'
    && type !== 'MethodDefinition'
  ) {
    return;
  }

  traverse(ASTNode.body, {
    enter(node) {
      const breakTraverse = () => {
        this.break();
      };
      switch (node.type) {
        case 'ReturnStatement':
          this.skip();
          onReturn(node.argument, breakTraverse);
          return;
        case 'BlockStatement':
        case 'IfStatement':
        case 'ForStatement':
        case 'WhileStatement':
        case 'SwitchStatement':
        case 'SwitchCase':
          return;
        default:
          this.skip();
      }
    },
  });
}

/**
 * Get node with property's name
 * @param {ASTNode} node - Property.
 * @returns {ASTNode | null} Property name node.
 */
function getPropertyNameNode(node) {
  if (
    ('key' in node && node.key)
    || node.type === 'MethodDefinition'
    || node.type === 'Property'
  ) {
    return node.key;
  }
  if (isMemberExpression(node)) {
    return node.property;
  }
  return null;
}

/**
 * Get properties name
 * @param {ASTNode} node - Property.
 * @returns {string} Property name.
 */
function getPropertyName(node) {
  const nameNode = getPropertyNameNode(node);
  return nameNode && 'name' in nameNode && typeof nameNode.name === 'string'
    ? nameNode.name
    : '';
}

/**
 * Get properties for a given AST node
 * @param {ASTNode} node The AST node being checked.
 * @returns {(ClassElement | ObjectLiteralElement)[]} Properties array.
 */
function getComponentProperties(node) {
  switch (node.type) {
    case 'ClassDeclaration':
    case 'ClassExpression':
      return node.body.body;
    case 'ObjectExpression':
      return node.properties;
    default:
      return [];
  }
}

/**
 * Gets the first node in a line from the initial node, excluding whitespace.
 * @param {Object} context The node to check
 * @param {ASTNode} node The node to check
 * @return {ASTNode} the first node in the line
 */
function getFirstNodeInLine(context, node) {
  const sourceCode = getSourceCode(context);
  let token = node;
  let lines;
  do {
    token = sourceCode.getTokenBefore(token);
    lines = token.type === 'JSXText'
      ? token.value.split('\n')
      : null;
  } while (
    token.type === 'JSXText'
        && /^\s*$/.test(lines[lines.length - 1])
  );
  return token;
}

/**
 * Checks if the node is the first in its line, excluding whitespace.
 * @param {Object} context The node to check
 * @param {ASTNode} node The node to check
 * @return {boolean} true if it's the first node in its line
 */
function isNodeFirstInLine(context, node) {
  const token = getFirstNodeInLine(context, node);
  const startLine = node.loc.start.line;
  const endLine = token ? token.loc.end.line : -1;
  return startLine !== endLine;
}

/** @type {(node: unknown) => node is FunctionExpression | ArrowFunctionExpression} */
function isFunctionLikeExpression(node) {
  return node
    && typeof node === 'object'
    && 'type' in node
    && (
      node.type === 'FunctionExpression'
      || node.type === 'ArrowFunctionExpression'
    );
}

/** @type {(node: ASTNode) => node is FunctionExpression | FunctionDeclaration} */
function isFunction(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
}

/** @type {(node: ASTNode) => node is FunctionDeclaration | FunctionExpression | ArrowFunctionExpression} */
function isFunctionLike(node) {
  return node.type === 'FunctionDeclaration' || isFunctionLikeExpression(node);
}

/** @type {(node: ASTNode) => node is ClassDeclaration | ClassExpression} */
function isClass(node) {
  return node.type === 'ClassDeclaration' || node.type === 'ClassExpression';
}

/** @type {(node: unknown) => node is CallExpression} */
function isCallExpression(node) {
  return node
    && typeof node === 'object'
    && 'type' in node
    && node.type === 'CallExpression';
}

/**
 * Check if we are in a class constructor
 * @param {Context} context
 * @param {ASTNode} node The AST node being checked.
 * @return {boolean}
 */
function inConstructor(context, node) {
  let scope = getScope(context, node);
  while (scope) {
    // @ts-ignore
    if (scope.block && scope.block.parent && scope.block.parent.kind === 'constructor') {
      return true;
    }
    scope = scope.upper;
  }
  return false;
}

/**
 * Removes quotes from around an identifier.
 * @param {string} string the identifier to strip
 * @returns {string}
 */
function stripQuotes(string) {
  return string.replace(/^'|'$/g, '');
}

/**
 * Retrieve the name of a key node
 * @param {Context} context The AST node with the key.
 * @param {any} node The AST node with the key.
 * @return {string | undefined} the name of the key
 */
function getKeyValue(context, node) {
  if (node.type === 'ObjectTypeProperty') {
    const tokens = getFirstTokens(context, node, 2);
    return (tokens[0].value === '+' || tokens[0].value === '-'
      ? tokens[1].value
      : stripQuotes(tokens[0].value)
    );
  }
  if (node.type === 'GenericTypeAnnotation') {
    return node.id.name;
  }
  if (node.type === 'ObjectTypeAnnotation') {
    return;
  }
  const key = node.key || node.argument;
  if (!key) {
    return;
  }
  return key.type === 'Identifier' ? key.name : key.value;
}

/**
 * Checks if a node is surrounded by parenthesis.
 *
 * @param {object} context - Context from the rule
 * @param {ASTNode} node - Node to be checked
 * @returns {boolean}
 */
function isParenthesized(context, node) {
  const sourceCode = getSourceCode(context);
  const previousToken = sourceCode.getTokenBefore(node);
  const nextToken = sourceCode.getTokenAfter(node);

  return !!previousToken && !!nextToken
    && previousToken.value === '(' && previousToken.range[1] <= node.range[0]
    && nextToken.value === ')' && nextToken.range[0] >= node.range[1];
}

/**
 * Checks if a node is being assigned a value: props.bar = 'bar'
 * @param {ASTNode} node The AST node being checked.
 * @returns {boolean}
 */
function isAssignmentLHS(node) {
  return (
    node.parent
    && node.parent.type === 'AssignmentExpression'
    && node.parent.left === node
  );
}

/** @type {(node: unknown) => node is TSAsExpression} */
function isTSAsExpression(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  return node.type === 'TSAsExpression';
}

/**
 * Extracts the expression node that is wrapped inside a TS type assertion
 * @type {<T = unknown>(node: T) => T extends TSAsExpression ? Expression : T}
 */
function unwrapTSAsExpression(node) {
  return isTSAsExpression(node) ? node.expression : node;
}

/** @type {(node: unknown) => node is TSTypeReference} */
function isTSTypeReference(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  return node.type === 'TSTypeReference';
}

/** @type {(node: unknown) => node is TSTypeAnnotation} */
function isTSTypeAnnotation(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  return node.type === 'TSTypeAnnotation';
}

/** @type {(node: unknown) => node is TSTypeLiteral} */
function isTSTypeLiteral(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  return node.type === 'TSTypeLiteral';
}

/** @type {(node: unknown) => node is TSIntersectionType} */
function isTSIntersectionType(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  return node.type === 'TSIntersectionType';
}

/** @type {(node: unknown) => node is TSInterfaceHeritage} */
function isTSInterfaceHeritage(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  return node.type === 'TSInterfaceHeritage';
}

/** @type {(node: unknown) => node is { type: TSInterfaceDeclaration } | { declaration: { type: TSInterfaceDeclaration }}} */
function isTSInterfaceDeclaration(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  return (
    node.type === 'ExportNamedDeclaration' && node.declaration
      ? node.declaration.type
      : node.type
  ) === 'TSInterfaceDeclaration';
}

/** @type {(node: unknown) => node is TypeAlias} */
function isTypeAlias(node) {
  return !!node
    && typeof node === 'object'
    && 'type' in node
    && node.type === 'TypeAlias';
}

/** @type {(node: unknown) => node is ImportBinding} */
function isImportBinding(node) {
  return !!node
    && typeof node === 'object'
    && 'type' in node
    && node.type === 'ImportBinding';
}

/** @type {(node: unknown) => node is VariableDeclaration | { declaration: VariableDeclaration, kind: 'type' }} */
function isTSTypeDeclaration(node) {
  if (!node || typeof node !== 'object' || !('type' in node) || !('kind' in node)) { return false; }

  const nodeToCheck = node.type === 'ExportNamedDeclaration' && 'declaration' in node && node.declaration
    ? node.declaration
    : node;

  return nodeToCheck.type === 'VariableDeclaration' && nodeToCheck.kind === 'type';
}

/** @type {(node: unknown) => node is TSTypeAliasDeclaration | { declaration: TSTypeAliasDeclaration }} */
function isTSTypeAliasDeclaration(node) {
  if (!node || typeof node !== 'object' || !('type' in node)) { return false; }

  if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    return node.declaration.type === 'TSTypeAliasDeclaration' && node.exportKind === 'type';
  }
  return node.type === 'TSTypeAliasDeclaration';
}

/** @type {(node: unknown) => node is TSTypeAliasDeclaration} */
function isTSParenthesizedType(node) {
  if (!node || typeof node !== 'object') return false;

  return 'type' in node && node.type === 'TSTypeAliasDeclaration';
}

/** @type {(node: ASTNode) => node is TSTypeAliasDeclaration} */
function isTSFunctionType(node) {
  if (!node) { return false; }

  return node.type === 'TSFunctionType';
}

/** @type {(node: ASTNode) => node is TSTypeQuery} */
function isTSTypeQuery(node) {
  if (!node) { return false; }

  return node.type === 'TSTypeQuery';
}

/** @type {(node: ASTNode) => node is TSTypeParameterInstantiation} */
function isTSTypeParameterInstantiation(node) {
  if (!node) { return false; }

  return node.type === 'TSTypeParameterInstantiation';
}

/** @type {(node: ASTNode) => node is (OptionalMemberExpression | MemberExpression)} */
function isMemberExpression(node) {
  if (!node) { return false; }

  return node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression';
}

/** @type {(node: ASTNode) => node is ObjectPattern} */
function isObjectPattern(node) {
  if (!node) { return false; }

  return node.type === 'ObjectPattern';
}

/** @type {(node: ASTNode) => node is VariableDeclarator} */
function isVariableDeclarator(node) {
  if (!node) { return false; }

  return node.type === 'VariableDeclarator';
}

// Descend through all wrapping TypeCastExpressions and return the expression that was cast.
/** @param {ASTNode} node */
function uncast(node) {
  while (node.type === 'TypeCastExpression') {
    node = node.expression;
  }
  return node;
}

/** @type {(node: unknown) => node is ThisExpression} */
function isThisExpression(node) {
  return unwrapTSAsExpression(uncast(node)).type === 'ThisExpression';
}

/** @type {(node: unknown) => node is ObjectExpression} */
function isObjectExpression(node) {
  return !!node
    && (typeof node === 'object' || typeof node === 'function')
    && 'type' in node
    && node.type === 'ObjectExpression';
}

module.exports = {
  findReturnStatement,
  getComponentProperties,
  getFirstNodeInLine,
  getKeyValue,
  getPropertyName,
  getPropertyNameNode,
  inConstructor,
  isAssignmentLHS,
  isCallExpression,
  isClass,
  isFunction,
  isFunctionLike,
  isFunctionLikeExpression,
  isImportBinding,
  isMemberExpression,
  isNodeFirstInLine,
  isObjectExpression,
  isObjectPattern,
  isParenthesized,
  isThisExpression,
  isTSAsExpression,
  isTSFunctionType,
  isTSInterfaceDeclaration,
  isTSInterfaceHeritage,
  isTSIntersectionType,
  isTSParenthesizedType,
  isTSTypeAliasDeclaration,
  isTSTypeAnnotation,
  isTSTypeDeclaration,
  isTSTypeLiteral,
  isTSTypeParameterInstantiation,
  isTSTypeQuery,
  isTSTypeReference,
  isTypeAlias,
  isVariableDeclarator,
  traverse,
  traverseReturns,
  uncast,
  unwrapTSAsExpression,
};
